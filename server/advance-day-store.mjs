import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
// Requires a SAVEPOINT-compatible shard store on the same SQLite connection.
// No simulation or asynchronous work may run inside commit().
export function createAdvanceDayStore(db,shards){
 db.exec(`CREATE TABLE IF NOT EXISTS be_day_requests (
  user_id INTEGER NOT NULL, slot TEXT NOT NULL, request_id TEXT NOT NULL,
  expected_rev INTEGER NOT NULL, response TEXT NOT NULL,
  PRIMARY KEY(user_id,slot,request_id)
 )`);
 const find=db.prepare('SELECT expected_rev,response FROM be_day_requests WHERE user_id=? AND slot=? AND request_id=?');
 const insert=db.prepare('INSERT INTO be_day_requests(user_id,slot,request_id,expected_rev,response) VALUES(?,?,?,?,?)');
 const rev=db.prepare('SELECT rev FROM be_save_shard_meta WHERE user_id=? AND slot=?');
 const metadata=db.prepare('SELECT * FROM be_save_shard_meta WHERE user_id=? AND slot=?');
 const fieldRows=db.prepare('SELECT field,content FROM be_save_shards WHERE user_id=? AND slot=? ORDER BY rowid');
 const nativeUpsert=db.prepare('INSERT INTO be_save_shards(user_id,slot,field,content) VALUES(?,?,?,?) ON CONFLICT(user_id,slot,field) DO UPDATE SET content=excluded.content');
 const nativeRemove=db.prepare('DELETE FROM be_save_shards WHERE user_id=? AND slot=? AND field=?');
 const fieldSize=db.prepare('SELECT length(content) AS bytes FROM be_save_shards WHERE user_id=? AND slot=? AND field=?');
 const nativeMeta=db.prepare('UPDATE be_save_shard_meta SET rev=?,updated_at=?,digest=?,compressed_bytes=? WHERE user_id=? AND slot=?');
 function patchSerialized(user,slot,expected,set,unset){
  const m=metadata.get(user,slot);if(!m||m.rev!==expected)return {status:409,current_rev:m?.rev||0};
  let bytes=Number(m.compressed_bytes)||0;const digest=createHash('sha256');digest.update('be-shard-delta-v2');digest.update(m.digest);digest.update(String(expected+1));
  for(const key of [...unset].sort()){if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid field');digest.update('DELETE');digest.update(key)}
  for(const key of [...set.keys()].sort()){if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid field');digest.update('SET');digest.update(key);digest.update(set.get(key))}
  for(const key of unset){bytes-=fieldSize.get(user,slot,key)?.bytes||0;nativeRemove.run(user,slot,key)}
  for(const [key,raw] of set){bytes-=fieldSize.get(user,slot,key)?.bytes||0;const data=gzipSync(raw,{level:1});nativeUpsert.run(user,slot,key,data);bytes+=data.length}
  const result={status:200,ok:true,slot,rev:expected+1,updated_at:new Date().toISOString(),digest:digest.digest('hex'),compressed_bytes:bytes};
  nativeMeta.run(result.rev,result.updated_at,result.digest,bytes,user,slot);return result;
 }
 function receipt(user,slot,requestId,expectedRev){
  const item=find.get(user,slot,requestId);
  if(!item)return null;
  return item.expected_rev===expectedRev?{status:200,...JSON.parse(item.response),replayed:true}:{status:409,error:'request ID reused with a different revision'};
 }
 return {
  receipt,
  metadata(user,slot){return metadata.get(user,slot)||null},
  load(user,slot){
   db.exec('SAVEPOINT be_day_read');
   try{
    const m=metadata.get(user,slot);if(!m){db.exec('RELEASE be_day_read');return null}
    const save=Object.create(null),fieldHashes=new Map();
    for(const row of fieldRows.all(user,slot)){const raw=gunzipSync(row.content);fieldHashes.set(row.field,createHash('sha256').update(raw).digest('hex'));Object.defineProperty(save,row.field,{value:JSON.parse(raw.toString('utf8')),enumerable:true,writable:true,configurable:true})}
    db.exec('RELEASE be_day_read');return {...m,slot,save,fieldHashes};
   }
   catch(error){db.exec('ROLLBACK TO be_day_read');db.exec('RELEASE be_day_read');throw error}
  },
  commit({user,slot,requestId,expectedRev,state,result,delta,serializedDelta}){
   db.exec('BEGIN IMMEDIATE');
   try{
    let response=receipt(user,slot,requestId,expectedRev);
    if(!response){
     const current=rev.get(user,slot);
     if(!current)response={status:404,error:'save not found'};
     else if(current.rev!==expectedRev)response={status:409,error:'revision conflict',current_rev:current.rev};
     else{
      const commitStarted=performance.now();
      const saved=serializedDelta?patchSerialized(user,slot,expectedRev,serializedDelta,delta.unset):delta&&typeof shards.patch==='function'?shards.patch(user,slot,expectedRev,delta.set,delta.unset):shards.put(user,slot,expectedRev,state);
      if(saved.status!==200)throw Error('Shard store violated atomic revision check');
      const {status,...metadata}=saved;
      const payload={...metadata,request_id:requestId,day:{...result,...(result.timing?{timing:{...result.timing,writeMs:Math.round(performance.now()-commitStarted)}}:{})}};
      insert.run(user,slot,requestId,expectedRev,JSON.stringify(payload));
      response={status:200,...payload,replayed:false};
     }
    }
    db.exec('COMMIT');return response;
   }catch(error){db.exec('ROLLBACK');throw error}
  }
 };
}
