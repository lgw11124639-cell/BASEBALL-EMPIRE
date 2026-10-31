const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')();
vm.runInContext(`state=world(0);state.year=2039;state.day=316;state.teams=state.teams.slice(0,2);state.players=[{id:7,name:'협상 선수',age:30,position:'SS',teamId:0,level:'FA대기',salary:100000000,profile:{},faService:{creditedSeasons:8,carryDays:0,faUses:0}}];for(const t of state.teams)t.budget=10000000000;const p=state.players[0],record={year:2039,previousTeamId:0,previousSalary:100000000,grade:'B'};state.postseasons={2039:{finished:true}};const offer={teamId:1,annualSalary:400000000,signingBonus:100000000,years:3,totalValue:1300000000,opportunity:.8};const ok=faSettleAcceptedOffer(p,record,offer);`,c);
assert.equal(vm.runInContext('ok',c),true);
assert.deepEqual(Array.from(vm.runInContext('state.clubNotices.map(n=>n.kind)',c)),['FA 계약','FA 보상','FA 특집']);
const prior=vm.runInContext('JSON.stringify(state)',c);assert.equal(vm.runInContext('faSettleAcceptedOffer(p,record,offer)',c),false);assert.equal(vm.runInContext('JSON.stringify(state)',c),prior,'settled agreement cannot be charged or published twice');
assert.equal(vm.runInContext('state.faCompensations.length',c),1);
console.log('PASS: actual FA agreement → compensation → feature publication, financial settlement and duplicate guard');
