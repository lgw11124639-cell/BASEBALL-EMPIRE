import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {verifyAdvanceStore} from './verify-advance-day-store.mjs';
// Test the transaction boundary against real SQLite using a minimal shard adapter.
// stage-advance-day.mjs runs the same suite against the actual production source.
function createTestShards(db){
 const meta=db.prepare('SELECT * FROM be_save_shard_meta WHERE user_id=? AND slot=?');
 const fields=db.prepare('SELECT field,content FROM be_save_shards WHERE user_id=? AND slot=?');
 return {
  get(user,slot){const row=meta.get(user,slot);return row?{...row,save:Object.fromEntries(fields.all(user,slot).map(r=>[r.field,JSON.parse(gunzipSync(r.content))]))}:null},
  patch(user,slot,expected,set,unset){
   const current=meta.get(user,slot);
   if(current?.rev!==expected)return {status:409,current_rev:current?.rev||0};
   db.exec('SAVEPOINT be_shard_patch');
   try{
    for(const key of unset)db.prepare('DELETE FROM be_save_shards WHERE user_id=? AND slot=? AND field=?').run(user,slot,key);
    for(const [key,value] of Object.entries(set))db.prepare('INSERT OR REPLACE INTO be_save_shards VALUES(?,?,?,?)').run(user,slot,key,gzipSync(JSON.stringify(value)));
    db.prepare('UPDATE be_save_shard_meta SET rev=rev+1,digest=? WHERE user_id=? AND slot=?').run('test-digest',user,slot);
    db.exec('RELEASE be_shard_patch');return {status:200,ok:true,slot,rev:expected+1,digest:'test-digest'};
   }catch(error){db.exec('ROLLBACK TO be_shard_patch');db.exec('RELEASE be_shard_patch');throw error}
  },
  put(user,slot,expected,data){
   db.exec('SAVEPOINT be_shard_write');
   try{
    const current=meta.get(user,slot);
    if((current?.rev||0)!==expected){db.exec('RELEASE be_shard_write');return {status:409,current_rev:current?.rev||0}}
    db.prepare('DELETE FROM be_save_shards WHERE user_id=? AND slot=?').run(user,slot);
    const insert=db.prepare('INSERT INTO be_save_shards VALUES(?,?,?,?)');
    for(const [key,value] of Object.entries(data))insert.run(user,slot,key,gzipSync(JSON.stringify(value)));
    db.prepare('INSERT OR REPLACE INTO be_save_shard_meta VALUES(?,?,?,?,?,?)').run(user,slot,expected+1,'test-date','test-digest',0);
    db.exec('RELEASE be_shard_write');return {status:200,ok:true,slot,rev:expected+1,digest:'test-digest'};
   }catch(error){db.exec('ROLLBACK TO be_shard_write');db.exec('RELEASE be_shard_write');throw error}
  }
 };
}
test('atomic day commits, durable retries, concurrent requests and failures',async()=>{
 const report=await verifyAdvanceStore(createTestShards);
 assert.equal(report.success,true);
});
test('warm decoded state avoids reads and gzip restore but preserves DB authority and failure rollback',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {createAdvanceDayStore}=await import('./advance-day-store.mjs');
 const {createAdvanceDayService}=await import('./advance-day-service.mjs');
 const {createDecodedDayCache}=await import('./decoded-day-cache.mjs');
 const {createSaveWireCodec}=await import('./save-wire-codec.mjs');
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field))');
 const shards=createTestShards(db),store=createAdvanceDayStore(db,shards),cache=createDecodedDayCache();
 const seed={year:2027,day:1,players:[{id:1,name:'Original'}],teams:[],extension:{value:1},history:{seasons:{2026:{complete:true}}}};
 shards.put(1,'main',0,await createSaveWireCodec().pack(seed));
 let reads=0,restores=0,runs=0,fail=false;
 const originalLoad=store.load;store.load=(...args)=>{reads++;return originalLoad(...args)};
 const codecFactory=()=>{const codec=createSaveWireCodec();return {pack:s=>codec.pack(s),restore:s=>{restores++;return codec.restore(s)}}};
 const advance=createAdvanceDayService({store,stateCache:cache,codecFactory,restoreSave:s=>s,runDay:async state=>{runs++;if(fail){fail=false;state.players[0].name='Uncommitted';throw Error('deliberate failure')}state.day++;state.extension.value++;state.players[0].jsonOnly=undefined;state.nonFinite=NaN;return {state,result:{}}}});
 const first=await advance({userId:1,expectedRev:1,requestId:'warm-cache-first1'});assert.equal(first.status,200);assert.equal(first.day.timing.cacheHit,false);
 const second=await advance({userId:1,expectedRev:2,requestId:'warm-cache-second'});assert.equal(second.status,200);assert.equal(second.day.timing.cacheHit,true);assert.equal(reads,1);assert.equal(restores,1);
 assert.equal((await createSaveWireCodec().restore(shards.get(1,'main').save)).extension.value,3,'warm raw fields remain detached from the acknowledged wire baseline');
 assert.equal((await advance({userId:1,expectedRev:1,requestId:'warm-cache-first1'})).replayed,true);assert.equal(runs,2);
 fail=true;const request={userId:1,expectedRev:3,requestId:'warm-cache-failure'};
 assert.equal((await advance(request)).status,500);assert.equal(shards.get(1,'main').rev,3);
 const recovered=await advance(request);assert.equal(recovered.status,200);assert.equal(recovered.day.timing.cacheHit,false);
 assert.equal((await createSaveWireCodec().restore(shards.get(1,'main').save)).players[0].name,'Original');
 db.prepare('UPDATE be_save_shard_meta SET digest=? WHERE user_id=1').run('changed-outside-cache');
 const changed=await advance({userId:1,expectedRev:4,requestId:'warm-cache-digest1'});assert.equal(changed.day.timing.cacheHit,false);
 const external=structuredClone(seed);external.players[0].name='External';
 shards.put(1,'main',5,await createSaveWireCodec().pack(external));
 const externalResult=await advance({userId:1,expectedRev:6,requestId:'warm-cache-external'});assert.equal(externalResult.status,200);assert.equal(externalResult.day.timing.cacheHit,false);
 assert.equal((await createSaveWireCodec().restore(shards.get(1,'main').save)).players[0].name,'External');
 shards.put(2,'main',0,await createSaveWireCodec().pack(seed));
 assert.equal((await advance({userId:2,expectedRev:1,requestId:'warm-cache-user-two'})).day.timing.cacheHit,false);
 cache.clear();db.close();
});
test('native format migrates atomically, detects changes with pre-mutation hashes and rolls back receipts',async()=>{
 const {DatabaseSync}=await import('node:sqlite'),{createSaveWireCodec}=await import('./save-wire-codec.mjs'),{createNativeSaveCodec,nativeWireDelta}=await import('./native-save-codec.mjs');
 const {createAdvanceDayStore}=await import('./advance-day-store.mjs'),{createAdvanceDayService}=await import('./advance-day-service.mjs');
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field))');
 const shards=createTestShards(db),store=createAdvanceDayStore(db,shards),legacy=createSaveWireCodec();
 const initial={year:2046,day:100,players:[{id:1,name:'A',games:1}],teams:[],gameResults:[],history:{seasons:{2045:{complete:true}}}};
 shards.put(1,'main',0,await legacy.pack(initial));
 db.exec('UPDATE be_save_shard_meta SET compressed_bytes=(SELECT sum(length(content)) FROM be_save_shards)');
 const advance=createAdvanceDayService({store,restoreSave:s=>legacy.restore(s),codecFactory:createSaveWireCodec,ownsRestoredState:true,includeDelta:true,runDay:async s=>{s.day++;s.players[0].games++;return {state:s,result:{}}}});
 const first=await advance({userId:1,expectedRev:1,requestId:'native-migration1',nativeWire:true});assert.equal(first.status,200);assert.equal(first.day.timing.storageFormat,'server-json-v1');
 const before=store.load(1,'main');assert.ok(before.save.beServerNativeManifest);assert.equal((await legacy.restore(before.save)).players[0].games,2);
 const native=new createNativeSaveCodec();
 const owned=await native.restore(before.save,{takeOwnership:true});owned.players[0].games=99;
 const next=await native.pack(owned),delta=nativeWireDelta(before.save,next,before.fieldHashes);
 assert.ok(Object.keys(delta.set).some(k=>k.startsWith('beServerPart_players')),'in-place mutation cannot change the saved baseline hashes');
 const previous=store.load(1,'main');
 db.exec("CREATE TRIGGER native_receipt_failure BEFORE INSERT ON be_day_requests BEGIN SELECT RAISE(ABORT,'native receipt failure'); END");
 assert.throws(()=>store.commit({user:1,slot:'main',requestId:'native-rollback-1',expectedRev:2,state:next,delta,serializedDelta:delta.serializedSet,result:{}}),/native receipt failure/);
 assert.deepEqual(store.load(1,'main'),previous);db.exec('DROP TRIGGER native_receipt_failure');
 const second=await advance({userId:1,expectedRev:2,requestId:'native-continue-1',nativeWire:true});assert.equal(second.status,200);assert.equal((await legacy.restore(store.load(1,'main').save)).players[0].games,3);
 assert.equal(db.prepare('SELECT compressed_bytes AS n FROM be_save_shard_meta WHERE user_id=1').get().n,db.prepare('SELECT sum(length(content)) AS n FROM be_save_shards WHERE user_id=1').get().n);
 assert.equal((await advance({userId:1,expectedRev:1,requestId:'native-migration1',nativeWire:true})).replayed,true);
 db.close();
});
