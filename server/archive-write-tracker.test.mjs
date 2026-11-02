import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeSaveCodec,nativeWireDelta} from './native-save-codec.mjs';
import {restoreNativeSave} from '../native-save.js';
const seed=()=>({year:2046,day:50,players:[{id:1,games:1}],teams:[],history:{seasons:{2044:{players:[{id:1,hits:5}],meta:{valid:true}},2045:{players:[{id:1,hits:10}]}}},gameResults:Array.from({length:3},(_,i)=>({day:i+1,events:[{text:'original'}]})),highSchoolBaseball:{2045:{players:[{id:1,hits:4}]},2046:{players:[{id:1,hits:6,profile:{skills:{contact:50}}}]}},amateurCareerArchive:Object.fromEntries(Array.from({length:140},(_,i)=>['player'+i,[{year:2045,hits:i}]]))});
for(const [name,change] of [
 ['unchanged archives',s=>{s.day++;s.players[0].games++}],
 ['deep mutation',s=>{s.history.seasons[2044].players[0].hits=99;s.gameResults[0].events[0].text='changed'}],
 ['array and property changes',s=>{s.gameResults.splice(1,1);s.gameResults.push({day:5,events:[]});delete s.history.seasons[2044].meta;s.history.seasons[2045].players.push({id:2,hits:7})}],
 ['root replacement',s=>{s.history={seasons:{2046:{players:[{id:1,hits:100}]}}}}],
 ['active year raw mutations',s=>{s.highSchoolBaseball[2046].players[0].hits=20}],
 ['large map mutation',s=>{s.amateurCareerArchive.player20[0].hits=123;s.amateurCareerArchive.newPlayer=[{year:2046,hits:50}]}],
 ['clone archived profile', (s,t)=>{s.players[0].old=t.clone(s.highSchoolBaseball[2045].players[0])}]
])test('tracked native packing matches a full encode: '+name,async()=>{
 const codec=createNativeSaveCodec(),wire=await codec.pack(seed()),baseline=nativeWireDelta({},wire).fieldHashes;
 const state=restoreNativeSave(wire,{clone:true}),tracking=codec.track(state,wire),expected=seed();
 change(state,tracking);change(expected,{clone:structuredClone});
 const packed=await codec.pack(state),delta=nativeWireDelta(wire,packed,baseline,codec.reusedFields());
 assert.deepEqual(JSON.parse(JSON.stringify(restoreNativeSave(packed))),expected);
 if(name==='unchanged archives'){assert.ok(codec.reusedFields().size>5);assert.ok(delta.serializedFields.size<10)}
 assert.ok(!JSON.stringify(packed).includes('Proxy'));
});
test('season replacement does not accidentally pack the old tracked world',async()=>{
 const codec=createNativeSaveCodec(),wire=await codec.pack(seed()),state=restoreNativeSave(wire,{clone:true});codec.track(state,wire);
 const next={...state,year:2047,day:2,history:{seasons:{2046:{complete:true}}}};
 assert.equal(restoreNativeSave(await codec.pack(next)).year,2047);
});
test('random archive edits preserve full-encode equivalence across repeated cache reuse',async()=>{
 let random=731;const next=n=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random%n};
 const codec=createNativeSaveCodec();let wire=await codec.pack(seed()),hashes=nativeWireDelta({},wire).fieldHashes,state=restoreNativeSave(wire,{clone:true}),expected=seed();
 for(let day=0;day<40;day++){
  const tracking=codec.track(state,wire),operations=[];
  for(let i=0;i<8;i++)operations.push([next(6),next(100)]);
  for(const s of [state,expected])for(const [type,value] of operations){
   if(type===0)s.history.seasons[2045].players[0].hits=value;
   if(type===1)s.gameResults.push({day:value,events:[{text:'new'+value}]});
   if(type===2&&s.gameResults.length)s.gameResults.shift();
   if(type===3)s.highSchoolBaseball[2046].players[0].hits=value;
   if(type===4)s.amateurCareerArchive['player'+value]=[{year:2046,hits:value}];
   if(type===5)delete s.amateurCareerArchive['player'+value];
  }
  const packed=await codec.pack(state),delta=nativeWireDelta(wire,packed,hashes,codec.reusedFields()),normalized={...packed};
  for(const [key,raw] of delta.serializedFields)normalized[key]=JSON.parse(raw);
  state=restoreNativeSave(normalized,{previousWire:packed,previousState:state,changedKeys:[...delta.serializedFields.keys()]});codec.release();wire=normalized;hashes=delta.fieldHashes;
  assert.deepEqual(state,expected,'day '+day);
 }
});

test('active league governance stays unproxied and is encoded after raw edits',async()=>{
 const original=seed();original.leagueOffice={seasons:{2046:{ballId:'standard'}},governance:{cases:[{playerId:1,remaining:2}]}};
 const codec=createNativeSaveCodec(),wire=await codec.pack(original),state=restoreNativeSave(wire,{clone:true}),office=state.leagueOffice;
 codec.track(state,wire);assert.equal(state.leagueOffice,office);
 state.leagueOffice.governance.cases[0].remaining=1;
 const packed=await codec.pack(state);assert.equal(restoreNativeSave(packed).leagueOffice.governance.cases[0].remaining,1);
 assert.ok(![...codec.reusedFields()].some(key=>key.startsWith('beServerPart_leagueOffice')));
});
