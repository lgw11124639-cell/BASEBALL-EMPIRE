const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=src.indexOf('async function advanceSeason(');
const end=src.indexOf('function newsStory(',start);
assert.ok(start>=0&&end>start,'real day-advance function found');
const initial={year:2026,day:366,gameResults:[{year:2026,day:100}],players:[{id:1,teamId:0,profile:{contractYears:1}}],teams:[{id:0,budget:100000000},{id:1,budget:100000000}],history:{seasons:{2026:{complete:true}}},postseasons:{2026:{finished:true}}};
const notices=[];
let state=structuredClone(initial);
const context=vm.createContext({performance:{now:()=>0},document:{querySelector:()=>null},window:{},structuredClone,
 get state(){return state},set state(v){state=v},
 seasonStepBusy:false,entryMode:'game',tab:'home',
 ensureSeasonCalendar:()=>{},monthlyOwnerReport:()=>{},
 seasonDate:()=>new Date('2027-01-01T12:00:00'),
 nationalTeamTournamentDay:()=>{},nationalTeamReturnDay:()=>{},
 awardsFinished:()=>true,
 runOffseasonContracts:()=>{
   state.offseasonContractsDone={2026:true};
   state.players[0].teamId=1;
   state.players[0].profile.contractYears=3;
   state.teams[0].budget+=80000000;
   state.teams[1].budget-=110000000;
   state.freeAgents=[{id:1,from:0,to:1}];
   throw new Error('FA 보상금 정산 실패');
 },
 annualSalaryNegotiations:()=>{},beginNextSeason:()=>{},offseasonDay:()=>{},
 simulateLeagueDay:()=>{},saveSeasonSnapshot:()=>{},validateSeasonIntegrity:()=>{},
 save:async()=>{},render:()=>{},stopAutoSeason:()=>{},
 alert:x=>notices.push(x),
});
vm.runInContext(src.slice(start,end),context);
(async()=>{
 const result=await vm.runInContext('advanceSeason()',context);
 assert.equal(result,false,'failed settlement aborts day advance');
 assert.deepEqual(JSON.parse(JSON.stringify(context.state)),initial,'all FA transfers, budgets and flags rolled back');
 assert.equal(notices.length,1,'error surfaced');
 assert.match(notices[0],/FA 보상금 정산 실패/);
 assert.equal(context.seasonStepBusy,false,'day advance unlocked after failure');
 console.log('Day advance rollback after failed FA settlement: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
