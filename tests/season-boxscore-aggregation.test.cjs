const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=src.indexOf('function currentSeasonBoxStats(');
const end=src.indexOf('function ',start+35);
assert.ok(start>=0&&end>start,'actual game-result aggregation function found');
const batter={id:10,name:'Batter',position:'OF',joinYear:2026,teamId:1,games:999,hits:999};
const pitcher={id:20,name:'Pitcher',position:'P',joinYear:2026,teamId:0,games:999,pitchingWins:999};
const state={year:2026,day:300,gameResults:[]};
const context=vm.createContext({state,Number,String,console});
vm.runInContext(src.slice(start,end),context);
const calc=p=>vm.runInContext('currentSeasonBoxStats(player)',vm.createContext({...context,player:p}));
for(let day=1;day<=144;day++){
 state.gameResults.push({year:2026,day,away:0,home:1,
  homeBatters:[{id:10,name:'Batter',atBats:4,hits:day%2?2:1,homeRuns:day%12===0?1:0,walks:1}],
  awayPitchers:[{id:20,name:'Pitcher',innings:6,earnedRuns:day%3,win:day%2===0,started:true,strikeouts:7}]});
}
let b=calc(batter),p=calc(pitcher);
assert.equal(b.games,144,'batter games');
assert.equal(b.atBats,576,'batter at-bats');
assert.equal(b.hits,216,'batter hits accumulated');
assert.equal(b.homeRuns,12,'batter home runs');
assert.equal(b.plateAppearances,720,'batter plate appearances');
assert.equal(p.games,144,'pitcher appearances');
assert.equal(p.inningsPitched,864,'pitcher innings');
assert.equal(p.earnedRuns,144,'pitcher earned runs');
assert.equal(p.pitchingWins,72,'pitcher wins');
assert.equal(p.pitchingStrikeouts,1008,'pitcher strikeouts');
assert.equal(p.gamesStarted,144,'pitcher starts');
assert.equal(b.hits,216,'stale player totals ignored');
state.year=2027;
assert.equal(calc(batter).hits,0,'previous season does not leak into new year');
assert.equal(calc(pitcher).pitchingWins,0,'pitcher wins reset in new year');
state.gameResults=[{year:2027,day:1,away:0,home:1,homeBatters:[{id:10,name:'Batter',atBats:3,hits:1}],awayPitchers:[{id:20,name:'Pitcher',innings:5,earnedRuns:2,loss:true}]}];
assert.equal(calc(batter).hits,1,'new year batter result');
assert.equal(calc(pitcher).pitchingLosses,1,'new year pitcher result');
console.log('Real 144-game batting and pitching box-score accumulation: PASS');
