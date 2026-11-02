// One EC2 command: verify exact current sources, upgrade with engine off, then
// activate only after the public client release and backup checks succeed.
import {spawnSync} from 'node:child_process';
for(const script of ['stage-advance-day.mjs','stage-auth-advance.mjs','verify-staged-http.mjs','upgrade-disabled-api.mjs','activate-server-engine.mjs']){
 const result=spawnSync(process.execPath,['--experimental-sqlite','--max-old-space-size=4096','server/'+script],{stdio:'inherit',env:process.env});
 if(result.status!==0){process.exitCode=result.status||1;break}
}
