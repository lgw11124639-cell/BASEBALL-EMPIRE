const assert=require('node:assert/strict'),vm=require('node:vm');
const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
// Exercise real international pitch-by-pitch ntTestGames and the same settlement as major ntTestGames.
run(`state=world(0);state.day=100;state.gameResults=[];
 const ntTestRoster=state.players.filter(p=>p.teamId===0&&!p.foreignPlayer&&!p.retired&&p.level==='1군');
 let ntTestGames=[];
 const countersBefore=JSON.stringify([...snapshotLeagueCounters(ntTestRoster)].map(([id,e])=>[id,e.values]));
 for(let i=0;i<5;i++){state.day=100+i*7;ntTestGames.push(internationalOpeningGame(2027,'올림픽',ntTestRoster,'JP',i+1));}
 const countersAfter=JSON.stringify([...snapshotLeagueCounters(ntTestRoster)].map(([id,e])=>[id,e.values]));
`);
assert.equal(run('countersAfter'),run('countersBefore'),'national matches never inflate domestic counters');
for(const g of run('ntTestGames')){
 assert.ok(g&&g.recordVersion===2);
 const all=[...g.homePitchers,...g.awayPitchers],winning=g.homeRuns>g.awayRuns?g.homePitchers:g.awayPitchers,losing=g.homeRuns>g.awayRuns?g.awayPitchers:g.homePitchers;
 assert.equal(all.filter(p=>p.win).length,1,'one winning pitcher');
 assert.equal(all.filter(p=>p.loss).length,1,'one losing pitcher');
 assert.equal(winning.filter(p=>p.win).length,1);assert.equal(losing.filter(p=>p.loss).length,1);
 assert.ok(winning.filter(p=>p.save).length<=1);
 for(const p of all){assert.ok(Number.isFinite(p.battersFaced));assert.ok(p.pitchCount>=p.battersFaced);if(p.save||p.hold){assert.ok(p.outs>0);assert.ok(!p.win&&!p.loss&&!p.blownSave)}if(p.completeGame)assert.equal((winning.includes(p)?winning:losing).length,1)}
 assert.ok(g.homeBatters.every(p=>Number.isFinite(p.plateAppearances)&&Number.isFinite(p.strikeouts)));
 assert.equal(g.homeBatters.reduce((n,p)=>n+p.runs,0),g.homeRuns,'home batter runs match score');
 assert.equal(g.awayBatters.reduce((n,p)=>n+p.runs,0),g.awayRuns,'away batter runs match score');
}
// Deterministic late-inning fixture checks hold/save, blown saves and starter win eligibility.
run(`const ntTestP=id=>({id,name:'P'+id});
 const ntTestLine=(id,outs,entryLead,exitLead)=>({p:ntTestP(id),outs,er:0,hits:0,walks:0,entryLead,exitLead,entryRunners:0,pitchCount:outs*4,battersFaced:outs});
 const ntTestClub={runs:3,usage:[ntTestLine(1,18,0,2),ntTestLine(2,6,2,2),ntTestLine(3,3,2,2)],plan:{roles:new Map([[1,'선발'],[2,'셋업'],[3,'마무리']])},goAheadPitcherId:1};
 finishPitcherDecisions(ntTestClub,true,1);`);
assert.deepEqual(Array.from(run('ntTestClub.pitcherUsage'),p=>[p.win,p.hold,p.save]),[[true,false,false],[false,true,false],[false,false,true]]);
run(`ntTestClub.usage[1].blownSave=true;delete ntTestClub.holdPitcherIds;finishPitcherDecisions(ntTestClub,true,1)`);
assert.equal(run('ntTestClub.pitcherUsage[1].hold'),false);
run(`ntTestClub.usage[0].outs=12;finishPitcherDecisions(ntTestClub,true,1)`);
assert.equal(run('ntTestClub.pitcherUsage[0].win'),false,'short starter cannot receive win');
assert.equal(run('ntTestClub.pitcherUsage.filter(p=>p.win).length'),1);
console.log('PASS international actual games, W/L/S/H settlement and domestic counter isolation');

run(`const ntOther=internationalRivalResult(2027,'올림픽','조별리그 A조','JP','US')`);
assert.equal(run('ntOther.recordVersion'),2);
assert.ok(run('ntOther.homePitchers.length>0&&ntOther.awayPitchers.length>0'));
assert.equal(run('[...ntOther.homePitchers,...ntOther.awayPitchers].filter(p=>p.win).length'),1);
const markup=run('internationalMatchDetails(ntOther)');
assert.ok(markup.includes('세이브')&&markup.includes('홀드')&&markup.includes('피홈런')&&markup.includes('희비'));
assert.ok(markup.includes('일본')&&markup.includes('미국'));
console.log('PASS foreign-country match full scorecards and decision displays');
