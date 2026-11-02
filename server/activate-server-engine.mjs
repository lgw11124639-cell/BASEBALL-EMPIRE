import {totalmem} from 'node:os';
import {engineNodeOptions} from './memory-policy.mjs';
// Activation never advances a save. Verify public clients, back up SQLite and
// proxy config, then enable only the identified API process. No DB restore on failure.
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {readProcessRuntime} from './process-runtime.mjs';
import {withEngineTimeouts} from './engine-proxy-config.mjs';
const api='/opt/baseball-empire-api',repo=resolve('.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const log=value=>console.log(JSON.stringify(value));
function command(name,args,env=process.env){const result=spawnSync(name,args,{encoding:'utf8',env});if(result.status!==0)throw Error(name+' '+args[0]+' failed: '+String(result.stderr||'').slice(0,400));return result.stdout}
const info=JSON.parse(command('pm2',['jlist'])).find(p=>p.pm_id===4);
if(!info||resolve(info.pm2_env.pm_exec_path)!==resolve(api,'server.mjs'))throw Error('Unexpected API process');
const runtime=readProcessRuntime(Number(info.pid));
if(!runtime.listeningPorts.includes(3300)||runtime.configuration.BE_SERVER_ENGINE_ENABLED!=='0')throw Error('Expected the disabled API on port 3300');
const database=resolve(runtime.configuration.DATA_DIR||resolve(api,'data'),'saves.sqlite');
if(database!==resolve(api,'data/saves.sqlite'))throw Error('Unexpected database path');
for(const name of ['app.js','native-save.js','cloud-only.js','server-day-client.js','server-save-client.js','kpbl-investigation-policy.js','server/save-lifecycle.mjs','server/original-engine-command.mjs','server/advance-day-route.mjs','server/advance-day-service.mjs','server/advance-day-store.mjs','server/original-engine-day.mjs','server/owned-engine-runtime.mjs','server/decoded-day-cache.mjs','server/native-save-codec.mjs','server/archive-write-tracker.mjs','server/prepared-day-store.mjs','server/precompute-controller.mjs','server/precompute-worker.mjs','server/precompute-engine-key.mjs','server/save-wire-codec.mjs','server/wire-delta.mjs']){
 if(hash(readFileSync(resolve(api,name)))!==hash(readFileSync(resolve(repo,name))))throw Error('Production file does not match verified release: '+name+'; upgrade first');
}
const auth=readFileSync(resolve(api,'auth.mjs'),'utf8');
if(!auth.includes("process.env.BE_SERVER_ENGINE_ENABLED==='1'||serverOwner")||!auth.includes('be_lifecycle_requests'))throw Error('Global legacy-write guard missing');
const version=JSON.parse(readFileSync('version.json','utf8')),site='https://lgw11124639-cell.github.io/BASEBALL-EMPIRE/';
async function download(url){const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error('Public release unavailable');return res.text()}
const [publicVersion,html,dayClient,saveClient]=await Promise.all(['version.json','index.html','server-day-client.js','server-save-client.js'].map(file=>download(site+file+'?verify='+version.build)));
if(JSON.parse(publicVersion).build!==version.build||!html.includes('app.js?v='+version.build)||hash(dayClient)!==hash(readFileSync('server-day-client.js'))||hash(saveClient)!==hash(readFileSync('server-save-client.js')))throw Error('Public frontend release is incomplete');
const config=realpathSync('/etc/nginx/sites-enabled/baseball-empire-api');
if(!config.startsWith('/etc/nginx/'))throw Error('Unexpected proxy configuration target');
const original=readFileSync(config,'utf8'),updated=withEngineTimeouts(original);
command('sudo',['-n','nginx','-t']);
const saved=resolve(repo,'server.local-backup/activation-'+new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(saved,{recursive:true,mode:0o700});
writeFileSync(resolve(saved,'nginx.original'),original,{mode:0o600});writeFileSync(resolve(saved,'nginx.updated'),updated,{mode:0o600});
const db=new DatabaseSync(database,{readOnly:true});try{await backup(db,resolve(saved,'saves.sqlite'))}finally{db.close()}
log({stage:'activation-backup-complete',backupDirectory:saved,publicBuild:version.build});
const previousOptions=runtime.configuration.NODE_OPTIONS||'';
const engineOptions=engineNodeOptions(previousOptions,totalmem()).options;
const environment=enabled=>({...process.env,PORT:'3300',DATA_DIR:dirname(database),BE_SERVER_ENGINE_ENABLED:enabled,BE_SERVER_PRECOMPUTE:'0',NODE_OPTIONS:enabled==='1'?engineOptions:previousOptions});
async function healthy(){for(let n=0;n<30;n++){try{const response=await fetch('http://127.0.0.1:3300/health',{signal:AbortSignal.timeout(1000)});if(response.ok)return true}catch{}await new Promise(r=>setTimeout(r,500))}return false}
let proxyChanged=false;
try{
 if(updated!==original){proxyChanged=true;command('sudo',['-n','install','-m','0644',resolve(saved,'nginx.updated'),config]);command('sudo',['-n','nginx','-t']);command('sudo',['-n','systemctl','reload','nginx'])}
 command('pm2',['restart','4','--update-env'],environment('1'));
 if(!await healthy())throw Error('Enabled API did not become healthy');
 const after=JSON.parse(command('pm2',['jlist'])).find(p=>p.pm_id===4),running=readProcessRuntime(Number(after?.pid));
 if(running.configuration.BE_SERVER_ENGINE_ENABLED!=='1'||!running.listeningPorts.includes(3300))throw Error('Enabled process state mismatch');
 const unauthorized=await fetch('https://baseball-empire-save.duckdns.org/v2/engine/status',{signal:AbortSignal.timeout(10000)});
 if(unauthorized.status!==401)throw Error('Public authentication check failed');
 command('pm2',['save']);
 log({success:true,stage:'server-engine-activated',engineEnabled:true,frontendVersion:version.version,frontendBuild:version.build,pm2Id:4,publicAuthentication401:true,proxyTimeoutSeconds:240,pm2ConfigurationSaved:true,saveSimulationPerformed:false,backupDirectory:saved});
}catch(error){
 let recovered=false;
 try{
  command('pm2',['restart','4','--update-env'],environment('0'));
  if(proxyChanged){command('sudo',['-n','install','-m','0644',resolve(saved,'nginx.original'),config]);command('sudo',['-n','nginx','-t']);command('sudo',['-n','systemctl','reload','nginx'])}
  recovered=await healthy();
  command('pm2',['save']);
 }catch{}
 log({success:false,error:String(error.message||error),disabledApiRecovered:recovered,backupDirectory:saved,databaseRestored:false});process.exitCode=1;
}
