const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);const managerBatter=state.players.find(p=>p.position!=='P');const originalManagerState=JSON.stringify(state);`);
assert.equal(run("beManagerDefensePlan(managerBatter,{inning:8,outs:1,bases:[null,null,42],margin:0}).id"),'infield-in');
assert.equal(run("beManagerDefensePlan(managerBatter,{inning:4,outs:1,bases:[42,null,null],margin:2}).id"),'double-play');
assert.equal(run("beManagerDefensePlan(managerBatter,{inning:8,outs:2,bases:[42,null,null],margin:0}).id==='double-play'"),false);
run(`const dpPlan=beManagerDefensePlan(managerBatter,{inning:4,outs:1,bases:[42,null,null]});`);
assert.equal(run('beBroadcastFieldPoints(dpPlan).SS[0]'),306);
assert.notEqual(run("beDefenseRangeAdjustment(dpPlan,'SS',-15,3,95)"),0);
assert.equal(run("beDefenseRangeAdjustment(null,'SS',-15,3,95)"),0);
assert.equal(run('JSON.stringify(state)'),run('originalManagerState'),'planning and projection do not alter saves or consume game RNG');
// Identical batted-ball RNG exposes only the coverage tradeoff: same contact,
// exit speed, launch/spray and random stream, different hit threshold.
run(`const managerRoster=state.players.filter(p=>p.teamId===0&&p.level==='1군');const managerLineup=chooseBattingNine(managerRoster.filter(p=>p.position!=='P'));const managerClub=createInningClub(0,managerLineup,{lineupPositions:managerLineup.assignedPositions},managerRoster.find(p=>p.position==='P'));let differences=0;for(let seed=1;seed<=2000;seed++){managerClub.defensivePlan=null;const standard=resolveBattedBall(managerBatter,null,managerClub,{zoneX:50,zoneY:50},rng(seed));managerClub.defensivePlan=dpPlan;const shifted=resolveBattedBall(managerBatter,null,managerClub,{zoneX:50,zoneY:50},rng(seed));if(standard.hit!==shifted.hit)differences++;if(standard.exitVelocity!==shifted.exitVelocity||standard.sprayAngle!==shifted.sprayAngle)throw Error('alignment changed contact');}`);
assert.ok(run('differences')>0,'actual hit resolution uses defensive alignment');
console.log('PASS manager decisions, recorded position offsets, range tradeoffs, pure planning and actual batted-ball resolution');
assert.equal(run("beManagerDefensePlan(managerBatter,{inning:6,outs:1,bases:[null,null,42],margin:0,style:'승부형'}).id"),'infield-in');
assert.notEqual(run("beManagerDefensePlan(managerBatter,{inning:6,outs:1,bases:[null,null,42],margin:0,style:'안정형'}).id"),'infield-in');
assert.ok(run("beManagerDefensePlan(managerBatter,{inning:4,outs:1,bases:[42,null,null],style:'공격형'}).offsets.SS[0]>beManagerDefensePlan(managerBatter,{inning:4,outs:1,bases:[42,null,null],style:'안정형'}).offsets.SS[0]"));
console.log('PASS manager-specific timing, depth thresholds and double-play alignment');
