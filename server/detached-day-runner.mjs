// Execute a single original-engine day against a detached copy of a save.
// Never writes SQLite or invokes the live cloud save endpoint.
import {advanceSimulationDay} from './daily-engine-core.mjs';
export function runDetachedDay(originalState,createOriginalOps,options={}){
 if(!originalState||typeof originalState!=='object'||typeof createOriginalOps!=='function')throw Error('Invalid detached engine inputs');
 const clone=structuredClone(originalState);
 const originalYear=clone.year,originalDay=clone.day;
 const ops=createOriginalOps(clone);
 if(!ops||typeof ops!=='object')throw Error('Original engine adapter missing');
 const started=performance.now();
 const result=advanceSimulationDay(clone,ops,options);
 const elapsedMs=performance.now()-started;
 return Object.freeze({state:clone,result:Object.freeze({...result}),elapsedMs,detached:true,liveSaveWritten:false,
  originalYear,originalDay});
}
