import {gunzipSync} from 'node:zlib';
import {createSaveLifecycleStore,createSaveLifecycleService,validateLifecycleRequest} from './save-lifecycle.mjs';
import {runOriginalEngineCommand,validateGameCommand,commandFingerprint} from './original-engine-command.mjs';
import {createAdvanceDayStore} from './advance-day-store.mjs';
import {createAdvanceDayService} from './advance-day-service.mjs';
// Install only after auth.mjs has authenticated the existing Bearer session.
// Kept disabled until server-owned client flows and legacy write guards are ready.
export function createAdvanceDayRoute({db,shards,restoreSave,encodeSave,body,response,enabled=false}){
 const store=createAdvanceDayStore(db,shards);
 const advance=createAdvanceDayService({store,restoreSave,encodeSave});
 const command=createAdvanceDayService({store,restoreSave,encodeSave,runDay:runOriginalEngineCommand,fingerprint:commandFingerprint});
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
  if(!receiptId&&!lifecycleType&&!['/v2/engine/advance','/v2/engine/status','/v2/engine/command'].includes(path))return false;
  if(!session||!Number.isSafeInteger(session.user_id)){response(res,401,{error:'unauthorized'},origin);return true}
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
    response(res,200,{enabled,serverOwned:!!owner.get(session.user_id,'main'),revision:current?.rev??0,hasSave:!!current&&!isEmpty,canAdvance:enabled&&!!current&&!isEmpty},origin);
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
    const {status,...payload}=await lifecycle({userId:session.user_id,requestId,expectedRev:Number(match),type:lifecycleType,input:operation});
    response(res,status,payload,origin);return true;
   }
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!(path==='/v2/engine/command'?['requestId','command']:['requestId']).includes(k))||typeof match!=='string'||!/^\d+$/.test(match)){
    response(res,400,{error:'requestId and If-Match revision required'},origin);return true;
   }
   let operation;
   if(path==='/v2/engine/command'){try{operation=validateGameCommand(input.command)}catch{response(res,400,{error:'invalid game command'},origin);return true}}
   const execute=operation?command:advance;
   const {status,...payload}=await execute({userId:session.user_id,requestId:input.requestId,expectedRev:Number(match),operation});
   response(res,status,payload,origin);
  }catch{
   response(res,500,{error:'day advance unavailable'},origin);
  }
  return true;
 };
}
