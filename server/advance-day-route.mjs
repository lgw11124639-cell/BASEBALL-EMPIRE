import {createAdvanceDayStore} from './advance-day-store.mjs';
import {createAdvanceDayService} from './advance-day-service.mjs';
// Install only after auth.mjs has authenticated the existing Bearer session.
// Kept disabled until server-owned client flows and legacy write guards are ready.
export function createAdvanceDayRoute({db,shards,restoreSave,body,response,enabled=false}){
 const store=createAdvanceDayStore(db,shards);
 const advance=createAdvanceDayService({store,restoreSave});
 return async function handleAdvance(req,res,origin,session){
  if((req.url||'').split('?')[0]!=='/v2/engine/advance')return false;
  if(!session||!Number.isSafeInteger(session.user_id)){response(res,401,{error:'unauthorized'},origin);return true}
  if(req.method!=='POST'){response(res,405,{error:'method not allowed'},origin);return true}
  if(!enabled){response(res,503,{error:'server engine not enabled'},origin);return true}
  let input;
  try{input=await body(req,4096)}catch{response(res,400,{error:'invalid advance request'},origin);return true}
  try{
   const match=req.headers['if-match'];
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='requestId')||typeof match!=='string'||!/^\d+$/.test(match)){
    response(res,400,{error:'requestId and If-Match revision required'},origin);return true;
   }
   const {status,...payload}=await advance({userId:session.user_id,requestId:input.requestId,expectedRev:Number(match)});
   response(res,status,payload,origin);
  }catch{
   response(res,500,{error:'day advance unavailable'},origin);
  }
  return true;
 };
}
