// Integration audit: production major-game loop, real year transition, no mock innings/scoring.
// Daily recovery is explicit; excludes minor/international/transaction daily simulation and cloud I/O.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c),source=fs.readFileSync('app.js','utf8');
const a=source.indexOf('const day=state.day,r=rng(',source.indexOf('function simulateLeagueDay(')),b=source.indexOf('state.day++;finalizeAwards()',a);
assert.ok(a>0&&b>a);const play=new vm.Script('{'+source.slice(a,b)+'}');
run(`state=world(0);state.gameResults=[];for(const p of state.players)ensureProfile(p);`);
const reports=[],start=performance.now();
for(let season=0;season<2;season++){
 for(let day=1;day<=365;day++){
  run(`state.day=${day};kpblGovernanceDay();for(const p of state.players){if(p.position==='P'){const b=playerBaseball(p);b.fatigue=Math.max(0,(Number(b.fatigue)||0)-(Number(b.recovery)||10));}else recoverBatterFatigue(p);if(p.profile?.injury?.days>0)p.profile.injury.days--;}`);
  play.runInContext(c);
 }
 const data=run('({year:state.year,games:state.gameResults,teams:state.teams,totals:kpblEnvironmentTotals(state.gameResults),cases:kpblOffice().cases})');
 assert.equal(data.games.length,720);for(const t of data.teams)assert.equal(t.wins+t.losses+t.draws,144);
 let ab=0,h=0,hr=0,outs=0,er=0;
 for(const game of data.games){assert.ok(!game.recordAudit?.length);for(const side of ['away','home']){const bats=game[side+'Batters'],arms=game[side+'Pitchers'];assert.equal(game[side+'Innings'].reduce((n,x)=>n+(x||0),0),game[side+'Runs']);assert.equal(bats.reduce((n,p)=>n+p.runs,0),game[side+'Runs']);for(const p of bats){ab+=p.atBats;h+=p.hits;hr+=p.homeRuns}for(const p of arms){outs+=p.outs;er+=p.earnedRuns}}}
 assert.equal(data.totals.ab,ab);assert.equal(data.totals.hits,h);assert.equal(data.totals.hr,hr);assert.equal(data.totals.avg,h/ab);assert.equal(data.totals.era,er*27/outs);
 for(const incident of data.cases){assert.ok(incident.evidence.events.length>=3);assert.equal(new Set(incident.served||[]).size,(incident.served||[]).length);}
 reports.push({year:data.year,games:720,ab,h,hr,outs,er,avg:h/ab,era:er*27/outs,cases:data.cases.length});
 run('saveSeasonSnapshot()');assert.equal(run('state.history.seasons[state.year].leagueEnvironment.games'),720);
 if(season===0){assert.equal(run('beginNextSeason()'),true);assert.equal(run('state.year'),2028);run('state=JSON.parse(JSON.stringify(state))');assert.equal(run('state.history.seasons[2027].leagueEnvironment.games'),720);}
}
const report={seasons:reports,totalGames:1440,elapsedSeconds:(performance.now()-start)/1000,scope:'Production regular major-game loop + daily recovery/governance + actual beginNextSeason. Daily transactions, minor/international games, cloud I/O excluded.'};
if(process.env.KPBL_AUDIT_REPORT)fs.writeFileSync(process.env.KPBL_AUDIT_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
