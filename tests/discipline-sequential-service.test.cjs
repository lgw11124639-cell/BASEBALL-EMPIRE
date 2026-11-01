const assert=require('node:assert/strict');
const vm=require('node:vm');
const context=require('./helpers/game-context.cjs')();
const run=source=>vm.runInContext(source,context);
const value=source=>JSON.parse(run(`JSON.stringify(${source})`));

run(`state=world(0);state.year=2030;state.day=100;state.seasonStartDate='2030-01-01';
 const queuedPlayer=managerPlan(0).first[0];queuedPlayer.level='1군';
 const early={id:'bench-first',playerId:queuedPlayer.id,teamId:0,type:'bench',scope:'regular',status:'확정',decision:2,remaining:2,year:2030,day:90,finalYear:2030,finalDay:95,reason:'확정된 벤치 충돌',served:[],steps:[{year:2030,day:95,stage:'확정'}]};
 const later={id:'doping-second',playerId:queuedPlayer.id,teamId:0,type:'doping',scope:'domestic',status:'확정',decision:3,remaining:3,year:2030,day:91,finalYear:2030,finalDay:96,reason:'확정된 금지약물 사건',served:[],steps:[{year:2030,day:96,stage:'확정'}]};
 kpblOffice().cases=[later,early];
 function fixture(day,id){return {year:2030,day,gameId:id,away:0,home:1,awayRuns:0,homeRuns:0,awayInnings:Array(9).fill(0),homeInnings:Array(9).fill(0),broadcastEvents:[]};}
 const beforeSelectors=JSON.stringify(kpblOffice().cases),initialRoster=kpblSuspensionRoster('regular');`);
assert.deepEqual(value('initialRoster.map(x=>x.caseId)'),['bench-first'],'oldest final decision runs first even when stored last');
assert.equal(run('kpblSuspended(queuedPlayer)'),true);
assert.equal(run('kpblSuspended(queuedPlayer,"international")'),false);
assert.equal(run('JSON.stringify(kpblOffice().cases)'),run('beforeSelectors'),'selection and queue queries do not rewrite old decisions or history');

run(`for(const change of [{cancelled:true},{rainedOut:true},{pending:true},{status:'scheduled'},{awayInnings:Array(8).fill(0)},{homeInnings:[]}])kpblCompleteMatch({...fixture(100,'not-complete'),...change},'regular',initialRoster);`);
assert.deepEqual(value('[early.remaining,later.remaining]'),[2,3],'only a completed original match serves a ban');
run(`kpblCompleteMatch(fixture(100,'international'),'international',initialRoster);`);
assert.deepEqual(value('[early.remaining,later.remaining]'),[2,3],'a domestic queue cannot be served in an international game');

// Even an old caller passing every case or duplicate rows cannot consume the queue in parallel.
run(`const duplicateRoster=[...initialRoster,...initialRoster,{caseId:later.id,playerId:queuedPlayer.id,teamId:0}];kpblCompleteMatch(fixture(100,'game-100'),'regular',duplicateRoster);kpblCompleteMatch(fixture(100,'game-100'),'regular',duplicateRoster);`);
assert.deepEqual(value('[early.remaining,later.remaining,early.served.length,later.served.length]'),[1,3,1,0]);
run(`state.day=101;kpblCompleteMatch(fixture(101,'game-101'),'regular',kpblSuspensionRoster('regular'));`);
assert.deepEqual(value('[early.status,early.remaining,later.remaining]'),['복귀',0,3],'finishing the first sentence does not also start the next one in that game');
assert.equal(run('kpblSuspended(queuedPlayer)'),true,'the later sentence still keeps this player out');
assert.equal(run('state.clubNotices.at(-1).title'),'해당 처분 이행 완료 · 복귀 보류','finishing one case does not announce eligibility while another sentence waits');
assert.equal(run('state.clubNotices.at(-1).returnEligible'),false);
assert.deepEqual(value('kpblSuspensionRoster("regular").map(x=>x.caseId)'),['doping-second']);

