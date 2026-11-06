const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);var pitcher=state.players.find(p=>p.position==='P'),runner=state.players.find(p=>p.position!=='P');var setup=()=>({batting:{batters:[runner],beEvents:[],beSide:'away',runs:0},fielding:{},appearance:{outs:2,pitchCount:12},bases:[{id:runner.id},null,null]});var draws=values=>()=>values.shift()??.99;`);
for(const [values,action,isOut] of [[[0,.8,0],'pickoff',true],[[0,0,0],'rundown',true],[[0,.8,.99],'pickoff',false],[[0,0,.99],'rundown',false]]){
 run(`var fixture=setup(),oldCaught=Number(runner.caughtStealing)||0,oldStolen=Number(runner.stolenBases)||0;var result=beAttemptPickoff(fixture.batting,fixture.fielding,pitcher,fixture.appearance,fixture.bases,2,draws(${JSON.stringify(values)}),5);`);
 assert.equal(run('result.event.runAction'),action);assert.equal(run('result.outs'),isOut?3:2);assert.equal(run('fixture.appearance.outs'),isOut?3:2);assert.equal(run('fixture.appearance.pitchCount'),12);
 assert.equal(run('fixture.batting.beEvents.length'),1);assert.equal(run('result.event.bases[0]===runner.id'),true);assert.equal(run('result.event.afterBases[0]'),isOut?null:run('runner.id'));
 assert.equal(run('Number(runner.caughtStealing)||0'),run('oldCaught'));assert.equal(run('Number(runner.stolenBases)||0'),run('oldStolen'));
 assert.equal(run('JSON.stringify(result.event.afterBases)===JSON.stringify(fixture.bases.map(x=>x?.id??null))'),true);
}
run('var idle=setup()');assert.equal(run('beAttemptPickoff(idle.batting,idle.fielding,pitcher,idle.appearance,idle.bases,2,()=>.99,1)'),null);assert.equal(run('idle.batting.beEvents.length'),0);
for(const action of ['pickoff','rundown','steal'])for(const out of [false,true]){
 run(`var event={eventType:'baserunning',runAction:${JSON.stringify(action)},runnerId:runner.id,bases:[runner.id,null,null],afterBases:${out?'[null,null,null]':action==='steal'?'[null,runner.id,null]':'[runner.id,null,null]'},fromBase:1,toBase:${action==='steal'?2:1},targetBase:2,outsBefore:0,outsAfter:${out?1:0},outcome:${JSON.stringify(action==='steal'?'도루':action==='pickoff'?'견제':'런다운')}};var plan=beBroadcastRunningDefense(event);var moves=beBroadcastRunnerMoves(event);`);
 assert.equal(run('moves.some(move=>move.id===runner.id)'),true);assert.equal(run('moves.find(move=>move.id===runner.id).out'),out);
 assert.equal(run('plan.transfers.every(leg=>{const move=plan.moves.find(row=>row.position===leg.receiver),point=beBroadcastActorPoint(move,leg.end);return Math.hypot(point[0]-leg.to[0],point[1]-leg.to[1])<.001})'),true,action+' '+out+' must throw to the receiving dot');
 assert.equal(run('plan.transfers.every(leg=>leg.kind==="carry"||Math.hypot(...leg.to.map((n,i)=>n-beBroadcastActorPoint(plan.moves.find(row=>row.position===leg.receiver),leg.end)[i]))<.001)'),true);
}
assert.equal(run('Object.hasOwn(runner,"pickedOff")||Object.hasOwn(pitcher,"pickoffs")||Object.hasOwn(pitcher,"pickoffAttempts")'),false);
console.log('PASS recorded pickoff/rundown outcomes, third-out accounting, unchanged pitch and stealing counts, and occupied receiving locations');
