// Complete authenticated flow against an in-memory DB and a detached save only.
// No production imports, DB, HTTP listener, or cloud writes.
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {packServerSave,restoreServerSave} from './save-wire-codec.mjs';
const file=resolve(process.argv[2]||'server.local-backup/detached-real-save.json');
const stage=resolve('server.local-backup/advance-api');
const started=performance.now(),initialStat=statSync(file);
const log=report=>console.log(JSON.stringify(report));
// Hash JSON semantics without materializing another 292MB JSON string. Key
// ordering is normalized; the browser codec can reorder keys while merging rows.
function semanticHash(value){
 const hash=createHash('sha256');
 function visit(v){
  if(Array.isArray(v)){hash.update('[');for(const item of v){visit(item);hash.update(',')}hash.update(']');return}
  if(v&&typeof v==='object'){hash.update('{');for(const key of Object.keys(v).sort()){hash.update(JSON.stringify(key)+':');visit(v[key]);hash.update(',')}hash.update('}');return}
  hash.update(JSON.stringify(v));
 }
 visit(value);return hash.digest('hex');
}
let db;
try{
 let state=JSON.parse(readFileSync(file,'utf8'));
 assert.ok(Array.isArray(state.players)&&Array.isArray(state.teams),'Expected detached full save');
 const before={year:state.year,day:state.day,players:state.players.length,teams:state.teams.length,games:state.gameResults?.length||0};
 // This runner must not reuse the incomplete-year fixture or rewind any dates.
 assert.ok(state.day<300,'Use original pre-season detached-real-save.json, not the regular-complete fixture');
 const expectedHash=semanticHash(state);
 log({stage:'real-save-loaded',...before});
 let wire=await packServerSave(state);state=null;
 log({stage:'canonical-wire-packed',fields:Object.keys(wire).length});
 let restored=await restoreServerSave(wire);
 assert.equal(semanticHash(restored),expectedHash,'Lossless full save round trip failed');restored=null;
 log({stage:'all-fields-roundtrip',success:true});
 db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));
 CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field));`);
 const {createShardStore}=await import(pathToFileURL(resolve(stage,'shard-store.mjs')).href);
 const shards=createShardStore(db);
 assert.equal(shards.put(1,'main',0,wire).status,200);wire=null;
 process.env.BE_SERVER_ENGINE_ENABLED='1'; // This test process only.
 const {installAuth}=await import(pathToFileURL(resolve(stage,'auth.mjs')).href);
 let handler=installAuth(db);
 const token=randomBytes(32).toString('hex'),tokenHash=createHash('sha256').update(token).digest('hex');
 db.prepare('INSERT INTO be_users(id,username,salt,password_hash,created_at) VALUES(?,?,?,?,?)').run(1,'private_fixture_test','unused','unused',new Date().toISOString());
 db.prepare('INSERT INTO be_users(id,username,salt,password_hash,created_at) VALUES(?,?,?,?,?)').run(2,'private_empty_test','unused','unused',new Date().toISOString());
 db.prepare('INSERT INTO be_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash,1,Date.now()+3600000);
 const requestId='real-api-test-'+randomBytes(12).toString('hex');
 async function request(url,method='GET',input,authenticated=true){
  let status,payload;
  const res={writeHead(s){status=s},end(text){payload=JSON.parse(text)},setHeader(){}};
  const req={url,method,headers:{...(authenticated?{authorization:'Bearer '+token}:{}),'if-match':'1'},async *[Symbol.asyncIterator](){if(input!==undefined)yield Buffer.from(JSON.stringify(input))}};
  assert.equal(await handler(req,res,null),true);return {status,payload};
 }
 assert.equal((await request('/v2/engine/advance','POST',{requestId},false)).status,401);
 log({stage:'authenticated-original-engine-day-start'});
 const first=await request('/v2/engine/advance','POST',{requestId});
 assert.equal(first.status,200,first.payload?.error||'Engine request failed');
 assert.equal(first.payload.rev,2);
 const result=first.payload.day;
 assert.equal(Date.parse(result.to.date)-Date.parse(result.from.date),86400000);
 // Re-create the actual auth/service objects, then replay the exact old revision.
 handler=installAuth(db);
 const replay=await request('/v2/engine/advance','POST',{requestId});
 assert.equal(replay.status,200);assert.equal(replay.payload.replayed,true);assert.equal(replay.payload.rev,2);
 assert.deepEqual(replay.payload.day,result);
 const stale=await request('/v2/engine/advance','POST',{requestId:requestId+'-other'});
 assert.equal(stale.status,409);
 assert.equal((await request('/v2/saves/main','PUT',{})).status,409);
 assert.equal((await request('/v2/saves/main','PATCH',{})).status,409);
 assert.equal((await request('/v2/saves/main','DELETE')).status,409);
 const home=await request('/v2/view/home');
 assert.equal(home.status,200,'Existing mobile home endpoint failed after server save');
 assert.equal(home.payload.revision,2);assert.equal(home.payload.day,result.to.day);
 const snapshot=shards.get(1,'main');
 assert.equal(snapshot.rev,2);
 const saved=await restoreServerSave(snapshot.save);
 assert.equal(saved.year,result.to.year);assert.equal(saved.day,result.to.day);
 assert.equal(saved.teams.length,before.teams);assert.ok(saved.players.length>=before.players);
 assert.equal(shards.get(2,'main'),null);
 const lastStat=statSync(file);
 assert.equal(lastStat.size,initialStat.size);assert.equal(lastStat.mtimeMs,initialStat.mtimeMs);
 log({success:true,stage:'real-authenticated-day-api',before,after:{year:saved.year,day:saved.day,players:saved.players.length,games:saved.gameResults?.length||0},revision:2,exactlyOneDate:true,durableRetry:true,staleRevisionRejected:true,legacyWritesBlocked:true,mobileHomeReadable:true,fullWireRoundtrip:true,userIsolation:true,sourceFileUnchanged:true,productionDatabaseOpened:false,productionChanged:false,elapsedSeconds:Math.round((performance.now()-started)/1000)});
}catch(error){log({success:false,stage:'real-authenticated-day-api',error:String(error.stack||error),productionDatabaseOpened:false,productionChanged:false});process.exitCode=1}
finally{db?.close()}
