const assert=require('node:assert/strict');
const vm=require('node:vm');
const gameContext=require('./helpers/game-context.cjs');
for(const failure of ['bonus','compensation-credit',null]){
 const c=gameContext();c.failure=failure;
 vm.runInContext(`state=world(0);state.year=2027;state.day=336;state.seasonStartDate='2027-01-01';
 state.teams=state.teams.slice(0,2);state.teams[0].budget=0;state.teams[1].budget=1000000000;
 state.players=[{id:7,name:'미계약 FA',age:29,position:'SS',teamId:0,level:'FA대기',salary:100000000,
 profile:{contractYears:0,faContractHistory:[{signedYear:2020,years:2,totalValue:300000000}]},
 faService:{creditedSeasons:8,carryDays:0,faUses:0},careerStats:{hits:800}}];
 state.faMarket=[{year:2027,playerId:7,previousTeamId:0,grade:'B',previousSalary:100000000}];
 state.postseasons={2027:{finished:true}};awardsFinished=()=>true;
 const realFinanceEntry=financeEntry;financeEntry=(id,amount,kind,detail)=>{
  if(failure==='bonus'&&kind==='FA 계약금'&&amount<0)return false;
  if(failure==='compensation-credit'&&id===0&&kind==='FA 이적 보상금'&&amount>0)return false;
  return realFinanceEntry(id,amount,kind,detail);
 };
 if(failure)reviewUnsignedFaMarket();else{
  state.offseasonContractsDone={2027:true};
  highSchoolBaseballDay=collegeBaseballDay=independentBaseballDay=calendarNotice=activateDraftRookies=draftScoutReport=officeDraft=coachDevelopmentDay=()=>{};
  offseasonDay();
 }`,c);
 const state=vm.runInContext('state',c),p=state.players[0];
 assert.equal(p.careerStats.hits,800);
 assert.equal(p.profile.faContractHistory.length,failure?1:2,'preserve existing contract archive');
 if(failure){
  assert.equal(p.level,'FA대기');assert.equal(p.teamId,0);
  assert.equal(p.faService.faUses,0);
  assert.equal(state.teams[0].budget,0);assert.equal(state.teams[1].budget,1000000000,'full cash rollback');
  assert.equal((state.faCompensations||[]).length,0,'no phantom compensation records');
  assert.ok(!(state.clubNotices||[]).some(n=>n.kind==='FA 보상'),'no false successful transfer notice');
 }else{
  assert.equal(p.teamId,1);assert.equal(p.level,'2군');assert.equal(p.faService.faUses,1);
  assert.equal(p.profile.faContract.startYear,2028);assert.equal(p.profile.faContract.endYear,2028);
  assert.equal(state.teams[0].budget,200000000);
  const fee=Math.round(85000000*.35);
  assert.equal(state.teams[1].budget,1000000000-200000000-fee);
  assert.equal(state.faCompensations.length,1);
  vm.runInContext('state.offseasonContractsDone={2027:true};annualSalaryNegotiations();reviewUnsignedFaMarket()',c);
  assert.equal(p.salary,85000000,'one-year late FA salary is guaranteed');
  assert.equal(state.faCompensations.length,1,'repeat review does not duplicate compensation');
  assert.equal(p.profile.faContractHistory.length,2);
 }
}
console.log('Late FA signing bonus failure, compensation refund, single settlement and one-year guarantee: PASS');
