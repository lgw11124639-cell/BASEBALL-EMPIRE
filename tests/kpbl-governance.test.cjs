const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);state.teams.forEach(t=>t.budget=1000000000000);leagueOfficeSeason();const before=JSON.stringify(state.players);const seasonBefore=JSON.stringify(leagueOfficeSeason());const policy=kpblProposePolicy('minimumSalary',40000000,'신규 계약 처우 개선');`);
assert.equal(run('kpblMinimumSalary()'),33000000);assert.equal(run('kpblMinimumSalary(2028)'),33000000);
for(let day=2;day<=7;day++)run(`state.day=${day};kpblAdvancePolicy(policy)`);
assert.equal(run('policy.status'),'공고');assert.equal(run('policy.steps.length'),7);assert.equal(run('policy.vote.quorum'),7);
assert.equal(run('kpblMinimumSalary(2028)'),40000000);assert.equal(run('kpblMinimumSalary()'),33000000);
assert.equal(run('JSON.stringify(leagueOfficeSeason())'),run('seasonBefore'));assert.equal(run('JSON.stringify(state.players)'),run('before'));
run(`state=JSON.parse(JSON.stringify(state));state.year=2028;leagueOfficeSeason();`);assert.equal(run('kpblMinimumSalary()'),40000000);
run(`const failed=kpblInspectBall('control',{mass:160,circumference:230,rebound:.99,drag:1.015,grip:1.035});const passed=kpblInspectBall('control',null,failed.id);`);
assert.equal(run('failed.passed'),false);assert.equal(run('passed.passed'),true);assert.equal(run('passed.retestOf'),run('failed.id'));
assert.throws(()=>run(`kpblInspectBall('standard',null,'not-a-failed-test')`));assert.throws(()=>run(`kpblProposePolicy('minimumSalary',100,'bad')`));
// New actual contract paths honor the policy; existing signed FA remains guaranteed.
run(`state.salaryNegotiations={};state.postseasons={2028:{finished:true}};state.leagueOffice.scheduled[2029]={minimumSalary:50000000};const player=state.players.find(p=>p.level==='1군'&&!p.foreignPlayer);player.salary=10000000;player.profile=player.profile||{};ensureProfile(player);player.profile.faContract=null;annualSalaryNegotiations();`);
assert.ok(run('player.salary>=50000000'));
run(`const faPlayer=state.players.find(p=>p.position!=='P'&&p.level==='1군'&&p.id!==player.id);const rec={year:2028,previousTeamId:faPlayer.teamId,grade:'C',previousSalary:33000000};const offer={teamId:faPlayer.teamId,annualSalary:10000000,years:1,signingBonus:0,totalValue:10000000,opportunity:.5,expectedRole:'백업'};faSettleAcceptedOffer(faPlayer,rec,offer);`);
assert.equal(run('faPlayer.salary'),50000000);assert.equal(run('faPlayer.profile.faContract.annualSalary'),50000000);
console.log('PASS seven-stage prospective policy, immutable contracts/rules, inspection failure/retest and contract floors');
// Exercise real rookie, development and re-signing entry points against high policy floors.
run(`{state=world(0);state.day=258;leagueOfficeSeason();state.leagueOffice.scheduled[2028]={minimumSalary:44000000};state.highSchoolBaseball={2027:{prospects:[{id:90001,name:'정책 신인',age:18,position:'P',potential:70,draftEligible:true,scoutVariance:0,games:10,inningsPitched:20,earnedRuns:5,pitchingStrikeouts:20}]}};officeDraft();}`);
assert.equal(run('state.players.find(p=>p.name==="정책 신인").salary'),44000000);
run(`{state=world(0);state.day=69;leagueOfficeSeason().minimumSalary=45000000;state.independentBaseball={2027:{players:[{id:90002,name:'정책 육성',age:23,position:'CF',potential:70,teamId:0}]}};developmentScoutDay();}`);
assert.equal(run('state.players.find(p=>p.name==="정책 육성").salary'),45000000);
run(`{state=world(0);state.day=69;leagueOfficeSeason().minimumSalary=200000000;const p=state.players.find(p=>p.teamId===0&&!p.foreignPlayer);p.name='정책 재영입';p.level='방출';p.age=25;p.profile={skills:{stuff:90,control:90,stamina:90,contact:90,power:90,eye:90,speed:90,fielding:90,arm:90}};state.players=state.players.filter((x,i)=>x.teamId!==1||i<120);state.teams[1].budget=100000000000;releasedPlayerSigningDay();}`);
assert.equal(run('state.players.find(p=>p.name==="정책 재영입").salary'),200000000);
run(`{state=world(0);state.teams.forEach(t=>t.budget=0);const rejected=kpblProposePolicy('minimumSalary',40000000,'비용 협의');for(let day=2;day<=7;day++){state.day=day;kpblAdvancePolicy(rejected)}if(rejected.status!=='부결'||state.leagueOffice.scheduled[2028])throw Error('rejected policy applied');}`);
console.log('PASS real rookie, development, released-player signing floors and rejected-policy isolation');
