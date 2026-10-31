const assert=require('node:assert/strict');
const vm=require('node:vm');
const context=require('./helpers/game-context.cjs')();
vm.runInContext(`state=world(0);state.year=2027;state.day=330;state.seasonStartDate='2027-01-01';
 state.teams=state.teams.slice(0,3);for(const t of state.teams)t.budget=20000000000;
 state.teams[0].wins=70;state.teams[0].losses=74;state.teams[1].wins=90;state.teams[1].losses=54;
 state.postseasons={2027:{finished:true}};state.gameResults=[];
 const candidate={id:100,name:'협상 선수',teamId:0,age:28,position:'SS',level:'FA대기',salary:2000000000,
 atBats:550,hits:175,doubles:32,triples:3,homeRuns:27,walks:65,games:140,registeredDays:145,
 profile:{contractYears:0},faService:{creditedSeasons:8,carryDays:0,faUses:0},careerStats:{hits:1200},
 faPreferences:{money:0,security:0,playingTime:0,contention:0,loyalty:0}};
 ensureProfile(candidate);candidate.profile.contractYears=0;
 state.players=[candidate,...[1,2,3,4].map(id=>({id,name:'시장 동료 '+id,teamId:id%3,level:'2군',position:'SS',
 age:28,salary:500000000,atBats:500,hits:140,doubles:25,homeRuns:15,walks:45,games:130,profile:{contractYears:1}}))];
 for(const p of state.players)ensureProfile(p);
 const baseRecord={year:2027,playerId:100,previousTeamId:0,previousLevel:'1군',grade:'C',previousSalary:2000000000};`,context);
const project=vm.runInContext('faPlayerProjection',context),build=vm.runInContext('faBuildOffer',context),evaluate=vm.runInContext('faEvaluateOffer',context);
const p=vm.runInContext('candidate',context),record=vm.runInContext('baseRecord',context);
const ageReport=[];
for(const age of [28,33,37,40]){
 const x=project({...p,age});const offer=build({...p,age},1,record,x);
 ageReport.push({age,recommendedYears:x.recommendedYears,annual:offer.annualSalary,years:offer.years,total:offer.totalValue});
}
assert.ok(ageReport[0].years>=3,'healthy productive prime player can receive a long guarantee');
assert.ok(ageReport[3].years<=2,'40-year-old does not receive an arbitrary four-year guarantee');
assert.ok(ageReport[3].annual<ageReport[0].annual,'aging projections change offered value');
assert.equal(project({...p,salary:50000000}).fairAnnual,project({...p,salary:2000000000}).fairAnnual,'club valuation is not a raise on previous salary');
const healthy=project(p),injured=project({...p,profile:{...p.profile,injury:{days:120}}});
assert.ok(injured.recommendedYears<healthy.recommendedYears,'serious injury shortens guarantee');
assert.ok(injured.fairAnnual<healthy.fairAnnual,'injury risk changes valuation');
const missing=project({...p,atBats:0,hits:0,homeRuns:0,doubles:0,triples:0,walks:0});
assert.equal(missing.recommendedYears,1,'lack of recent appearances does not justify a long guarantee');
const weak=project({...p,hits:95,homeRuns:3,walks:10,doubles:12,triples:0});
assert.ok(weak.fairAnnual<healthy.fairAnnual,'recent performance changes price');
// Market valuation regressions: identical pitcher with a proven closer role
// must be worth more than a middle reliever, without a fixed FA minimum.
const reliever={...p,id:300,position:'P',age:30,atBats:0,hits:0,doubles:0,triples:0,homeRuns:0,
 inningsPitched:62,earnedRuns:18,games:58,gamesStarted:0,saves:0,holds:0,
 profile:{...p.profile,baseball:{role:'불펜'}}};
// Supply a league pitching baseline so ERA-relative valuation is meaningful.
vm.runInContext(`state.players.push(
 {id:401,teamId:1,position:'P',level:'1군',salary:900000000,inningsPitched:160,earnedRuns:65,age:29},
 {id:402,teamId:2,position:'P',level:'1군',salary:700000000,inningsPitched:140,earnedRuns:60,age:30}
);`,context);
const middle=project(reliever);
const closer=project({...reliever,saves:37});
const setup=project({...reliever,holds:28});
assert.ok(closer.fairAnnual>middle.fairAnnual,'37-save closer earns a higher market valuation than middle relief');
assert.ok(setup.fairAnnual>middle.fairAnnual,'28-hold setup pitcher earns a higher market valuation than middle relief');
assert.ok(project({...reliever,earnedRuns:9}).fairAnnual>project({...reliever,earnedRuns:35}).fairAnnual,
 'pitching run prevention changes market value');
// Salary, playing time, security, contention and loyalty each have independent refusal paths.
const projection=healthy;
const clean={money:0,security:0,playingTime:0,contention:0,loyalty:0};
const asking=projection.fairAnnual*1.03;
const offer={teamId:1,years:projection.recommendedYears,annualSalary:asking,signingBonus:asking*projection.recommendedYears*.2,
 totalValue:asking*projection.recommendedYears*1.2,opportunity:.65,contention:.5};
