import test from 'node:test';import assert from 'node:assert/strict';import {gzipSync,gunzipSync} from 'node:zlib';
import {packNativeSave,compressedNativeWire,restoreNativeSave,copyNativeWire,applyNativeValuePatch} from '../native-save.js';
const encode=wire=>Object.fromEntries(Object.entries(wire).map(([key,value])=>[key,key.startsWith('beServerPart_')?gzipSync(JSON.stringify(value)).toString('base64'):value]));
test('compressed bootstrap and wire copies do not decode archives; arrays preserve complete JSON and iteration',()=>{
 const original={schema:1,year:2046,day:2,players:Array.from({length:130},(_,id)=>({id,name:'p'+id})),gameResults:Array.from({length:10},(_,day)=>({day,broadcastEvents:[{text:'event'+day}]})),amateurCareerArchive:{2040:{players:Array.from({length:75},(_,id)=>({id}))}}};
 let reads=0;const wire=compressedNativeWire(encode(packNativeSave(original)),{decode:b=>gunzipSync(Buffer.from(b,'base64')).toString(),maxChars:100,onDecode:()=>reads++}),state=restoreNativeSave(wire);
 assert.equal(reads,0,'opening a world must not hydrate historical chunks');assert.equal(state.day,2);assert.equal(state.players.length,130);assert.equal(reads,0);
 assert.deepEqual(state.players.slice(62,67),original.players.slice(62,67));assert.equal(state.players.find(p=>p.id===129).name,'p129');assert.ok(state.players.every(p=>p.id>=0));
 assert.deepEqual(JSON.parse(JSON.stringify(state)),original,'all deferred history remains available without deleting records');
 const before=reads,next=copyNativeWire(wire,{day:3});assert.equal(reads,before,'copying the acknowledged wire must not invoke part getters');
 const key='beServerPart_players_0',changed=applyNativeValuePatch(wire[key],[['set',[0,'name'],'updated']]);
 Object.defineProperty(next,key,{value:changed,enumerable:true,writable:true,configurable:true});
 const restored=restoreNativeSave(next,{previousWire:wire,previousState:state,changedKeys:['day',key]});assert.equal(restored.players[0].name,'updated');assert.equal(state.players[0].name,'p0');assert.equal(restored.day,3);assert.equal(restored.gameResults,state.gameResults);
});
test('compressed HTTP snapshot is session scoped and does not advance the save',async()=>{
 const {DatabaseSync}=await import('node:sqlite'),{createAdvanceDayRoute}=await import('./advance-day-route.mjs');
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field))');
 const source={schema:1,year:2046,day:9,players:[{id:1}],gameResults:[],history:{seasons:{2040:{note:'retained'}}}};
 db.prepare("INSERT INTO be_save_shard_meta VALUES(1,'main',7,'now','digest',0)").run();const insert=db.prepare("INSERT INTO be_save_shards VALUES(1,'main',?,?)");for(const [key,value] of Object.entries(packNativeSave(source)))insert.run(key,gzipSync(JSON.stringify(value)));
 let reply;const route=createAdvanceDayRoute({db,shards:{},restoreSave(){throw Error('snapshot must not hydrate the engine')},body(){throw Error('GET must not read a body')},response:(res,status,payload)=>reply={status,payload}}),req={url:'/v2/engine/snapshot?userId=1',method:'GET'};
 await route(req,{},null,null);assert.equal(reply.status,401);await route(req,{},null,{user_id:2});assert.equal(reply.status,404);
 await route(req,{},null,{user_id:1});assert.equal(reply.status,200);assert.equal(reply.payload.rev,7);
 const wire=compressedNativeWire(reply.payload.save,{decode:b=>gunzipSync(Buffer.from(b,'base64')).toString()});assert.deepEqual(JSON.parse(JSON.stringify(restoreNativeSave(wire))),source);
 assert.equal(db.prepare('SELECT rev FROM be_save_shard_meta WHERE user_id=1').get().rev,7);assert.equal(db.prepare('SELECT count(*) AS n FROM be_day_requests').get().n,0);db.close();
});
test('roster and standings scans do not repeatedly inflate replay events after LRU eviction',()=>{
 const original={players:[],gameResults:Array.from({length:8},(_,day)=>({day,awayRuns:day,awayPitchers:[{id:1,innings:6}],broadcastEvents:Array.from({length:100},(_,i)=>({text:'Replay event '+i}))}))};
 let reads=0;const wire=compressedNativeWire(encode(packNativeSave(original)),{decode:b=>gunzipSync(Buffer.from(b,'base64')).toString(),maxChars:1,onDecode:()=>reads++}),state=restoreNativeSave(wire);
 const sums=()=>state.gameResults.reduce((sum,g)=>sum+g.awayRuns+g.awayPitchers[0].innings,0);
 sums();assert.equal(reads,8);for(let player=0;player<50;player++)sums();assert.equal(reads,8,'repeated player statistics retain small box scores without replay decoding');
 assert.deepEqual(state.gameResults[0].broadcastEvents,original.gameResults[0].broadcastEvents);assert.equal(reads,9,'replay remains available when explicitly opened');
 assert.deepEqual(JSON.parse(JSON.stringify(state)),original,'summary cache must preserve every replay field');
});
