const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
for(const event of [{buntPlan:{type:'희생번트'}},{battedBall:{bunt:true}},{outcome:'희생번트'},{outcome:'번트 실패'}]){
 const before=JSON.stringify(event),e=JSON.stringify(event);
 assert.equal(run(`beBroadcastBuntAttempt({},${e})`),true);
 assert.equal(run(`beBroadcastBuntPose({call:'인플레이'},${e},200,0,1100,450)`),0);
 assert.equal(run(`beBroadcastBuntPose({call:'인플레이'},${e},600,0,1100,450)`),1);
 for(const call of ['인플레이','파울','헛스윙'])assert.equal(run(`beBroadcastBuntPose({call:'${call}'},${e},1550,1,1100,450)`),2);
 for(const call of ['볼','루킹 스트라이크'])assert.equal(run(`beBroadcastBuntPose({call:'${call}'},${e},1550,1,1100,450)`),1,'a taken pitch must not show contact');
 assert.equal(run(`beBroadcastBuntPose({call:'볼'},${e},1700,1,1100,450)`),3);
 assert.equal(JSON.stringify(event),before,'visual timing cannot change stored plans or results');
}
assert.equal(run("beBroadcastBuntPose({call:'인플레이'},{outcome:'땅볼 아웃',battedBall:{ground:true}},1550,1,1100,450)"),null);
console.log('PASS recorded bunt plans: presentation, contact, miss, taking a ball, recovery and immutable outcomes');
