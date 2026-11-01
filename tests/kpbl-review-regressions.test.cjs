const assert=require('node:assert/strict');
const vm=require('node:vm');
const context=require('./helpers/game-context.cjs')();
const run=source=>vm.runInContext(source,context);

run(`state=world(0);const balance={avg:.23,era:3,runsPerGame:7,hrPerGame:1};`);
for(const count of ['undefined','NaN','Infinity','719','720.5']){
 assert.equal(run(`kpblSeasonBalance({...balance,games:${count}}).complete`),false,'invalid or incomplete season count '+count);
}
assert.equal(run('kpblSeasonBalance({...balance,games:720}).direction'),1);

// Exercise supplier failure, automatic retest and the actual announcement path.
run(`{
 state=world(0);state.teams.forEach(t=>t.budget=1000000000000);
 const policy=kpblProposePolicy('ball','control','공급 품질 재검토');
 for(let day=2;day<=6;day++){state.day=day;kpblAdvancePolicy(policy)}
 const failed=kpblInspectBall('control',{mass:160,circumference:230,rebound:.99,drag:1.015,grip:1.035});
 const inspect=kpblInspectBall;kpblInspectBall=()=>failed;
 try{state.day=7;kpblAdvancePolicy(policy)}finally{kpblInspectBall=inspect}
 if(policy.status!=='검사 보류')throw Error('failed lot was announced');
 state.day=8;kpblGovernanceDay();
 if(policy.status!=='공고')throw Error('passed retest was not announced');
 const inspection=kpblOffice().inspections.find(i=>i.id===policy.retestInspectionId);
 if(!inspection?.passed||inspection.retestOf!==failed.id)throw Error('retest lost original failed lot');
 if(state.leagueOffice.scheduled[2028].inspectionId!==inspection.id)throw Error('announcement omitted passed retest');
}`);

// Recovery uses the injury episode's own calendar, including older save anchors.
run(`{
 state=world(0);state.seasonStartDate='2027-03-01';state.day=10;
 const p=state.players[0],a=kpblAssociation();
 p.injuryHistory=[{year:2027,day:10,seasonStartDate:state.seasonStartDate,type:'어깨 염좌',days:30,status:'재활 중'}];
 ensureProfile(p).injury={occurredYear:2027,occurredDay:10,type:'어깨 염좌',days:20,historyIndex:0};
 kpblTrackRehabilitation(a);
 if(a.rehabilitation[0].initialDays!==30)throw Error('original injury duration lost');
 state.day=50;Object.assign(p.profile.injury,{days:0,recoveredDay:50});p.medicalReturnDay=50;
 Object.assign(p.injuryHistory[0],{status:'복귀',recoveredYear:2027,recoveredDay:50});
 kpblTrackRehabilitation(a);
 if(a.rehabilitation[0].returnedDate!=='2027-04-19')throw Error('legacy calendar anchor lost');
 if(kpblAssociationPitchLimit(p)!==65)throw Error('recovery-day protection missing');
 state.day=52;if(kpblAssociationPitchLimit(p)!==65)throw Error('three-day recovery protection expired early');
 state.day=53;if(kpblAssociationPitchLimit(p)!==Infinity)throw Error('recovery protection did not expire');
 // A subsequent minor injury cannot borrow the previous major injury's duration.
 state.day=100;p.injuryHistory.push({year:2027,day:100,seasonStartDate:state.seasonStartDate,type:'타박상',days:2,status:'재활 중'});
 p.profile.injury={occurredYear:2027,occurredDay:100,type:'타박상',days:2,historyIndex:1};
 kpblTrackRehabilitation(a);
 state.day=102;Object.assign(p.profile.injury,{days:0,recoveredDay:102});p.medicalReturnDay=102;
 if(kpblAssociationPitchLimit(p)!==Infinity)throw Error('old major injury restricted a new minor injury');
 kpblTrackRehabilitation(a);
 if(a.rehabilitation[0].returnedDay!==50)throw Error('new recovery overwrote an older injury');
 if(a.rehabilitation[1].returnedDay!==102)throw Error('new injury recovery not tracked');
}`);

