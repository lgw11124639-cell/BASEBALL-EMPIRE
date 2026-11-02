// Disable only the verified game API's background worker, including installed
// code so an older PM2 startup environment cannot silently enable it again.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,renameSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {readProcessRuntime} from './process-runtime.mjs';
function pm2(args,env=process.env){const r=spawnSync('pm2',args,{encoding:'utf8',env});if(r.status!==0)throw Error('PM2 failed: '+args[0]);return r.stdout}
const api='/opt/baseball-empire-api',target=resolve(api,'server/advance-day-route.mjs'),info=JSON.parse(pm2(['jlist'])).find(p=>p.pm_id===4);
if(!info||info.pm2_env.status!=='online'||resolve(info.pm2_env.pm_exec_path)!==resolve(api,'server.mjs'))throw Error('Expected running game API at PM2 ID 4');
const runtime=readProcessRuntime(Number(info.pid));
if(!runtime.listeningPorts.includes(3300)||resolve(runtime.configuration.DATA_DIR||api+'/data')!==api+'/data'||realpathSync(target)!==target)throw Error('Unexpected API port or file path');
const before=readFileSync(target,'utf8'),anchor='if(!prepared&&enabled&&precompute){',marker='/* preparation disabled by user */ if(false&&enabled&&precompute){';
let after=before;
if(before.includes(anchor)){if(before.split(anchor).length!==2)throw Error('Unexpected preparation gate');after=before.replace(anchor,marker)}
else if(!before.includes(marker)&&!before.includes('Production preparation is disabled.'))throw Error('Unknown route; use the standard staged upgrade');
const directory=resolve('server.local-backup/disable-precompute/'+new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(directory,{recursive:true,mode:0o700});writeFileSync(resolve(directory,'advance-day-route.original.mjs'),before,{mode:0o600});
const staged=resolve(directory,'advance-day-route.mjs');writeFileSync(staged,after,{mode:0o600});const checked=spawnSync(process.execPath,['--check',staged],{encoding:'utf8'});if(checked.status!==0)throw Error('Disabled route failed syntax validation');
const env={...process.env,...runtime.configuration,BE_SERVER_PRECOMPUTE:'0'};
const install=text=>{const temp=target+'.disable-tmp';writeFileSync(temp,text,{mode:0o600});renameSync(temp,target)};
try{
 pm2(['stop','4']);install(after);pm2(['restart','4','--update-env'],env);
 let healthy=false;for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:3300/health',{signal:AbortSignal.timeout(1000)});if(r.ok){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}
 const running=JSON.parse(pm2(['jlist'])).find(p=>p.pm_id===4),config=readProcessRuntime(Number(running?.pid));
 if(!healthy||config.configuration.BE_SERVER_PRECOMPUTE!=='0'||!config.listeningPorts.includes(3300))throw Error('Could not verify disabled API health');
 console.log(JSON.stringify({success:true,stage:'precompute-disabled',pm2Id:4,healthy:true,backgroundPreparation:false,productionSaveWrites:false,backupDirectory:directory}));
}catch(error){install(before);try{pm2(['restart','4','--update-env'],env)}catch{}throw error}
