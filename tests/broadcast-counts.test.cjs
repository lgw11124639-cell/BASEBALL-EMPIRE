const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);state.day=100;for(const p of state.players)ensureProfile(p);`);
let pitches=0,steals=0,caught=0,thirdOutSteals=0,halves=0;
for(let seed=1;seed<=70;seed++){
 c.testSeed=seed;
 const game=JSON.parse(run(`var a=inningClub(0,state.day,'우투'),h=inningClub(1,state.day,'우투');a.beEvents=[];h.beEvents=[];a.beSide='away';h.beSide='home';runBaseballInnings(a,h,rng(8721+testSeed),{league:'major'});JSON.stringify({awayRuns:a.runs,homeRuns:h.runs,awayInnings:a.innings,homeInnings:h.innings,awayOuts:a.usage.reduce((n,x)=>n+x.outs,0),homeOuts:h.usage.reduce((n,x)=>n+x.outs,0),events:[...a.beEvents,...h.beEvents]})`));
 const eventOuts={away:0,home:0};
 for(const side of ['away','home'])for(let inning=1;inning<=game[side+'Innings'].length;inning++){
  if(game[side+'Innings'][inning-1]==null)continue;
  const events=game.events.filter(e=>e.side===side&&e.inning===inning);assert.ok(events.length,'played half has records');halves++;
  let outs=0;
  for(const e of events){
   assert.equal(e.outsBefore,outs,`no missing outs before ${e.outcome} in ${seed}/${inning}/${side}`);
   assert.ok(e.outsAfter>=outs&&e.outsAfter<=3,'out count never regresses or exceeds three');eventOuts[side]+=e.outsAfter-outs;outs=e.outsAfter;
   if(e.eventType==='baserunning'){
    assert.equal(e.pitchSequence.length,0,'running play invents no pitch');assert.equal(e.pitches,0);if(e.runAction==='pickoff'||e.runAction==='rundown'){const base=Number(e.fromBase)-1;assert.equal(e.bases[base],e.runnerId);assert.equal(e.afterBases[base],e.outsAfter>e.outsBefore?null:e.runnerId);continue;}assert.equal(e.bases[0],e.runnerId);assert.equal(e.afterBases[0],null);
    if(e.outcome==='도루 실패'){caught++;assert.equal(e.outsAfter,e.outsBefore+1);assert.equal(e.afterBases[1],null);if(e.outsAfter===3)thirdOutSteals++;}
    else{steals++;assert.equal(e.outsAfter,e.outsBefore);assert.equal(e.afterBases[1],e.runnerId);}
    continue;
   }
   let balls=0,strikes=0;
   for(const p of e.pitchSequence){pitches++;if(p.call==='볼'||p.call==='볼넷')balls++;if(['루킹 스트라이크','스트라이크','헛스윙','루킹 삼진','헛스윙 삼진','삼진'].includes(p.call))strikes++;if(p.call==='파울'&&strikes<2)strikes++;
    assert.equal(p.ballsAfter,balls,'recorded ball count follows saved calls');assert.equal(p.strikesAfter,strikes,'recorded strike count follows saved calls');assert.ok(balls<=4&&strikes<=3,'valid terminal count');
   }
   if(e.outcome==='볼넷')assert.equal(balls,4);if(e.outcome==='삼진')assert.equal(strikes,3);
  }
  const walkoff=side==='home'&&inning===game.homeInnings.length&&inning>=9&&game.homeRuns>game.awayRuns;
  assert.ok(outs===3||walkoff,'only a walk-off can finish a played half below three outs');
 }
 assert.equal(eventOuts.away,game.homeOuts,'home pitching outs match the entire replay');assert.equal(eventOuts.home,game.awayOuts,'away pitching outs match the entire replay');
}
assert.ok(steals>0&&caught>0&&thirdOutSteals>0,'real simulations exercise successful steals and inning-ending caught stealing');
run(`var legacy=[{call:'볼'},{call:'루킹 스트라이크'},{call:'헛스윙'},{call:'파울'},{call:'파울'},{call:'볼'},{call:'볼'},{call:'볼넷'}],saved=JSON.stringify(legacy),counts=beReplayPitchCounts(legacy);`);
assert.equal(run('counts[4].strikesAfter'),2,'two-strike foul does not add a strike');assert.equal(run('counts.at(-1).ballsAfter'),4);assert.equal(run('JSON.stringify(legacy)'),run('saved'),'display normalization preserves saved source records');
console.log(JSON.stringify({pass:true,games:70,halves,pitches,steals,caught,thirdOutSteals}));
