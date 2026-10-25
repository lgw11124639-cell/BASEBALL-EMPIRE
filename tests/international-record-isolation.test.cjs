// Run: node tests/international-record-isolation.test.cjs
// Tests the actual snapshot/restore functions extracted from app.js.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('const LEAGUE_BATTING_STAT_KEYS=');
const end=source.indexOf('function minorInningClub(',start);
assert.ok(start>=0&&end>start,'league counter implementation exists');
const context=vm.createContext({Map,Set,Object,Number});
vm.runInContext(source.slice(start,end),context);
const sample={id:42,name:'테스트 선수',games:17,atBats:60,hits:20,homeRuns:4,inningsPitched:22,lastAppearance:80};
const original={...sample};
context.sample=sample;
vm.runInContext('var saved=snapshotLeagueCounters([sample]);',context);
sample.games+=1;sample.atBats+=4;sample.hits+=2;sample.homeRuns+=1;
sample.inningsPitched+=2;sample.lastAppearance=99;sample.walks=3;
vm.runInContext('restoreLeagueCounters(saved);',context);
assert.deepEqual(sample,original,'international game must not change KBO counters');
assert.equal(Object.hasOwn(sample,'walks'),false,'new international-only counter removed');
console.log('International game counter snapshot/restore: PASS');
