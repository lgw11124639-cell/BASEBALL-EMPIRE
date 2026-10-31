// Full production rosters, scheduler, pitch/ball engine and box scores; no target-average correction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const gameContext = require('./helpers/game-context.cjs');
const context = gameContext();
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('const day=state.day,r=rng(', source.indexOf('function simulateLeagueDay('));
const end = source.indexOf('state.day++;finalizeAwards()', start);
assert.ok(start > 0 && end > start, 'production major-league game loop found');
const playDay = new vm.Script('{'+source.slice(start, end)+'}');
vm.runInContext(`state=world(0);state.gameResults=[];for(const p of state.players)ensureProfile(p);`, context);
const started = performance.now();
for (let day=1;day<=365;day++) {
  context.auditDay=day;
  vm.runInContext(`state.day=auditDay;
    for(const p of state.players){
      if(p.position==='P'){const b=playerBaseball(p);b.fatigue=Math.max(0,(Number(b.fatigue)||0)-(Number(b.recovery)||10));}
      if(p.profile?.injury?.days>0)p.profile.injury.days--;
    }`, context);
  playDay.runInContext(context);
}
const data=vm.runInContext('({games:state.gameResults,teams:state.teams,players:state.players})',context);
assert.equal(data.games.length,720,'720 actual games completed');
for(const t of data.teams)assert.equal(t.wins+t.losses+t.draws,144,'144 games per team');
const keys=['atBats','hits','doubles','triples','homeRuns','walks','strikeouts','runs','hitByPitch','sacrificeBunts','sacrificeFlies'];
const totals=Object.fromEntries(keys.map(k=>[k,0]));
let outs=0,earnedRuns=0,pitches=0;
const histogram={};
for(const g of data.games){
  assert.ok(!g.recordAudit?.length,'batting and pitching records agree');
  for(const side of ['away','home']){
    const bats=g[side+'Batters'],arms=g[side+'Pitchers'];
    const runs=g[side+'Runs'];
    assert.equal(g[side+'Innings'].reduce((n,v)=>n+(v||0),0),runs,'inning score agrees');
    assert.equal(bats.reduce((n,p)=>n+p.runs,0),runs,'player runs agree');
    histogram[runs]=(histogram[runs]||0)+1;
    for(const p of bats)for(const k of keys)totals[k]+=p[k]||0;
    for(const p of arms){outs+=p.outs;earnedRuns+=p.earnedRuns;pitches+=p.pitchCount;}
  }
}
assert.ok(totals.hits>=totals.homeRuns+totals.doubles+totals.triples);
const report={seed:'world=20271001; games=year*100003+day*7919',games:data.games.length,
  gamesPerTeam:data.teams.map(t=>t.wins+t.losses+t.draws),...totals,outs,earnedRuns,pitches,
  battingAverage:totals.hits/totals.atBats,ERA:earnedRuns*27/outs,
  runsPerTeamGame:totals.runs/1440,runsHistogram:histogram,
  elapsedSeconds:(performance.now()-started)/1000,
  scope:'Production major game loop with daily pitcher recovery/injury countdown; excludes transactions, growth, minor league, international games and cloud I/O.'};
console.log(JSON.stringify(report,null,2));
if(process.env.BALANCE_REPORT)fs.writeFileSync(process.env.BALANCE_REPORT,JSON.stringify(report,null,2)+'\n');
