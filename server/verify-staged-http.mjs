// Verify the actual HTTP entrypoint with a disposable DB, port and dummy token.
// Never restart PM2, read production environment values, or open production DB.
import assert from 'node:assert/strict';
import {readFileSync,copyFileSync,mkdtempSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import net from 'node:net';
const stage=resolve('server.local-backup/advance-api');
const source=resolve(process.argv[2]||'/opt/baseball-empire-api/server.mjs');
const serverSource=readFileSync(source,'utf8');
for(const expected of ['process.env.DATA_DIR','process.env.PORT','process.env.SAVE_API_TOKEN','await handleV2(req,res,origin)'])assert.ok(serverSource.includes(expected),'Server entrypoint changed: '+expected);
assert.ok(readFileSync(resolve(stage,'auth.mjs'),'utf8').includes('createAdvanceDayRoute'),'Stage auth before HTTP check');
copyFileSync(source,resolve(stage,'server.mjs'));
const directory=mkdtempSync(resolve('server.local-backup/http-check-'));chmodSync(directory,0o700);
const db=new DatabaseSync(resolve(directory,'saves.sqlite'));
db.exec(`CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));
CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field));`);db.close();
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin='https://lgw11124639-cell.github.io',base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['--experimental-sqlite','--max-old-space-size=4096',resolve(stage,'server.mjs')],{env:{...process.env,PORT:String(port),DATA_DIR:directory,SAVE_API_TOKEN:randomBytes(40).toString('hex'),ALLOWED_ORIGIN:origin,BE_SERVER_ENGINE_ENABLED:'0'},stdio:['ignore','ignore','pipe']});
let errors='';child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-4000)});
let report;
try{
 const ready=await Promise.race([
  new Promise((done,reject)=>{const deadline=Date.now()+10000;async function check(){try{const response=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});if(response.ok)return done(true)}catch{}if(Date.now()>deadline)return reject(Error('Staged HTTP server did not start: '+errors));setTimeout(check,100)}check()}),
  new Promise((_,reject)=>{child.once('error',reject);child.once('exit',code=>reject(Error('Staged HTTP exited early: '+code+' '+errors)))})
 ]);
 assert.ok(ready);
 const options=await fetch(base+'/v2/engine/advance',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,if-match'},signal:AbortSignal.timeout(5000)});
 assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-origin'),origin);
 const headers=(options.headers.get('access-control-allow-headers')||'').toLowerCase().split(',').map(s=>s.trim());
 for(const header of ['authorization','content-type','if-match'])assert.ok(headers.includes(header),'CORS missing '+header);
 const unauthorized=await fetch(base+'/v2/engine/status',{headers:{Origin:origin},signal:AbortSignal.timeout(5000)});assert.equal(unauthorized.status,401);
 const registered=await fetch(base+'/v2/auth/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'staging_'+randomBytes(4).toString('hex'),password:randomBytes(24).toString('hex')}),signal:AbortSignal.timeout(10000)});
 assert.equal(registered.status,201,'Staged account registration failed');const session=await registered.json();
 const authenticated={Origin:origin,Authorization:'Bearer '+session.token};
 const status=await fetch(base+'/v2/engine/status',{headers:authenticated,signal:AbortSignal.timeout(5000)});assert.equal(status.status,200);assert.equal((await status.json()).enabled,false);
 const disabled=await fetch(base+'/v2/engine/advance',{method:'POST',headers:{...authenticated,'Content-Type':'application/json','If-Match':'1'},body:JSON.stringify({requestId:'staged-http-request-01'}),signal:AbortSignal.timeout(5000)});assert.equal(disabled.status,503);
 const denied=await fetch(base+'/v2/engine/status',{headers:{...authenticated,Origin:'https://untrusted.invalid'},signal:AbortSignal.timeout(5000)});assert.equal(denied.status,403);
 report={success:true,stage:'staged-http',realHttpEntrypoint:true,preflight204:true,requiredCorsHeaders:true,unauthenticated401:true,authenticatedStatus200:true,disabledEngine503:true,invalidOrigin403:true,productionDatabaseOpened:false,productionChanged:false,pm2Restarted:false};
}catch(error){report={success:false,stage:'staged-http',error:String(error.stack||error),productionDatabaseOpened:false,productionChanged:false};process.exitCode=1}
finally{
 const stopped=new Promise(r=>child.once('exit',r));
 child.kill('SIGTERM');
 let timer;
 await Promise.race([stopped,new Promise(r=>{timer=setTimeout(()=>{child.kill('SIGKILL');r()},2000)})]);clearTimeout(timer);
}
console.log(JSON.stringify(report));
