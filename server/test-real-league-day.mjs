// Run the canonical simulateLeagueDay against a detached JSON save file.
// This test never opens SQLite, performs HTTP, or writes the save back.
// Usage: node server/test-real-league-day.mjs /path/to/EXPORTED-SAVE.json
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadOriginalEngineSandbox} from './original-engine-sandbox.mjs';
const file=process.argv[2];
if(!file){console.error('Usage: node server/test-real-league-day.mjs /path/to/detached-save.json [--date=YYYY-MM-DD] [--expected-games=5]');process.exit(2)}
const options=Object.fromEntries(process.argv.slice(3).filter(x=>x.startsWith('--')).map(x=>{const i=x.indexOf('=');return i<0?[x.slice(2),true]:[x.slice(2,i),x.slice(i+1)]}));
const bytes=readFileSync(resolve(file));
const hash=createHash('sha256').update(bytes).digest('hex');
const source=JSON.parse(bytes.toString('utf8'));
if(!Array.isArray(source.teams)||source.teams.length!==10||!Array.isArray(source.players)||!Number.isInteger(source.day))throw Error('Not a valid 10-team save');
const sandbox=loadOriginalEngineSandbox(new URL('../app.js',import.meta.url),source);
if(options.date){
 const target=new Date(options.date+'T12:00:00'),start=new Date((source.seasonStartDate||'')+'T12:00:00');
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(options.date)||!Number.isFinite(target.getTime())||!Number.isFinite(start.getTime())||target.getFullYear()!==Number(source.year))throw Error('Target date or seasonStartDate is invalid');
 const targetDay=Math.round((target-start)/86400000)+1;
 if(targetDay<1)throw Error('Target date precedes seasonStartDate');
 sandbox.invoke('state.day='+targetDay);
}
const before=sandbox.invoke('({day:state.day,year:state.year,date:seasonDate(state.day).toISOString().slice(0,10),games:state.gameResults?.length||0,teams:state.teams.map(t=>({wins:t.wins||0,losses:t.losses||0,draws:t.draws||0}))})');
const scheduled=sandbox.invoke('scheduledPairs(state.day,true).map(pair=>pair.slice())');
const started=performance.now();
let error=null;
try{sandbox.invoke('simulateLeagueDay()')}catch(e){error=String(e?.stack||e)}
const elapsedMs=+(performance.now()-started).toFixed(2);
const after=sandbox.invoke('({day:state.day,year:state.year,date:seasonDate(state.day-1).toISOString().slice(0,10),games:state.gameResults?.length||0,teams:state.teams.map(t=>({wins:t.wins||0,losses:t.losses||0,draws:t.draws||0}))})');
const unchanged=createHash('sha256').update(readFileSync(resolve(file))).digest('hex')===hash;
const expectedGames=options['expected-games']==null?null:Number(options['expected-games']);
const report={ok:!error&&after.day===before.day+1&&(!Number.isFinite(expectedGames)||after.games-before.games===expectedGames),stage:'real-league-day-detached',before,scheduledPairs:scheduled,scheduledGameCount:scheduled.length,after,elapsedMs,gameDelta:after.games-before.games,expectedGames,sourceFileUnchanged:unchanged,sqliteWrites:0,cloudWrites:0,error};
console.log(JSON.stringify(report,null,2));
if(!report.ok||!unchanged)process.exitCode=1;