// A new injury can arrive before the next daily review of the previous recovery.
run(`{
 state=world(0);state.day=10;const p=state.players[0],a=kpblAssociation();
 p.injuryHistory=[{year:2027,day:10,type:'어깨 염좌',days:30,status:'재활 중'}];
 ensureProfile(p).injury={occurredYear:2027,occurredDay:10,type:'어깨 염좌',days:30,historyIndex:0};kpblTrackRehabilitation(a);
 Object.assign(p.injuryHistory[0],{status:'복귀',recoveredYear:2027,recoveredDay:40});
 state.day=41;p.injuryHistory.push({year:2027,day:41,type:'타박상',days:2,status:'재활 중'});
 p.profile.injury={occurredYear:2027,occurredDay:41,type:'타박상',days:2,historyIndex:1};kpblTrackRehabilitation(a);
 if(a.rehabilitation[0].status!=='복귀 확인'||a.rehabilitation[0].returnedDay!==40)throw Error('previous recovery merged into new injury');
 if(a.rehabilitation[1].status!=='재활 중')throw Error('new injury incorrectly closed');
}`);

run(`{
 state=world(0);state.day=340;const p=state.players[0],a=kpblAssociation();
 ensureProfile(p).injury={occurredYear:2027,occurredDay:340,type:'어깨 염좌',days:25};kpblTrackRehabilitation(a);
 state.day=365;Object.assign(p.profile.injury,{days:0,recoveredDay:365,recoveredDate:'2027-12-31'});p.medicalReturnDay=365;kpblTrackRehabilitation(a);
 state.year=2028;state.seasonStartDate='2028-01-01';state.day=1;
 if(kpblAssociationPitchLimit(p)!==65)throw Error('year transition lost recovery protection');
 state.day=3;if(kpblAssociationPitchLimit(p)!==Infinity)throw Error('previous-year recovery protection restarted');
}`);

run(`{
 state=world(0);state.day=10;const p=state.players.find(p=>p.position==='C'),a=kpblAssociation();
 ensureProfile(p).injury={occurredYear:2027,occurredDay:10,type:'어깨 염좌',days:20};kpblTrackRehabilitation(a);
 state.day=30;Object.assign(p.profile.injury,{days:0,recoveredDay:30});p.medicalReturnDay=30;kpblTrackRehabilitation(a);
 if(kpblAssociationPitchLimit(p)!==Infinity)throw Error('pitch limit was applied to a position player');
}`);

// Selection and credit use the same effective date; completed games count once.
run(`{
 state=world(0);state.day=100;const p=state.players[0],g=kpblOffice();
 const c={id:'timing',playerId:p.id,teamId:p.teamId,scope:'domestic',status:'확정',remaining:2,finalYear:2027,finalDay:100,reason:'확정된 출장정지',steps:[{year:2027,day:100,stage:'확정',text:'출장정지 확정'}]};g.cases.push(c);
 if(kpblSuspended(p)||kpblSuspensionRoster('regular').length)throw Error('penalty applied on finalization day');
 if(!managerPlan(0).first.some(x=>x.id===p.id))throw Error('finalization-day roster already excluded player');
 state.day=101;
 if(!kpblSuspended(p)||kpblSuspensionRoster('regular').length!==1)throw Error('selection and service start dates disagree');
 if(managerPlan(0).first.some(x=>x.id===p.id))throw Error('effective penalty did not exclude player from roster');
 if(kpblSuspended(p,'international'))throw Error('domestic penalty leaked into international games');
 const game={year:2027,day:101,away:0,home:1,awayInnings:Array(9).fill(0),homeInnings:Array(9).fill(0)};
 const roster=kpblSuspensionRoster('regular');kpblCompleteMatch(game,'regular',roster);kpblCompleteMatch(game,'regular',roster);
 if(c.remaining!==1||c.served.length!==1)throw Error('one completed game credited more than once');
 state.day=102;kpblCompleteMatch({...game,day:102},'regular',kpblSuspensionRoster('regular'));
 if(c.remaining!==0||c.status!=='복귀'||kpblSuspended(p))throw Error('player not restored after exact penalty');
 const next={...c,id:'carry-over',status:'확정',remaining:1,finalYear:2027,finalDay:365};g.cases.push(next);
 state.year=2028;state.day=1;
 if(!kpblSuspended(p)||kpblSuspensionRoster('regular').length!==1)throw Error('penalty did not carry across seasons');
 p.level='2군';if(kpblSuspensionRoster('regular').length||kpblSuspensionRoster('minor').length!==1)throw Error('service ignored registered level');
}`);

console.log('PASS finite completed-season evidence, ball retest announcement, injury episode/calendar isolation, and matching suspension selection/service timing');
