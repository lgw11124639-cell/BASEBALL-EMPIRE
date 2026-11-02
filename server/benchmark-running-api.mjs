// Temporarily pause ONLY the verified game API to avoid running a second large
// world alongside it on a 4 GiB host. Always resume it, even if the benchmark fails.
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {totalmem} from 'node:os';
import {readProcessRuntime} from './process-runtime.mjs';
import {engineNodeOptions} from './memory-policy.mjs';
const api='/opt/baseball-empire-api',database=resolve(api,'data/saves.sqlite');
function pm2(args,env=process.env){const result=spawnSync('pm2',args,{env,encoding:'utf8'});if(result.status!==0)throw Error('PM2 command failed: '+args[0]);return result.stdout}
const p=JSON.parse(pm2(['jlist'])).find(p=>p.pm_id===4);
if(!p||p.pm2_env.status!=='online'||resolve(p.pm2_env.pm_exec_path)!==resolve(api,'server.mjs'))throw Error('PM2 ID 4 is not the expected running game API');
const runtime=readProcessRuntime(Number(p.pid));
if(!runtime.listeningPorts.includes(3300)||resolve(runtime.configuration.DATA_DIR||resolve(api,'data'))!==dirname(database))throw Error('Unexpected API port or DB directory');
const env={...process.env,PORT:'3300',DATA_DIR:dirname(database),BE_SERVER_ENGINE_ENABLED:runtime.configuration.BE_SERVER_ENGINE_ENABLED||'0',NODE_OPTIONS:runtime.configuration.NODE_OPTIONS||''};
const policy=engineNodeOptions('',totalmem());
let benchmarkStatus=1;
try{
 pm2(['stop','4']);
 console.log(JSON.stringify({stage:'game-api-paused',pm2Id:4,productionSaveWrites:false,benchmarkHeapMiB:policy.heapLimitMiB}));
 const result=spawnSync(process.execPath,['--experimental-sqlite','--max-old-space-size='+policy.heapLimitMiB,resolve('server/benchmark-owned-day.mjs'),'--database',database,'--days','1','--profile'],{stdio:'inherit',env:{...process.env,NODE_OPTIONS:''},timeout:240000});
 benchmarkStatus=result.status??1;
}finally{
 pm2(['restart','4','--update-env'],env);
 let healthy=false;for(let n=0;n<30;n++){try{const response=await fetch('http://127.0.0.1:3300/health',{signal:AbortSignal.timeout(1000)});if(response.ok){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
 console.log(JSON.stringify({stage:'game-api-resumed',pm2Id:4,healthy,productionSaveWrites:false}));
 if(!healthy)throw Error('The original game API was restarted but its health check failed');
}
process.exitCode=benchmarkStatus;
