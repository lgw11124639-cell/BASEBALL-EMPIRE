const assert = require('node:assert/strict');
const vm = require('node:vm');
const context = require('./helpers/game-context.cjs')();
const run = source => vm.runInContext(source, context);
const fresh = () => run(`state=world(0);state.year=2030;state.seasonStartDate='2030-01-01';state.day=100;`);
const advanceCase = (name, days = 5) => run(`for(var i=0;i<${days};i++){state.day++;kpblDisciplineDay();}`);

// A whole-league policy uses two completed seasons, multiple metrics and a cooldown.
fresh();
run(`var low={games:720,avg:.23,era:3,runsPerGame:7,hrPerGame:1},normal={games:720,avg:.265,era:4.1,runsPerGame:9,hrPerGame:1.8};state.history.seasons={2028:{year:2028,leagueEnvironment:low},2029:{year:2029,leagueEnvironment:low}};leagueOfficeSeason();`);
assert.equal(run('kpblBallReview().direction'), 1);
run('state.history.seasons[2028].leagueEnvironment=normal');
assert.equal(run('kpblBallReview()'), null);
run('state.history.seasons[2028].leagueEnvironment={...low,games:100}');
assert.equal(run('kpblBallReview()'), null);
run('state.history.seasons[2028].leagueEnvironment=low;kpblOffice().policies.push({type:"ball",status:"공고",effectiveYear:2029})');
assert.equal(run('kpblBallReview()'), null);
run('kpblOffice().policies=[]');
assert.equal(run('kpblSeasonBalance({...low,era:5}).direction'), 0, 'mixed signals never trigger tuning');
assert.equal(run('kpblSeasonBalance({...low,games:undefined}).complete'), false, 'missing game totals are not completed seasons');

// Unchanged injury reports stay quiet while an actual tracked recovery is protected.
fresh();
run(`state.day=15;var rehab=state.players.find(p=>p.position==='P');ensureProfile(rehab).injury={days:20,type:'어깨 염좌',occurredYear:2030,occurredDay:10};kpblAssociationConsultation();var firstArticles=state.clubNotices.filter(n=>n.kind==='KPBL 선수협회').length;state.day=46;kpblAssociationConsultation();`);
assert.equal(run('state.clubNotices.filter(n=>n.kind==="KPBL 선수협회").length'), run('firstArticles'), 'unchanged monthly injury situation is not republished');
run(`rehab.profile.injury.days=0;rehab.profile.injury.recoveredDay=47;rehab.profile.injury.recoveredYear=2030;rehab.medicalReturnDay=47;state.day=47;kpblAssociationConsultation();`);
assert.equal(run('kpblAssociationPitchLimit(rehab)'), 65);
run(`var protectionClub=inningClub(rehab.teamId,state.day,'우투');protectionClub.starter=rehab;`);
assert.equal(run('starterPitchLimit(protectionClub,2)'),65,'return protection reaches actual pitcher management');
run(`recordPitch(protectionClub,rehab,1).pitchCount=65`);
assert.notEqual(run('selectPitcher(protectionClub,2,0).id'),run('rehab.id'),'manager replaces the recovering starter at the threshold');
run('state.day=50');
assert.equal(run('kpblAssociationPitchLimit(rehab)'), Infinity);

// A verified therapeutic-use approval changes the real final decision.
fresh();
run(`var subject=state.players[0],medical=kpblOpenIntegrityCase('doping',subject.id,{id:'lab',playerId:subject.id,sampleId:'specimen-medical',sampleA:'양성',sampleB:'양성',chainVerified:true,independentLab:true,therapeuticExemption:{verified:true,playerId:subject.id,documentId:'tue-medical'}},'domestic');var medicalNotice=state.clubNotices.find(n=>n.caseId===medical.id);var originalInvestigation=JSON.stringify(medicalNotice.kpblRecord);`);
assert.equal(run('kpblSuspended(subject)'), false);
assert.equal(run('medicalNotice.kpblRecord.incidentType'), 'doping');
assert.equal(run('medicalNotice.kpblRecord.step.stage'), '조사');
assert.equal(run('medicalNotice.kpblRecord.finding'), null, 'a publication cannot reveal a later finding');
advanceCase('medical');
assert.equal(run('medical.status'), '종결');
assert.equal(run('medical.appeal.originalPenalty'), 30);
assert.equal(run('medical.decision'), 0);
assert.equal(run('JSON.stringify(medicalNotice.kpblRecord)'), run('originalInvestigation'), 'later rulings do not rewrite the investigation publication');
assert.match(run('kpblArticleModel(medicalNotice).title'), /금지약물.*조사/);
assert.doesNotMatch(run('kpblArticleModel(medicalNotice).title'), /확정|종결/);
assert.equal(run('state.clubNotices.find(n=>n.caseId===medical.id&&n.kpblRecord?.step.stage==="종결").kpblRecord.remaining'), 0);

