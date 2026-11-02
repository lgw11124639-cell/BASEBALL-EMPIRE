// Same RNG and full state: caching normalized data must never change a game,
// player development, staff contracts, amateur leagues, or disciplinary effects.
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {createOriginalEngineSandbox}=await import('../server/original-engine-sandbox.mjs');
 const {runOriginalEngineDay}=await import('../server/original-engine-day.mjs');
 const source=fs.readFileSync('app.js','utf8'),cacheInit='beInningLookupCache={staff:new Map(),profiles:new WeakMap(),arsenals:new WeakMap(),skills:new WeakMap()}';
 assert.ok(source.includes(cacheInit));const uncached=source.replace(cacheInit,'beInningLookupCache=null');
 const sandbox=createOriginalEngineSandbox(source,{year:2027,day:1,players:[],teams:[],gameResults:[]});sandbox.context.structuredClone=structuredClone;
 let state=sandbox.invoke('world(0)');state.day=110;
 const random=Math.random;const reset=()=>{let seed=7327;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}};
 try{
  for(let day=0;day<2;day++){
   reset();const before=runOriginalEngineDay(structuredClone(state),{appSource:uncached},{takeOwnership:true});
   reset();const after=runOriginalEngineDay(structuredClone(state),{appSource:source},{takeOwnership:true});
   assert.deepEqual(JSON.parse(JSON.stringify(after.state)),JSON.parse(JSON.stringify(before.state)));
   state=after.state;
  }
 }finally{Math.random=random}
 console.log('PASS inning memoization preserves complete state across pro, minor and amateur games');
})().catch(e=>{console.error(e);process.exitCode=1});
