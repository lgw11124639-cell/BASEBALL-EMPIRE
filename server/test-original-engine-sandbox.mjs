// Smoke-test canonical app.js initialization in a detached Node VM.
// Usage: node server/test-original-engine-sandbox.mjs
// Never connects to SQLite or cloud storage.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const sourceState={year:2046,day:56,seasonStartDate:'2046-01-01',teamId:0,players:[],teams:[],gameResults:[]};
const snapshot=structuredClone(sourceState);
const started=performance.now();
try{
 const sandbox=createOriginalEngineSandbox(app,sourceState,{timeoutMs:15000});
 const types=sandbox.invoke('({simulateLeagueDay:typeof simulateLeagueDay,offseasonDay:typeof offseasonDay,nationalTeamTournamentDay:typeof nationalTeamTournamentDay,nationalTeamReturnDay:typeof nationalTeamReturnDay,advanceSeason:typeof advanceSeason})');
 assert.deepEqual(Object.values(types),['function','function','function','function','function']);
 assert.deepEqual(sourceState,snapshot);
 assert.notStrictEqual(sandbox.state,sourceState);
 console.log(JSON.stringify({ok:true,stage:'original-engine-initialized',types,elapsedMs:+(performance.now()-started).toFixed(2),sourceSaveUnchanged:true,realGameSimulation:false,sqliteWrites:0}));
}catch(error){
 console.error(JSON.stringify({ok:false,stage:'original-engine-initialization',error:String(error?.message||error),stack:String(error?.stack||'').split('\n').slice(0,5).join('\n'),sourceSaveUnchanged:JSON.stringify(sourceState)===JSON.stringify(snapshot),realGameSimulation:false,sqliteWrites:0}));
 process.exitCode=1;
}
