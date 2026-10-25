const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function section(start,end){const i=source.indexOf('function '+start+'('),j=source.indexOf('function '+end+'(',i);assert(i>=0&&j>i);return source.slice(i,j)}
const context={pitchingArsenal:p=>({velocity:p.velocity,control:60,stamina:60,pitches:[{name:'직구',grade:60}]}),playerBaseball:p=>({fatigue:0,throwHand:'우투',batHand:'우타'}),batterSkill:()=>60,stadiumFactors:()=>({hit:1,homer:1}),deliveryFactors:()=>({hit:1,walk:1,strikeout:1}),batterPhysicalBonus:()=>({contact:0,power:0})};
vm.createContext(context);vm.runInContext(section('pitchMatchup','sharedHitBases')+section('sharedPlateOutcome','playHalf')+section('pitcherSpeedBonus','playerPhysical'),context);
let seed=123456789;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
const velocities=[125,130,135,140,141,145,150,155,160,165],totals=[];
for(const velocity of velocities){const pitcher={velocity,overall:60},batter={};let hits=0,walks=0,strikeouts=0,homers=0;for(let i=0;i<100000;i++){const roll=random(),outcome=context.sharedPlateOutcome(batter,pitcher,0,1,roll),match=context.pitchMatchup(pitcher,batter,1);if(outcome.walk)walks++;else if(outcome.hit){hits++;const homerChance=Math.max(.05,Math.min(.24,.10*match.homer));if(random()<homerChance)homers++}else if(random()<.27*match.strikeout)strikeouts++}totals.push({velocity,hits,walks,strikeouts,homers})}
for(let i=1;i<totals.length;i++){assert(totals[i-1].hits>=totals[i].hits-1200,'unexpected hit trend');assert(totals[i-1].strikeouts<=totals[i].strikeouts+1200,'unexpected K trend')}
assert(totals[3].hits>totals[5].hits,'140km/h penalty should increase hits vs 145');
assert(totals[3].strikeouts<totals[5].strikeouts,'140km/h penalty should reduce strikeouts vs 145');
console.log(JSON.stringify({sample:'100000 plate appearances per velocity, equal underlying skills',totals},null,2));
