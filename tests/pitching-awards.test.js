// BASEBALL EMPIRE pitching award regression tests.
// Run: node tests/pitching-awards.test.js
// No game saves are opened or modified.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function finishPitchers(');
const end = source.indexOf('function localTodayISO(', start);
assert(start >= 0 && end > start, 'pitcher settlement function missing');
const finishPitchers = new Function('state', 'addPitchingLine', 'playerBaseball',
  source.slice(start, end) + ';return finishPitchers;')(
  { day: 1 }, () => {}, () => ({ fatigue: 0 })
);
function settle({ outs, won, entryLeads = [], exitLeads = [], goAhead = null, lossId = null, opponentRuns = won ? 1 : 4, requiredOuts = 27 }) {
  const usage = outs.map((n, i) => ({
    p: { id: i + 1 }, outs: n, er: 0, hits: 0, walks: 0,
    pitchCount: 35, battersFaced: 9, entry: i + 1, lastInning: i + 1,
    entryLead: entryLeads[i] || 0, exitLead: exitLeads[i] || 0,
    entryRunners: 0, started: i === 0
  }));
  const club = { usage, plan: { roles: new Map() }, runs: won ? 4 : 1,
    goAheadPitcherId: goAhead, lossPitcherId: lossId };
  finishPitchers(club, won, opponentRuns, requiredOuts);
  return club.pitcherUsage;
}
const solo = settle({ outs: [27], won: true, goAhead: 1 });
assert.equal(solo[0].win, true);
assert.equal(solo[0].completeGame, true);
assert.equal(solo[0].save, false);
const relief = settle({ outs: [18, 6, 3], won: true, entryLeads: [0, 3, 2],
  exitLeads: [3, 2, 2], goAhead: 1 });
assert.equal(relief[0].win, true);
assert.equal(relief[1].hold, true);
assert.equal(relief[2].save, true);
assert.equal(relief.filter(x => x.win).length, 1);
assert.equal(relief.filter(x => x.save).length, 1);
const loss = settle({ outs: [12, 15], won: false, lossId: 1 });
assert.equal(loss[0].loss, true);
assert.equal(loss[1].loss, false);
const incomplete = settle({ outs: [24], won: false, requiredOuts: 27 });
assert.equal(incomplete[0].completeGame, false);
const completeEight = settle({ outs: [24], won: false, requiredOuts: 24 });
assert.equal(completeEight[0].completeGame, true);
console.log('PASS: 5 pitching award regression scenarios');
