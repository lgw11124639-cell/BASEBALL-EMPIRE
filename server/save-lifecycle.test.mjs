import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createTestShards} from './test-fixtures/shards.mjs';
import {createSaveLifecycleStore,createSaveLifecycleService} from './save-lifecycle.mjs';
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field));');
 const shards=createTestShards(db),store=createSaveLifecycleStore(db,shards);
 const state={schema:1,year:2046,day:56,teamId:0,teams:Array.from({length:10},(_,id)=>({id})),players:[{id:1}],history:{archive:'must survive'},gameResults:[]};
 const service=createSaveLifecycleService({store,restoreSave:async s=>s,encodeSave:async s=>s,createWorld:teamId=>({...state,teamId,year:2027,day:1})});
 return {db,shards,store,state,service};
}
test('new game archives every prior shard; retry after service recreation is idempotent',async()=>{
 const {db,shards,store,state,service}=setup();
 try{
  shards.put(1,'main',0,state);shards.put(2,'main',0,{private:'other user'});
  const old=db.prepare('SELECT field,hex(content) AS bytes FROM be_save_shards WHERE user_id=1 ORDER BY field').all();
  const req={userId:1,requestId:'lifecycle-new-game-01',expectedRev:1,type:'new-game',input:{teamId:3}};
  const saved=await service(req);assert.equal(saved.status,200);assert.equal(saved.rev,2);assert.equal(shards.get(1,'main').save.teamId,3);
  const archive=db.prepare('SELECT field,hex(content) AS bytes FROM be_save_version_fields WHERE user_id=1 AND source_rev=1 ORDER BY field').all();assert.deepEqual(archive,old);
  const restarted=createSaveLifecycleService({store,restoreSave:async s=>s,encodeSave:async s=>s});
  assert.equal((await restarted(req)).replayed,true);assert.equal(shards.get(1,'main').rev,2);
  assert.equal((await restarted({...req,input:{teamId:4}})).status,409);
  assert.equal(shards.get(2,'main').save.private,'other user');
 }finally{db.close()}
});
test('reset retains original data in archive and keeps revisions monotonic for restore',async()=>{
 const {db,shards,state,service}=setup();
 try{
  shards.put(1,'main',0,state);
  const reset=await service({userId:1,requestId:'lifecycle-reset-0001',expectedRev:1,type:'reset',input:{confirm:true}});
  assert.equal(reset.status,200);assert.equal(reset.rev,2);assert.equal(shards.get(1,'main').save.beServerSlotEmpty,true);
  assert.ok(db.prepare('SELECT 1 FROM be_save_version_fields WHERE user_id=1 AND source_rev=1 AND field=?').get('history'));
  const restored=await service({userId:1,requestId:'lifecycle-restore-01',expectedRev:2,type:'restore',input:{save:state}});
  assert.equal(restored.status,200);assert.equal(restored.rev,3);assert.deepEqual(shards.get(1,'main').save,state);
  assert.equal((await service({userId:1,requestId:'lifecycle-stale-001',expectedRev:1,type:'reset',input:{confirm:true}})).status,409);
 }finally{db.close()}
});
test('receipt failure rolls back new state and archive together',()=>{
 const {db,shards,store,state}=setup();
 try{
  shards.put(1,'main',0,state);
  db.exec("CREATE TRIGGER fail_lifecycle BEFORE INSERT ON be_lifecycle_requests BEGIN SELECT RAISE(ABORT,'receipt failure'); END");
  assert.throws(()=>store.commit({user:1,requestId:'lifecycle-failure-01',expectedRev:1,fingerprint:'x',type:'reset',state:{beServerSlotEmpty:true}}),/receipt failure/);
  assert.deepEqual(shards.get(1,'main').save,state);assert.equal(shards.get(1,'main').rev,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM be_save_versions').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM be_save_version_fields').get().n,0);
 }finally{db.close()}
});
test('first game can create revision 1; reset requires explicit confirmation',async()=>{
 const {db,shards,service}=setup();
 try{
  assert.equal((await service({userId:1,requestId:'lifecycle-no-confirm',expectedRev:0,type:'reset',input:{}})).status,400);
  assert.equal((await service({userId:1,requestId:'lifecycle-first-001',expectedRev:0,type:'new-game',input:{teamId:0}})).status,200);
  assert.equal(shards.get(1,'main').rev,1);
 }finally{db.close()}
});

test('deployment verification suite passes against a real SQLite shard adapter',async()=>{const {verifySaveLifecycle}=await import('./verify-save-lifecycle.mjs');assert.equal((await verifySaveLifecycle(createTestShards)).success,true)});
test('a concurrent newer save wins without archiving or replacing stale data',async()=>{
 const {db,shards,store,state}=setup();
 try{
  shards.put(1,'main',0,state);let release;
  const delayed=createSaveLifecycleService({store,restoreSave:s=>new Promise(r=>{release=()=>r(s)}),encodeSave:async s=>s});
  const work=delayed({userId:1,requestId:'lifecycle-racing-001',expectedRev:1,type:'restore',input:{save:state}});
  await Promise.resolve();const newer={...state,day:57};shards.put(1,'main',1,newer);release();
  assert.equal((await work).status,409);assert.deepEqual(shards.get(1,'main').save,newer);
  assert.equal(db.prepare('SELECT count(*) AS n FROM be_save_versions').get().n,0);
 }finally{db.close()}
});

test('production null-prototype root objects retain identical save semantics',async()=>{
 const {verifySaveLifecycle}=await import('./verify-save-lifecycle.mjs');
 const productionShape=db=>{
  const shards=createTestShards(db),get=shards.get;
  return {...shards,get(user,slot){const snapshot=get(user,slot);return snapshot?{...snapshot,save:Object.assign(Object.create(null),snapshot.save)}:null}};
 };
 assert.equal((await verifySaveLifecycle(productionShape)).success,true);
});
