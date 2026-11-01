// Run the canonical simulateLeagueDay against a detached JSON save file.
// This test never opens SQLite, performs HTTP, or writes the save back.
// Usage: node server/test-real-league-day.mjs /path/to/EXPORTED-SAVE.json
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadOriginalEngineSandbox} from './original-engine-sandbox.mjs';
const file=process.argv[2];
if(!file){console.error('Usage: node server/test-real-league-day.mjs /path/to/detached-save.json');process.exit(2)}
const bytes=readFileSync(resolve(file));
const hash=createHash('sha256').update(bytes).digest('hex');
const source=JSON.parse(bytes.toString('utf8'));
if(!Array.isArray(source.teams)||source.teams.length!==10||!Array.isArray(source.players)||!Number.isInteger(source.day))throw Error('Not a valid 10-team save');
const sandbox=loadOriginalEngineSandbox(new URL('../app.js',import.meta.url),source);
const before=sandbox.invoke('({day:state.day,year:state.year,games:state.gameResults?.length||0,teams:state.teams.map(t=>({wins:t.wins||0,losses:t.losses||0,draws:t.draws||0}))})');
const started=performance.now();
let error=null;
try{sandbox.invoke('simulateLeagueDay()')}catch(e){error=String(e?.stack||e)}
const elapsedMs=+(performance.now()-started).toFixed(2);
const after=sandbox.invoke('({day:state.day,year:state.year,games:state.gameResults?.length||0,teams:state.teams.map(t=>({wins:t.wins||0,losses:t.losses||0,draws:t.draws||0}))})');
const unchanged=createHash('sha256').update(readFileSync(resolve(file))).digest('hex')===hash;
const report={ok:!error&&after.day===before.day+1,stage:'real-league-day-detached',before,after,elapsedMs,gameDelta:after.games-before.games,sourceFileUnchanged:unchanged,sqliteWrites:0,cloudWrites:0,error};
console.log(JSON.stringify(report,null,2));
if(!report.ok||!unchanged)process.exitCode=1;
