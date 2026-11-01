// Experimental original-engine loader for a detached Node VM.
// It evaluates the unmodified game logic, excluding browser imports and
// startup login/render bootstrap. No cloud or database writes are provided.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const browserImports=/^import\s+[^;]+;\s*$/gm;
export function createOriginalEngineSandbox(appSource,saveState,{timeoutMs=15000}={}){
 if(typeof appSource!=='string'||!saveState||typeof saveState!=='object')throw Error('Source and detached state required');
 const bootstrap='(async()=>{try{app.innerHTML=';
 const boot=appSource.lastIndexOf(bootstrap);
 if(boot<0)throw Error('Original browser startup not found; refusing unsafe source transformation');
 const source=appSource.slice(0,boot).replace(browserImports,'');
 const detached=structuredClone(saveState);
 const context=vm.createContext({
  console:{log(){},warn(){},error(){}},
  window:{},document:{querySelector(){return null},getElementById(){return null}},
  performance,Date,Math,JSON,Map,Set,WeakMap,WeakSet,Promise,
  setTimeout(){throw Error('Browser timer not supported in engine sandbox')},
  clearTimeout(){},alert(){throw Error('Browser alert in engine')},
  confirm(){throw Error('Browser confirmation in engine')},
  localStorage:undefined,indexedDB:undefined,
  cloudGate(){throw Error('Cloud login prohibited in engine sandbox')},
  cloudSave(){throw Error('Cloud save prohibited in engine sandbox')},
  selectUnannouncedTests(){throw Error('Investigation policy adapter not yet installed')},
  investigationCalendar(){throw Error('Investigation policy adapter not yet installed')}
 });
 vm.runInContext(source,context,{timeout:timeoutMs,filename:'original-app.js'});
 vm.runInContext('state = __detachedSave',Object.assign(context,{__detachedSave:detached}),{timeout:timeoutMs});
 return {context,state:detached,invoke(expression){return vm.runInContext(expression,context,{timeout:timeoutMs})}};
}
export function loadOriginalEngineSandbox(path,state,options){
 return createOriginalEngineSandbox(readFileSync(path,'utf8'),state,options);
}
