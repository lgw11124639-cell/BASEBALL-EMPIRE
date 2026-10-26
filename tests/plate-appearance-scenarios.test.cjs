const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function playHalf('),end=source.indexOf('function ',start+20);
assert.ok(start>=0&&end>start,'actual playHalf engine found');
function runScenario(name,events,expected,{walkoff=false,homeRuns=0}={}){
 const batters=Array.from({length:9},(_,i)=>({id:i+1,name:'B'+i,position:'OF',atBats:0,hits:0,walks:0,runs:0,runsBattedIn:0}));
 const pitcher={id:99,position:'P'};
 const appearance={p:pitcher,outs:0,er:0,pitchCount:0,battersFaced:0,hits:0,walks:0,strikeouts:0,pitchMix:{},homeRunsAllowed:0};
 const batting={teamId:0,league:'major',batters,index:0,runs:0};
 const fielding={teamId:1,league:'major',batters:[{id:200,position:'SS'}],runs:homeRuns,usage:[appearance],used:new Set(),inheritedRunners:0};
 const state={players:[...batters,pitcher],day:1};
 let next=0;
 const context=vm.createContext({state,Math,Number,
  selectPitcher:()=>pitcher,recordPitch:()=>appearance,
  pitchingArsenal:()=>({stamina:65,usage:[{name:'fastball',percent:100}]}),
  managerRatings:()=>({pitching:60,baserunning:60}),
  clubPitchingPhilosophy:()=> '선발 중시형',
  clubBattingPhilosophy:()=> '빅볼',
  officeAI:()=>({manager:{style:'분석형'}}),
  batterSkill:()=>60,stadiumFactors:()=>({}),pitchMatchup:()=>({strikeout:1}),
  batterPhysicalBonus:()=>({speed:0}),deliveryFactors:()=>({strikeout:1}),
  sharedPlateOutcome:()=>{const e=events[next++]||'out';return {baseOnBalls:e==='walk',hitByPitch:e==='hbp',walk:e==='walk'||e==='hbp',hit:['single','double','triple','homer'].includes(e)}},
  sharedHitAdvance:()=>{const e=events[next-1];return {single:1,double:2,triple:3,homer:4}[e]||1},
  ri:()=>3,markBlownSave:()=>{},
 });
 vm.runInContext(source.slice(start,end),context);
 const half=vm.runInContext('playHalf',context);
 const scored=half(batting,fielding,9,()=>0.99,walkoff);
 const sum=k=>batters.reduce((n,p)=>n+(p[k]||0),0);
 const actual={runs:scored,teamRuns:batting.runs,atBats:sum('atBats'),hits:sum('hits'),walks:sum('walks'),homeRuns:sum('homeRuns'),doubles:sum('doubles'),triples:sum('triples'),rbi:sum('runsBattedIn'),scoredRuns:sum('runs'),outs:appearance.outs,battersFaced:appearance.battersFaced};
 for(const [key,value] of Object.entries(expected))assert.equal(actual[key],value,name+': '+key);
 assert.equal(actual.runs,actual.teamRuns,name+': score return matches club');
 assert.equal(actual.runs,actual.scoredRuns,name+': scored runners match score');
 assert.equal(actual.runs,actual.rbi,name+': RBI matches runs without errors');
 assert.ok(next<=70,name+': no infinite plate-appearance loop');
 return actual;
}
runScenario('three ground outs',['out','out','out'],{runs:0,atBats:3,hits:0,outs:3,battersFaced:3});
runScenario('walk and two-run homer',['walk','homer','out','out','out'],{runs:2,atBats:4,hits:1,walks:1,homeRuns:1,rbi:2,outs:3,battersFaced:5});
runScenario('bases loaded via walks then grand slam',['walk','walk','walk','homer','out','out','out'],{runs:4,atBats:4,hits:1,walks:3,homeRuns:1,rbi:4,outs:3,battersFaced:7});
runScenario('single, double, then RBI single',['single','double','single','out','out','out'],{runs:1,atBats:6,hits:3,doubles:1,rbi:1,outs:3,battersFaced:6});
runScenario('triple and homer',['triple','homer','out','out','out'],{runs:2,atBats:5,hits:2,triples:1,homeRuns:1,rbi:2,outs:3,battersFaced:5});
runScenario('walk-off solo home run',['homer'],{runs:1,atBats:1,hits:1,homeRuns:1,rbi:1,outs:0,battersFaced:1},{walkoff:true,homeRuns:0});
console.log('Real playHalf: outs, walks, singles, doubles, triples, homers, grand slam and walk-off PASS');
