const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`var e={batterId:12,pitcherId:7,pitchSequence:['헛스윙','헛스윙','파울'].map((call,i)=>({type:'커터',number:i+1,velocity:136,zoneX:30+i*13,zoneY:70-i*7,leadTargetX:64,leadTargetY:50,call,ballsAfter:0,strikesAfter:Math.min(2,i+1),lead:'몸쪽'}))};var before=JSON.stringify(e);var plans=e.pitchSequence.map((p,i)=>beBroadcastLeadPlan(e,i+1,'좌타'));`);
assert.equal(run('plans.every(p=>p.reconstructed)'),true);assert.equal(run('plans[0].x!==plans[1].x||plans[0].y!==plans[1].y'),true);assert.equal(run('plans[1].x!==plans[2].x||plans[1].y!==plans[2].y'),true);assert.equal(run('JSON.stringify(e)'),run('before'),'reconstructed display must never rewrite old pitch targets or ball positions');
run(`e.pitchSequence.forEach(p=>p.leadPlanVersion=2);var actual=e.pitchSequence.map((p,i)=>beBroadcastLeadPlan(e,i+1,'좌타'));`);
assert.equal(run('actual.every(p=>p.x===64&&p.y===50&&!p.reconstructed)'),true,'explicit new plans can intentionally repeat a course');
run(`e.pitchSequence.forEach((p,i)=>{delete p.leadPlanVersion;p.leadTargetX=32+i*18});var varied=e.pitchSequence.map((p,i)=>beBroadcastLeadPlan(e,i+1,'좌타'));`);
assert.equal(run('varied.every((p,i)=>p.x===32+i*18&&!p.reconstructed)'),true,'existing genuinely varied numeric plans remain authoritative');
console.log('PASS legacy server fixed-target compatibility, per-pitch visual changes, recorded plan authority and immutable ball endpoints');

run(`e.pitchSequence.forEach((p,i)=>{delete p.leadPlanVersion;p.leadTargetX=[66,64,50][i];p.leadTargetY=50});var oldCountPlans=e.pitchSequence.map((p,i)=>beBroadcastLeadPlan(e,i+1,'좌타'));`);assert.equal(run('oldCountPlans.every(p=>p.reconstructed)'),true,'old edge-to-two-strike-to-three-ball grid is reconstructed even when numeric targets differ slightly');
