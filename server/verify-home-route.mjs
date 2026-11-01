// Run on Ubuntu: node --experimental-sqlite --env-file=/opt/baseball-empire-api/.env verify-status-route.mjs
// Creates a short-lived test login session only; never modifies save rows.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const db = new DatabaseSync((process.env.DATA_DIR || '/opt/baseball-empire-api/data') + '/saves.sqlite');
const port = Number(process.env.PORT || 3200);
const base = 'http://127.0.0.1:' + port;
const user = db.prepare("SELECT user_id,slot,rev FROM be_save_shard_meta WHERE slot='main' ORDER BY updated_at DESC LIMIT 1").get();
if (!user) { console.error('SKIP: no existing main save'); process.exitCode = 2; db.close(); }
else {
 const token = randomBytes(32).toString('hex');
 const tokenHash = createHash('sha256').update(token).digest('hex');
 const expires = Date.now() + 60_000;
 const meta = db.prepare('SELECT rev,updated_at FROM be_save_shard_meta WHERE user_id=? AND slot=?');
 const before = meta.get(user.user_id, 'main');
 const insert = db.prepare('INSERT INTO be_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)');
 const remove = db.prepare('DELETE FROM be_sessions WHERE token_hash=?');
 try {
  insert.run(tokenHash,user.user_id,expires);
  const noAuth = await fetch(base+'/v2/view/home', {signal:AbortSignal.timeout(5000)});
  assert.equal(noAuth.status,401,'unauthenticated home request must be rejected');
  const authorized = await fetch(base+'/v2/view/home',{
   headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)
  });
  assert.equal(authorized.status,200,'authenticated home must succeed');
  const data = await authorized.json();
  assert.equal(data.revision,before.rev,'revision must match SQLite');
  assert.equal(typeof data.year,'number','year must be numeric');
  assert.equal(typeof data.day,'number','day must be numeric');
  assert.equal(data.updatedAt,before.updated_at,'timestamp must match SQLite');
  assert.equal(data.teamId,data.team.id,'team id must match');
  assert.equal(typeof data.team.name,'string','team name required');
  assert.equal(typeof data.team.city,'string','team city required');
  assert.equal(data.readOnly,true,'home must be read only');
  assert.deepEqual(meta.get(user.user_id,'main'),before,'save metadata must be unchanged');
  assert.equal(Object.hasOwn(data,'save'),false,'no full save should be returned');
  console.log(JSON.stringify({ok:true,port,unauthenticated:401,authenticated:200,year:data.year,day:data.day,revision:data.revision,teamId:data.teamId,teamName:data.team.name,saveUnchanged:true,fullSaveDownloaded:false}));
 } catch (error) {
  console.error('FAIL:',error.message);process.exitCode=1;
 } finally {remove.run(tokenHash);db.close();}
}
