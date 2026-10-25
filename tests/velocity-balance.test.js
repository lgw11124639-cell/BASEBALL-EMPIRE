const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function extract(name,next){const start=source.indexOf('function '+name+'(');assert(start>=0,name+' missing');const end=source.indexOf(next,start);assert(end>start,name+' end missing');return source.slice(start,end)}
const code=extract('pitchMatchup','function sharedHitBases(')+extract('pitcherSpeedBonus','function playerPhysical(');
const context={pitchingArsenal:p=>({velocity:p.velocity,control:60,stamina:60,pitches:[{name:'직구',grade:60}]}),playerBaseball:p=>({fatigue:0,throwHand:'우투',batHand:'우타'})};
vm.createContext(context);vm.runInContext(code,context);
const batter={};
const match=v=>context.pitchMatchup({velocity:v},batter,1);
const slow=match(130),border=match(140),normal=match(145),elite=match(160);
assert(slow.hit>border.hit&&border.hit>normal.hit&&normal.hit>elite.hit,'low velocity must increase hits');
assert(slow.strikeout<border.strikeout&&border.strikeout<normal.strikeout&&normal.strikeout<elite.strikeout,'low velocity must reduce strikeouts');
assert(slow.homer>normal.homer,'low velocity must increase home runs');
for(const v of [125,130,135,140,141,145,155,160,165]){const m=match(v);for(const key of ['hit','walk','strikeout','homer'])assert(Number.isFinite(m[key]),v+' '+key)}
assert(source.includes('Math.min(165,fast)'), 'velocity ceiling must be 165');
assert(source.includes('velocityPeak'), 'velocity growth must persist');
assert(source.includes('arsenal.velocity=Math.min(165,peak,v+1)'), 'velocity growth must apply');
assert(source.includes('arsenal.velocity=v-1'), 'age decline must apply');
console.log('Velocity regression: hit/K/homer ordering, boundaries, 165 cap, growth and decline OK');
