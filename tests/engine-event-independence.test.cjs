const assert=require('node:assert/strict');
const vm=require('node:vm');
const gameContext=require('./helpers/game-context.cjs');
function run(events,seed){
 const c=gameContext();c.events=events;c.seed=seed;
 return JSON.parse(vm.runInContext(`state=world(0);state.gameResults=[];
 for(const p of state.players)ensureProfile(p);
 // Established zone histories expose accidental dependence on replay records.
 state.gameResults=[{year:state.year,away:0,home:1,broadcastEvents:
 state.players.filter(p=>p.teamId<2).flatMap(p=>Array.from({length:80},(_,i)=>({
 batterId:p.id,side:p.teamId===0?'away':'home',outcome:i<30?'안타':'땅볼 아웃',
 pitchSequence:[{zoneX:i<40?50:15,zoneY:50}]})))}];
 const a=inningClub(0,1),h=inningClub(1,1);
 if(events){a.beEvents=[];h.beEvents=[];}
 runBaseballInnings(a,h,rng(seed));
 JSON.stringify({away:a.runs,home:h.runs,awayInnings:a.innings,homeInnings:h.innings,
 players:state.players.map(p=>[p.id,p.atBats,p.hits,p.homeRuns,p.doubles,p.triples,p.walks,p.strikeouts])});`,c));
}
for(let seed=1;seed<=30;seed++)assert.deepEqual(run(true,seed),run(false,seed),'broadcast logging must not change game outcomes, seed '+seed);
console.log('Actual pitch/ball engine is independent of broadcast logging: PASS');
