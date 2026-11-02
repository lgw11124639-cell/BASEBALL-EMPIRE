import test from 'node:test';
import assert from 'node:assert/strict';
import {runOriginalEngineDay} from './original-engine-day.mjs';
// Controlled VM engine exercises the orchestration boundary, not baseball rules.
const appSource=`let state;
function seasonDate(day){const d=new Date(state.seasonStartDate+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+day-1);return d}
function ensureSeasonCalendar(){}function monthlyOwnerReport(){}
function awardsFinished(){return !!state.done}
function runOffseasonContracts(){state.offseasonContractsDone={[state.year]:true}}
function annualSalaryNegotiations(){state.negotiated=true}
function beginNextSeason(){state.year++;state.day=1;state.seasonStartDate=state.year+'-01-01';state.gameResults=[];state.done=false;return true}
function offseasonDay(){state.offseasonCalls=(state.offseasonCalls||0)+1;state.day++}
function simulateLeagueDay(){state.simCalls=(state.simCalls||0)+1;state.gameResults.push({year:state.year,day:state.day,away:0,home:1});if(state.fail)throw Error('engine failed');if(state.duplicate)state.gameResults.push({...state.gameResults[0]});state.day+=state.skip?2:1}
function nationalTeamTournamentDay(){state.nationalCalls=(state.nationalCalls||0)+1}
function nationalTeamReturnDay(){state.returnCalls=(state.returnCalls||0)+1}
function finalizeAwards(){state.awarded=true}
function saveSeasonSnapshot(){state.history={seasons:{[state.year]:{complete:true}}}}
function validateSeasonIntegrity(){}
(async()=>{try{app.innerHTML='';}catch(e){}})();`;
const seed=()=>({year:2046,day:90,seasonStartDate:'2046-01-01',players:[],teams:[{id:0},{id:1}],gameResults:[]});
const run=s=>runOriginalEngineDay(s,{appSource});
test('one simulation, one day, national calls, detached input',()=>{
 const input=seed(),before=structuredClone(input),out=run(input);
 assert.deepEqual(input,before);assert.equal(out.state.day,91);assert.equal(out.state.simCalls,1);
 assert.equal(out.state.gameResults.length,1);assert.equal(out.state.nationalCalls,1);assert.equal(out.state.returnCalls,1);
 assert.equal(out.result.to.date,'2046-04-01');
});
test('prepared browser game is consumed without a second simulation',()=>{
 const input=seed();input.beWatchedCompletedDay=input.day;input.gameResults=[{year:2046,day:90,away:0,home:1}];
 const out=run(input);assert.equal(out.state.gameResults.length,1);assert.equal(out.state.simCalls,undefined);
 assert.equal(out.state.day,91);assert.equal(out.state.beWatchedCompletedDay,undefined);assert.equal(out.result.consumedPreparedDay,true);
});
test('completed season rolls over and processes one January day',()=>{
 const input={...seed(),day:366,done:true,postseasons:{2046:{finished:true}}};
 const out=run(input);assert.equal(out.state.year,2047);assert.equal(out.state.day,2);
 assert.equal(out.state.offseasonCalls,1);assert.equal(out.result.to.date,'2047-01-02');assert.equal(out.state.negotiated,true);
});
test('unfinished season cannot cross year or repair itself by rewinding',()=>{
 const input={...seed(),day:366,done:true};assert.throws(()=>run(input),/unfinished/);assert.equal(input.day,366);
});
test('exception, skipped date and duplicate results all discard tentative state',()=>{
 for(const flag of ['fail','skip','duplicate']){const input={...seed(),[flag]:true},before=structuredClone(input);assert.throws(()=>run(input));assert.deepEqual(input,before)}
});
test('ambiguous partially simulated saves are rejected',()=>{
 const input=seed();input.gameResults=[{day:90,away:0,home:1}];assert.throws(()=>run(input),/without completion marker/);
 const prepared={...seed(),beWatchedCompletedDay:90};assert.throws(()=>run(prepared),/no game results/);
});
test('API-owned decoded state skips the second clone with identical day results',()=>{
 const input=seed(),copy=structuredClone(input),detached=run(input);
 const owned=runOriginalEngineDay(copy,{appSource},{takeOwnership:true});
 assert.equal(owned.state,copy,'request already owns its decoded state');
 assert.deepEqual(structuredClone(owned.state),structuredClone(detached.state));
 assert.equal(owned.result.to.date,detached.result.to.date);
 assert.deepEqual(input,seed(),'default entry still leaves the caller input untouched');
});
test('cached compiled code never shares context state between owned requests',()=>{
 const first=runOriginalEngineDay({...seed(),marker:'first'},{appSource},{takeOwnership:true});
 const second=runOriginalEngineDay(seed(),{appSource},{takeOwnership:true});
 assert.equal(second.state.marker,undefined);
 assert.equal(second.state.day,91);assert.equal(first.state.day,91);
 const bad=seed();bad.fail=true;
 assert.throws(()=>runOriginalEngineDay(bad,{appSource},{takeOwnership:true}),/engine failed/);
 assert.equal(runOriginalEngineDay(seed(),{appSource},{takeOwnership:true}).state.day,91);
});
