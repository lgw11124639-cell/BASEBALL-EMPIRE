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
  put(user,slot,expected,data){
   db.exec('SAVEPOINT be_shard_write');
   try{
    const current=meta.get(user,slot);
    if((current?.rev||0)!==expected){db.exec('RELEASE be_shard_write');return {status:409,current_rev:current?.rev||0}}
    db.prepare('DELETE FROM be_save_shards WHERE user_id=? AND slot=?').run(user,slot);
    const insert=db.prepare('INSERT INTO be_save_shards VALUES(?,?,?,?)');
    for(const [key,value] of Object.entries(data))insert.run(user,slot,key,gzipSync(JSON.stringify(value)));
    db.prepare('INSERT OR REPLACE INTO be_save_shard_meta VALUES(?,?,?,?,?,?)').run(user,slot,expected+1,'test-date','test-digest',0);
    db.exec('RELEASE be_shard_write');return {status:200,ok:true,slot,rev:expected+1};
   }catch(error){db.exec('ROLLBACK TO be_shard_write');db.exec('RELEASE be_shard_write');throw error}
  }
 };
}
test('atomic day commits, durable retries, concurrent requests and failures',async()=>{
 const report=await verifyAdvanceStore(createTestShards);
 assert.equal(report.success,true);
});
