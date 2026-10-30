// BASEBALL EMPIRE daily progression and save rollback regression.
// Run: node tests/day-save.test.js
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('async function advanceSeason(');
const end=source.indexOf('function newsStory(',start);
assert(start>=0&&end>start);
const clone=x=>JSON.parse(JSON.stringify(x));
async function run(mode){
 let saves=0,simulations=0,stops=0,contracts=0,negotiations=0,rollovers=0;
 const state={year:2027,day:42,players:[],teams:[],events:[],gameResults:[],postseasons:{2027:{finished:true}},offseasonContractsDone:{}};
 const ctx={state,seasonStepBusy:false,entryMode:'game',tab:'home',
 document:{querySelector:()=>({disabled:false})},window:{},performance:{now:()=>0},structuredClone:clone,
 ensureSeasonCalendar:()=>{},monthlyOwnerReport:()=>{},saveSeasonSnapshot:()=>{},nationalTeamTournamentDay:()=>{},nationalTeamReturnDay:()=>{},
 seasonDate:(day)=>{const base=new Date(mode==='rollover'?'2027-11-21T12:00:00':mode==='offseason'?'2027-01-01T12:00:00':'2027-03-20T12:00:00');base.setDate(base.getDate()+Number(day)-1);return base;},
 awardsFinished:()=>mode==='rollover'||mode==='offseason',
 offseasonDay:()=>{ctx.state.day++},
 simulateLeagueDay:()=>{simulations++;ctx.state.day++;if(mode==='engine failure')throw Error('injected simulation failure')},
 validateSeasonIntegrity:()=>[],render:()=>{},save:async()=>{saves++;if(mode==='save failure')throw Error('injected storage failure')},
 stopAutoSeason:()=>{stops++},alert:()=>{},
 runOffseasonContracts:()=>{contracts++;ctx.state.offseasonContractsDone[2027]=true},
 annualSalaryNegotiations:()=>{negotiations++},
 beginNextSeason:()=>{rollovers++;ctx.state.year=2028;ctx.state.day=1}
 };
 const fn=new Function('ctx','with(ctx){'+source.slice(start,end)+';return advanceSeason;}')(ctx);
 const ok=await fn();
 return {ok,state:ctx.state,saves,simulations,stops,contracts,negotiations,rollovers};
}
(async()=>{
 let x=await run('normal');
 assert.equal(x.ok,true);assert.equal(x.state.day,43);assert.equal(x.saves,1);
 x=await run('engine failure');
 assert.equal(x.ok,false);assert.equal(x.state.day,42);assert.equal(x.saves,0);assert.equal(x.stops,1);
 x=await run('save failure');
 assert.equal(x.ok,false);assert.equal(x.state.day,42);assert.equal(x.saves,1);assert.equal(x.stops,1);
 x=await run('offseason');
 assert.equal(x.ok,true);assert.equal(x.state.day,43);
 x=await run('rollover');
 assert.equal(x.ok,true);assert.equal(x.state.year,2028);assert.equal(x.rollovers,1);
 assert.equal(x.contracts,1);assert.equal(x.negotiations,1);
 console.log('PASS: 5 daily progression, rollback and season rollover scenarios');
})().catch(e=>{console.error(e);process.exitCode=1});