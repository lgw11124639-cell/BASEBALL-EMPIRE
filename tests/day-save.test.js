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
 let saves=0,simulations=0,stops=0,contracts=0,negotiations=0,rollovers=0,prepares=0,renders=0;const timers=[],errors=[];
 const state={year:2027,day:42,players:[{id:1,careerStats:{hits:10}}],teams:[],events:[],gameResults:[{day:40,marker:'preserve'}],postseasons:{2027:{finished:true}},offseasonContractsDone:{}};
 if(mode==='watched postseason'||mode==='pending postseason')state.postseasons[2027].finished=false;
 const initial=clone(state);
 const ctx={state,seasonStepBusy:mode==='busy',autoSeasonRunning:mode==='auto'||mode==='auto-fast',autoSeasonSpeed:mode==='auto-fast'?0:300,entryMode:'game',tab:'home',
 document:{querySelector:()=>({disabled:false})},window:{},performance:{now:()=>0},structuredClone:clone,
 ensureSeasonCalendar:()=>{},monthlyOwnerReport:()=>{},saveSeasonSnapshot:()=>{},nationalTeamTournamentDay:()=>{},nationalTeamReturnDay:()=>{},
 seasonDate:(day)=>{const base=new Date(mode==='rollover'?'2027-11-21T12:00:00':['offseason','watched postseason','pending postseason'].includes(mode)?'2027-01-01T12:00:00':'2027-03-20T12:00:00');base.setDate(base.getDate()+Number(day)-1);return base;},
 awardsFinished:()=>['rollover','offseason','watched postseason','pending postseason'].includes(mode),
 offseasonDay:()=>{if(mode==='watched postseason')ctx.state.postseasons[2027].games=[{day:ctx.state.day,away:1,home:0}];ctx.state.day++},
 simulateLeagueDay:()=>{simulations++;ctx.state.players[0].careerStats.hits++;if(['watched regular','engine failure','save failure'].includes(mode))ctx.state.gameResults.push({day:ctx.state.day,away:0,home:1});ctx.state.day++;if(mode==='engine failure')throw Error('injected simulation failure')},
 validateSeasonIntegrity:()=>[],scheduledPairs:()=>mode==='pending league'?[[0,1]]:[],render:()=>{renders++},setTimeout:callback=>{timers.push(callback);return timers.length},bePrepareTodayScores:async()=>{prepares++},save:async()=>{saves++;if(mode==='save failure')throw Error('injected storage failure')},
 stopAutoSeason:()=>{stops++;ctx.autoSeasonRunning=false},alert:message=>errors.push(message),
 runOffseasonContracts:()=>{contracts++;ctx.state.offseasonContractsDone[2027]=true},
 annualSalaryNegotiations:()=>{negotiations++},
 beginNextSeason:()=>{rollovers++;ctx.state.year=2028;ctx.state.day=1}
 };
 const fn=new Function('ctx','with(ctx){'+source.slice(start,end)+';return advanceSeason;}')(ctx);
 const watching=mode==='watched regular'||mode==='watched postseason';
 const ok=await fn(watching,['auto','auto-fast'].includes(mode)?'auto':'manual');const watched=watching?clone(ctx.state):null;let nextOk=null;if(watching)nextOk=await fn();if(mode==='auto-fast')nextOk=await fn(false,'auto');
 for(const callback of timers)callback();await Promise.resolve();
 return {ok,state:ctx.state,saves,simulations,stops,contracts,negotiations,rollovers,prepares,renders,timers:timers.length,errors,initial,watched,nextOk};
}
(async()=>{
 let x=await run('normal');
 assert.equal(x.ok,true,x.errors.join('\n'));assert.equal(x.state.day,43);assert.equal(x.saves,1);
 x=await run('engine failure');
 assert.equal(x.ok,false);assert.equal(x.state.day,42);assert.equal(x.saves,0);assert.equal(x.stops,1);assert.deepEqual(x.state,x.initial);assert.match(x.errors[0],/injected simulation failure/);
 x=await run('save failure');
 assert.equal(x.ok,false);assert.equal(x.state.day,42);assert.equal(x.saves,1);assert.equal(x.stops,1);assert.deepEqual(x.state,x.initial);assert.match(x.errors[0],/injected storage failure/);
 x=await run('offseason');
 assert.equal(x.ok,true);assert.equal(x.state.day,43);
 x=await run('rollover');
 assert.equal(x.ok,true);assert.equal(x.state.year,2028);assert.equal(x.rollovers,1);
 assert.equal(x.contracts,1);assert.equal(x.negotiations,1);
 for(const mode of ['pending league','pending postseason']){x=await run(mode);assert.equal(x.ok,true,x.errors.join('\n'));assert.equal(x.state.day,43);assert.equal(x.saves,1);assert.equal(x.timers,1);assert.equal(x.prepares,1);assert.equal(x.renders,0);}
 x=await run('auto');assert.equal(x.ok,true,x.errors.join('\n'));assert.equal(x.timers,0);assert.equal(x.renders,1);assert.equal(x.stops,0);
 for(const mode of ['watched regular','watched postseason']){x=await run(mode);assert.equal(x.ok,true,x.errors.join('\n'));assert.equal(x.watched.day,42);assert.equal(x.watched.beWatchedCompletedDay,42);assert.equal(x.nextOk,true);assert.equal(x.state.day,43);assert.equal(x.state.beWatchedCompletedDay,undefined);assert.equal(x.saves,2);assert.equal(x.simulations,mode==='watched regular'?1:0);}
 x=await run('auto-fast');assert.equal(x.ok,true,x.errors.join('\n'));assert.equal(x.nextOk,true);assert.equal(x.saves,2,'fast mode saves each day');assert.equal(x.state.day,44);assert.equal(x.renders,1,'fast mode coalesces redundant layouts');
 x=await run('busy');assert.equal(x.ok,false);assert.equal(x.state.day,42);assert.equal(x.saves,0);assert.equal(x.simulations,0);
 console.log('PASS: 12 daily progression, deferred rendering, watched games, rollback and rollover scenarios');
})().catch(e=>{console.error(e);process.exitCode=1});
