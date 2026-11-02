import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOwnedEngineRuntime} from './owned-engine-runtime.mjs';
import {createSaveWireCodec} from './save-wire-codec.mjs';
import {runOriginalEngineDay} from './original-engine-day.mjs';
test('owned and detached runtimes produce the same complete original-engine day',async()=>{
 const source=`const Math=Object.assign(Object.create(globalThis.Math),{random:()=>.5});
 const Date=class extends globalThis.Date{constructor(...args){super(...(args.length?args:['2026-11-02T00:00:00Z']))}static now(){return 1793577600000}};
`+readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const boot=createOwnedEngineRuntime(source,{year:2027,day:1,players:[],teams:[],gameResults:[]});
 const seed=boot.invoke('world(0)'),baseline=structuredClone(seed);
 const detached=runOriginalEngineDay(seed,{appSource:source});
 const owned=runOriginalEngineDay(structuredClone(seed),{appSource:source},{takeOwnership:true});
 assert.deepEqual(JSON.parse(JSON.stringify(owned.state)),JSON.parse(JSON.stringify(detached.state)));
 assert.deepEqual(JSON.parse(JSON.stringify(seed)),JSON.parse(JSON.stringify(baseline)));
 assert.equal(owned.result.to.date,detached.result.to.date);
 const codec=createSaveWireCodec(),wire=await codec.pack(owned.state);
 const coldState=await createSaveWireCodec().restore(wire),warmState=JSON.parse(JSON.stringify(owned.state));
 const coldNext=runOriginalEngineDay(coldState,{appSource:source},{takeOwnership:true});
 const warmNext=runOriginalEngineDay(warmState,{appSource:source},{takeOwnership:true});
 assert.deepEqual(JSON.parse(JSON.stringify(warmNext.state)),JSON.parse(JSON.stringify(coldNext.state)),'JSON-normalized warm world matches authoritative gzip restore for the next original-engine day');
});
test('a consumed owned runtime reuses completed history without changing consecutive day outcomes',async()=>{
 const source=`const Date=class extends globalThis.Date{constructor(...args){super(...(args.length?args:['2026-11-02T00:00:00Z']))}static now(){return 1793577600000}};\n`+readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const boot=createOwnedEngineRuntime(source,{year:2027,day:1,players:[],teams:[],gameResults:[]});let state=boot.invoke('world(0)');state.day=110;
 let runtime=null;const originalRandom=Math.random;function reset(){let seed=12345;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)}
 try{for(let day=0;day<3;day++){
  reset();const fresh=runOriginalEngineDay(structuredClone(state),{appSource:source},{takeOwnership:true});
  reset();const warm=runOriginalEngineDay(structuredClone(state),{appSource:source},{takeOwnership:true,runtime});
  assert.deepEqual(JSON.parse(JSON.stringify(warm.state)),JSON.parse(JSON.stringify(fresh.state)),'same complete major/minor/amateur/governance state');
  assert.deepEqual(warm.result.to,fresh.result.to);if(runtime)assert.equal(warm.runtime,runtime);
  state=JSON.parse(JSON.stringify(fresh.state));runtime=warm.runtime;runtime.context.window.beEngineReadArchive=()=>{throw Error('stale tracker')};runtime.context.__gameCommand={private:true};runtime.park(state);
  assert.equal(runtime.context.structuredClone,structuredClone);assert.equal(runtime.context.window.beEngineReadArchive,undefined);assert.equal(runtime.context.__gameCommand,undefined);assert.equal(runtime.context.__detachedSave,undefined);
  assert.equal(runtime.invoke('simulateLeagueDay.__beEngineOriginal.__beEngineOriginal'),undefined,'phase wrappers never stack');
  assert.equal(Object.keys(warm).includes('runtime'),false,'runtime never enters save/response JSON');
 }}finally{Math.random=originalRandom}
});
