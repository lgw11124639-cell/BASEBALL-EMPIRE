const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);state.year=2046;state.day=100;state.leagueOffice={governance:{}};state.leagueOffice.governance.cases=Array.from({length:1500},(_,i)=>({id:'case'+i,playerId:String(state.players[i%state.players.length].id),scope:['regular','minor','domestic','international'][i%4],status:i%5===0?'종결':'확정',remaining:i%3,finalYear:2046,finalDay:i%2?99:100}));`);
for(const scope of ['regular','minor','postseason','international']){
 run(`var ids=kpblSuspendedIds('${scope}')`);
 assert.equal(run(`state.players.every(p=>ids.has(String(p.id))===kpblSuspended(p,'${scope}'))`),true);
}
run('state.day++');
assert.equal(run(`state.players.every(p=>kpblSuspendedIds('regular').has(String(p.id))===kpblSuspended(p,'regular'))`),true);
console.log('PASS batch suspension index matches exact eligibility across scopes, expired cases and next-day effect');
