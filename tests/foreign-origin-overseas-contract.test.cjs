const assert=require('node:assert/strict'),vm=require('node:vm');
const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);const p=state.players.find(p=>p.position==='P');p.foreignPlayer=true;p.asianQuota=true;p.nationality='AUS';p.highSchool='전주고';const before=JSON.stringify(p);`);
const text=run('JSON.stringify(playerCareerOrigin(p))');
assert.ok(text.includes('아시아쿼터 영입'));
assert.ok(!text.includes('전주고')&&!text.includes('리그 창설 멤버'));
assert.equal(run('JSON.stringify(p)'),run('before'));
for(const league of ['MLB','NPB']){
 run(`const terms${league}=createOverseasContractTerms(p,'${league}','Club',2047,3)`);
 assert.equal(run(`terms${league}.totalValue`),run(`terms${league}.annualSalary*3+terms${league}.signingBonus`));
 assert.equal(run(`JSON.stringify(terms${league})`),run(`JSON.stringify(createOverseasContractTerms(p,'${league}','Club',2047,3))`));
}
assert.ok(run("overseasContractPanel({contract:{years:2},league:'NPB',club:'Club'})").includes('미기록'));
console.log('PASS foreign recruitment origin, no fabricated Korean school, actual new contract amounts and missing historical finances');
