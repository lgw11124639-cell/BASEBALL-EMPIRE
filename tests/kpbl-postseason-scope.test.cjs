const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);leagueOfficeSeason();state.leagueOffice.seasons[state.year].maxInnings=10;state.leagueOffice.seasons[state.year].automaticRunner=true;gameInjuryCheck=()=>{};managerSubstitutions=()=>{};playHalf=()=>0;const club=()=>({runs:0,innings:[]});const a=club(),b=club();runBaseballInnings(a,b,()=>.5,{league:'major',postseason:true,maxInnings:15});`);
assert.equal(run('a.leagueAutomaticRunner'),false);assert.equal(run('a.innings.length'),15);
run(`const regular=club(),regular2=club();runBaseballInnings(regular,regular2,()=>.5,{league:'major'});`);assert.equal(run('regular.leagueAutomaticRunner'),true);assert.equal(run('regular.innings.length'),10);
// Production postseason controller under a deliberately tied game: replay instead of invented score.
run(`state.teams.forEach(t=>{t.wins=72;t.losses=72;t.draws=0});postseasonDay();const ps=state.postseasons[state.year];const tied=ps.games[0];`);
assert.equal(run('tied.awayRuns'),0);assert.equal(run('tied.homeRuns'),0);assert.equal(run('tied.winner'),null);assert.equal(run('tied.draw'),true);assert.equal(run('ps.series.wins.join(",")'),'1,0');assert.equal(run('ps.stage'),0);
assert.equal(run('tied.leagueRules.automaticRunner'),false);
console.log('PASS production postseason tie/replay and no regular-season tiebreak leakage');
