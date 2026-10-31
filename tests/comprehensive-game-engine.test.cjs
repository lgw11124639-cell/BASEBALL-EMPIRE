const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function extract(name){const start=src.indexOf('function '+name+'(');assert.ok(start>=0,name+' found');const end=src.indexOf('function ',start+15);assert.ok(end>start,name+' bounded');return src.slice(start,end)}
let seed=0x20261026;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const state={players:[],day:1};
const context=vm.createContext({state,Math,Number,
 batterSkill:(p,k)=>({contact:70,eye:60,power:65,speed:60,fielding:60,arm:60}[k]||60),
 stadiumFactors:()=>({hit:1,homer:1}),
 deliveryFactors:()=>({hit:1,walk:1,strikeout:1}),
 pitchMatchup:()=>({hit:1,walk:1,homer:1,strikeout:1}),
 batterPhysicalBonus:()=>({contact:0,power:0,speed:0}),
 bePlayerEvaluation:()=>60,
 batterZoneFactor:()=>1,
 catcherGameCalling:()=>({preference:'바깥쪽',skill:50}),
 pitchingArsenal:()=>({stamina:65,usage:[]}),
 managerRatings:()=>({pitching:60,baserunning:60}),
 clubPitchingPhilosophy:()=> '선발 중시형',
 clubBattingPhilosophy:()=> '빅볼',
 officeAI:()=>({manager:{style:'분석형'}}),
 ri:(r,a,b)=>a+Math.floor(r()*(b-a+1)),
 markBlownSave:()=>{},
});
vm.runInContext(extract('sharedHitAdvance')+extract('sharedPlateOutcome')+extract('resolveBattedBall')+extract('playHalf'),context);
const batter={id:1,position:'OF'},pitcher={id:99,position:'P',overall:60};
const outcome=vm.runInContext('sharedPlateOutcome',context);
const advance=vm.runInContext('sharedHitAdvance',context);
let walks=0,hits=0,outs=0,homers=0,doubles=0,triples=0;
for(let i=0;i<100000;i++){
 const o=outcome(batter,pitcher,1,1,random());
 assert.equal(typeof o.walk,'boolean');
 assert.equal(typeof o.hit,'boolean');
 assert.ok(!(o.walk&&o.hit),'walk and hit mutually exclusive');
 if(o.walk)walks++;else if(o.hit)hits++;else outs++;
 const n=advance(batter,pitcher,1,1,random());
 assert.ok([1,2,3,4].includes(n),'valid base advance');
 if(n===4)homers++;if(n===3)triples++;if(n===2)doubles++;
}
assert.ok(walks>1000&&hits>10000&&outs>30000,'real plate result distribution');
assert.ok(homers>1000&&doubles>10000&&triples>100,'real extra-base distribution');
const batters=Array.from({length:9},(_,i)=>({id:i+1,name:'B'+i,position:'OF',atBats:0,hits:0,walks:0,runs:0,runsBattedIn:0}));
state.players=[...batters,pitcher];
const appearance={p:pitcher,outs:0,er:0,pitchCount:0,battersFaced:0,hits:0,walks:0,strikeouts:0,pitchMix:{},homeRunsAllowed:0};
context.selectPitcher=()=>pitcher;
context.recordPitch=()=>appearance;
const half=vm.runInContext('playHalf',context);
const batting={teamId:0,league:'major',batters,index:0,runs:0};
const fielding={teamId:1,league:'major',batters:[{id:200,position:'SS'}],runs:0,usage:[appearance],used:new Set(),inheritedRunners:0};
let totalRuns=0;
for(let i=0;i<2000;i++){
 const before=batting.runs,outsBefore=appearance.outs,paBefore=appearance.battersFaced;
 const scored=half(batting,fielding,1,random);
 assert.equal(scored,batting.runs-before,'inning return matches runs');
 assert.ok(scored>=0&&Number.isInteger(scored),'nonnegative integer runs');
 assert.ok(appearance.outs-outsBefore>=3,'pitcher receives at least 3 outs per full inning');
 assert.ok(appearance.battersFaced>=paBefore,'plate appearances monotonic');
 assert.ok(batting.index<=appearance.battersFaced,'batting order cannot exceed faced batters');
 totalRuns+=scored;
}
const sum=k=>batters.reduce((n,p)=>n+(Number(p[k])||0),0);
assert.equal(totalRuns,batting.runs,'club score accumulates');
assert.equal(sum('runs'),batting.runs,'player runs sum to club score');
assert.ok(sum('hits')<=sum('atBats'),'hits <= at-bats');
assert.ok(sum('homeRuns')+sum('doubles')+sum('triples')<=sum('hits'),'extra-base hits <= hits');
assert.ok(sum('runsBattedIn')<=batting.runs,'RBI cannot exceed runs');
assert.ok(sum('atBats')>6000,'thousands of real at-bats processed');
console.log('COMPREHENSIVE real outcome + half-inning integration: 100000 plate outcomes, 2000 innings PASS');
