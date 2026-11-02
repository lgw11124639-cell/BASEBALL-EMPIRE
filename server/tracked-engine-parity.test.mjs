import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';import {runOriginalEngineDay} from './original-engine-day.mjs';
import {createNativeSaveCodec,nativeWireDelta} from './native-save-codec.mjs';import {restoreNativeSave} from '../native-save.js';
test('tracked native engine days preserve actual major, minor, amateur and governance outcomes',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8'),sandbox=createOriginalEngineSandbox(source,{year:2027,day:1,players:[],teams:[],gameResults:[]});sandbox.context.structuredClone=structuredClone;
 let base=sandbox.invoke('world(0)');base.day=110;
 // A normal first day initializes the real amateur leagues and minor season.
 base=runOriginalEngineDay(base,{appSource:source},{takeOwnership:true}).state;
 return (async()=>{
  const codec=createNativeSaveCodec();let wire=await codec.pack(base),hashes=nativeWireDelta({},wire).fieldHashes,state=restoreNativeSave(wire,{clone:true});
  const random=Math.random;const reset=()=>{let seed=7327;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}};
  try{for(let day=0;day<2;day++){
   reset();const expected=runOriginalEngineDay(structuredClone(base),{appSource:source},{takeOwnership:true}).state;
   const tracking=codec.track(state,wire);reset();const outcome=runOriginalEngineDay(state,{appSource:source},{takeOwnership:true,cloneState:tracking.clone,readArchive:tracking.raw});
   const packed=await codec.pack(outcome.state),delta=nativeWireDelta(wire,packed,hashes,codec.reusedFields()),normalized={...packed};
   for(const [key,raw] of delta.serializedFields)normalized[key]=JSON.parse(raw);
   state=restoreNativeSave(normalized,{previousWire:packed,previousState:outcome.state,changedKeys:[...delta.serializedFields.keys()]});codec.release();wire=normalized;hashes=delta.fieldHashes;
   assert.deepEqual(JSON.parse(JSON.stringify(state)),JSON.parse(JSON.stringify(expected)));base=expected;
  }}finally{Math.random=random}
 })();
});
