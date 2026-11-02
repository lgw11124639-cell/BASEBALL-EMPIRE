import {buildWireDelta} from './wire-delta.mjs';
import {runOriginalEngineDay} from './original-engine-day.mjs';
// userId must come from the existing authenticated session, never the body.
// restoreSave must restore a detached full state; store.commit is atomic.
export function createAdvanceDayService({store,restoreSave,encodeSave=async s=>s,runDay=runOriginalEngineDay,fingerprint=()=>'day',codecFactory=null,includeDelta=false}){
 if(!store||typeof restoreSave!=='function')throw Error('Advance-day dependencies missing');
 const active=new Map();
 return async function advance({userId,slot='main',requestId,expectedRev,operation}){
  if(!Number.isSafeInteger(userId)||userId<1)return {status:401,error:'unauthorized'};
  if(slot!=='main'||typeof requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(requestId)||!Number.isSafeInteger(expectedRev)||expectedRev<1)return {status:400,error:'invalid advance request'};
  let requestFingerprint;
  try{requestFingerprint=fingerprint(operation)}catch{return {status:400,error:'invalid operation'}}
  const verifyReceipt=response=>response.status===200&&(response.day?.requestFingerprint??'day')!==requestFingerprint?{status:409,error:'request ID reused for a different operation'}:response;
  const replay=store.receipt(userId,slot,requestId,expectedRev);
  if(replay)return verifyReceipt(replay);
  const key=JSON.stringify([userId,slot]),pending=active.get(key);
  if(pending){
   if(pending.requestId===requestId&&pending.expectedRev===expectedRev&&pending.requestFingerprint===requestFingerprint)return pending.promise;
   return {status:409,error:'day advance in progress'};
  }
  // Defer execution so active is populated before any asynchronous dependency.
  const promise=Promise.resolve().then(async()=>{
   try{
    const timing={},started=performance.now();
    let phase=started;const mark=name=>{const now=performance.now();timing[name]=Math.round(now-phase);phase=now};
    const snapshot=store.load(userId,slot);mark('loadMs');
    if(!snapshot)return {status:404,error:'save not found'};
    if(snapshot.rev!==expectedRev)return {status:409,error:'revision conflict',current_rev:snapshot.rev};
    const codec=codecFactory?.();
    const state=await(codec?codec.restore(snapshot.save):restoreSave(structuredClone(snapshot.save)));mark('restoreMs');
    const outcome=await runDay(state,operation);mark('engineMs');
    const wire=await(codec?codec.pack(outcome.state):encodeSave(outcome.state));mark('packMs');
    const delta=buildWireDelta(snapshot.save,wire);mark('deltaMs');
    timing.changedFields=Object.keys(delta.set).length;timing.removedFields=delta.unset.length;timing.totalFields=Object.keys(wire).length;
    const response=verifyReceipt(store.commit({user:userId,slot,requestId,expectedRev,state:wire,delta,result:{...outcome.result,requestFingerprint,timing}}));
    if(response.status===200&&performance.now()-started>2000)console.info(JSON.stringify({stage:'server-day-performance',...response.day?.timing,enginePhases:response.day?.enginePhases||null}));
    if(response.status===200&&!response.replayed&&includeDelta)return {...response,wireDelta:{fromRevision:expectedRev,toRevision:response.rev,...delta}};
    return response;
   }catch(error){
    // No save or receipt is committed for decoding, engine or persistence errors.
    console.error('Server day advance failed:',error?.message||'unknown error');
    return {status:500,error:'day advance failed; reload server status before retrying'};
   }finally{active.delete(key)}
  });
  active.set(key,{requestId,expectedRev,requestFingerprint,promise});return promise;
 };
}
