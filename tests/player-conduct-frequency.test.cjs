const assert=require('node:assert/strict');
const vm=require('node:vm');
const context=require('./helpers/game-context.cjs')();
const run=source=>vm.runInContext(source,context);
run(`
var subject,firstBet,lossGame,relapse,report;
function conductScenario(id=396){
 state=world(0);state.seasonStartDate='2027-01-01';state.day=1;
 const p=state.players.find(p=>p.id===id);p.age=25;p.salary=200000000;p.level='1군';
 const profile=ensureProfile(p);profile.contractYears=1;profile.injury={status:'건강',days:0};
 playerConductState(p).persona={integrity:25,riskTolerance:86,financialFocus:90,ambition:45};
 playerConductAccrue(p);playerConductDecision(p);return p;
}
function completeLosingBet(p,bet){
 state.day=bet.fixture.day;const selectedHome=String(bet.selection)===String(bet.fixture.home);
 const game={...bet.fixture,awayRuns:selectedHome?1:0,homeRuns:selectedHome?0:1,awayInnings:Array(9).fill(0),homeInnings:Array(9).fill(0),awayBatters:[],homeBatters:[],awayPitchers:[],homePitchers:[]};
 game.awayInnings[0]=game.awayRuns;game.homeInnings[0]=game.homeRuns;
 state.gameResults=state.gameResults||[];state.gameResults.push(game);playerConductAfterMatch(game,'regular');return game;
}
`);
// Rare preferences alone, old age, a minor role and an expiring contract cannot manufacture a financial motive.
run(`state=world(0);state.seasonStartDate='2027-01-01';state.day=1;const savedRandom=Math.random;Math.random=()=>{throw Error('random misconduct draw')};
 for(let year=2027;year<=2029;year++){state.year=year;state.seasonStartDate=year+'-01-01';for(let day=1;day<=365;day++){state.day=day;kpblIntegrityAuditDay()}}
 Math.random=savedRandom;`);
assert.equal(run(`state.players.flatMap(p=>p.conduct?.actions||[]).filter(a=>a.type==='gamble').length`),0,'unchanged observed incomes produce no automatic wagers over three seasons');
// A real observed income decline and real new poor results can make the risky choice beat legal alternatives.
run(`subject=conductScenario();state.day=90;playerConductAccrue(subject);state.day=91;subject.salary=100000000;subject.games=12;subject.atBats=50;subject.hits=4;playerConductAutonomy(subject,seasonDate(state.day));firstBet=subject.conduct.actions.find(a=>a.type==='gamble');`);
assert.ok(run('!!firstBet'),'an extreme financial preference with an actual salary shock and slump can choose a first bet');
assert.equal(run('subject.conduct.lastDecision.choice'),'gamble');
assert.equal(run('subject.conduct.incomePressure.previousSalary'),200000000);
assert.equal(run('subject.conduct.incomePressure.currentSalary'),100000000);
assert.equal(run('subject.conduct.incomePressure.drop'),.5);
assert.ok(run('subject.conduct.lastDecision.utilities.gamble>subject.conduct.lastDecision.utilities.train'));
assert.ok(run('subject.conduct.lastDecision.utilities.gamble>subject.conduct.lastDecision.utilities.doping'),'financial stress does not merely force a doping event');
// Restored income removes the gambling motive even while the old shock record remains inside its observation window.
run(`subject=conductScenario();state.day=90;playerConductAccrue(subject);state.day=91;subject.salary=100000000;subject.atBats=50;subject.hits=4;var cutDecision=playerConductDecision(subject);state.day=92;subject.salary=200000000;subject.atBats=100;subject.hits=8;var restoredIncomeDecision=playerConductDecision(subject);`);
assert.ok(run('Number.isFinite(cutDecision.utilities.gamble)'));assert.equal(run('restoredIncomeDecision.utilities.gamble'),-Infinity,'recovered salary cannot keep manufacturing financial distress');
// Old saves have no observed prior salary, so their current income is the baseline, not an invented cut.
run(`subject=conductScenario();delete subject.conduct.observation.salary;state.day=91;subject.salary=100000000;subject.atBats=50;subject.hits=4;playerConductAccrue(subject);var migratedDecision=playerConductDecision(subject);`);
assert.equal(run('subject.conduct.incomePressure??null'),null);
assert.equal(run('migratedDecision.utilities.gamble'),-Infinity);
assert.equal(run('subject.conduct.observation.salary'),100000000);
// A genuine settled loss can trigger a single short-term reconsideration before the regular monthly audit.
run(`subject=conductScenario(1);state.day=90;playerConductAccrue(subject);state.day=91;subject.salary=100000000;playerConductAccrue(subject);playerConductDecision(subject);
 // Stake only the actually accrued personal reserve, then settle the exact scheduled fixture.
 firstBet=choosePlayerConduct(subject,'gamble',{amount:Math.floor(subject.conduct.finances.balance),reason:'자발적 베팅'});
 lossGame=completeLosingBet(subject,firstBet);subject.conduct.lastDecision={key:state.year+':'+(seasonDate(state.day).getMonth()+1),choice:'train'};
 state.day+=2;playerConductAccrue(subject);playerConductAutonomy(subject,seasonDate(state.day));var wagersBeforeReview=subject.conduct.actions.filter(a=>a.type==='gamble').length;
 state.day+=1;playerConductAccrue(subject);playerConductAutonomy(subject,seasonDate(state.day));relapse=subject.conduct.actions.find(a=>a.sourceLossId===firstBet.id);`);
