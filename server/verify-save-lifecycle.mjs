import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createSaveLifecycleStore,createSaveLifecycleService} from './save-lifecycle.mjs';
export async function verifySaveLifecycle(createShardStore){
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));
  CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field));
  CREATE TABLE be_user_saves(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,content BLOB,PRIMARY KEY(user_id,slot));`);
  const shards=createShardStore(db),store=createSaveLifecycleStore(db,shards);
  const fixture={schema:1,year:2046,day:56,teamId:0,teams:Array.from({length:10},(_,id)=>({id})),players:[{id:1}],history:{preserved:'fixture'}};
  shards.put(1,'main',0,fixture);shards.put(2,'main',0,{other:'user'});
  const fields=db.prepare('SELECT field,hex(content) AS content FROM be_save_shards WHERE user_id=1 ORDER BY field').all();
  const service=createSaveLifecycleService({store,restoreSave:async s=>s,encodeSave:async s=>s});
  const reset={userId:1,requestId:'staged-lifecycle-reset-01',expectedRev:1,type:'reset',input:{confirm:true}};
  assert.equal((await service(reset)).status,200);assert.equal(shards.get(1,'main').rev,2);
  assert.equal(shards.get(1,'main').save.beServerSlotEmpty,true);
  assert.deepEqual(db.prepare('SELECT field,hex(content) AS content FROM be_save_version_fields WHERE user_id=1 AND source_rev=1 ORDER BY field').all(),fields);
  const again=createSaveLifecycleService({store:createSaveLifecycleStore(db,shards),restoreSave:async s=>s,encodeSave:async s=>s});
  assert.equal((await again(reset)).replayed,true);assert.equal(shards.get(1,'main').rev,2);
  assert.equal((await again({userId:1,requestId:'staged-lifecycle-restore',expectedRev:2,type:'restore',input:{save:fixture}})).status,200);
  assert.deepEqual({...shards.get(1,'main').save},fixture);assert.equal(shards.get(1,'main').rev,3);
  const archivedBefore=db.prepare('SELECT count(*) AS n FROM be_save_versions').get().n;
  db.exec("CREATE TRIGGER lifecycle_fail BEFORE INSERT ON be_lifecycle_requests BEGIN SELECT RAISE(ABORT,'expected lifecycle receipt failure'); END");
  assert.throws(()=>store.commit({user:1,requestId:'staged-lifecycle-failure',expectedRev:3,fingerprint:'test',type:'reset',state:{beServerSlotEmpty:true}}),/expected lifecycle receipt failure/);
  assert.deepEqual({...shards.get(1,'main').save},fixture);assert.equal(shards.get(1,'main').rev,3);
  assert.equal(db.prepare('SELECT count(*) AS n FROM be_save_versions').get().n,archivedBefore);
  assert.equal(shards.get(2,'main').save.other,'user');
  return {success:true,stage:'save-lifecycle',allPriorCompressedFieldsPreserved:true,resetArchived:true,restoreVerified:true,retryIdempotent:true,monotonicRevisions:true,receiptFailureRollback:true,userIsolation:true,productionDatabaseOpened:false};
 }finally{db.close()}
}
