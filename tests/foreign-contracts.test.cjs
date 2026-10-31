const assert=require('node:assert/strict');
const vm=require('node:vm');
const c=require('./helpers/game-context.cjs')();
vm.runInContext(`state=world(0);state.teams=state.teams.slice(0,1);state.teams[0].budget=10000000000;
 state.year=2027;state.seasonStartDate='2027-01-01';state.day=339;state.postseasons={2027:{finished:true}};
 awardsFinished=()=>true;
 state.players=[{id:1,name:'아시아쿼터',foreignPlayer:true,asianQuota:true,nationality:'JP',teamId:0,
 age:26,position:'P',level:'1군',salary:150000000,foreignContractYear:2027,profile:{contractYears:1}}];
 ensureProfile(state.players[0]);
 state.foreignRecruitment={'2027:0':{phase:'scouted',candidates:[]}};
 foreignRecruitmentDay();`,c);
const state=vm.runInContext('state',c),p=state.players[0];
assert.equal(p.level,'1군','regular foreign review cannot release Asian-quota player');
assert.equal(p.salary,150000000,'regular foreign review cannot renegotiate Asian salary');
assert.equal(p.foreignContractYear,2027,'Asian contract not renewed a day early');
assert.equal(state.foreignRecruitment['2027:0'].phase,'complete');
assert.ok(!(state.clubNotices||[]).some(n=>n.players?.includes(1)));
// The separate Asian-quota procedure still performs the actual renewal.
vm.runInContext(`state.day=340;currentSeasonBoxStats=()=>({inningsPitched:60,earnedRuns:20});asianQuotaRecruitmentDay();`,c);
assert.equal(p.level,'1군');assert.equal(p.foreignContractYear,2028);
assert.equal(p.salary,160500000);
const salary=p.salary;
vm.runInContext('annualSalaryNegotiations();asianQuotaRecruitmentDay()',c);
assert.equal(p.salary,salary,'no ordinary salary adjustment or duplicate Asian renewal');
assert.equal((state.clubNotices||[]).filter(n=>n.kind==='아시아쿼터 재계약').length,1);
console.log('Asian quota uses a separate one-year renewal, once, without ordinary salary negotiation: PASS');