assert.equal(run('wagersBeforeReview'),1,'a loss does not cause an immediate automatic wager');
assert.ok(run('!!relapse'),'a fresh actual loss can prompt one outcome-triggered credit decision within the month');
assert.equal(run('firstBet.recoveryAttemptId===relapse.id'),true);
assert.equal(run('subject.conduct.lastLossReviewId===firstBet.id'),true);
assert.ok(run(`subject.conduct.actions.some(a=>a.type==='borrow'&&a.amount>0)`),'credit comes from an actual recorded shortfall');
assert.ok(run(`subject.conduct.actions.some(a=>a.type==='fixing'||a.type==='report_offer'||a.type==='reject_fixing')`),'a real betting contact and debt can lead to an explicit solicitation decision');
run(`var actionsAfterReview=subject.conduct.actions.length;state.day+=1;playerConductAccrue(subject);playerConductAutonomy(subject,seasonDate(state.day));`);
assert.equal(run('subject.conduct.actions.length'),run('actionsAfterReview'),'the same source loss does not repeat every day');
// Even a funded relapse must consume its source loss; otherwise monthly cash wagers bypassed the old borrow guard.
run(`subject=conductScenario();state.day=90;playerConductAccrue(subject);state.day=91;firstBet=choosePlayerConduct(subject,'gamble',{amount:40000});completeLosingBet(subject,firstBet);state.day+=3;playerConductAccrue(subject);var fundedBefore=subject.conduct.finances.balance;
 relapse=choosePlayerConduct(subject,'borrow_and_gamble',{sourceLossId:firstBet.id,amount:10000});`);
assert.ok(run('fundedBefore>=10000'));
assert.ok(run('!!relapse'));
assert.equal(run('firstBet.recoveryAttemptId'),run('relapse.id'));
assert.equal(run('subject.conduct.actions.filter(a=>a.type===\'borrow\').length'),0,'a funded bet creates no fictitious borrowing');
run(`completeLosingBet(subject,relapse);`);
assert.equal(run(`choosePlayerConduct(subject,'borrow_and_gamble',{sourceLossId:firstBet.id,amount:10000})`),null,'a consumed loss cannot be reused even after its recovery wager settles');
assert.ok(run('subject.conduct.finances.balance<Math.min(1000000,subject.salary*.002)/5'),'the reserve has a real potential credit shortfall');
assert.equal(run('playerConductBettingContext(subject).creditShortfall'),false,'a fresh recovery attempt imposes a real dated cooldown');
// An old loss and a calendar rollover do not reset the source-event or credit cooldown.
run(`subject=conductScenario();state.day=90;playerConductAccrue(subject);state.day=91;firstBet=choosePlayerConduct(subject,'gamble',{amount:10000});completeLosingBet(subject,firstBet);state.day+=61;playerConductAccrue(subject);var oldLossContext=playerConductBettingContext(subject),oldLossDecision=playerConductDecision(subject);`);
assert.equal(run('oldLossContext.recentLoss'),null);
assert.equal(run('oldLossDecision.utilities.borrow_and_gamble'),-Infinity);
run(`state.year=2028;state.seasonStartDate='2028-01-01';state.day=1;playerConductAccrue(subject);var rollover=playerConductDecision(subject);`);
assert.equal(run('rollover.utilities.borrow_and_gamble'),-Infinity);
// A December recovery attempt keeps its dated credit cooldown across January, even with a fresh unsettled loss.
run(`subject=conductScenario();state.day=335;playerConductAccrue(subject);firstBet=choosePlayerConduct(subject,'gamble',{amount:Math.floor(subject.conduct.finances.balance)});completeLosingBet(subject,firstBet);state.day+=3;playerConductAccrue(subject);relapse=choosePlayerConduct(subject,'borrow_and_gamble',{sourceLossId:firstBet.id});completeLosingBet(subject,relapse);
 state.year=2028;state.seasonStartDate='2028-01-01';state.day=1;playerConductAccrue(subject);var newYearCredit=playerConductBettingContext(subject);`);
assert.ok(run('!!newYearCredit.recentLoss'),'the later loss remains genuinely recent at New Year');
assert.equal(run('newYearCredit.creditShortfall'),false,'January does not reset the 365-day credit cooldown');
// Public proceedings, a confirmed suspension, and a voluntary disclosure all inhibit further autonomous betting.
for(const status of ['조사','확정']){
 run(`subject=conductScenario();kpblOffice().cases.push({id:'public-case',playerId:subject.id,type:'gambling',status:${JSON.stringify(status)},year:state.year,day:state.day,decision:60,remaining:60});`);
 assert.equal(run('playerConductBettingContext(subject).blocked'),true,`${status} blocks autonomous gambling`);
}
run(`subject=conductScenario();state.day=90;playerConductAccrue(subject);state.day=91;firstBet=choosePlayerConduct(subject,'gamble',{amount:10000});report=choosePlayerConduct(subject,'self_report',{actionId:firstBet.id});`);
assert.ok(run('!!report'));
assert.equal(run('playerConductBettingContext(subject).blocked'),true,'self-disclosure is an actual dated deterrent');
run(`state=JSON.parse(JSON.stringify(state));subject=state.players.find(p=>p.id===subject.id);`);
assert.equal(run('playerConductBettingContext(subject).blocked'),true,'deterrence survives a cloud save round trip');
run(`state.year=2029;state.seasonStartDate='2029-01-01';state.day=91;`);
assert.equal(run('playerConductBettingContext(subject).blocked'),true,'the deterrent spans multiple seasons');
console.log('PASS conduct frequency: no motive-free annual cohort, observed salary shock, causal choice, single fresh-loss response, dated relapse guards, proceedings/disclosure deterrence, save compatibility');
