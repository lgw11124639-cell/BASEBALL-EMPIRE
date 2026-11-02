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
 const owner=db.prepare('SELECT 1 FROM be_day_requests WHERE user_id=? AND slot=? LIMIT 1');
 return async function handleAdvance(req,res,origin,session){
  const path=(req.url||'').split('?')[0];
  if(!['/v2/engine/advance','/v2/engine/status','/v2/engine/command'].includes(path))return false;
  if(!session||!Number.isSafeInteger(session.user_id)){response(res,401,{error:'unauthorized'},origin);return true}
  if(path==='/v2/engine/status'){
   if(req.method!=='GET'){response(res,405,{error:'method not allowed'},origin);return true}
   const current=meta.get(session.user_id,'main');
   response(res,200,{enabled,serverOwned:!!owner.get(session.user_id,'main'),revision:current?.rev??null,canAdvance:enabled&&!!current},origin);return true;
  }
  if(req.method!=='POST'){response(res,405,{error:'method not allowed'},origin);return true}
  if(!enabled){response(res,503,{error:'server engine not enabled'},origin);return true}
  let input;
  try{input=await body(req,path==='/v2/engine/command'?256000:4096)}catch{response(res,400,{error:'invalid advance request'},origin);return true}
  try{
   const match=req.headers['if-match'];
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
