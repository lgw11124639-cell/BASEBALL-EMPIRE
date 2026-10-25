// Run with: node tests/international-schedule.test.cjs
// Pure scheduling regression checks; never touches game saves.
const assert=require('node:assert/strict');
function fixtures(groups){
 const out=[];
 for(let gi=0;gi<groups.length;gi++){
  const group=groups[gi],slots=group.map((_,i)=>i);
  if(slots.length%2)slots.push(-1);
  const days=new Map();
  for(let round=0;round<slots.length-1;round++){
   for(let k=0;k<slots.length/2;k++){
    const x=slots[k],y=slots[slots.length-1-k];
    if(x>=0&&y>=0)days.set(Math.min(x,y)+'-'+Math.max(x,y),round+1);
   }
   slots.splice(1,0,slots.pop());
  }
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)
   out.push({group:gi,home:group[i],away:group[j],day:days.get(i+'-'+j)});
 }
 return out;
}
for(const [event,groups,days] of [
 ['WBC',[['JP','KR','AU','CZ','CN'],['US','MX','IT','GB','CA'],['DO','VE','NL','IL','NI'],['PR','CU','PA','CO','TW']],5],
 ['아시안게임',[['KR','TW','TH','HK'],['JP','CN','PH','PK']],3],
 ['올림픽',[['KR','JP','TW'],['US','DO','AU']],3]
]){
 const rows=fixtures(groups);
 for(let gi=0;gi<groups.length;gi++){
  const teams=groups[gi],games=rows.filter(x=>x.group===gi);
  assert.equal(games.length,teams.length*(teams.length-1)/2,event+' fixture count');
  assert.equal(new Set(games.map(x=>[x.home,x.away].sort().join(':'))).size,games.length,event+' unique opponents');
  assert.equal(Math.max(...games.map(x=>x.day)),days,event+' group duration');
  for(let d=1;d<=days;d++){
   const playing=games.filter(x=>x.day===d).flatMap(x=>[x.home,x.away]);
   assert.equal(new Set(playing).size,playing.length,event+' duplicate team on day '+d);
  }
 }
 console.log(event+': fixtures and dates OK');
}
