const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')();const run=s=>vm.runInContext(s,c);
run(`state=world(0);const third={id:9901,name:'3루 전문',position:'3B',secondaryPositions:['1B'],age:25,teamId:0};`);
assert.equal(run("defensiveFit(third,'3B')"),22);assert.equal(run("defensiveFit(third,'1B')"),12);
for(const pos of ['C','SS','RF'])assert.ok(run(`defensiveFit(third,'${pos}')`)<5,'untrained '+pos+' prohibited');
assert.equal(run('fieldingPositionLabel(third)'),'1루수 · 숙련');
run(`for(let i=0;i<10;i++){const plan=managerPlan(i);if(plan.lineup.length!==9)throw Error('missing lineup');if(plan.lineup.emergencyPositions.size)throw Error('healthy starting roster needs no emergency');for(const p of plan.lineup){const pos=plan.lineupPositions.get(p.id);if(pos!=='DH'&&defensiveFit(p,pos)<5)throw Error('unqualified normal fielding')}}`);
// Offensive ranking alone must not exclude weak-hitting specialist catchers or shortstops.
run(`const pool=['C','C','SS','2B','3B','1B','CF','LF','RF','RF','LF','1B','3B','2B','CF'].map((position,i)=>({id:10000+i,name:'대표'+i,teamId:i%10,age:25,position}));const score=p=>p.position==='C'?1:p.position==='SS'?2:90;const nationalSelected=selectNationalHitters(pool,12,score);const nine=chooseBattingNine(nationalSelected,null,score);`);
assert.equal(run("nationalSelected.filter(p=>defensiveFit(p,'C')>=5).length"),2);
assert.equal(run('nine.emergencyPositions.size'),0);assert.equal(run('new Set(nine.map(p=>p.id)).size'),9);
assert.equal(run("nine.find(p=>nine.assignedPositions.get(p.id)==='C').position"),'C');
run(`const absent=pool.filter(p=>p.position!=='C');const emergency=chooseBattingNine(absent,null,score);`);assert.ok(run("[...emergency.emergencyPositions.values()].includes('C')"),'unavoidable emergency is explicitly recorded');
run(`const alternate={id:99990,name:'부 포수',position:'3B',secondaryPositions:['C'],teamId:0};const club={teamId:0,batters:[alternate],plan:{lineupPositions:new Map([[alternate.id,'C']])},substitutions:[]};`);
assert.equal(run('assignedFieldingPosition(club,alternate)'),'C');assert.equal(run('catcherGameCalling(club,third,state.players[0]).catcher.id'),99990,'actual assigned catcher calls pitches');
run(`const sub={id:99991,name:'교체 포수',position:'C'};club.substitutions=[{from:alternate.id,to:sub.id}];`);assert.equal(run('assignedFieldingPosition(club,sub)'),'C','substitution retains the slot');
console.log('PASS: specialist fielding, declared secondary positions, ten healthy lineups, national reserve catcher, emergency flags and actual assigned catcher');
