import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {installAuth}=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));
CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field));`);
delete process.env.BE_SERVER_ENGINE_ENABLED;
let handler=installAuth(db);
const token='a'.repeat(64),digest=createHash('sha256').update(token).digest('hex');
db.prepare('INSERT INTO be_users(id,username,salt,password_hash,created_at) VALUES(?,?,?,?,?)').run(1,'staging_test','unused','unused',new Date().toISOString());
db.prepare('INSERT INTO be_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest,1,Date.now()+60000);
async function request(path,method='POST',authenticated=true,input={requestId:'staged-auth-0001'}){
 let status,payload;
 const res={writeHead(s){status=s},end(text){payload=JSON.parse(text)}};
 const req={url:path,method,headers:{...(authenticated?{authorization:'Bearer '+token}:{}),'if-match':'1'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(input))}};
 assert.equal(await handler(req,res,null),true);
 return {status,payload};
}
assert.equal((await request('/v2/engine/advance','POST',false)).status,401);
assert.equal((await request('/v2/engine/status','GET',false)).status,401);
const capability=await request('/v2/engine/status','GET');
assert.equal(capability.status,200);assert.equal(capability.payload.enabled,false);assert.equal(capability.payload.canAdvance,false);
assert.equal((await request('/v2/engine/advance')).status,503);
// A server-owned save cannot be overwritten by the old browser routes.
db.prepare('INSERT INTO be_day_requests VALUES(?,?,?,?,?)').run(1,'main','staged-receipt-01',1,'{}');
for(const method of ['PUT','PATCH','DELETE'])assert.equal((await request('/v2/saves/main',method)).status,409);
process.env.BE_SERVER_ENGINE_ENABLED='1';
const enabled=installAuth(db);
// Install-time flag only: obtain the enabled handler for the remaining check.
let status;
await enabled({url:'/v2/engine/advance',method:'POST',headers:{authorization:'Bearer '+token,'if-match':'1'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({requestId:'staged-auth-0002'}))}},{writeHead(s){status=s},end(){}},null);
assert.equal(status,404); // Authenticated empty test DB; never invokes simulation.
handler=enabled;
assert.equal((await request('/v2/engine/command','POST',true,{requestId:'staged-photo-command-01',command:{type:'player-photo',playerId:'1',photo:'data:image/jpeg;base64,/9j/4A=='}})).status,404);
assert.equal((await request('/v2/engine/command','POST',true,{requestId:'staged-bad-command-0001',command:{type:'arbitrary-script'}})).status,400);
db.close();
console.log(JSON.stringify({success:true,stage:'staged-auth',unauthenticated401:true,disabled503:true,legacyWritesBlocked:true,authenticatedRouteReached:true,productionDatabaseOpened:false}));
