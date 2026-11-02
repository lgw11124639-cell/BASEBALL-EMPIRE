import {runOriginalEngineDay} from './original-engine-day.mjs';
// userId must come from the existing authenticated session, never the body.
// restoreSave must restore a detached full state; store.commit is atomic.
export function createAdvanceDayService({store,restoreSave,runDay=runOriginalEngineDay}){
 if(!store||typeof restoreSave!=='function')throw Error('Advance-day dependencies missing');
 const active=new Map();
 return async function advance({userId,slot='main',requestId,expectedRev}){
  if(!Number.isSafeInteger(userId)||userId<1)return {status:401,error:'unauthorized'};
  if(slot!=='main'||typeof requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(requestId)||!Number.isSafeInteger(expectedRev)||expectedRev<1)return {status:400,error:'invalid advance request'};
  const replay=store.receipt(userId,slot,requestId,expectedRev);
  if(replay)return replay;
  const key=JSON.stringify([userId,slot]),pending=active.get(key);
  if(pending){
   if(pending.requestId===requestId&&pending.expectedRev===expectedRev)return pending.promise;
   return {status:409,error:'day advance in progress'};
  }
  // Defer execution so active is populated before any asynchronous dependency.
  const promise=Promise.resolve().then(async()=>{
   try{
    const snapshot=store.load(userId,slot);
    if(!snapshot)return {status:404,error:'save not found'};
    if(snapshot.rev!==expectedRev)return {status:409,error:'revision conflict',current_rev:snapshot.rev};
    const state=await restoreSave(structuredClone(snapshot.save));
    const outcome=await runDay(state);
    return store.commit({user:userId,slot,requestId,expectedRev,state:outcome.state,result:outcome.result});
   }catch(error){
    // No save or receipt is committed for decoding, engine or persistence errors.
    console.error('Server day advance failed:',error?.message||'unknown error');
    return {status:500,error:'day advance failed; reload server status before retrying'};
   }finally{active.delete(key)}
  });
  active.set(key,{requestId,expectedRev,promise});return promise;
 };
}
