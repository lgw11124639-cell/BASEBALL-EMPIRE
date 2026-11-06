const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);state.day=150;state.gameResults=[];officeAI(0).manager.philosophy='스몰볼';officeAI(1).manager.philosophy='스몰볼';const buntEvents=[];for(let day=0;day<80;day++){state.day=150+day;for(const p of state.players){playerBaseball(p).fatigue=0;p.lastAppearance=null;}const a=inningClub(0,state.day,'우투'),h=inningClub(1,state.day,'우투');a.beEvents=[];h.beEvents=[];a.beSide='away';h.beSide='home';runBaseballInnings(a,h,rng(81811+day*391),{league:'major',maxInnings:12});buntEvents.push(...a.beEvents,...h.beEvents);}`);
const events=run('buntEvents').filter(e=>e.buntPlan);
assert.ok(events.length>10);
assert.ok(events.some(e=>e.outcome==='희생번트'),'successful sacrifice');
assert.ok(events.some(e=>e.outcome==='번트 선행주자 아웃'),'failed force play');
assert.ok(events.some(e=>e.outcome==='번트 뜬공 아웃'),'failed popup');
assert.ok(events.some(e=>e.pitchSequence.some(p=>p.bunt&&p.call==='파울')),'actual bunt foul');
assert.ok(events.some(e=>e.pitchSequence.some(p=>p.bunt&&/헛스윙/.test(p.call))),'actual missed bunt');
assert.ok(events.some(e=>e.pitchSequence.some(p=>p.call==='번트 파울 삼진')),'two strike bunt foul is strikeout');
for(const e of events){if(e.outcome==='희생번트')assert.equal(e.outsAfter-e.outsBefore,1);if(e.outcome==='번트 선행주자 아웃')assert.ok(e.afterBases.includes(e.batterId),'bunt force play leaves batter at first');if(e.runnerOuts?.some(out=>String(out.id)===String(e.batterId)))assert.ok(!e.afterBases.includes(e.batterId),'a bunt attempt abandoned for a ground out does not leave the retired batter on base');for(const p of e.pitchSequence)if(p.call==='번트 파울 삼진')assert.equal(p.strikesAfter,3);}
console.log('PASS actual small-ball games: sacrifice success, force-out, popup, foul, whiff and two-strike bunt foul strikeout',events.length);
