// Install verified API sources. Running upgrades explicitly preserve engine state.
// User saves are never simulated, reset, or replaced by this deployment.
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync,renameSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readProcessRuntime} from './process-runtime.mjs';
const upgrade=process.argv.includes('--upgrade');
const keepEnabled=process.argv.includes('--keep-enabled');
if(keepEnabled&&!upgrade)throw Error('Keeping the engine enabled requires an upgrade');
const engineFlag=keepEnabled?'1':'0';
const repo=resolve('.'),api='/opt/baseball-empire-api',stage=resolve(repo,'server.local-backup/advance-api');
const log=x=>console.log(JSON.stringify(x));
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function pm2(args,env=process.env){const r=spawnSync('pm2',args,{encoding:'utf8',env});if(r.status!==0)throw Error('PM2 command failed: '+args[0]);return r.stdout}
const processes=JSON.parse(pm2(['jlist']));
const processInfo=processes.find(p=>p.pm_id===4);
if(!processInfo||resolve(processInfo.pm2_env.pm_exec_path)!==resolve(api,'server.mjs'))throw Error('PM2 ID 4 does not match the expected API; refusing deployment');
const runtime=readProcessRuntime(Number(processInfo.pid));
if(!runtime.listeningPorts.includes(3300))throw Error('PM2 API process does not own listening port 3300; refusing deployment');
if((runtime.configuration.BE_SERVER_ENGINE_ENABLED==='1')!==keepEnabled)throw Error('Engine state differs from requested upgrade mode; refusing deployment');
const database=resolve(runtime.configuration.DATA_DIR||resolve(api,'data'),'saves.sqlite');
log({stage:'runtime-verified',pm2Id:4,pid:runtime.pid,listeningPort:3300});
if(database!==resolve(api,'data/saves.sqlite'))throw Error('Unexpected production DB path; review before deployment');
const names=['auth.mjs','shard-store.mjs','app.js','cloud-only.js','server-day-client.js','server-save-client.js','kpbl-investigation-policy.js',
 'server/wire-delta.mjs','server/save-lifecycle.mjs','server/original-engine-command.mjs','server/advance-day-route.mjs','server/advance-day-service.mjs','server/advance-day-store.mjs','server/original-engine-day.mjs','server/owned-engine-runtime.mjs','server/decoded-day-cache.mjs','server/original-engine-sandbox.mjs','server/save-wire-codec.mjs'];
for(const name of names){
 const src=resolve(stage,name);
 const check=spawnSync(process.execPath,['--check',src],{encoding:'utf8'});
 if(check.status!==0)throw Error('Invalid staged source: '+name);
 if(!['auth.mjs','shard-store.mjs','server/original-engine-sandbox.mjs'].includes(name)){
  const canonical=resolve(repo,name);
  if(!existsSync(canonical)||digest(src)!==digest(canonical))throw Error('Staged file differs from repository; restage first: '+name);
 }
}
if(!readFileSync(resolve(stage,'auth.mjs'),'utf8').includes("enabled:process.env.BE_SERVER_ENGINE_ENABLED==='1'"))throw Error('Expected disabled-by-default engine gate');
if(!readFileSync(resolve(stage,'shard-store.mjs'),'utf8').includes('SAVEPOINT be_shard_write'))throw Error('Expected atomic SAVEPOINT store');
// Abort if sources or staged artifacts changed since successful HTTP verification.
const inputs=JSON.parse(readFileSync(resolve(stage,'deployment-inputs.json'),'utf8'));
const verified=JSON.parse(readFileSync(resolve(stage,'http-verification.json'),'utf8'));
for(const [name,expected] of Object.entries(inputs.productionSourceHashes))if(digest(resolve(api,name))!==expected)throw Error('Production source changed; restage first: '+name);
if(digest(resolve(api,'server.mjs'))!==verified.productionServerHash||digest(resolve(stage,'auth.mjs'))!==verified.stagedAuthHash||digest(resolve(stage,'shard-store.mjs'))!==verified.stagedStoreHash)throw Error('HTTP verification no longer matches this deployment');
const liveAuth=readFileSync(resolve(api,'auth.mjs'),'utf8');
if(upgrade!==liveAuth.includes('createAdvanceDayRoute'))throw Error(upgrade?'Engine foundation is not installed; upgrade refused':'Engine foundation already installed; use upgrade-disabled-api.mjs');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const saved=resolve(repo,'server.local-backup/'+(upgrade?'upgrade-':'deploy-')+stamp);mkdirSync(saved,{recursive:true,mode:0o700});
const previous=names.map(name=>({name,existed:existsSync(resolve(api,name))}));
for(const item of previous)if(item.existed){mkdirSync(dirname(resolve(saved,'files',item.name)),{recursive:true,mode:0o700});copyFileSync(resolve(api,item.name),resolve(saved,'files',item.name))}
const readOnly=new DatabaseSync(database,{readOnly:true});
try{await backup(readOnly,resolve(saved,'saves.sqlite'))}finally{readOnly.close()}
writeFileSync(resolve(saved,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),engineEnabled:keepEnabled,mode:upgrade?'upgrade':'first-install',files:previous},null,2),{mode:0o600});
log({stage:'backup-complete',backupDirectory:saved,sqliteBackup:true});
const restartEnv={...process.env,PORT:'3300',DATA_DIR:dirname(database),BE_SERVER_ENGINE_ENABLED:engineFlag,...(runtime.configuration.NODE_OPTIONS?{NODE_OPTIONS:runtime.configuration.NODE_OPTIONS}:{})};
function install(src,dest){mkdirSync(dirname(dest),{recursive:true});const tmp=dest+'.engine-stage-tmp';copyFileSync(src,tmp);renameSync(tmp,dest)}
async function healthy(){
 for(let n=0;n<30;n++){
  try{
   const health=await fetch('http://127.0.0.1:3300/health',{signal:AbortSignal.timeout(1000)});
   if(health.ok){const unauth=await fetch('http://127.0.0.1:3300/v2/engine/status',{signal:AbortSignal.timeout(1000)});if(unauth.status===401)return true}
  }catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 return false;
}
try{
 for(const name of names)install(resolve(stage,name),resolve(api,name));
 pm2(['restart','4','--update-env'],restartEnv);
 if(!await healthy())throw Error('API health or authentication check failed');
 const after=JSON.parse(pm2(['jlist'])).find(p=>p.pm_id===4);
 const afterRuntime=readProcessRuntime(Number(after?.pid));
 if(afterRuntime.configuration.BE_SERVER_ENGINE_ENABLED!==engineFlag||!afterRuntime.listeningPorts.includes(3300))throw Error('Cannot confirm expected engine state and API port');
 log({success:true,stage:upgrade?'production-api-upgraded':'production-foundation-installed',engineEnabled:keepEnabled,pm2Id:4,health200:true,unauthenticated401:true,saveSimulationPerformed:false,backupDirectory:saved,clientPublished:false});
}catch(error){
 let rollback=true;
 try{
  for(const item of previous){const dest=resolve(api,item.name);if(item.existed)install(resolve(saved,'files',item.name),dest);else rmSync(dest,{force:true})}
  pm2(['restart','4','--update-env'],restartEnv);rollback=await healthy();
 }catch{rollback=false}
 log({success:false,error:String(error.message||error),codeRollbackHealthy:rollback,backupDirectory:saved,databaseRestored:false,saveSimulationPerformed:false});
 process.exitCode=1;
}
