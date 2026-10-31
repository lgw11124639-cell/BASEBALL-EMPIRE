const assert=require('node:assert/strict');
const vm=require('node:vm');
const context=require('./helpers/game-context.cjs')();
vm.runInContext(`state=world(0);state.year=2027;state.day=314;state.seasonStartDate='2027-01-01';state.gameResults=[];
 state.postseasons={2027:{finished:true}};awardsFinished=()=>true;
 snapshotOverseasInterest=processOverseasPosting=resolveOverseasNegotiations=saveSeasonSnapshot=renewStaffContracts=hireRetiredCoaches=honorRetiredPlayers=publishReserveRoster=()=>{};
 // Keep retirement out of this isolated negotiation experiment; retirement has its own suite.
 playerRetirementProbability=()=>0;
 const candidates=[];
 for(const team of state.teams){
  team.budget=25000000000;
  const selected=state.players.filter(p=>p.teamId===team.id&&!p.foreignPlayer&&p.position!=='P').slice(0,2);
  selected.forEach((p,i)=>{
   p.age=i?40:28;p.salary=i?2000000000:500000000;p.level='1군';
   p.atBats=540;p.hits=170;p.homeRuns=25;p.doubles=28;p.triples=2;p.walks=55;p.games=140;p.registeredDays=145;
   p.faService={creditedSeasons:7,carryDays:0,faUses:0};p.faApplicationDecisions={2027:true};
   p.teamHistory=[{year:2026,to:team.id,reason:'기존 이력'}];candidates.push(p.id);
  });
 }
 for(const p of state.players){ensureProfile(p);p.profile.contractYears=1;if(!candidates.includes(p.id)){p.faService={creditedSeasons:0,carryDays:0,faUses:0};p.registeredDays=0;}}
 const initialBudget=state.teams.reduce((n,t)=>n+t.budget,0);
 runOffseasonContracts();
 if(state.faMarket.some(r=>r.signedYear))throw Error('contracts signed on registration day');
 for(let day=315;day<=364;day++){state.day=day;reviewUnsignedFaMarket();}
 const beforeRepeat=JSON.stringify(state.faMarket);reviewUnsignedFaMarket();
 const experiment={candidates,initialBudget,beforeRepeat,afterRepeat:JSON.stringify(state.faMarket),
  records:state.faMarket,players:state.players.filter(p=>candidates.includes(p.id)),teams:state.teams};`,context);
const x=vm.runInContext('experiment',context);
assert.equal(x.records.length,20,'20 actual eligible candidates across 10 clubs');
assert.equal(x.beforeRepeat,x.afterRepeat,'same-day reviews cannot accelerate concessions or duplicate contracts');
const signed=x.records.filter(r=>r.signedYear),pending=x.records.filter(r=>!r.signedYear);
assert.ok(signed.length>0,'players can accept competitive offers');
const signingDays=new Set(signed.map(r=>r.negotiationHistory.find(h=>h.signedTeamId!=null).day));
assert.ok(signingDays.size>1,'signings are spread across actual dates');
console.log('FA signing days:',Array.from(signingDays).sort((a,b)=>a-b));
assert.ok(pending.length>0,'no forced market clearing');
assert.ok(x.records.some(r=>r.negotiationHistory.some(h=>h.offers.some(o=>!o.accepted))),'players actually reject club offers');
let bonus=0;
for(const p of x.players){
 const r=x.records.find(r=>String(r.playerId)===String(p.id));
 assert.equal(p.teamHistory[0].reason,'기존 이력','existing team history preserved');
 if(r.signedYear){
  assert.equal(p.faService.faUses,1);assert.equal(p.profile.faContractHistory.length,1);
  bonus+=p.profile.faContract.signingBonus;
  assert.equal(p.profile.faContract.totalValue,p.salary*p.profile.contractYears+p.profile.faContract.signingBonus);
  if(p.age===40)assert.ok(p.profile.contractYears<=2,'old players have no random four-year guarantee');
 }else{assert.equal(p.faService.faUses,0);assert.equal(p.level,'FA대기');assert.equal(p.profile.contractYears,0);}
}
assert.ok(x.teams.every(t=>t.budget>=0));
assert.ok(vm.runInContext("state.teams.every(t=>state.players.filter(p=>p.teamId===t.id&&p.level==='1군'&&!p.retired).length<=28)",context),'FA signing does not exceed major roster registration capacity');
assert.equal(x.initialBudget-x.teams.reduce((n,t)=>n+t.budget,0),bonus,'bonuses are paid once; internal compensation transfers conserve money');
console.log('Ten-club real FA market:',JSON.stringify({candidates:x.records.length,signed:signed.length,pending:pending.length,
 playerRefusals:x.records.reduce((n,r)=>n+r.negotiationHistory.filter(h=>h.offers.length&&!h.signedTeamId&&h.signedTeamId!==0).length,0),
 signed40:x.players.filter(p=>p.age===40&&p.profile.faContract).map(p=>({years:p.profile.faContract.years,total:p.profile.faContract.totalValue})),
 totalSigningBonuses:bonus}));

// An unsigned FA's former salary is not a continuing monthly employment cost.
function monthly(includeUnsigned){
 const c=require('./helpers/game-context.cjs')();c.includeUnsigned=includeUnsigned;
 return vm.runInContext(`state=world(0);state.teams=state.teams.slice(0,1);state.players=[
 {id:101,teamId:0,name:'계약 선수',age:28,position:'SS',level:'1군',salary:120000000,contractSigned:true}];
 if(includeUnsigned)state.players.push({id:102,teamId:0,name:'미계약 FA',age:40,position:'SS',level:'FA대기',salary:2000000000});
 state.year=2028;state.seasonStartDate='2028-01-01';state.faMarket=[{year:2027,playerId:102,previousTeamId:0,previousSalary:2000000000}];state.day=1;financeMonth();const expense=state.teams[0].finance.lastMonthlySummary.operatingExpense;
 const budget=state.teams[0].budget;financeMonth();if(state.teams[0].budget!==budget)throw Error('monthly cost repeated');expense;`,c);
}
assert.equal(monthly(true),monthly(false),'unsigned former salary is excluded from actual monthly payroll');
console.log('Unsigned FA salary is excluded from monthly payroll; billing remains idempotent PASS');

const payrollContext=require('./helpers/game-context.cjs')();
vm.runInContext('state=world(0)',payrollContext);
const charge=vm.runInContext('playerSalaryCharge',payrollContext);
const futureDeal={id:200,teamId:1,level:'1군',salary:200000000,profile:{faContract:{signedYear:2027,startYear:2028,endYear:2029,years:2,annualSalary:200000000,previousTeamId:0,previousSalary:100000000}}};
assert.equal(charge(futureDeal,0,2027),100000000,'original club retains old-year salary obligation');
assert.equal(charge(futureDeal,1,2027),0,'new club is not billed before the contract starts');
assert.equal(charge(futureDeal,0,2028),0);
assert.equal(charge(futureDeal,1,2028),200000000,'new club pays from playing season');
payrollContext.pendingId=201;
vm.runInContext('state.faMarket=[{year:2027,playerId:pendingId,previousTeamId:0,previousSalary:100000000}]',payrollContext);
const pendingPlayer={id:201,teamId:0,level:'FA대기',salary:100000000};
assert.equal(charge(pendingPlayer,0,2027),100000000,'declaring FA does not erase salary already owed for that year');
assert.equal(charge(pendingPlayer,0,2028),0,'unsigned player does not earn a new year of salary');
console.log('FA payroll respects old obligations and actual new-contract start season PASS');
