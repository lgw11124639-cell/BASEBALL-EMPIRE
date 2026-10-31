const assert=require('node:assert/strict');
const vm=require('node:vm');
const gameContext=require('./helpers/game-context.cjs');
const c=gameContext(),touches=vm.runInContext('pitchHitsBatter',c);
assert.ok(touches({zoneX:-8,zoneY:50},'우타'));
assert.ok(touches({zoneX:108,zoneY:50},'좌타'));
assert.ok(!touches({zoneX:108,zoneY:50},'우타'),'outside side does not hit RHB');
assert.ok(!touches({zoneX:-8,zoneY:50},'좌타'),'outside side does not hit LHB');
assert.ok(!touches({zoneX:50,zoneY:50},'우타'),'strike zone is not body');
assert.ok(!touches({zoneX:-80,zoneY:50},'우타'),'ball beyond batter is not body');
assert.ok(!touches({zoneX:-8,zoneY:130},'우타'),'ball below batter is not body');
assert.ok(!touches({zoneX:NaN,zoneY:50},'우타'));
vm.runInContext('batterSkill=()=>60',c);
const avoids=vm.runInContext('batterAvoidsPitch',c);
assert.ok(avoids({}, {velocity:120},()=>.04),'slow body-side pitch can be evaded');
assert.ok(!avoids({}, {velocity:160},()=>.04),'fast pitch reduces evasion time');
assert.ok(avoids({}, {velocity:160},()=>1));
assert.ok(!avoids({}, {velocity:120},()=>0));
for(const swing of [false,true]){
 const context=gameContext();context.swing=swing;
 const result=JSON.parse(vm.runInContext(`state=world(0);state.gameResults=[];
 for(const p of state.players)ensureProfile(p);
 const away=inningClub(0,1),defending=inningClub(1,1);away.beEvents=[];
 let thrown=0;
 batterAvoidsPitch=()=>false;
 simulatePitchLocation=(pitcher,batter)=>{
  thrown++;
  return swing||thrown<=4?{zoneX:playerBaseball(batter).batHand==='좌타'?108:-8,zoneY:50}:{zoneX:50,zoneY:50};
 };
 playHalf(away,defending,1,()=>swing?0:.99);
 JSON.stringify({runs:away.runs,hbp:away.batters.reduce((n,p)=>n+(p.hitByPitch||0),0),
 ab:away.batters.reduce((n,p)=>n+(p.atBats||0),0),
 walks:defending.usage.reduce((n,p)=>n+p.walks,0),outs:defending.usage.reduce((n,p)=>n+p.outs,0),
 k:defending.usage.reduce((n,p)=>n+p.strikeouts,0),
 wildPitches:defending.wildPitches||0,calls:away.beEvents.map(e=>e.outcome),
 bf:defending.usage.reduce((n,p)=>n+p.battersFaced,0)});`,context));
 assert.equal(result.outs,3);
 assert.equal(result.walks,0,'HBP is not recorded as a walk');
 assert.equal(result.wildPitches,0,'body contact is dead, not a wild pitch');
 assert.equal(result.hbp,swing?0:4,'swung-at pitch cannot award first base');
 assert.equal(result.runs,swing?0:1,'bases-loaded HBP forces one run');
 assert.equal(result.ab,3,'HBP does not count as an at-bat');
 assert.equal(result.bf,swing?3:7,'HBP counts as a batter faced');
 assert.equal(result.k,3);
 if(!swing)assert.equal(result.calls.filter(x=>x==='사구').length,4,'replay shows HBP');
}
console.log('Actual pitch engine: handed HBP, dead ball, forced run, no AB/BB and swing strike: PASS');
