const assert=require('node:assert/strict'),vm=require('node:vm');
const c=require('./helpers/game-context.cjs')();
vm.runInContext(`state=world(0);state.gameResults=[];const plan=managerPlan(0);const p=plan.lineup[0];
 const before=plan.score(p);playerBaseball(p).fatigue=80;const tired=plan.score(p);
 playerBaseball(p).fatigue=0;p.atBats=300;p.hits=135;p.homeRuns=40;const improved=plan.score(p);`,c);
assert.ok(vm.runInContext('tired<before',c),'returned score reflects live fatigue rather than cached construction score');
assert.ok(vm.runInContext('improved>before',c),'in-game score reflects changed player stats');
assert.equal(vm.runInContext('new Set(plan.lineup.map(p=>p.id)).size',c),9);
console.log('Manager plan snapshot caching preserves live player evaluation PASS');
