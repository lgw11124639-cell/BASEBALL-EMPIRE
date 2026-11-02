import {totalmem} from 'node:os';
import {createDecodedDayCache} from './decoded-day-cache.mjs';
import {createSaveWireCodec} from './save-wire-codec.mjs';
import {gunzipSync} from 'node:zlib';
import {createSaveLifecycleStore,createSaveLifecycleService,validateLifecycleRequest} from './save-lifecycle.mjs';
import {runOriginalEngineCommand,validateGameCommand,commandFingerprint} from './original-engine-command.mjs';
import {createAdvanceDayStore} from './advance-day-store.mjs';
import {createAdvanceDayService} from './advance-day-service.mjs';
// Install only after auth.mjs has authenticated the existing Bearer session.
// Kept disabled until server-owned client flows and legacy write guards are ready.
export function createAdvanceDayRoute({db,shards,restoreSave,encodeSave,body,response,enabled=false,codecFactory=createSaveWireCodec,precompute=false,precomputeController=null}){
 const store=createAdvanceDayStore(db,shards);
 // Production preparation is disabled. Injection is retained for detached tests.
 const prepared=precomputeController;
 const stateCache=createDecodedDayCache({maxRssBytes:totalmem()*.80});
 const advance=createAdvanceDayService({store,restoreSave,encodeSave,codecFactory,includeDelta:true,ownsRestoredState:true,stateCache,precompute:prepared});
 const command=createAdvanceDayService({store,restoreSave,encodeSave,runDay:runOriginalEngineCommand,fingerprint:commandFingerprint,codecFactory,includeDelta:true,ownsRestoredState:true,stateCache:prepared?null:stateCache});
 const meta=db.prepare('SELECT rev FROM be_save_shard_meta WHERE user_id=? AND slot=?');
 const lifecycleStore=createSaveLifecycleStore(db,shards);
 const lifecycle=createSaveLifecycleService({store:lifecycleStore,restoreSave,encodeSave});
 const lifecycleReceipt=db.prepare('SELECT response FROM be_lifecycle_requests WHERE user_id=? AND slot=? AND request_id=?');
 const empty=db.prepare("SELECT content FROM be_save_shards WHERE user_id=? AND slot=? AND field='beServerSlotEmpty'");
 const owner=db.prepare('SELECT 1 FROM (SELECT user_id,slot FROM be_day_requests UNION ALL SELECT user_id,slot FROM be_lifecycle_requests) WHERE user_id=? AND slot=? LIMIT 1');
 return async function handleAdvance(req,res,origin,session){
  const path=(req.url||'').split('?')[0];
  const lifecycleType={'/v2/engine/new-game':'new-game','/v2/engine/reset':'reset','/v2/engine/restore':'restore'}[path];
  const receiptId=/^\/v2\/engine\/save-request\/([-a-zA-Z0-9_]{16,128})$/.exec(path)?.[1];
  if(!receiptId&&!lifecycleType&&!['/v2/engine/snapshot','/v2/engine/advance','/v2/engine/status','/v2/engine/command'].includes(path))return false;
  if(!session||!Number.isSafeInteger(session.user_id)){response(res,401,{error:'unauthorized'},origin);return true}
  if(path==='/v2/engine/snapshot'){
   if(req.method!=='GET'){response(res,405,{error:'method not allowed'},origin);return true}
   try{const snapshot=store.compressedSnapshot(session.user_id,'main');response(res,snapshot?200:404,snapshot||{error:'native snapshot unavailable'},origin)}catch{response(res,500,{error:'snapshot unavailable'},origin)}return true;
  }
  if(receiptId){
   if(req.method!=='GET'){response(res,405,{error:'method not allowed'},origin);return true}
   const receipt=lifecycleReceipt.get(session.user_id,'main',receiptId);
   response(res,receipt?200:404,receipt?{...JSON.parse(receipt.response),replayed:true}:{error:'request not committed'},origin);return true;
  }
  if(path==='/v2/engine/status'){
   if(req.method!=='GET'){response(res,405,{error:'method not allowed'},origin);return true}
   try{
    const current=meta.get(session.user_id,'main'),marker=empty.get(session.user_id,'main');
    const isEmpty=marker?JSON.parse(gunzipSync(marker.content,{maxOutputLength:1024}).toString('utf8'))===true:false;
    const currentMeta=store.metadata(session.user_id,'main');
    if(prepared&&currentMeta&&!isEmpty)prepared.ensure(session.user_id,'main',currentMeta.rev,currentMeta.digest);
    response(res,200,{enabled,compressedSnapshot:true,serverOwned:!!owner.get(session.user_id,'main'),revision:current?.rev??0,hasSave:!!current&&!isEmpty,canAdvance:enabled&&!!current&&!isEmpty,...(prepared?{preparation:prepared.status(session.user_id,'main',current?.rev??0)}:{})},origin);
   }catch{response(res,500,{error:'server status unavailable'},origin)}
   return true;
  }
  if(req.method!=='POST'){response(res,405,{error:'method not allowed'},origin);return true}
  if(!enabled){response(res,503,{error:'server engine not enabled'},origin);return true}
  let input;
  try{input=await body(req,lifecycleType==='restore'?20*1024*1024:path==='/v2/engine/command'?256000:4096)}catch{response(res,400,{error:'invalid advance request'},origin);return true}
  try{
   const match=req.headers['if-match'];
   if(lifecycleType){
    try{validateLifecycleRequest(lifecycleType,input)}catch{response(res,400,{error:'invalid save operation'},origin);return true}
    if(typeof match!=='string'||!/^\d+$/.test(match)){response(res,400,{error:'If-Match revision required'},origin);return true}
    const {requestId,...operation}=input;
    await prepared?.pause?.();
    try{
    const {status,...payload}=await lifecycle({userId:session.user_id,requestId,expectedRev:Number(match),type:lifecycleType,input:operation});
    if(status===200&&prepared&&!payload.replayed)prepared.invalidate(session.user_id,'main');
    if(status===200&&prepared&&lifecycleType!=='reset'){const current=store.metadata(session.user_id,'main');if(current)prepared.ensure(session.user_id,'main',current.rev,current.digest)}
    response(res,status,payload,origin);return true;
    }finally{prepared?.resume?.()}
   }
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!(path==='/v2/engine/command'?['requestId','command']:['requestId']).includes(k))||typeof match!=='string'||!/^\d+$/.test(match)){
    response(res,400,{error:'requestId and If-Match revision required'},origin);return true;
   }
   let operation;
   if(path==='/v2/engine/command'){try{operation=validateGameCommand(input.command)}catch{response(res,400,{error:'invalid game command'},origin);return true}}
   const execute=operation?command:advance;
   const nativeWire=new URL(req.url,'http://localhost').searchParams.get('wireFormat')==='server-json-v1';
   const compactWire=new URL(req.url,'http://localhost').searchParams.get('wirePatch')==='1';
   const {status,...payload}=await execute({userId:session.user_id,requestId:input.requestId,expectedRev:Number(match),operation,nativeWire,compactWire});
   if(status===200&&prepared){const current=store.metadata(session.user_id,'main');if(operation&&!payload.replayed){prepared.invalidate(session.user_id,'main');stateCache.clear()}if(operation&&current)prepared.ensure(session.user_id,'main',current.rev,current.digest);payload.preparation=prepared.status(session.user_id,'main',current?.rev??payload.rev)}
   if(!nativeWire&&payload.day?.timing?.storageFormat==='server-json-v1')delete payload.wireDelta;
   response(res,status,payload,origin);
  }catch{
   response(res,500,{error:'day advance unavailable'},origin);
  }
  return true;
 };
}