const low=evaluate(p,{...offer,annualSalary:asking*.3,totalValue:offer.totalValue*.3}, {...record,previousSalary:0},projection,clean);
assert.equal(low.accepted,false);assert.match(low.reason,/연봉/);
const role=evaluate(p,{...offer,opportunity:.2}, {...record,previousSalary:0},projection,{...clean,playingTime:1});
assert.equal(role.accepted,false);assert.match(role.reason,/출전/);
const short=evaluate(p,{...offer,years:1,totalValue:asking*1.2}, {...record,previousSalary:0},projection,{...clean,security:1});
assert.equal(short.accepted,false);assert.match(short.reason,/보장기간/);
const winner=evaluate(p,{...offer,contention:.75}, {...record,previousSalary:0},projection,{...clean,contention:1});
const loser=evaluate(p,{...offer,contention:.25}, {...record,previousSalary:0},projection,{...clean,contention:1});
assert.ok(winner.accepted&&!loser.accepted,'equal money can be accepted at a contender and declined elsewhere');
const loyalOffer={...offer,annualSalary:asking*.98,totalValue:offer.totalValue*.98};
assert.ok(evaluate(p,{...loyalOffer,teamId:0},{...record,previousSalary:0},projection,{...clean,loyalty:1}).accepted);
assert.ok(!evaluate(p,loyalOffer,{...record,previousSalary:0},projection,{...clean,loyalty:1}).accepted,'loyal player may reject an equal outside offer');
const older=project({...p,age:40}),olderAsk=older.fairAnnual*1.03;
const olderRefusal=evaluate({...p,age:40},{...offer,years:1,annualSalary:olderAsk,totalValue:olderAsk*1.2}, {...record,previousSalary:0},older,{...clean,security:1});
assert.ok(!olderRefusal.accepted&&/보장기간/.test(olderRefusal.reason),'older players can insist on more security than clubs offer');
// Same-day reviews are idempotent; refusal consumes no money and does not exercise FA.
vm.runInContext(`candidate.age=40;candidate.faPreferences={money:1,security:1,playingTime:1,contention:1,loyalty:1};
 state.faMarket=[{...baseRecord}];const beforeBudgets=state.teams.map(t=>t.budget);
 negotiateFaContract(candidate,state.faMarket[0]);`,context);
let state=vm.runInContext('state',context),market=state.faMarket[0];
assert.equal(p.level,'FA대기');assert.equal(p.faService.faUses,0);
assert.equal(p.careerStats.hits,1200);assert.equal(market.lastOutcome,'선수 제안 거절');
assert.ok(market.negotiationHistory[0].offers.length>0,'refusal is distinct from no club offer');
const marketHtml=vm.runInContext('faMarketPanel()',context);
assert.ok(marketHtml.includes('선수 제안 거절')&&marketHtml.includes(market.lastReason),'FA screen shows the actual refusal reason');
assert.deepEqual(Array.from(state.teams,t=>t.budget),Array.from(vm.runInContext('beforeBudgets',context)));
vm.runInContext('negotiateFaContract(candidate,state.faMarket[0])',context);
assert.equal(market.negotiationRounds,1);assert.equal(market.negotiationHistory.length,1);
const initialAsk=market.negotiationHistory[0].offers[0].askingAnnual;
vm.runInContext('state.day+=14;negotiateFaContract(candidate,state.faMarket[0])',context);
assert.equal(market.negotiationRounds,2);
assert.ok(market.negotiationHistory[1].offers[0].askingAnnual<initialAsk,'waiting changes player expectations without forcing agreement');
// No affordable offer remains a distinct state, not a fabricated rejection.
vm.runInContext('state.day+=14;for(const t of state.teams)t.budget=0;negotiateFaContract(candidate,state.faMarket[0])',context);
assert.equal(market.lastOutcome,'구단 제안 없음');assert.equal(p.faService.faUses,0);
// A previously signed four-year contract is not rewritten by the new model.
vm.runInContext(`candidate.level='1군';candidate.salary=1500000000;candidate.profile.contractYears=3;
 candidate.profile.faContract={signedYear:2026,startYear:2027,endYear:2030,years:4,annualSalary:1500000000,signingBonus:1980000000,totalValue:7980000000};
 const guaranteed=JSON.stringify(candidate.profile.faContract);
 negotiateFaContract(candidate,{...baseRecord});`,context);
assert.equal(JSON.stringify(p.profile.faContract),vm.runInContext('guaranteed',context));assert.equal(p.salary,1500000000);
// Prior-year unsigned FAs can negotiate in the following regular season, with a current-season start.
vm.runInContext(`state.year=2028;state.day=98;state.postseasons={};candidate.level='FA대기';candidate.profile.contractYears=0;
 state.faMarket=[{...baseRecord}];for(const t of state.teams)t.budget=20000000000;
 candidate.salary=33000000;state.faMarket[0].previousSalary=33000000;candidate.faPreferences={money:0,security:0,playingTime:0,contention:0,loyalty:0};
 awardsFinished=()=>false;for(let i=0;i<6&&!state.faMarket[0].signedYear;i++){state.day=98+i*14;reviewUnsignedFaMarket();}`,context);
assert.ok(state.faMarket[0].signedYear,'previous-season FA can actually accept an affordable offer');
assert.equal(p.profile.faContract.startYear,2028,'in-season signing begins this season');
assert.equal(p.faService.faUses,1,'FA use increases on signing only');
const signedHistory=p.profile.faContractHistory.length;
vm.runInContext('reviewUnsignedFaMarket()',context);assert.equal(p.profile.faContractHistory.length,signedHistory);
console.log('FA negotiation: evidence-based terms, five refusal factors, waiting, no offer, guarantees and spring signing PASS');
console.log('Identical-performance age comparison:',JSON.stringify(ageReport));
