const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')();const run=s=>vm.runInContext(s,c);
run(`state=world(0);state.day=150;state.gameResults=[];const club=inningClub(0,150,'우투');const starter=club.starter;pitchingArsenal(starter).stamina=90;playerBaseball(starter).fatigue=0;clubPitchingPhilosophy=()=> '선발 중시형';const appearance=recordPitch(club,starter,1);appearance.pitchCount=88;appearance.outs=24;appearance.hits=3;appearance.walks=1;appearance.er=0;const realRng=rng;rng=()=>()=>0;`);
assert.equal(run('selectPitcher(club,9,2).id'),run('starter.id'),'dominant efficient starter is allowed into the ninth');
run('appearance.pitchCount=125');assert.notEqual(run('selectPitcher(club,9,2).id'),run('starter.id'),'pitch workload still forces relief');
run('appearance.pitchCount=88;appearance.er=4');assert.notEqual(run('selectPitcher(club,9,2).id'),run('starter.id'),'struggling starter replaced');
run('appearance.er=0;playerBaseball(starter).fatigue=85');assert.notEqual(run('selectPitcher(club,9,2).id'),run('starter.id'),'fatigued starter replaced');
run('playerBaseball(starter).fatigue=0;club.wbcPitchLimit=85');assert.notEqual(run('selectPitcher(club,9,2).id'),run('starter.id'),'international pitch limit preserved');
// Real plate appearances and the actual inning controller, without fabricated runs or outs.
run(`let completed=0,shutouts=0;rng=realRng;state=world(0);state.gameResults=[];
for(const p of state.players.filter(p=>p.position==='P')){p.age=27;const a=pitchingArsenal(p);a.stamina=95;a.control=92;ensureProfile(p).skills.stuff=105;ensureProfile(p).skills.control=92;for(const pitch of a.pitches){pitch.grade=95;pitch.command=92}}
for(let i=0;i<16;i++){
 state.day=150+i;for(const p of state.players){playerBaseball(p).fatigue=0;p.lastAppearance=null;}
 const away=inningClub(0,state.day,'우투'),home=inningClub(1,state.day,'우투');runBaseballInnings(away,home,rng(20271001+i*391),{league:'major',maxInnings:12});
 for(const [side,opponent] of [[away,home],[home,away]]){const required=opponent.innings.filter(x=>x!==null).length*3;finishPitchers(side,side.runs>opponent.runs,opponent.runs,required);for(const row of side.pitcherUsage){if(row.completeGame){completed++;if(row.shutout)shutouts++;if(side.usage.length!==1||row.outs!==required)throw Error('invalid CG');if(row.shutout&&opponent.runs!==0)throw Error('invalid SHO')}}}
}`);
assert.ok(run('completed')>0,'real common engine generates complete games with a dominant, efficient starter');
assert.ok(run('shutouts')>0,'real common engine generates earned shutouts');
console.log('PASS: ninth-inning continuation, workload/fatigue/score/international safeguards and 16 actual games',JSON.stringify({completeGames:run('completed'),shutouts:run('shutouts')}));
