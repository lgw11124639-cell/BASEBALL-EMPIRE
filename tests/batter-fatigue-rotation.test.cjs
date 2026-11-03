const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);state.day=100;const fatigueC=state.players.find(p=>p.teamId===0&&p.position==='C'),fatigueRF=state.players.find(p=>p.teamId===0&&p.position==='RF');const cClub={teamId:0,gameDay:100,plan:{lineupPositions:new Map([[fatigueC.id,'C'],[fatigueRF.id,'RF']])}};
for(let day=100;day<106;day++){state.day=day;cClub.gameDay=day;recoverBatterFatigue(fatigueC);recoverBatterFatigue(fatigueRF);recordPlayerExperience(fatigueC,'batting',4,cClub);recordPlayerExperience(fatigueC,'defense',27,cClub);recordPlayerExperience(fatigueRF,'batting',4,cClub);recordPlayerExperience(fatigueRF,'defense',27,cClub)}
const catcherFatigue=playerBaseball(fatigueC).fatigue,outfielderFatigue=playerBaseball(fatigueRF).fatigue;`);
assert.ok(run('catcherFatigue')>25,'six full games accumulate real fatigue');assert.ok(run('catcherFatigue>outfielderFatigue'),'catching imposes higher workload');
run(`state.day=106;recoverBatterFatigue(fatigueC);state.day=107;const beforeFullRest=playerBaseball(fatigueC).fatigue;recoverBatterFatigue(fatigueC);const afterFullRest=playerBaseball(fatigueC).fatigue;recoverBatterFatigue(fatigueC);`);
assert.ok(run('beforeFullRest-afterFullRest')>10,'a day without an appearance gives meaningful recovery');assert.equal(run('playerBaseball(fatigueC).fatigue'),run('afterFullRest'),'recovery cannot be applied twice on one date');
run(`const priorRF=playerBaseball(fatigueRF).fatigue;const oldClub={...cClub,gameDay:50};recordPlayerExperience(fatigueRF,'defense',27,oldClub);`);assert.equal(run('playerBaseball(fatigueRF).fatigue'),run('priorRF'),'historical backfill does not create current fatigue');
run(`state=world(0);state.day=120;const tiredC=state.players.find(p=>p.teamId===0&&p.level==='1군'&&p.position==='C'),reserveC=state.players.find(p=>p.teamId===0&&p.id!==tiredC.id&&p.position==='C');reserveC.level='1군';for(const p of [tiredC,reserveC]){const x=ensureProfile(p);for(const key of ['contact','power','eye','speed','fielding','arm'])x.skills[key]=65;}playerBaseball(tiredC).fatigue=85;playerBaseball(reserveC).fatigue=0;const fatiguePlan=managerPlan(0);`);
assert.equal(run("fatiguePlan.lineupPositions.get(reserveC.id)"),'C','fresh qualified reserve starts at catcher');assert.notEqual(run("fatiguePlan.lineupPositions.get(tiredC.id)"),'C','tired starter is rested or moved to DH');
run(`state=world(0);state.day=200;const restedBatter=state.players.find(p=>p.position==='C');const restedProfile=playerBaseball(restedBatter),restedBefore=JSON.stringify(restedProfile);recoverBatterFatigue(restedBatter);`);
assert.equal(run('JSON.stringify(restedProfile)'),run('restedBefore'),'zero-fatigue players do not create daily save changes');
run(`const restedClub={teamId:0,gameDay:200};recordPlayerExperience(restedBatter,'batting',4,restedClub);const sameDayWorkFatigue=restedProfile.fatigue;recoverBatterFatigue(restedBatter);`);
assert.equal(run('restedProfile.fatigue'),run('sameDayWorkFatigue'),'zero-fatigue recovery pass cannot run again after same-day work');
console.log('PASS real batting/defensive workload, catcher burden, daily/full rest, historical isolation and qualified fatigue rotation');
// Training consumes the same fatigue pool as games, once per actual calendar day.
run(`state=world(0);state.day=140;const trainingBatter=state.players.find(p=>p.position==='CF');trainingBatter.age=27;const tb=playerBaseball(trainingBatter);tb.fatigue=0;const normalTraining=recordBatterTrainingFatigue(trainingBatter,1.8),trainingAdded=tb.fatigue;recordBatterTrainingFatigue(trainingBatter,1.8);`);
assert.ok(run('trainingAdded')>2,'full offseason training consumes physical energy');
assert.equal(run('tb.fatigue'),run('trainingAdded'),'repeat training evaluation cannot charge fatigue twice');
run(`state.day++;tb.fatigue=65;const reducedTraining=recordBatterTrainingFatigue(trainingBatter,1.8);`);
assert.ok(run('reducedTraining<normalTraining*.5'),'fatigued hitters automatically reduce actual training load');
run(`state.day++;trainingBatter.profile.injury={days:10};const rehabFatigue=tb.fatigue;const rehabTraining=recordBatterTrainingFatigue(trainingBatter,1.8);`);
assert.equal(run('rehabTraining'),0,'injured hitters do not perform ordinary physical training');
assert.equal(run('tb.fatigue'),run('rehabFatigue'),'rehabilitation is not charged ordinary training fatigue');
// Equal qualified players must rotate after actual game workload, before extreme exhaustion.
run(`state=world(0);state.day=160;const rotationStarter=state.players.find(p=>p.teamId===0&&p.position==='C'),rotationReserve=state.players.find(p=>p.teamId===0&&p.position==='C'&&p.id!==rotationStarter.id);
for(const p of [rotationStarter,rotationReserve]){p.age=27;playerBaseball(p).fatigue=0;for(const key of ['contact','power','eye','speed','fielding','arm'])ensureProfile(p).skills[key]=65;}
const rotationClub={teamId:0,gameDay:160,plan:{lineupPositions:new Map([[rotationStarter.id,'C']])}};
for(let day=160;day<164;day++){state.day=day;rotationClub.gameDay=day;recoverBatterFatigue(rotationStarter);recordBatterTrainingFatigue(rotationStarter,.65);recordBatterFatigue(rotationStarter,'batting',4,rotationClub);recordBatterFatigue(rotationStarter,'defense',27,rotationClub);}
const rotationPool=state.players.filter(p=>p.teamId===0&&p.position!=='P'&&!p.retired&&!p.draftPending);const rotated=chooseBattingNine(rotationPool,'우투',p=>p.id===rotationStarter.id||p.id===rotationReserve.id?90:60);`);
assert.equal(run('rotated.length'),9,'rotation uses a complete nine-player lineup');
assert.equal(run("rotated.assignedPositions.get(rotationReserve.id)"),'C','four consecutive full catching games trigger qualified reserve selection');
assert.ok(run('playerBaseball(rotationStarter).fatigue')<85,'rotation starts before extreme exhaustion');
console.log('PASS training workload, daily idempotency, managed training, rehab isolation and workload-driven rotation');
