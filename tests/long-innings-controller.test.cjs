const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function runBaseballInnings(');
const end=source.indexOf('function ',start+30);
assert.ok(start>=0&&end>start,'actual innings controller exists');
let seed=20261026;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
let injuries=0,substitutions=0,halves=0;
const context=vm.createContext({
 gameInjuryCheck:()=>{injuries++},
 managerSubstitutions:()=>{substitutions++},
 playHalf:(batting,fielding,inning,r,walkoff)=>{
  halves++;
  const runs=r()<.28?1+Math.floor(r()*3):0;
  batting.runs+=runs;
  return runs;
 },
});
vm.runInContext(source.slice(start,end),context);
const run=vm.runInContext('runBaseballInnings',context);
let games=0,walkoffs=0,extras=0;
for(let year=2026;year<2056;year++){
 for(let game=0;game<720;game++){
  const away={runs:0,innings:[]},home={runs:0,innings:[]};
  const result=run(away,home,random);
  assert.equal(result.awayRuns,away.runs);
  assert.equal(result.homeRuns,home.runs);
  assert.ok(away.innings.length>=9&&away.innings.length<=12,'away innings bounded');
  assert.equal(away.innings.length,home.innings.length,'both sides have inning slots');
  assert.ok(away.runs>=0&&home.runs>=0,'nonnegative scores');
  assert.ok(away.innings.every(n=>Number.isInteger(n)&&n>=0),'valid away inning scores');
  assert.ok(home.innings.every(n=>n===null||(Number.isInteger(n)&&n>=0)),'valid home inning scores');
  assert.equal(away.innings.reduce((n,x)=>n+(x||0),0),away.runs,'away score matches innings');
  assert.equal(home.innings.reduce((n,x)=>n+(x||0),0),home.runs,'home score matches innings');
  if(home.innings.at(-1)===null){walkoffs++;assert.ok(home.runs>away.runs,'skipped home half only if already leading')}
  if(away.innings.length>9)extras++;
  games++;
 }
}
assert.equal(games,21600,'30 seasons of 720 games');
assert.ok(halves>300000,'real innings controller repeatedly exercised');
assert.ok(injuries>0&&substitutions>0,'injury and manager hooks invoked');
console.log('30-year innings controller: '+games+' games, '+halves+' half-innings, '+extras+' extra-inning games, '+walkoffs+' skipped bottom halves PASS');
