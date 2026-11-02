import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWireDelta} from './wire-delta.mjs';
import {createSaveWireCodec} from './save-wire-codec.mjs';
test('incremental wire preserves unknown fields, updates manifests and removes obsolete shards',async()=>{
 const codec=createSaveWireCodec();
 const state={year:2046,day:1,players:Array.from({length:33},(_,id)=>({id,name:'P'+id})),teams:[],unknownExtension:{retained:true}};
 const previous=await codec.pack(state),nextState=await codec.restore(previous);
 nextState.day++;nextState.players.splice(2);nextState.newExtension={present:true};
 const current=await codec.pack(nextState),delta=buildWireDelta(previous,current);
 assert.ok(delta.unset.length>0);
 assert.ok(!Object.hasOwn(delta.set,'unknownExtension'));
 const rebuilt={...previous,...delta.set};for(const key of delta.unset)delete rebuilt[key];
 assert.deepEqual(rebuilt,current);
 assert.deepEqual(await createSaveWireCodec().restore(rebuilt),nextState);
});
