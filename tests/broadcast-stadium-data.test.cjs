const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`const event={pitchSequence:[{number:1,zoneX:0,zoneY:100,call:'볼'},{number:2,zoneX:null,zoneY:40},{number:3,zoneX:30,zoneY:45}]};`);
assert.equal(run('beBroadcastPitchPoints(event,1).length'),1);assert.equal(run('beBroadcastPitchPoints(event,1)[0].x'),0);assert.equal(run('beBroadcastPitchPoints(event,2).length'),1);assert.equal(run('beBroadcastPitchPoints(event,3).length'),2);
assert.equal(run('beBroadcastBallPath({})'),null);assert.equal(run('beBroadcastBallPath({sprayAngle:null})'),null);assert.ok(run('beBroadcastBallPath({sprayAngle:-30,launchAngle:20}).x<360'));assert.ok(run('beBroadcastBallPath({sprayAngle:30,launchAngle:20}).x>360'));
console.log('PASS saved-only pitch positions, seen pitch bounds, explicit missing data and recorded spray direction');
