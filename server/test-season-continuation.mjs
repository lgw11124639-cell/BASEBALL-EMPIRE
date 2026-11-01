// Detached continuation only. Never opens SQLite, saves, or calls browser advanceSeason.
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {loadOriginalEngineSandbox} from './original-engine-sandbox.mjs';

const file=process.argv[2];
if(!file){console.error('Usage: node server/test-season-continuation.mjs DETACHED-REGULAR-COMPLETE.json');process.exit(2)}
const initialStat=statSync(file), started=performance.now();
const log=value=>console.log(JSON.stringify(value));
let sandbox, steps=0;
try{
 let source=JSON.parse(readFileSync(file,'utf8'));
 assert.ok(Array.isArray(source.teams)&&source.teams.length===10&&Array.isArray(source.players),'Expected full detached state, not a report or compressed save');
 assert.equal(source.year,2046);
 assert.equal(source.gameResults?.length,720,'Regular season must contain 720 games');
 sandbox=loadOriginalEngineSandbox(new URL('../app.js',import.meta.url),source,{timeoutMs:120000});
 source=null;
 const run=expression=>sandbox.invoke(expression);
 const summary=()=>run(`({year:state.year,day:state.day,date:seasonDate(state.day).toISOString().slice(0,10),games:state.gameResults?.length||0,postseasonGames:state.postseasons?.[2046]?.games?.length||0,finished:!!state.postseasons?.[2046]?.finished,champion:state.postseasons?.[2046]?.champion??null,awards:state.awards?.[2046]?.length||0,contracts:!!state.offseasonContractsDone?.[2046],salaryRecords:state.salaryNegotiations?.[2046]?.length||0,retired:state.retiredPlayers?.filter(p=>p.year===2046).length||0})`);
 assert.ok(run('awardsFinished()'),'All clubs must have finished the regular season');
 assert.ok(!run('Number(state.beWatchedCompletedDay)===Number(state.day)'),'Prepared-day save needs explicit migration before continuation');
 log({stage:'loaded',...summary()});
 // Explicitly exercise canonical awards; report this rather than implying automatic issuance.
 run('finalizeAwards()');
 assert.ok(run('state.awards?.[2046]?.length>0'),'Canonical awards were not generated');
 log({stage:'canonical-awards-invoked',...summary()});
 for(;steps<220;steps++){
  const before=summary();
  run(`ensureSeasonCalendar();monthlyOwnerReport();
   if(seasonDate(state.day).getFullYear()>state.year){
    if(!awardsFinished()||!state.postseasons?.[state.year]?.finished)throw Error('Unfinished previous season');
    if(!state.offseasonContractsDone?.[state.year])runOffseasonContracts();
    annualSalaryNegotiations();if(!beginNextSeason())throw Error('Season rollover refused');
   }
   {const day=state.day;
    if(awardsFinished()||seasonDate(day)<new Date(state.year+'-03-20T12:00:00'))offseasonDay();else simulateLeagueDay();
    nationalTeamTournamentDay();nationalTeamReturnDay();
    if(state.day!==day+1)throw Error('Day increment was not exactly one');
   }
   if(awardsFinished()&&state.postseasons?.[state.year]?.finished&&!state.history?.seasons?.[state.year]?.complete)saveSeasonSnapshot();
   if(state.day%30===0)validateSeasonIntegrity();`);
  const after=summary();
  assert.equal(Date.parse(after.date)-Date.parse(before.date),86400000,'Calendar skipped or repeated a date');
  if(after.year===2046)assert.equal(after.games,720,'Postseason changed regular-season game count');
  if(steps%10===0||after.finished!==before.finished||after.year!==before.year||after.contracts!==before.contracts)log({stage:'progress',steps:steps+1,...after});
  if(after.year===2047&&after.games>0){
   assert.ok(after.finished&&after.champion!==null&&after.contracts&&after.salaryRecords>0&&after.awards>0,'Missing season completion artifacts');
   run(`{const seen=new Set();for(const g of state.gameResults){const key=[g.year??state.year,g.day,g.away,g.home].join(':');if(seen.has(key))throw Error('Duplicate game '+key);seen.add(key)}
    if(!state.players.some(p=>(p.games||0)>0))throw Error('No new-season player records');
    if(!state.history?.seasons?.[2046])throw Error('Previous season archive missing');}`);
   const endStat=statSync(file);
   assert.equal(endStat.size,initialStat.size);assert.equal(endStat.mtimeMs,initialStat.mtimeMs);
   log({success:true,stage:'2047-first-games',steps:steps+1,...after,elapsedSeconds:Math.round((performance.now()-started)/1000),sourceFileUnchanged:true,sqliteWrites:0,cloudWrites:0});
   process.exit(0);
  }
 }
 throw Error('Continuation exceeded 220 days');
}catch(error){
 log({success:false,steps,error:String(error.stack||error),elapsedSeconds:Math.round((performance.now()-started)/1000),sqliteWrites:0,cloudWrites:0});
 process.exitCode=1;
}
