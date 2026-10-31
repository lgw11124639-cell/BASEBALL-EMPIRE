const assert=require('node:assert/strict'),vm=require('node:vm');
const context=require('./helpers/game-context.cjs');
const c=context();const run=code=>vm.runInContext(code,c);
run(`state=world(0);state.year=2039;state.day=314;state.teams=state.teams.slice(0,1);state.players=state.players.filter(p=>p.teamId===0);const t=state.teams[0];t.wins=90;t.losses=54;
 for(const [role,s] of Object.entries(t.staff)){delete s.contractStartYear;s.hiredYear=2027;s.contractEndYear=2039;s.birthYear=1989;s.skill=80;}t.staff.manager.contractEndYear=2041;t.staff.president.contractEndYear=2042;officeAI(0);`);
assert.equal(run('t.staff.manager.contractStartYear'),2040,'infer legacy current renewal term, not entire tenure');
assert.equal(run('t.staff.president.contractStartYear'),2040);
assert.match(run('staffContractSummary(t.staff.manager)'),/^2040~2041년 \(2년 계약\)/);
assert.equal(run('t.staff.manager.hiredYear'),2027,'retain actual tenure');
assert.equal(run('t.staff.manager.age'),50);
const summary=run('staffContractSummary(t.staff.manager)');run('officeAI(0);officeAI(0)');assert.equal(run('t.staff.manager.age'),50,'reads do not age staff');assert.equal(run('staffContractSummary(t.staff.manager)'),summary);
const oldArticle={kind:'지도자 재계약',year:2039,title:'서울 로열스 감독 이정우 재계약',body:'이정우 감독 재계약 · 2027~2041년 · 연봉 79,807만원'};
c.article=oldArticle;assert.match(run('publicNoticeBody(article)'),/2040~2041년/);assert.match(oldArticle.body,/2027~2041년/,'legacy source remains intact');
run(`t.staff.manager.contractEndYear=2039;t.staff.manager.contractStartYear=2038;t.staff.president.contractEndYear=2039;renewStaffContracts();`);
assert.equal(run('t.staff.manager.hiredYear'),2027);assert.equal(run('t.staff.manager.contractStartYear'),2040);assert.equal(run('t.staff.manager.contractEndYear'),2042);assert.equal(run('t.staff.manager.contractHistory.at(-1).startYear'),2040);assert.match(run('state.clubNotices.find(n=>n.title.includes("감독")&&n.kind==="지도자 재계약").body'),/2040~2042년 \(3년 계약\)/);
const count=run('state.clubNotices.length');run('renewStaffContracts()');assert.equal(run('state.clubNotices.length'),count,'renewal is idempotent');
run(`state.year++;advanceStaffCalendar();`);assert.equal(run('t.staff.manager.age'),51);assert.equal(run('t.staff.manager.birthYear'),1989);
// A former player's age follows the retirement year, even years after leaving the player roster.
run(`state.players=[{id:999,name:'은퇴 선수',age:38,position:'P',retired:true}];state.retiredPlayers=[{id:999,year:2037}];const alumni={name:'은퇴 선수',formerPlayerId:999,hiredYear:2040};normalizeStaffMember(alumni,'pitchCoach',0);`);
assert.equal(run('alumni.age'),41);assert.equal(run('alumni.birthYear'),1999);
for(const [roll,kind,reason] of [[0,'감독 자진사퇴','성적 부진 자진사퇴'],[.12,'감독 교체','성적 부진 경질']]){
 const x=context();x.roll=roll;vm.runInContext(`state=world(0);state.year=2027;state.day=168;state.teams=state.teams.slice(0,1);state.players=state.players.filter(p=>p.teamId===0);const t=state.teams[0];t.wins=15;t.losses=50;const m=officeAI(0).manager;m.name='기존 감독';m.birthYear=1977;m.hiredYear=2027;m.hiredDay=1;m.style='안정형';rng=()=>()=>roll;reviewManagerEmployment();`,x);
 const get=code=>vm.runInContext(code,x);
 assert.equal(get('state.clubNotices.at(-1).kind'),kind);assert.equal(get('t.managerHistory.at(-1).reason'),reason);assert.notEqual(get('t.staff.manager.name'),'기존 감독');assert.equal(get('t.staff.manager.hiredDay'),168);assert.equal(get('t.staff.manager.contractStartYear'),2027);assert.equal(get('t.staff.manager.contractEndYear'),2029);assert.ok(get('t.staff.manager.age')>=40);assert.equal(get('state.staffMarket[0].name'),'기존 감독');
 vm.runInContext('reviewManagerEmployment();state.day+=14;reviewManagerEmployment()',x);assert.equal(get('t.managerHistory.length'),1,'duplicate calls and immediate repeated dismissals blocked');
}
const healthy=context();vm.runInContext(`state=world(0);state.day=168;state.teams=state.teams.slice(0,1);const t=state.teams[0];t.wins=45;t.losses=20;rng=()=>()=>0;reviewManagerEmployment();`,healthy);assert.equal(vm.runInContext('(t.managerHistory||[]).length',healthy),0,'healthy team not forced into turnover');
run(`state.year=2040;state.day=200;state.players=[];state.staffMarket=[{name:'경력 감독',skill:88,birthYear:1980,hiredYear:2027,previousTeamId:1,previousRole:'manager',staffId:'experienced-manager',salary:200000000}];replaceClubManager(t,'성적 부진 경질',{games:80});`);
assert.equal(run('t.staff.manager.name'),'경력 감독');assert.equal(run('t.staff.manager.hiredYear'),2040,'market recruit starts a new tenure');assert.equal(run('t.staff.manager.age'),60);assert.equal(run('t.staff.manager.contractStartYear'),2040);
assert.equal(run("staffRoleCompatible('president','manager')"),false,'executives are not hired as field managers');
// Retirement replaces even an unexpired contract, while preserving the departing person's record.
run(`for(const s of Object.values(t.staff))s.birthYear=1990;t.staff.manager.birthYear=1950;t.staff.manager.contractEndYear=2045;t.staff.manager.contractReviewYear=undefined;rng=()=>()=>0;renewStaffContracts();`);
assert.equal(run('state.staffRetirements.at(-1).retiredYear'),2040);assert.equal(run('state.staffRetirements.at(-1).name'),'경력 감독');assert.notEqual(run('t.staff.manager.staffId'),'experienced-manager');assert.ok(run('state.clubNotices.some(n=>n.kind==="지도자 은퇴")'));
run(`state.players=[{id:999,name:'은퇴한 지도자',age:40,position:'P',retired:true}];state.retiredPlayers=[{id:999,year:2037}];state.staffRetirements.push({formerPlayerId:999});const retiredCandidate=retiredStaffCandidate(0,'manager');state.players=[];`);
assert.equal(run('retiredCandidate'),null,'retired staff are not rehired through the former-player pool');
// Actual rollover controller, with external baseball/snapshot engines isolated, exercises staff aging.
run(`awardsFinished=()=>true;simulateOverseasSeason=()=>{};trackExportedPlayerSeasons=()=>{};snapshotInternationalPool=()=>{};saveSeasonSnapshot=()=>{};resolveOverseasContractExpiry=()=>{};registerOverseasTransfers=()=>{};rng=seed=>{let n=seed>>>0;return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296)};`);
for(let i=0;i<30;i++){
 run(`for(const team of state.teams){team.wins=90;team.losses=54}renewStaffContracts();beginNextSeason();`);
 assert.ok(run('Object.values(t.staff).every(s=>s.age===state.year-s.birthYear)'), 'annual age follows birth year');
 assert.ok(run('Object.values(t.staff).every(s=>s.contractEndYear-s.contractStartYear<3)'), 'separate contracts never grow with tenure');
}
console.log('PASS: legacy/current staff contracts, ages, actual 30-year rollover, retirement, dismissal, resignation, hiring and cooldown');
