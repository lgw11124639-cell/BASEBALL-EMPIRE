import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeSaveCodec,nativeWireDelta} from './native-save-codec.mjs';
import {createSaveWireCodec} from './save-wire-codec.mjs';
import {restoreNativeSave,NATIVE_SAVE_MANIFEST,isNativeSave} from '../native-save.js';
const seed=()=>({year:2046,day:110,teamId:0,seasonStartDate:'2046-01-01',teams:Array.from({length:10},(_,id)=>({id,name:'T'+id,city:'C',wins:10,losses:9,draws:0})),players:Array.from({length:180},(_,id)=>({id,name:'P'+id,profile:{baseball:{fatigue:2}},games:12})),gameResults:[{year:2046,day:109,away:0,home:1,awayRuns:4,homeRuns:5,broadcastEvents:[{inning:2,text:'중계 보존'}]}],history:{seasons:{2045:{year:2045,complete:true,players:[{id:1,hits:100}]}}},amateurCareerArchive:Object.fromEntries(Array.from({length:140},(_,i)=>['P'+i,[{year:2045,hits:i}]])),unknownExtension:{preserved:true}});
test('server JSON parts preserve legacy saves, replays and unknown fields without inner compression',async()=>{
 const original=seed(),legacy=await createSaveWireCodec().pack(original),codec=createNativeSaveCodec();
 const decoded=await codec.restore(legacy),wire=await codec.pack(decoded);
 assert.ok(isNativeSave(wire));assert.equal(wire[NATIVE_SAVE_MANIFEST].version,1);
 assert.ok(Object.keys(wire).filter(k=>k.startsWith('beServerPart_')).every(k=>typeof wire[k]==='object'));
 assert.deepEqual(restoreNativeSave(wire,{clone:true}),original);
 assert.deepEqual(await createSaveWireCodec().restore(wire),original);
 const oldClient=await createSaveWireCodec().pack(await createSaveWireCodec().restore(wire));
 assert.deepEqual(await createSaveWireCodec().restore(oldClient),original);
 assert.deepEqual(original,seed());
});
test('native incremental updates reuse unchanged histories and remove obsolete parts',async()=>{
 const codec=createNativeSaveCodec(),first=await codec.pack(seed()),before=restoreNativeSave(first,{clone:true});
 const baseline=nativeWireDelta({},first).fieldHashes;
 const changed=structuredClone(before);changed.day++;changed.players.splice(2);changed.players[0].games++;
 const wire=await codec.pack(changed),delta=nativeWireDelta(first,wire,baseline);
 assert.ok(delta.unset.length>0);assert.ok(!Object.hasOwn(delta.set,'beServerPart_history_seasons_2045_players_0'));
 const combined={...first,...delta.set};for(const key of delta.unset)delete combined[key];
 const next=restoreNativeSave(combined,{previousWire:first,previousState:before,changedKeys:[...Object.keys(delta.set),...delta.unset]});
 assert.deepEqual(next,changed);assert.equal(next.history,before.history);
 const broken=structuredClone(wire);delete broken[wire[NATIVE_SAVE_MANIFEST].fields.players.parts[0]];
 assert.throws(()=>restoreNativeSave(broken),/Missing/);
});
