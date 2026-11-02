// Reads source only from production. Writes a private staging directory in repo.
// Never opens the production DB, edits production files, or restarts the API.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifyAdvanceStore} from './verify-advance-day-store.mjs';
import {verifySaveLifecycle} from './verify-save-lifecycle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const input=resolve(process.argv[2]||'/opt/baseball-empire-api/shard-store.mjs');
const output=resolve(root,'server.local-backup/advance-api');
mkdirSync(output,{recursive:true,mode:0o700});
let source=readFileSync(input,'utf8');
if(!source.includes('SAVEPOINT be_shard_write')){
for(const [from,to] of [["db.exec('BEGIN IMMEDIATE');","db.exec('SAVEPOINT be_shard_write');"],["db.exec('COMMIT');","db.exec('RELEASE be_shard_write');"],["db.exec('ROLLBACK');","db.exec('ROLLBACK TO be_shard_write'); db.exec('RELEASE be_shard_write');"]]){
 if(source.split(from).length!==2)throw Error('Unexpected shard-store transaction implementation; refusing patch');
 source=source.replace(from,to);
}
}else if(!source.includes("RELEASE be_shard_write")||!source.includes("ROLLBACK TO be_shard_write"))throw Error('Unknown SAVEPOINT transaction implementation');
const staged=resolve(output,'shard-store.mjs');writeFileSync(staged,source,{mode:0o600});
const check=spawnSync(process.execPath,['--check',staged],{encoding:'utf8'});
if(check.status!==0)throw Error(check.stderr);
const {createShardStore}=await import(pathToFileURL(staged).href);
console.log(JSON.stringify(await verifyAdvanceStore(createShardStore)));
console.log(JSON.stringify(await verifySaveLifecycle(createShardStore)));
mkdirSync(resolve(output,'server'),{recursive:true,mode:0o700});
for(const name of ['app.js','cloud-only.js','kpbl-investigation-policy.js','server-day-client.js','server-save-client.js','server-engine-preview.html','server-game-preview.html'])copyFileSync(resolve(root,name),resolve(output,name));
for(const name of ['wire-delta.mjs','save-lifecycle.mjs','original-engine-command.mjs','save-wire-codec.mjs','advance-day-route.mjs','advance-day-store.mjs','advance-day-service.mjs','original-engine-day.mjs','owned-engine-runtime.mjs','original-engine-sandbox.mjs','detached-save-restore.mjs']){
 // The restore module and patched sandbox stay on EC2; do not overwrite them.
 const target=resolve(output,'server',name);
 copyFileSync(resolve(root,'server',name),target);
 const checked=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});
 if(checked.status!==0)throw Error(checked.stderr);
}
console.log(JSON.stringify({success:true,stagedDirectory:output,productionChanged:false,productionDatabaseOpened:false,apiRestarted:false,routeInstalled:false}));