run(`state.day=102;kpblCompleteMatch(fixture(102,'major-102'),'regular',kpblSuspensionRoster('regular'));queuedPlayer.level='2군';const blockedMinorRoster=kpblSuspensionRoster('minor');kpblCompleteMatch(fixture(102,'minor-102'),'minor',[{caseId:later.id,playerId:queuedPlayer.id,teamId:0}]);`);
assert.equal(run('blockedMinorRoster.length'),0,'moving to the second squad cannot credit a second competition on the same day');
assert.equal(run('later.remaining'),2);
run(`state=JSON.parse(JSON.stringify(state));const restoredPlayer=state.players.find(p=>p.id===queuedPlayer.id),restoredLater=kpblOffice().cases.find(c=>c.id===later.id);`);
assert.equal(run('kpblSuspensionRoster("minor").length'),0,'retained served keys preserve the cross-squad guard after reload');
run(`state.day=103;const minorRoster=kpblSuspensionRoster('minor');kpblCompleteMatch(fixture(103,'minor-103'),'minor',minorRoster);restoredPlayer.level='1군';kpblCompleteMatch(fixture(103,'major-103'),'regular',[{caseId:restoredLater.id,playerId:restoredPlayer.id,teamId:0}]);`);
assert.equal(run('minorRoster[0].caseId'),'doping-second','the domestic sentence can continue in actual second-squad games');
assert.equal(run('restoredLater.remaining'),1,'a same-day promotion cannot credit another competition either');
run(`state.day=104;kpblCompleteMatch(fixture(104,'major-104'),'regular',kpblSuspensionRoster('regular'));`);
assert.deepEqual(value('kpblOffice().cases.map(c=>[c.id,c.remaining,c.served.length])'),[['doping-second',0,3],['bench-first',0,2]]);
assert.equal(run('kpblSuspended(restoredPlayer)'),false);
assert.equal(run('state.clubNotices.at(-1).returnEligible'),true,'a cleared queue explicitly permits return in this competition');

// Deterministic ties and real doubleheaders: one distinct completed fixture is one game served.
run(`const tieA={...early,id:'tie-a',remaining:1,status:'확정',served:[],finalYear:2029,finalDay:200},tieB={...later,id:'tie-b',remaining:1,status:'확정',served:[],finalYear:2029,finalDay:200};kpblOffice().cases.push(tieB,tieA);state.day=105;`);
assert.equal(run('kpblSuspensionRoster("regular")[0].caseId'),'tie-a');
run(`kpblCompleteMatch({...fixture(105,'doubleheader-1'),gameNumber:1},'regular',kpblSuspensionRoster('regular'));kpblCompleteMatch({...fixture(105,'doubleheader-2'),gameNumber:2},'regular',kpblSuspensionRoster('regular'));`);
assert.deepEqual(value('[tieA.remaining,tieB.remaining]'),[0,0],'separate actual games in the same competition each count once');

// Expulsion is effective the day after a final decision and never pretends to have finite service.
run(`const expelled={id:'permanent',playerId:restoredPlayer.id,teamId:0,type:'doping',scope:'domestic',status:'제명',permanent:true,decision:0,remaining:0,year:2030,day:105,finalYear:2030,finalDay:105,steps:[{year:2030,day:105,stage:'제명'}]},unfinished={...later,id:'preserved-finite',playerId:restoredPlayer.id,remaining:5,status:'확정',served:['2029:regular:250:0:1:1']};kpblOffice().cases.push(expelled,unfinished);const beforeExpulsion=JSON.stringify(expelled);`);
assert.equal(run('kpblCaseEffective(expelled,"regular")'),false,'a permanent decision does not remove a player retrospectively on its final day');
run(`state.day=106;`);
assert.equal(run('kpblSuspended(restoredPlayer,"regular")'),true);
assert.equal(run('kpblSuspended(restoredPlayer,"minor")'),true);
assert.equal(run('kpblSuspended(restoredPlayer,"postseason")'),true);
assert.equal(run('kpblSuspended(restoredPlayer,"international")'),false,'domestic expulsion keeps its competition scope');
assert.equal(run('managerPlan(0).first.some(p=>p.id===restoredPlayer.id)'),false,'the actual club selector excludes an expelled player');
assert.equal(run('kpblSuspensionRoster("regular").length'),0,'expulsion has no game-service entry');
run(`kpblCompleteMatch(fixture(106,'after-expulsion'),'regular',[{caseId:expelled.id,playerId:restoredPlayer.id,teamId:0},{caseId:unfinished.id,playerId:restoredPlayer.id,teamId:0}]);`);
assert.equal(run('JSON.stringify(expelled)'),run('beforeExpulsion'));
assert.deepEqual(value('[unfinished.remaining,unfinished.served]'),[5,['2029:regular:250:0:1:1']],'old remaining days and service history survive expulsion unchanged');
run(`state=JSON.parse(JSON.stringify(state));`);
assert.equal(run('kpblSuspended(state.players.find(p=>p.id===restoredPlayer.id))'),true,'a permanent decision survives reload without infinite counters');
console.log('PASS sequential suspension queue, deterministic order, actual fixtures, cross-squad/reload guard, doubleheaders and next-day permanent expulsion');