// A subject's own samples and independent chain/lab verification are mandatory.
fresh();
run(`var subject=state.players[0],other=state.players[1];var lab={id:'wrong-subject',playerId:other.id,sampleId:'other-specimen',sampleA:'양성',sampleB:'양성',chainVerified:true,independentLab:true};var wrongSample=kpblOpenIntegrityCase('doping',subject.id,lab);var missingLab=kpblOpenIntegrityCase('doping',subject.id,{...lab,id:'missing-lab',playerId:subject.id,independentLab:false});var negative=kpblOpenIntegrityCase('doping',subject.id,{...lab,id:'negative-b',playerId:subject.id,sampleB:'음성'});var wrongExemption=kpblOpenIntegrityCase('doping',subject.id,{...lab,id:'other-tue',playerId:subject.id,therapeuticExemption:{verified:true,playerId:other.id,documentId:'other-approval'}});`);
advanceCase('wrongSample');
for (const name of ['wrongSample', 'missingLab', 'negative']) {
  assert.equal(run(`${name}.status`), '종결', name + ' is closed without a penalty');
  assert.equal(run(`${name}.remaining`), 0);
}
assert.equal(run('wrongExemption.remaining'), 30, 'another player’s treatment approval does not cancel a verified violation');
assert.equal(run('kpblSuspended(subject)'), false, 'the final day is still excluded');
run('state.day++');
assert.equal(run('kpblSuspended(subject)'), true);
assert.equal(run('kpblSuspended(subject,"international")'), false);

// An explicit signed bench report is processed even without a two-HBP trigger.
fresh();
run(`var subject=state.players[0],benchGame={year:2030,day:100,away:subject.teamId,home:(subject.teamId+1)%10,awayRuns:1,homeRuns:0,awayInnings:Array(9).fill(0),homeInnings:Array(9).fill(0),broadcastEvents:[],leagueIncidents:[{id:'explicit-umpire',type:'bench',reportSigned:true,inning:5,participants:[{playerId:subject.id,action:'신체 충돌',deescalationVerified:true}]}]};kpblRecordBenchIncident(benchGame,'regular',kpblMatchKey(benchGame,'regular'));var bench=kpblOffice().cases.find(c=>c.type==='bench');`);
assert.equal(run('bench.playerId'), run('subject.id'));
assert.equal(run('bench.evidence.reportSigned'), true);
assert.match(run('gameArticle(benchGame)'), /벤치클리어링/, 'the match article includes its recorded bench incident');
advanceCase('bench');
assert.equal(run('bench.remaining'), 1);
assert.equal(run('bench.appeal.originalPenalty'), 3);
assert.equal(run('bench.appeal.finalPenalty'), 1, 'verified deescalation changes the final penalty');
assert.equal(run('kpblSuspended(subject,"regular")'), false, 'final day selection and service use the same next-day predicate');
assert.equal(run('kpblSuspensionRoster("regular").length'), 0);
run('state.day++');
assert.equal(run('kpblSuspended(subject,"regular")'), true);
assert.equal(run('kpblSuspended(subject,"international")'), false);
assert.equal(run('kpblSuspended(subject,"minor")'), false, 'a regular-only case does not affect another scope');
run(`subject.level='1군';var serviceRoster=kpblSuspensionRoster('regular'),serviceGame={...benchGame,day:state.day,leagueIncidents:[]};kpblCompleteMatch({...serviceGame,cancelled:true},'regular',serviceRoster);`);
assert.equal(run('bench.remaining'), 1, 'a cancellation does not serve a suspension');
run(`kpblCompleteMatch({...serviceGame,gameId:'international'},'international',serviceRoster);`);
assert.equal(run('bench.remaining'), 1, 'an unrelated competition does not serve this case');
run(`kpblCompleteMatch({...serviceGame,home:(subject.teamId+2)%10,away:(subject.teamId+3)%10,gameId:'other-teams'},'regular',serviceRoster);`);
assert.equal(run('bench.remaining'), 1, 'other clubs cannot serve the player’s suspension');
run(`kpblCompleteMatch(serviceGame,'regular',serviceRoster);`);
assert.equal(run('bench.remaining'), 0);
assert.equal(run('bench.status'), '복귀');
assert.equal(run('bench.served.length'), 1);
run(`kpblCompleteMatch(serviceGame,'regular',serviceRoster);`);
assert.equal(run('bench.served.length'), 1, 'replaying completion cannot consume twice');
assert.equal(run('kpblSuspended(subject,"regular")'), false);

