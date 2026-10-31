const assert=require('node:assert/strict');
const vm=require('node:vm');
const c=require('./helpers/game-context.cjs')();
const bases=vm.runInContext('extraBaseHitBases',c);
const ball={ground:false,carry:280,exitVelocity:94,sprayAngle:15};
const defense={fielding:60,arm:60};
assert.equal(bases(ball,{speed:70},defense,()=>.3),2,'sub-99 mph gap hit can be a double');
assert.equal(bases({...ball,carry:100,sprayAngle:0,exitVelocity:105},{speed:50},defense,()=>.5),1,'hard shallow hit is not automatically a double');
assert.equal(bases(ball,{speed:70},defense,()=>.001),3,'deep gap hit can yield a triple');
assert.equal(bases({...ball,carry:200},{speed:70},defense,()=>.001),2,'shallow hit cannot yield a triple');
for(let i=0;i<1000;i++){
 const roll=(i+.5)/1000;
 const slow=bases(ball,{speed:40},defense,()=>roll);
 const fast=bases(ball,{speed:90},defense,()=>roll);
 const strong=bases(ball,{speed:70},{fielding:90,arm:90},()=>roll);
 const weak=bases(ball,{speed:70},{fielding:40,arm:40},()=>roll);
 assert.ok(fast>=slow,'faster runners do not lose bases');
 assert.ok(strong<=weak,'stronger fielding and arm do not concede more bases');
 assert.ok([1,2,3].includes(fast),'extra-base resolver never invents home runs');
}
// The old speed threshold had a discontinuity at 99 mph.
for(let i=0;i<1000;i++){
 const r=()=> (i+.5)/1000;
 const below=bases({...ball,exitVelocity:98.99},{speed:70},defense,r);
 const above=bases({...ball,exitVelocity:99.01},{speed:70},defense,r);
 assert.ok(above>=below);
}
console.log('Continuous gap/depth/speed/defense extra-base scenarios: PASS');
