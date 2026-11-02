// Internal API path only: the codec already owns a detached request state.
// Compile trusted source once, but allocate a fresh VM context for every request.
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
 vm.runInContext('state = __detachedSave',context,{timeout:timeoutMs});
 return {context,invoke(expression){return vm.runInContext(expression,context,{timeout:timeoutMs})}};
}