// A transaction must identify this player and an exact fixture at case opening.
// The fixture witness is retained when the season's match array is archived/reset.
fresh();
run(`var subject=state.players[0],other=state.players[1],fixture={year:2030,day:99,gameId:'fixture-99',gameNumber:1,away:subject.teamId,home:(subject.teamId+1)%10,awayRuns:1,homeRuns:0,awayInnings:Array(9).fill(0),homeInnings:Array(9).fill(0)};state.gameResults=[fixture];var transaction={id:'ledger',transactionId:'transfer-1',playerId:subject.id,year:2030,gameDay:99,gameId:'fixture-99',gameNumber:1,away:fixture.away,home:fixture.home,paymentVerified:true,amount:5000000,communicationVerified:true,agreement:'부정 청탁 수락',outcomeAltered:false};var fixing=kpblOpenIntegrityCase('fixing',subject.id,transaction);var wrongTransaction=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'wrong-transaction',playerId:other.id});var missingGame=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'missing-game',gameId:'absent'});var noCommunication=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'unverified-contact',communicationVerified:false});var beforeFixture=JSON.stringify(fixture);state.gameResults=[];`);
assert.equal(run('fixing.fixture.gameId'), 'fixture-99');
assert.equal(run('kpblIntegrityFinding(fixing).confirmed'), true, 'frozen source linkage survives an archive reset');
advanceCase('fixing');
assert.equal(run('fixing.remaining'), 120);
for (const name of ['wrongTransaction', 'missingGame', 'noCommunication']) assert.equal(run(`${name}.status`), '종결', name + ' is not proof');
assert.equal(run('JSON.stringify(fixture)'), run('beforeFixture'), 'the integrity case never rewrites match results');
assert.match(run('JSON.stringify(kpblArticleModel(state.clubNotices.find(n=>n.caseId===fixing.id&&n.kpblRecord?.step.stage==="확정")))'), /경기 결과.*별개/);
assert.equal(run('subject.retired'), undefined, 'a case does not silently retire the player');

// A scheduled, cancelled or incomplete fixture is never an original completed match.
run(`state.gameResults=[{...fixture,gameId:'pending',status:'pending'},{...fixture,gameId:'cancelled',cancelled:true},{...fixture,gameId:'no-innings',awayInnings:undefined},{...fixture,gameId:'short-game',awayInnings:Array(4).fill(0)}];var pendingFixture=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'pending-ledger',gameId:'pending'}),cancelledFixture=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'cancelled-ledger',gameId:'cancelled'}),noInningsFixture=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'no-innings-ledger',gameId:'no-innings'}),shortFixture=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'short-ledger',gameId:'short-game'});`);
for (const name of ['pendingFixture', 'cancelledFixture', 'noInningsFixture', 'shortFixture']) {
  assert.equal(run(`${name}.fixture`), undefined, name + ' cannot become a frozen source witness');
  assert.equal(run(`kpblIntegrityFinding(${name}).confirmed`), false);
}
run(`state.gameResults=[{...fixture,gameId:'double-1',gameNumber:1},{...fixture,gameId:'double-2',gameNumber:2}];var ambiguous=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'ambiguous-ledger',gameId:undefined,gameNumber:undefined}),identified=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'identified-ledger',gameId:'double-2',gameNumber:2}),wrongFixtureId=kpblOpenIntegrityCase('fixing',subject.id,{...transaction,id:'wrong-fixture-id',gameId:'absent'});`);
assert.equal(run('kpblIntegrityFinding(ambiguous).confirmed'), false, 'an ambiguous doubleheader cannot identify an original game');
assert.equal(run('kpblIntegrityFinding(identified).confirmed'), true, 'an exact fixture ID and game number resolve a doubleheader');
assert.equal(run('identified.fixture.gameNumber'), 2);
assert.equal(run('kpblIntegrityFinding(wrongFixtureId).confirmed'), false, 'a different game ID never falls back to the date and clubs');

console.log('PASS two-season league stability; substantive rehabilitation; subject-bound evidence, association appeals, immutable articles, explicit bench reporting, exact suspension service and fixture archive retention');
