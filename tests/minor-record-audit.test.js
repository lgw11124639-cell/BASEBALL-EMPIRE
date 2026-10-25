// BASEBALL EMPIRE minor-league game-record audit regression tests.
// Run: node tests/minor-record-audit.test.js
// Uses synthetic fixtures only; never opens IndexedDB or user saves.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function validateSeasonIntegrity(');
const end = source.indexOf('function activeRosterConsistency(', start);
assert(start >= 0 && end > start, 'integrity audit not found');
const makeAudit = new Function('state', source.slice(start, end) + ';return validateSeasonIntegrity;');
function fixture() {
  return {year:2027,day:30,players:[],teams:[{id:0},{id:1}],waiverClaims:[],
    minorLeague:{2027:{games:[{day:30,away:0,home:1,awayRuns:1,homeRuns:0,
      awayInnings:[0,0,0,0,0,0,0,0,1],homeInnings:[0,0,0,0,0,0,0,0,null],
      awayHits:1,homeHits:0,
      awayBatters:[{playerId:11,hits:1,strikeouts:0,walks:0,runs:1}],
      homeBatters:[{playerId:22,hits:0,strikeouts:2,walks:0,runs:0}],
      awayPitchers:[{playerId:31,innings:8,outs:24,hitsAllowed:0,strikeouts:2,walksAllowed:0,earnedRuns:0,startInning:1,endInning:8,win:true}],
      homePitchers:[{playerId:32,innings:9,outs:27,hitsAllowed:1,strikeouts:0,walksAllowed:0,earnedRuns:1,startInning:1,endInning:9,loss:true}]
    }]}}};
}
function audit(mutate) { const s=fixture(); if(mutate)mutate(s.minorLeague[2027].games[0]);return makeAudit(s)(); }
assert.deepEqual(audit(), [], 'valid 9-inning game should have no errors');
assert(audit(g=>g.awayPitchers[0].hitsAllowed=3).some(x=>x.includes('피안타 불일치')));
assert(audit(g=>g.awayPitchers[0].strikeouts=1).some(x=>x.includes('탈삼진 불일치')));
assert(audit(g=>g.homePitchers[0].walksAllowed=2).some(x=>x.includes('볼넷 불일치')));
assert(audit(g=>g.awayPitchers[0].outs=21).some(x=>x.includes('투구 이닝 합계')));
assert(audit(g=>g.awayBatters[0].hits=2).some(x=>x.includes('안타 합계 불일치')));
console.log('PASS: 6 minor league record audit scenarios');
