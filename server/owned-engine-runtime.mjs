// Internal API path only: the codec already owns a detached request state.
// Compile trusted source once; fresh contexts remain the default. A consumed
// committed cache entry may retain one private context for the same owner.
// The detached fixture sandbox remains unchanged for callers needing input isolation.
import vm from 'node:vm';
import {selectUnannouncedTests,investigationCalendar} from '../kpbl-investigation-policy.js';
let compiled=null;
export function createOwnedEngineRuntime(appSource,ownedState,{timeoutMs=120000}={}){
 if(typeof appSource!=='string'||!ownedState||typeof ownedState!=='object')throw Error('Owned engine dependencies missing');
 if(compiled?.original!==appSource){
  const boot=appSource.lastIndexOf('(async()=>{try{app.innerHTML=');
  if(boot<0)throw Error('Original browser startup not found; refusing unsafe source transformation');
  const source=appSource.slice(0,boot).replace(/^import\s+[^;]+;\s*$/gm,'');
  compiled={original:appSource,script:new vm.Script(source,{filename:'original-app.js'})};
 }
 const context=vm.createContext({
  console:{log(){},warn(){},error(){}},
  window:{addEventListener(){}},document:{addEventListener(){},removeEventListener(){},querySelector(){return null},getElementById(){return null}},
  performance,Date,Math,JSON,Map,Set,WeakMap,WeakSet,Promise,structuredClone,
  setTimeout(){throw Error('Browser timer not supported in engine sandbox')},clearTimeout(){},
  alert(){throw Error('Browser alert in engine')},confirm(){throw Error('Browser confirmation in engine')},
  localStorage:undefined,indexedDB:undefined,
  cloudGate(){throw Error('Cloud login prohibited in engine sandbox')},cloudSave(){throw Error('Cloud save prohibited in engine sandbox')},
  selectUnannouncedTests,investigationCalendar
 });
 compiled.script.runInContext(context,{timeout:timeoutMs});
 context.__detachedSave=ownedState;
 vm.runInContext('state = __detachedSave',context,{timeout:timeoutMs});delete context.__detachedSave;
 const invoke=expression=>vm.runInContext(expression,context,{timeout:timeoutMs});
 return {source:appSource,timeoutMs,context,invoke,park(nextState,{zoneCacheProof=null}={}){
  // This context can be retained only in the consumed, owner/revision-bound day
  // cache. Keep completed-match zone aggregates and warmed functions, not future
  // simulation results or references to the previous archive tracker.
  context.__ownedNextState=nextState;context.__zoneCacheProof=zoneCacheProof;
  invoke(`
   // JSON normalization replaces the outer world and the newly written game
   // rows. Retain completed zone aggregates only when the entire indexed
   // prefix is still identical (at most eight normalized tail rows may differ
   // by identity). This never computes or stores a future game.
   if(__zoneCacheProof&&typeof beZoneCache!=='undefined'&&beZoneCache.worldRef?.deref()===state){
    const prior=state.gameResults,next=__ownedNextState.gameResults,count=beZoneCache.indexedCount||0;
    let reusable=Number.isSafeInteger(__zoneCacheProof.previousCount)&&__zoneCacheProof.previousCount>=0&&state.year===__ownedNextState.year&&Array.isArray(prior)&&Array.isArray(next)&&count<=prior.length&&count<=next.length;
    if(reusable)for(let i=0;i<count;i++){
     // Identity cannot prove an in-place historic edit did not occur. Require
     // the codec's write-tracker proof for every pre-existing one-game part.
     if(i<__zoneCacheProof.previousCount&&!__zoneCacheProof.unchangedParts.has('beServerPart_gameResults_'+i)){reusable=false;break}
     if(prior[i]!==next[i]&&(i<Math.max(0,count-8)||JSON.stringify(prior[i])!==JSON.stringify(next[i]))){reusable=false;break}
    }
    if(reusable)beZoneCache.worldRef=new WeakRef(__ownedNextState);
   }
   state=__ownedNextState;
   if(typeof playerConductClockCache!=='undefined')playerConductClockCache=null;
   if(typeof beInningLookupCache!=='undefined')beInningLookupCache=null;
   if(typeof tradeReviewContext!=='undefined')tradeReviewContext=null;
   if(typeof awardCandidatesCache!=='undefined')awardCandidatesCache=null;
   if(typeof splitSaveCount!=='undefined')splitSaveCount=0;
   if(typeof beZoneCache!=='undefined')beZoneCache.profiles=new Map();`);
  delete context.__ownedNextState;delete context.__zoneCacheProof;context.structuredClone=structuredClone;
  for(const key of Object.keys(context.window))if(key!=='addEventListener')delete context.window[key];
  delete context.__gameCommand;delete context.__enginePhaseTimes;
 }};
}
