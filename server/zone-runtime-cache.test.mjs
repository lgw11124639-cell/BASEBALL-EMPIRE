import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOwnedEngineRuntime} from './owned-engine-runtime.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const proof=count=>({zoneCacheProof:{previousCount:count,unchangedParts:new Set(Array.from({length:count},(_,i)=>'beServerPart_gameResults_'+i))}});
function setup(){const state={year:2046,day:100,players:[],teams:[],gameResults:Array.from({length:100},(_,day)=>({year:2046,day,broadcastEvents:[{batterId:1,batter:'A',side:'away',outcome:'안타',pitchSequence:[{zoneX:50,zoneY:50}]}]}))};const runtime=createOwnedEngineRuntime(source,state);runtime.invoke('batterZoneProfile({id:1})');return {state,runtime,index:runtime.invoke('beZoneCache.index')}}
test('parking normalized owned state retains proven historical zone index and scans only appended results',()=>{
 const {state,runtime,index}=setup(),next={...state,gameResults:[...state.gameResults]};next.gameResults[99]=JSON.parse(JSON.stringify(next.gameResults[99]));next.gameResults.push({...next.gameResults[99],day:100});
 runtime.park(next,proof(100));assert.equal(runtime.invoke('beZoneCache.index'),index);assert.equal(runtime.invoke('beZoneCache.worldRef.deref()===state'),true);
 const result=runtime.invoke('batterZoneProfile({id:1})');assert.equal(result.total,101);assert.equal(result.overall,1);assert.equal(runtime.invoke('beZoneCache.index'),index);assert.equal(runtime.invoke('beZoneCache.indexedCount'),101);
 // Every old value can now reject an event scan; appending a new result must
 // not visit those historical event arrays again.
 for(const g of next.gameResults)Object.defineProperty(g,'broadcastEvents',{get(){throw Error('historical replay rescanned')}});
 next.gameResults.push({year:2046,day:101,broadcastEvents:[]});assert.equal(runtime.invoke('batterZoneProfile({id:1}).total'),101);
});
test('changed history, save switches, truncation and season rollover invalidate zone aggregates',()=>{
 for(const mode of ['history','tail','truncate','year','replaced']){
  const {state,runtime,index}=setup(),next={...state,gameResults:[...state.gameResults]};
  if(mode==='history'||mode==='tail'){const at=mode==='tail'?99:0;next.gameResults[at]={...next.gameResults[at],broadcastEvents:[]}}
  if(mode==='truncate')next.gameResults.length=2;
  if(mode==='year')next.year++;
  if(mode==='replaced')next.gameResults=structuredClone(next.gameResults);
  runtime.park(next,proof(100));runtime.invoke('batterZoneProfile({id:1})');assert.notEqual(runtime.invoke('beZoneCache.index'),index,mode);
  assert.equal(runtime.invoke('batterZoneProfile({id:1}).total'),mode==='truncate'?2:mode==='year'?0:mode==='replaced'?100:99);
 }
});

test('a write-tracker dirty part invalidates cached counts even when a historic object keeps its identity',()=>{
 const {state,runtime,index}=setup();state.gameResults[0].broadcastEvents=[];
 const next={...state,gameResults:[...state.gameResults]},options=proof(100);options.zoneCacheProof.unchangedParts.delete('beServerPart_gameResults_0');
 runtime.park(next,options);assert.equal(runtime.invoke('batterZoneProfile({id:1}).total'),99);assert.notEqual(runtime.invoke('beZoneCache.index'),index);assert.equal(runtime.context.__zoneCacheProof,undefined);
});

test('real codec normalization supplies the reuse proof and detects in-place historical edits',async()=>{
 const {createNativeSaveCodec,nativeWireDelta,normalizeNativeWire}=await import('./native-save-codec.mjs');
 const {restoreNativeSave}=await import('../native-save.js');
 for(const editOld of [false,true]){
  const {state:seed}=setup(),codec=createNativeSaveCodec(),wire=JSON.parse(JSON.stringify(await codec.pack(seed))),state=await codec.restore(wire,{takeOwnership:true}),runtime=createOwnedEngineRuntime(source,state);
  runtime.invoke('batterZoneProfile({id:1})');const index=runtime.invoke('beZoneCache.index');
  codec.track(state,wire);if(editOld)state.gameResults[0].broadcastEvents=[];
  state.gameResults.push({year:2046,day:100,broadcastEvents:[]});
  const packed=await codec.pack(state),delta=nativeWireDelta(wire,packed,nativeWireDelta({},wire).fieldHashes,codec.reusedFields()),normalized=normalizeNativeWire(wire,packed,delta,codec.appendStarts()),next=restoreNativeSave(normalized,{previousWire:packed,previousState:state,changedKeys:[...delta.serializedFields.keys()]});
  const options={zoneCacheProof:{previousCount:wire.beServerNativeManifest.fields.gameResults.length,unchangedParts:codec.reusedFields()}};codec.release();runtime.park(next,options);
  assert.equal(runtime.invoke('batterZoneProfile({id:1}).total'),editOld?99:100);assert.equal(runtime.invoke('beZoneCache.index')===index,!editOld);
 }
});
