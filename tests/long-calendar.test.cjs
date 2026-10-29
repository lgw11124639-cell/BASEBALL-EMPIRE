// Fifty-year calendar smoke test for the game's real seasonDate helper.
// This does not simulate match engines, drafts, or saves.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const begin=source.indexOf('function seasonDate(day){');
const end=source.indexOf('function seasonDateLabel(day)',begin);
assert.ok(begin>=0&&end>begin,'seasonDate implementation found');
const state={seasonStartDate:'2026-01-01'};
const context=vm.createContext({state,Date,localTodayISO:()=>state.seasonStartDate});
vm.runInContext(source.slice(begin,end),context);
const date=day=>vm.runInContext('seasonDate('+day+')',context);
let last=null,yearChanges=0,leapDays=0;
const years=50;
const totalDays=Math.round((new Date(2026+years,0,1)-new Date(2026,0,1))/86400000);
for(let day=1;day<=totalDays;day++){
 const current=date(day);
 assert.equal(current.getHours(),12,'midday date '+day);
 if(last){
  const expected=new Date(last);expected.setDate(expected.getDate()+1);
  assert.equal(current.getFullYear(),expected.getFullYear(),'year '+day);
  assert.equal(current.getMonth(),expected.getMonth(),'month '+day);
  assert.equal(current.getDate(),expected.getDate(),'day '+day);
  if(current.getFullYear()!==last.getFullYear())yearChanges++;
 }
 if(current.getMonth()===1&&current.getDate()===29)leapDays++;
 last=current;
}
assert.equal(yearChanges,years-1,'year transitions within 50-year span');
assert.equal(leapDays,12,'leap dates 2028 through 2072');
console.log('50-year calendar smoke: PASS ('+totalDays+' dates, '+yearChanges+' year transitions, '+leapDays+' leap days)');
