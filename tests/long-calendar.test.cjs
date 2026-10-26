// Thirty-year calendar smoke test for the game's real seasonDate helper.
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
for(let day=1;day<=10958;day++){
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
assert.equal(yearChanges,30,'thirty year transitions');
assert.equal(leapDays,7,'leap dates 2028 through 2052');
console.log('30-year calendar smoke: PASS (10,958 dates, 30 year transitions, 7 leap days)');
