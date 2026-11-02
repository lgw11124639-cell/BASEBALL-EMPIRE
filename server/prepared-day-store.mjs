import {gzipSync,gunzipSync} from 'node:zlib';
// Separate disposable DB. This module never writes to the authoritative save DB.
export function createPreparedDayStore(db,{maxBytes=512*1024*1024,now=Date.now,busyTimeoutMs=2000}={}){
 db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=${Math.max(1,Math.min(2000,busyTimeoutMs))};
 CREATE TABLE IF NOT EXISTS prepared_generations(user_id INTEGER,slot TEXT,generation INTEGER NOT NULL,PRIMARY KEY(user_id,slot));
 CREATE TABLE IF NOT EXISTS prepared_days(user_id INTEGER,slot TEXT,engine TEXT,rev INTEGER,input_digest TEXT,next_digest TEXT,payload BLOB,created INTEGER,PRIMARY KEY(user_id,slot,engine,rev,input_digest));`);
 if(!db.prepare('PRAGMA table_info(prepared_days)').all().some(row=>row.name==='fast_payload'))db.exec('ALTER TABLE prepared_days ADD COLUMN fast_payload BLOB');
 const get=db.prepare('SELECT next_digest,payload,fast_payload FROM prepared_days WHERE user_id=? AND slot=? AND engine=? AND rev=? AND input_digest=?');
 const put=db.prepare('INSERT OR IGNORE INTO prepared_days SELECT ?,?,?,?,?,?,?,?,? WHERE coalesce((SELECT generation FROM prepared_generations WHERE user_id=? AND slot=?),0)=?');
 const remove=db.prepare('DELETE FROM prepared_days WHERE user_id=? AND slot=? AND (engine<>? OR rev<?)');
 const used=db.prepare('SELECT coalesce(sum(length(payload)+coalesce(length(fast_payload),0)),0) AS bytes FROM prepared_days');
 return {
  has(user,slot,engine,rev,digest){return !!db.prepare('SELECT 1 FROM prepared_days WHERE user_id=? AND slot=? AND engine=? AND rev=? AND input_digest=?').get(user,slot,engine,rev,digest)},
  get(user,slot,engine,rev,digest){const row=get.get(user,slot,engine,rev,digest);if(!row)return null;const payload=JSON.parse(gunzipSync(row.payload).toString());if(payload.compactStorage){const fast=JSON.parse(gunzipSync(row.fast_payload).toString());payload.set=fast.shards.map(([key,raw])=>[key,gunzipSync(Buffer.from(raw,'base64')).toString()]);delete payload.compactStorage}return {...payload,nextDigest:row.next_digest}},
  getFast(user,slot,engine,rev,digest){const row=db.prepare('SELECT next_digest,fast_payload FROM prepared_days WHERE user_id=? AND slot=? AND engine=? AND rev=? AND input_digest=?').get(user,slot,engine,rev,digest);return row?.fast_payload?{...JSON.parse(gunzipSync(row.fast_payload).toString()),nextDigest:row.next_digest}:null},
  generation(user,slot){return db.prepare('SELECT generation FROM prepared_generations WHERE user_id=? AND slot=?').get(user,slot)?.generation||0},
  put(user,slot,engine,rev,digest,nextDigest,payload,generation=this.generation(user,slot),fast=null){
   const stored=fast?{...payload,set:undefined,compactStorage:true}:payload;
   const bytes=gzipSync(JSON.stringify(stored),{level:1}),fastBytes=fast?gzipSync(JSON.stringify(fast),{level:1}):null;if(used.get().bytes+bytes.length+(fastBytes?.length||0)>maxBytes)return false;
   return Number(put.run(user,slot,engine,rev,digest,nextDigest,bytes,now(),fastBytes,user,slot,generation).changes)===1;
  },
  pruneEngine(engine){db.prepare('DELETE FROM prepared_days WHERE engine<>?').run(engine)},
  prune(user,slot,engine,revision){remove.run(user,slot,engine,revision)},
  status(user,slot,engine,revision,digest){
   const rows=db.prepare('SELECT rev,input_digest,next_digest,(length(payload)+coalesce(length(fast_payload),0)) AS bytes FROM prepared_days WHERE user_id=? AND slot=? AND engine=? AND rev>=? ORDER BY rev').all(user,slot,engine,revision);
   if(typeof digest!=='string')return {ready:rows.length,first:rows[0]?.rev??null,last:rows.at(-1)?.rev??null,bytes:rows.reduce((n,r)=>n+r.bytes,0)};
   const indexed=new Map(rows.map(row=>[row.rev+':'+row.input_digest,row]));let next=revision,current=digest;
   while(indexed.has(next+':'+current)){const row=indexed.get(next+':'+current);current=row.next_digest;next++}
   return {ready:next-revision,first:next>revision?revision:null,last:next>revision?next-1:null,bytes:rows.reduce((n,r)=>n+r.bytes,0)};
  },
  invalidate(user,slot){db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO prepared_generations VALUES(?,?,1) ON CONFLICT(user_id,slot) DO UPDATE SET generation=generation+1').run(user,slot);db.prepare('DELETE FROM prepared_days WHERE user_id=? AND slot=?').run(user,slot);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}},
  close(){db.close()}
 };
}
