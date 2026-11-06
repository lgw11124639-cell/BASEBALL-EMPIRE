const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
for(let id=0;id<10;id++)assert.equal(run(`beBroadcastBatterUniform({away:${id},home:9},'away')`),`assets/broadcast/uniforms/club-${id}.webp`);
assert.equal(run("beBroadcastBatterUniform({away:1},'away',true)"),'assets/broadcast/batter-ready-side.webp');assert.equal(run("beBroadcastBatterUniform({away:null})"),'assets/broadcast/batter-ready-side.webp');
assert.equal(run("beBroadcastRunnerVerdict({id:1,from:3,to:4},{outcome:'안타'}).label"),'홈 세이프');assert.equal(run("beBroadcastRunnerVerdict({id:1,from:2,to:4,out:true},{battedBall:{defenderPosition:'RF'}}).label"),'홈 아웃 · 보살');assert.equal(run("beBroadcastRunnerVerdict({id:1,from:1,to:2,out:true},{battedBall:{defenderPosition:'SS'}}).label"),'2루 아웃');
assert.equal(run("beBroadcastOutMoment({outsBefore:0,outsAfter:1},{caught:true,fieldAt:.44})"),.44);assert.equal(run("beBroadcastOutMoment({outsBefore:0,outsAfter:1},{transfers:[{end:.9}]})"),.9);
run(`const rangePlay={outcome:'안타',outsBefore:0,outsAfter:0,battedBall:{ground:true,sprayAngle:-40,launchAngle:3,defenderPosition:'3B'}};`);assert.equal(run('beBroadcastPickup(rangePlay).position'),'LF','third baseman does not retrieve a hit in left field');
assert.ok(run("(()=>{const p=beBroadcastPickup({...rangePlay,outcome:'땅볼 아웃'});return Math.hypot(p.ball.x-p.origins['3B'][0],p.ball.y-p.origins['3B'][1])<=55.01})()"));
run(`state=world(0);const batter=state.players.find(p=>p.position!=='P'),runner=state.players.find(p=>p.position!=='P'&&p.id!==batter.id);const slow=JSON.parse(JSON.stringify(batter)),fast=JSON.parse(JSON.stringify(batter));ensureProfile(slow).skills.speed=30;ensureProfile(fast).skills.speed=95;`);
assert.ok(run("beDoublePlayChance(slow,runner,{batters:[]},{ground:true,defenderPosition:'SS',exitVelocity:95},0)>beDoublePlayChance(fast,runner,{batters:[]},{ground:true,defenderPosition:'SS',exitVelocity:95},0)"));assert.equal(run("beDoublePlayChance(slow,runner,{batters:[]},{ground:true,bunt:true},0)"),0);
console.log('PASS per-club uniforms, neutral fallback, recorded safe/out/assist badges, immediate calls, bounded infield retrieval and speed-dependent double plays');

assert.equal(run("beBroadcastRunnerVerdict({id:1,from:0,to:1,out:true},{battedBall:{defenderPosition:'RF'}}).label"),'1루 아웃 · 보살');
