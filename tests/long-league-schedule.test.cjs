const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function scheduledPairs(day){');
const end=source.indexOf('function ',start+30);
assert.ok(start>=0&&end>start,'real league scheduler exists');
const state={year:2026,seasonStartDate:'2026-01-01',teams:[]};
const seasonDate=day=>{const d=new Date(state.seasonStartDate+'T12:00:00');d.setDate(d.getDate()+day-1);return d};
const context=vm.createContext({state,Date,Math,Array,seasonDate});
vm.runInContext(source.slice(start,end),context);
let total=0;
for(let year=2026;year<2056;year++){
 state.year=year;state.seasonStartDate=year+'-01-01';
 state.teams=Array.from({length:10},(_,id)=>({id,wins:0,losses:0,draws:0}));
 let games=0;
 const length=(new Date(year+1,0,1)-new Date(year,0,1))/86400000;
 for(let day=1;day<=length;day++){
   const date=seasonDate(day);
   const pairs=vm.runInContext('scheduledPairs('+day+')',context);
   assert.ok(pairs.length<=5,'max five games daily');
   assert.equal(pairs.length*2,new Set(pairs.flat()).size,'club cannot play twice in one day');
   if(date.getDay()===1)assert.equal(pairs.length,0,'no Monday games');
   for(const [away,home] of pairs){
     assert.notEqual(away,home,'no self game');
     state.teams[away].wins++;
     state.teams[home].losses++;
     games++;
   }
   assert.ok(state.teams.every(t=>t.wins+t.losses+t.draws<=144),'144 game cap per club');
 }
 assert.ok(games>0,'games scheduled in '+year);
 assert.ok(state.teams.every(t=>t.wins+t.losses+t.draws===144),'full 144-game season '+year);
 total+=games;
}
console.log('Real 30-year league schedule: 30 seasons, '+total+' games PASS');
