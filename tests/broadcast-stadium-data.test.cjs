const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`const event={pitchSequence:[{number:1,zoneX:0,zoneY:100,call:'볼'},{number:2,zoneX:null,zoneY:40},{number:3,zoneX:30,zoneY:45}]};`);
assert.equal(run('beBroadcastPitchPoints(event,1).length'),1);assert.equal(run('beBroadcastPitchPoints(event,1)[0].x'),0);assert.equal(run('beBroadcastPitchPoints(event,2).length'),1);assert.equal(run('beBroadcastPitchPoints(event,3).length'),2);
assert.equal(run('beBroadcastBallPath({})'),null);assert.equal(run('beBroadcastBallPath({sprayAngle:null})'),null);assert.ok(run('beBroadcastBallPath({sprayAngle:-30,launchAngle:20}).x<360'));assert.ok(run('beBroadcastBallPath({sprayAngle:30,launchAngle:20}).x>360'));
console.log('PASS saved-only pitch positions, seen pitch bounds, explicit missing data and recorded spray direction');
assert.equal(run('JSON.stringify(beBroadcastRunnerMoves({batterId:9,bases:[1,null,null],afterBases:[9,null,1],outcome:"안타"}))'),JSON.stringify([{id:9,from:0,to:1},{id:1,from:1,to:3}]));
assert.equal(run('JSON.stringify(beBroadcastRunnerMoves({batterId:9,bases:[null,null,1],afterBases:[null,null,null],outcome:"희생플라이",runs:1,outsBefore:0,outsAfter:1}))'),JSON.stringify([{id:1,from:3,to:4}]));
assert.equal(run('beBroadcastRunnerMoves({bases:[1,2,null],afterBases:[null,null,null],runs:1,outsBefore:1,outsAfter:2}).length'),0);
assert.equal(run('beBroadcastRunnerMoves({batterId:9,bases:[1,null,null],afterBases:[],outcome:"홈런",runs:2}).length'),2);
assert.equal(run('beBroadcastDefense({battedBall:{defenderPosition:"RF",sprayAngle:25,launchAngle:25},outcome:"홈런"})'),null);
assert.equal(run('beBroadcastPosition("유격수")'),'SS');assert.equal(run('beBroadcastPosition("중견수")'),'CF');
assert.equal(run('JSON.stringify(beBroadcastFieldNames({homePositions:{1:"CF"},homeBatters:[{id:1,name:"김중견",position:"좌익수"},{id:2,name:"박유격",position:"유격수"}]},"home",1,"최투수"))'),JSON.stringify({P:'최투수',CF:'김중견',SS:'박유격'}));
run(`const play=(pos,angle=30,outcome='땅볼 아웃',outs=1)=>({battedBall:{defenderPosition:pos,sprayAngle:angle,launchAngle:2},outcome,outsBefore:0,outsAfter:outs});`);
assert.equal(run('beBroadcastDefense(play("1B")).transfers[0].kind'),'carry');
assert.equal(run('beBroadcastDefense(play("1B")).transfers[0].receiver'),'1B');
assert.equal(run('beBroadcastDefense(play("1B",-55)).transfers[0].receiver'),'P');
assert.equal(run('beBroadcastDefense(play("SS",-20)).transfers[0].receiver'),'1B');
assert.equal(run('JSON.stringify(beBroadcastDefense(play("2B",20,"병살",2)).transfers.map(x=>x.receiver))'),'["SS","1B"]');
assert.equal(run('JSON.stringify(beBroadcastDefense(play("1B",20,"병살",2)).transfers.map(x=>x.receiver))'),'["SS","P"]');
assert.equal(run('beBroadcastDefense(play("RF",30,"뜬공 아웃")).transfers.length'),0);
assert.equal(run('beBroadcastDefense(play("LF",-30,"안타",0)).transfers[0].receiver'),'SS');
for(const pos of ['1B','2B','3B','SS','P','C','LF','CF','RF'])for(const outcome of ['땅볼 아웃','병살','안타']){
 run(`var plan=beBroadcastDefense(play(${JSON.stringify(pos)},${pos==='LF'?-30:30},${JSON.stringify(outcome)},${outcome==='병살'?2:outcome==='안타'?0:1}));`);
 assert.equal(run('plan.transfers.every(leg=>{const actor=plan.moves.find(move=>move.position===leg.receiver),point=beBroadcastActorPoint(actor,leg.kind==="carry"?leg.end:leg.start);return Math.hypot(point[0]-leg.to[0],point[1]-leg.to[1])<.001})'),true,pos+' '+outcome+' receiver must cover destination before throw');
}
assert.equal(run('beBroadcastRunnerMoves({batterId:9,bases:[1,null,null],afterBases:[],outcome:"병살",outsBefore:0,outsAfter:2}).filter(x=>x.out).length'),2);
assert.notEqual(run('beBroadcastPitchPath({type:"직구"},400,330,360,260)'),run('beBroadcastPitchPath({type:"슬라이더"},400,330,360,260)'));
console.log('PASS named defense positions, first-base tags and pitcher coverage, double-play receivers, cutoff returns and type-specific pitch movement');
for(const delivery of ['오버핸드','쓰리쿼터','사이드암','언더핸드'])for(const type of ['직구','투심','싱커','커터','슬라이더','스위퍼','커브','너클커브','체인지업','포크볼','스플리터']){
 const right=run('beBroadcastPitchPath('+JSON.stringify({type,delivery,throwHand:'우투'})+',360,280,360,200)').match(/-?\d+(?:\.\d+)?/g).map(Number),left=run('beBroadcastPitchPath('+JSON.stringify({type,delivery,throwHand:'좌투'})+',360,280,360,200)').match(/-?\d+(?:\.\d+)?/g).map(Number);
 assert.deepEqual(right.slice(-2),[360,280]);assert.deepEqual(left.slice(-2),[360,280]);for(let i=0;i<right.length;i++)assert.ok(Math.abs(i%2?right[i]-left[i]:right[i]+left[i]-720)<.01,delivery+' '+type+' mirrors pitching arm while retaining the recorded endpoint');
}
assert.equal(run('beReplayHighlight({outcome:"홈런",runs:1})'),true);assert.equal(run('beReplayHighlight({eventType:"baserunning",runAction:"pickoff"})'),true);assert.equal(run('beReplayHighlight({outcome:"볼넷",outsBefore:0,outsAfter:0})'),false);
console.log('PASS arm-mirrored release and pitch movement with exact endpoints, and recorded highlight selection');
assert.equal(run('JSON.stringify(beBroadcastLeadTarget({leadTargetX:30,leadTargetY:64},"우타"))'),'{"x":30,"y":64}');
assert.equal(run('beBroadcastLeadTarget({lead:"바깥쪽"},"좌타").x'),36);assert.equal(run('beBroadcastLeadTarget({lead:"바깥쪽"},"우타").x'),64);assert.equal(run('beBroadcastLeadTarget({},"우타")'),null);
for(const [call,cue] of [['볼','ball'],['루킹 스트라이크','strike'],['헛스윙 삼진','strike'],['인플레이','contact'],['파울','contact']])assert.equal(run('beReplayAudioCue({kind:"pitch",pitch:{call:'+JSON.stringify(call)+'}})'),cue);
assert.equal(run('beReplayAudioCue({kind:"result",e:{outcome:"홈런",outsBefore:0,outsAfter:0}})'),'homer');assert.equal(run('beReplayAudioCue({kind:"baserunning",e:{outcome:"런다운 아웃",outsBefore:0,outsAfter:1}})'),'out');
console.log('PASS fixed recorded glove lead and recorded strike/ball/contact/out/homer sound cues');
