import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createOwnedEngineRuntime} from '../server/owned-engine-runtime.mjs';
import {runOriginalEngineDay} from '../server/original-engine-day.mjs';
const require=createRequire(import.meta.url),source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function random(){let seed=7327;return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
const time=Date.parse('2026-11-03T05:00:00Z');class FixedDate extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
test('actual worker matches the canonical production engine for offseason and regular games',()=>{
 const c=require('../tests/helpers/game-context.cjs')();vm.runInContext('state=world(0);',c);
 for(const day of [1,100]){
  const input=JSON.parse(vm.runInContext('JSON.stringify(state)',c));input.day=day;
  const runtime=createOwnedEngineRuntime(source,structuredClone(input));runtime.context.Math=Object.assign(Object.create(Math),{random:random()});runtime.context.Date=FixedDate;
  const expected=runOriginalEngineDay(structuredClone(input),{appSource:source},{takeOwnership:true,runtime}).state;
  let reply;const context=vm.createContext({console,performance,structuredClone,setTimeout,clearTimeout,TextEncoder,TextDecoder,Date:FixedDate,Math:Object.assign(Object.create(Math),{random:random()}),self:{postMessage:v=>{reply=v;}}});
  vm.runInContext(readFileSync(new URL('../dist-mobile/engine-worker.js',import.meta.url),'utf8'),context);
  context.self.onmessage({data:{id:1,world:structuredClone(input)}});
  assert.equal(reply.error,undefined);assert.equal(reply.world.day,day+1);assert.deepEqual(JSON.parse(JSON.stringify(reply.world)),JSON.parse(JSON.stringify(expected)));
 }
});
