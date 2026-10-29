const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=src.indexOf('function playHalf(');
const end=src.indexOf('function ',start+20);
assert.ok(start>=0&&end>start,'real half-inning engine found');
const batters=Array.from({length:9},(_,i)=>({id:i+1,name:'B'+i,position:'OF',atBats:0,hits:0,walks:0}));
const pitcher={id:99,position:'P'};
const appearance={p:pitcher,outs:0,er:0,pitchCount:0,battersFaced:0,hits:0,walks:0,strikeouts:0,pitchMix:{},homeRunsAllowed:0};
const batting={teamId:0,league:'major',batters,index:0,runs:0};
const fielding={teamId:1,league:'major',batters:[{id:200,position:'SS'}],runs:0,usage:[appearance],used:new Set(),inheritedRunners:0};
const state={players:[...batters,pitcher],day:1};
const context=vm.createContext({state,Math,Number,
 selectPitcher:()=>pitcher,recordPitch:()=>appearance,
 pitchingArsenal:()=>({stamina:65,usage:[]}),
 catcherGameCalling:()=>({preference:'바깥쪽',skill:50}),
 managerRatings:()=>({pitching:60}),
 clubPitchingPhilosophy:()=> '선발 중시형',
 batterSkill:()=>60,stadiumFactors:()=>({}),pitchMatchup:()=>({strikeout:1}),
 batterPhysicalBonus:()=>0,deliveryFactors:()=>({strikeout:1}),
 sharedPlateOutcome:()=>({baseOnBalls:0,hitByPitch:false,walk:false,hit:false}),
 clubBattingPhilosophy:()=> '빅볼',ri:()=>3,
 markBlownSave:()=>{},
});
vm.runInContext(src.slice(start,end),context);
const half=vm.runInContext('playHalf',context);
for(let i=0;i<1000;i++){
 const before=batters.reduce((n,p)=>n+p.atBats,0);
 const result=half(batting,fielding,1,()=>0.99);
 assert.equal(result,0,'three-out inning without scoring');
 assert.equal(batters.reduce((n,p)=>n+p.atBats,0)-before,3,'three at-bats per inning');
 assert.equal(batting.runs,0);
 assert.equal(appearance.outs,(i+1)*3,'pitcher outs accumulated');
}
assert.equal(batting.index,3000,'lineup progresses over 1000 innings');
assert.equal(batters.reduce((n,p)=>n+p.atBats,0),3000,'batting totals accumulated');
console.log('Real plate-appearance and half-inning engine: 1000 innings, 3000 at-bats PASS');
