// BASEBALL EMPIRE common inning progression regression tests.
// Run: node tests/inning-progression.test.js
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('function runBaseballInnings(');
const end=source.indexOf('function simulateLeagueDay(',start);
assert(start>=0&&end>start,'shared inning engine missing');
function play(awayLine,homeLine){
 let halves=0;
 const half=(batting,fielding,inning)=>{
   const runs=(batting.tag==='away'?awayLine:homeLine)[inning-1]||0;
   batting.runs+=runs;halves++;return runs;
 };
 const run=new Function('gameInjuryCheck','managerSubstitutions','playHalf',
   source.slice(start,end)+';return runBaseballInnings;')(()=>{},()=>{},half);
 const away={tag:'away',runs:0,innings:[]};
 const home={tag:'home',runs:0,innings:[]};
 run(away,home,()=>0.5,{historical:true,maxInnings:12});
 return {away,home,halves};
}
let x=play(Array(9).fill(0),[1,0,0,0,0,0,0,0]);
assert.equal(x.halves,17,'home lead must skip bottom ninth');
assert.equal(x.home.innings[8],null,'skipped bottom ninth should be null');
x=play([1,0,0,0,0,0,0,0,0],Array(9).fill(0));
assert.equal(x.halves,18,'away lead requires bottom ninth');
x=play(Array(12).fill(0),Array(12).fill(0));
assert.equal(x.halves,24,'tied game must reach 12 innings');
assert.equal(x.away.innings.length,12);
x=play(Array(9).fill(0),[0,0,0,0,0,0,0,0,1]);
assert.equal(x.home.runs,1,'ninth-inning home walkoff result');
assert.equal(x.halves,18);
console.log('PASS: 4 common inning progression scenarios');
