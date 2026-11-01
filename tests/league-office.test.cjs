const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);const officeLegacy=JSON.stringify({players:state.players,history:state.history});`);
assert.equal(run('leagueOfficeSeason().ballId'),'standard');assert.equal(run('leagueOfficeSeason().maxInnings'),12);
assert.equal(run('JSON.stringify({players:state.players,history:state.history})'),run('officeLegacy'));
run(`const officeCurrent=JSON.stringify(leagueOfficeSeason());scheduleLeagueOfficeDecision('control',10,true);`);
assert.equal(run('JSON.stringify(leagueOfficeSeason())'),run('officeCurrent'),'announcement never changes running rules');
assert.throws(()=>run(`scheduleLeagueOfficeDecision('unknown',12,false)`));assert.throws(()=>run(`scheduleLeagueOfficeDecision('standard',11,false)`));
assert.equal(run('state.leagueOffice.scheduled[2028].ballId'),'control');
run(`state=JSON.parse(JSON.stringify(state));state.year=2028;`);
assert.equal(run('leagueOfficeSeason().ballId'),'control');assert.equal(run('leagueOfficeSeason().maxInnings'),10);assert.equal(run('leagueOfficeSeason().automaticRunner'),true);
assert.equal(run('state.leagueOffice.seasons[2027].ballId'),'standard');
assert.equal(run(`leagueBallFactors({league:'minor'}).id`),'control');assert.equal(run(`leagueBallFactors({league:'amateur'}).id`),'standard');assert.equal(run(`leagueBallFactors({league:'international'}).id`),'standard');
run(`state.year=2029;`);assert.equal(run('leagueOfficeSeason().ballId'),'control','no announcement retains previous decision');
run(`leaguePane='office';`);assert.ok(run('league()').includes('리그 사무국'));assert.ok(run('league()').includes('office-announce'));
// Compare identical contacts under each physical ball; no roster or statistical changes.
run(`const officeBatter=state.players.find(p=>p.position!=='P'),officePitcher=state.players.find(p=>p.position==='P');ensureProfile(officeBatter);ensureProfile(officePitcher);const officeField={teamId:0,league:'major',batters:[]};const officePhysics={};for(const id of ['control','standard','carry']){state.leagueOffice.seasons[2029].ballId=id;state.leagueOffice.seasons[2029].ball={...LEAGUE_BALLS[id]};const rr=rng(123456);officePhysics[id]=Array.from({length:200},()=>resolveBattedBall(officeBatter,officePitcher,officeField,null,rr));}`);
const mean=id=>run(`officePhysics.${id}.reduce((n,x)=>n+x.exitVelocity,0)/officePhysics.${id}.length`);
assert.ok(mean('control')<mean('standard')&&mean('standard')<mean('carry'),'rebound changes actual exit speed for identical inputs');
// Run production inning controller with isolated half-inning scoring to verify the rule boundary.
run(`gameInjuryCheck=()=>{};managerSubstitutions=()=>{};playHalf=(bat,field,inning)=>{if(bat.leagueAutomaticRunner&&inning>=10)window.officeRunnerSeen=true;return 0};state.leagueOffice.seasons[2029].maxInnings=10;state.leagueOffice.seasons[2029].automaticRunner=true;const officeClub=()=>({runs:0,innings:[]});window.officeGame=runBaseballInnings(officeClub(),officeClub(),()=>.5,{league:'major'});`);
assert.equal(run('window.officeGame.awayInnings.length'),10);assert.equal(run('window.officeRunnerSeen'),true);
assert.equal(run(`runBaseballInnings(officeClub(),officeClub(),()=>.5,{league:'minor'}).awayInnings.length`),12);
assert.equal(run(`runBaseballInnings(officeClub(),officeClub(),()=>.5,{league:'major',maxInnings:9}).awayInnings.length`),9);
console.log('PASS office legacy migration, next-season decisions, reload, immutable history, scope, real ball physics and inning boundaries');

// Actual club construction must carry scope so the major league uses its selected ball.
const live=require('./helpers/game-context.cjs')(),liveRun=s=>vm.runInContext(s,live);
liveRun(`state=world(0);const liveAway=inningClub(0,1),liveHome=inningClub(1,1);liveAway.leagueAutomaticRunner=true;liveAway.beEvents=[];playHalf(liveAway,liveHome,10,rng(98765));`);
assert.equal(liveRun('liveAway.league'),'major');
assert.equal(liveRun('liveAway.beEvents[0].bases[1]'),liveRun('liveAway.plan.lineup[8].id'),'actual extra inning begins with the previous batter on second');
assert.equal(liveRun('liveAway.beEvents[0].bases[0]'),null);
liveRun(`const gripP=state.players.find(p=>p.position==='P'),gripB=state.players.find(p=>p.position!=='P');const gripVariance={};for(const id of ['control','standard','carry']){const rr=rng(76543),xs=Array.from({length:2000},()=>simulatePitchLocation(gripP,gripB,'직구',rr,{skill:60,preference:'바깥쪽'},{balls:0,strikes:0},LEAGUE_BALLS[id]).zoneX);const mean=xs.reduce((n,x)=>n+x,0)/xs.length;gripVariance[id]=xs.reduce((n,x)=>n+(x-mean)**2,0)/xs.length;}`);
assert.ok(liveRun('gripVariance.control<gripVariance.standard&&gripVariance.standard<gripVariance.carry'),'grip tightens actual pitch location dispersion');
console.log('PASS actual major club ball scope, second-base runner and pitch grip dispersion');
(async()=>{
 const fs=require('node:fs'),cloud=vm.createContext({window:{},localStorage:{getItem:()=>null,removeItem:()=>{}},performance,structuredClone,CompressionStream,DecompressionStream,TextEncoder,TextDecoder,Blob,Response,Uint8Array,btoa,atob,setTimeout,console});
 vm.runInContext(fs.readFileSync('cloud-only.js','utf8').replace(/^export /gm,''),cloud);
 cloud.data=JSON.parse(run('JSON.stringify(state)'));const before=JSON.stringify(cloud.data.leagueOffice);
 const packed=await vm.runInContext('packCloudShards(data)',cloud);cloud.wire=structuredClone(packed);const restored=await vm.runInContext('unpackCloudShards(wire)',cloud);
 assert.equal(JSON.stringify(restored.leagueOffice),before,'actual cloud shard packing preserves seasons and scheduled decisions');
 console.log('PASS official ball and league decisions cloud round-trip');
 assert.equal(run("scheduleLeagueOfficeDecision('standard',9,true).automaticRunner"),false,'no extra innings cannot enable a runner');
})().catch(e=>{console.error(e);process.exitCode=1});
