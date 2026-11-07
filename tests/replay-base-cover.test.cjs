const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
for(const [position,angle,cover,cutoff]of[['LF',-35,'2B','SS'],['RF',35,'SS','2B'],['CF',0,'SS','2B']]){
 const play={batterId:9,bases:[1,null,null],afterBases:[9,1,null],outcome:'안타',outsBefore:0,outsAfter:0,battedBall:{defenderPosition:position,sprayAngle:angle,launchAngle:18}};
 const d=JSON.parse(run(`JSON.stringify(beBroadcastDefense(${JSON.stringify(play)}))`)),bag=JSON.parse(run('JSON.stringify(beBroadcastBasePoint(2))'));
 const move=d.moves.find(m=>m.position===cover);assert.ok(move,position+' needs a second-base cover');assert.deepEqual(move.points.at(-1),bag);assert.notDeepEqual(d.moves.find(m=>m.position===cutoff).points.at(-1),bag,'cutoff stays distinct from cover');
}
for(const [angle,cover]of[[-20,'2B'],[20,'SS']]){const d=JSON.parse(run(`JSON.stringify(beBroadcastDefense({batterId:9,bases:[1,null,null],afterBases:[null,1,null],outcome:'땅볼 아웃',outsBefore:0,outsAfter:1,battedBall:{defenderPosition:'SS',sprayAngle:${angle},launchAngle:2}}))`));assert.equal(d.moves.find(m=>m.coverBase===2).position,cover)}
const fly=JSON.parse(run(`JSON.stringify(beBroadcastDefense({batterId:9,bases:[1,null,null],afterBases:[1,null,null],outcome:'뜬공 아웃',outsBefore:0,outsAfter:1,battedBall:{defenderPosition:'LF',sprayAngle:-35,launchAngle:35}}))`));assert.equal(fly.moves.find(m=>m.coverBase===2).position,'2B');
console.log('PASS second-base cover is distinct from fielding/cutoff on grounders, outfield hits and fly balls');
