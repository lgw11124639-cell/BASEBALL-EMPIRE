import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {gzipSync,gunzipSync} from 'node:zlib';
import {compressSerializedFields,createAdvanceDayStore} from './advance-day-store.mjs';
import {nativeDeltaDigest} from './native-save-codec.mjs';
function setup(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field))');db.prepare("INSERT INTO be_save_shard_meta VALUES(1,'main',1,'now','first',0)").run();const store=createAdvanceDayStore(db,{});return {db,store}}
const set=new Map([['field',JSON.stringify({text:'선수 기록 '.repeat(50000),count:2})]]),unset=[];
test('gzip work is asynchronous, lossless and bounded to two in-flight fields',async()=>{
 let active=0,peak=0;const input=new Map(Array.from({length:12},(_,i)=>['field'+i,JSON.stringify({i})]));
 const result=await compressSerializedFields(input,{compress:async raw=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return gzipSync(raw,{level:1})}});assert.equal(peak,2);assert.equal(active,0);for(const [key,raw] of input)assert.equal(gunzipSync(result.get(key)).toString(),raw);
 let heartbeat=false;const prepared=compressSerializedFields(set);setImmediate(()=>{heartbeat=true});await prepared;assert.equal(heartbeat,true);
});
test('failed compression drains active jobs and stops the queue',async()=>{
 let calls=0,active=0;
 await assert.rejects(compressSerializedFields(new Map(Array.from({length:100},(_,i)=>['k'+i,'x'])),{compress:async()=>{calls++;active++;await new Promise(resolve=>setImmediate(resolve));active--;throw Error('controlled compressor failure')}}),/controlled/);assert.equal(active,0);assert.equal(calls,2);
});
test('compressed actual-day bytes commit atomically with unchanged digest, receipt and revision checks',async()=>{
 const {db,store}=setup();try{
  const options={user:1,slot:'main',expectedRev:1,set,unset};const token=await store.prepareSerializedDelta(options);
  assert.equal(db.isTransaction,false);assert.equal(store.metadata(1,'main').rev,1);assert.equal(store.receipt(1,'main','async-compression-001',1),null);
  const result=store.commit({user:1,slot:'main',expectedRev:1,requestId:'async-compression-001',serializedDelta:set,delta:{unset},compressionToken:token,result:{timing:{compressionMs:3}}});
  assert.equal(result.status,200);assert.equal(result.rev,2);assert.equal(result.digest,nativeDeltaDigest('first',2,set,unset));assert.deepEqual(store.load(1,'main').save.field,JSON.parse(set.get('field')));assert.ok(result.day.timing.writeMs>=3);
  assert.equal(store.commit({user:1,slot:'main',expectedRev:1,requestId:'async-compression-001',serializedDelta:set,delta:{unset},result:{}}).replayed,true);
  const stale=await store.prepareSerializedDelta(options);assert.equal(store.commit({user:1,slot:'main',expectedRev:1,requestId:'async-compression-002',serializedDelta:set,delta:{unset},compressionToken:stale,result:{}}).status,409);
 }finally{db.close()}
});
test('compressed tokens cannot cross owners, changed payloads or receipts and failed receipts roll back',async()=>{
 const {db,store}=setup();try{
  const options={user:1,slot:'main',expectedRev:1,set,unset};const token=await store.prepareSerializedDelta(options);
  assert.throws(()=>store.commit({user:2,slot:'main',expectedRev:1,requestId:'wrong-owner-request',serializedDelta:set,delta:{unset},compressionToken:token,result:{}}),/binding/);
  const changed=new Map(set),changedToken=await store.prepareSerializedDelta({...options,set:changed});changed.set('field','null');assert.throws(()=>store.commit({user:1,slot:'main',expectedRev:1,requestId:'changed-payload-request',serializedDelta:changed,delta:{unset},compressionToken:changedToken,result:{}}),/binding/);
  db.exec("CREATE TRIGGER reject_async BEFORE INSERT ON be_day_requests BEGIN SELECT RAISE(ABORT,'controlled receipt failure'); END");const fail=await store.prepareSerializedDelta(options);assert.throws(()=>store.commit({user:1,slot:'main',expectedRev:1,requestId:'async-rollback-request',serializedDelta:set,delta:{unset},compressionToken:fail,result:{}}),/controlled receipt/);assert.equal(store.metadata(1,'main').rev,1);assert.equal(db.prepare('SELECT count(*) AS n FROM be_save_shards').get().n,0);assert.equal(db.isTransaction,false);
 }finally{db.close()}
});

test('compression failure commits no day or receipt and a retry reloads the authoritative save',async()=>{
 const {createNativeSaveCodec}=await import('./native-save-codec.mjs'),{createAdvanceDayService}=await import('./advance-day-service.mjs');
 const {db,store}=setup();try{
  const wire=await createNativeSaveCodec().pack({year:2046,day:100,players:[],teams:[],gameResults:[]});
  for(const [key,value] of Object.entries(wire))db.prepare("INSERT INTO be_save_shards VALUES(1,'main',?,?)").run(key,gzipSync(JSON.stringify(value)));
  let calls=0;const advance=createAdvanceDayService({store,ownsRestoredState:true,restoreSave(){throw Error('native only')},runDay(state){calls++;state.day++;return {state,result:{}}}}),prepare=store.prepareSerializedDelta;
  store.prepareSerializedDelta=async()=>{throw Error('controlled compression rejection')};
  const request={userId:1,slot:'main',expectedRev:1,requestId:'compression-retry-request',nativeWire:true};
  assert.equal((await advance(request)).status,500);assert.equal(store.metadata(1,'main').rev,1);assert.equal(store.load(1,'main').save.day,100);assert.equal(store.receipt(1,'main',request.requestId,1),null);
  store.prepareSerializedDelta=prepare;const retry=await advance(request);assert.equal(retry.status,200);assert.equal(retry.rev,2);assert.equal(store.load(1,'main').save.day,101);assert.equal(calls,2);assert.equal((await advance(request)).replayed,true);
 }finally{db.close()}
});
