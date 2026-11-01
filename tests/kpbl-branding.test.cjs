const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),s=fs.readFileSync('app.js','utf8');
assert.ok(s.includes('BASEBALL EMPIRE'));assert.ok(s.includes('kboSchedule2027Mode'));assert.ok(s.includes('international.kboOverseasInterest'));assert.ok(s.includes("'KBO-'+p.id"));assert.ok(!s.includes('KPBL-'));
const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);run('state=world(0)');
assert.ok(!s.includes('KBO LEAGUE'));assert.ok(s.includes('KPBL LEAGUE'));
console.log('PASS BASEBALL EMPIRE brand, KPBL league, legacy save keys and overseas IDs');
