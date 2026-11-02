import {isNativeSave} from '../native-save.js';
import {createNativeSaveCodec,nativeWireDelta} from './native-save-codec.mjs';
import {buildWireDelta} from './wire-delta.mjs';
import {runOriginalEngineDay} from './original-engine-day.mjs';
// userId must come from the existing authenticated session, never the body.
// restoreSave must restore a detached full state; store.commit is atomic.
export function createAdvanceDayService({store,restoreSave,encodeSave=async s=>s,runDay=runOriginalEngineDay,fingerprint=()=>'day',codecFactory=null,includeDelta=false,ownsRestoredState=false,stateCache=null}){
 if(!store||typeof restoreSave!=='function')throw Error('Advance-day dependencies missing');
 const active=new Map();
 return async function advance({userId,slot='main',requestId,expectedRev,operation,nativeWire=false}){
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
    const meta=stateCache&&typeof store.metadata==='function'?store.metadata(userId,slot):null;
    const cached=meta?.rev===expectedRev?stateCache?.take(userId,slot,meta.rev,meta.digest):null;
    const snapshot=cached?{...meta,save:cached.wire,fieldHashes:cached.fieldHashes}:store.load(userId,slot);mark('loadMs');
    if(!snapshot)return {status:404,error:'save not found'};
    if(snapshot.rev!==expectedRev)return {status:409,error:'revision conflict',current_rev:snapshot.rev};
    const inputNative=isNativeSave(snapshot.save),native=nativeWire||inputNative;
    timing.nativeMigration=native&&!inputNative;
    timing.inputFormat=inputNative?'server-json-v1':'legacy-gzip';
    const codec=cached?.codec&&((cached.codec.mode==='server-json-v1')===native)?cached.codec:native?createNativeSaveCodec():codecFactory?.();
    let state;
    if(cached?.serializedFields){
     // Cache immutable JSON bytes, never a mutable native world. Each operation
     // parses fresh owned values without SQLite I/O, gunzip or a world clone.
     snapshot.save=Object.fromEntries([...cached.serializedFields].map(([key,raw])=>[key,JSON.parse(raw)]));
     state=await codec.restore(snapshot.save,{takeOwnership:ownsRestoredState});timing.cacheHit=true;timing.cacheMode='native-json-bytes';
    }else if(cached){
     try{state=JSON.parse(JSON.stringify(cached.state));timing.cacheHit=true}
     catch{state=await codec.restore(snapshot.save,{takeOwnership:ownsRestoredState&&!!snapshot.fieldHashes});timing.cacheHit=false}
    }else{state=await(codec?codec.restore(snapshot.save,{takeOwnership:ownsRestoredState&&!!snapshot.fieldHashes}):restoreSave(structuredClone(snapshot.save)));timing.cacheHit=false}
    mark('restoreMs');
    const outcome=await runDay(state,operation,{takeOwnership:ownsRestoredState});mark('engineMs');
    const wire=await(codec?codec.pack(outcome.state):encodeSave(outcome.state));mark('packMs');
    const delta=native?nativeWireDelta(snapshot.save,wire,snapshot.fieldHashes):buildWireDelta(snapshot.save,wire);mark('deltaMs');
    timing.storageFormat=native?'server-json-v1':'legacy-gzip';
    timing.changedFields=Object.keys(delta.set).length;timing.removedFields=delta.unset.length;timing.totalFields=Object.keys(wire).length;
    const response=verifyReceipt(store.commit({user:userId,slot,requestId,expectedRev,state:wire,delta,serializedDelta:delta.serializedSet,result:{...outcome.result,requestFingerprint,timing}}));
    if(response.status===200&&!response.replayed)stateCache?.put({user:userId,slot,rev:response.rev,digest:response.digest,
     state:native?undefined:outcome.state,
     wire:native?Object.fromEntries(Object.keys(wire).map(key=>[key,null])):wire,
     codec,fieldHashes:delta.fieldHashes,serializedFields:delta.serializedFields});
    if(response.status===200&&performance.now()-started>2000)console.info(JSON.stringify({stage:'server-day-performance',...response.day?.timing,enginePhases:response.day?.enginePhases||null}));
    if(response.status===200&&!response.replayed&&includeDelta)return {...response,wireDelta:{fromRevision:expectedRev,toRevision:response.rev,set:delta.set,unset:delta.unset}};
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
