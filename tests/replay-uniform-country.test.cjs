const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
for(const code of run('Object.keys(INTERNATIONAL_COUNTRIES)')){
 assert.equal(run(`beReplayCountryCode(${JSON.stringify(code)})`),code);
 assert.equal(run(`beReplayCountryCode(INTERNATIONAL_COUNTRIES[${JSON.stringify(code)}])`),code);
 assert.equal(run(`beReplayUniformKey({opponent:${JSON.stringify(code)}},'away')`),code);
 assert.equal(run(`beReplayUniformKey({opponent:${JSON.stringify(code)}},'home')`),'KR');
}
assert.equal(run(`beReplayUniformKey({away:0,home:1},'away',[{name:'일본'},{name:'대한민국',countryCode:'KR'}])`),'JP');
assert.equal(run(`beReplayUniformKey({away:0,home:1},'home',[{name:'일본'},{name:'대한민국',countryCode:'KR'}])`),'KR');
assert.equal(run("beReplayUniformKey({away:0,home:1},'away')"),0);
assert.equal(run("beReplayUniformKey({scrimmage:true,clubId:6,away:0,home:1},'away',true)"),6);
assert.equal(run("beReplayUniformKey({international:true,away:0},'away')"),'INTL');
for(const [a,b] of [['JPN','JP'],['USA','US'],['KOR','KR'],['TPE','TW']])assert.equal(run(`beReplayCountryCode('${a}')`),b);
for(const type of ['직구','커브','포크볼','슬라이더','스위퍼','너클볼'])for(const hand of ['우투','좌투']){
 const pitch={type,throwHand:hand,releaseX:125,releaseY:300};
 const points=JSON.parse(run(`JSON.stringify(Array.from({length:101},(_,i)=>beBroadcastPitchPoint(${JSON.stringify(pitch)},470,250,420,210,i/100)))`));
 assert.deepEqual(points[0],{x:125,y:300});assert.deepEqual(points[100],{x:470,y:250});
 for(let i=1;i<points.length;i++)assert.ok(Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y)<8,'continuous late break');
 const path=run(`beBroadcastPitchPath(${JSON.stringify(pitch)},470,250,420,210)`);assert.ok(path.endsWith('470.00 250.00'));
}
console.log('PASS national opponents and continuous pitches ending at recorded location');
