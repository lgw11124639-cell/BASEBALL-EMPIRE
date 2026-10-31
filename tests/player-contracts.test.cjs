const assert=require('node:assert/strict');
const vm=require('node:vm');
const gameContext=require('./helpers/game-context.cjs');
function setup(){
 const c=gameContext();
 vm.runInContext(`state=world(0);state.players=[];state.gameResults=[];state.teams=state.teams.slice(0,2);
 state.year=2027;state.day=336;state.seasonStartDate='2027-01-01';state.postseasons={2027:{finished:true}};
 awardsFinished=()=>true;
 snapshotOverseasInterest=processOverseasPosting=resolveOverseasNegotiations=saveSeasonSnapshot=renewStaffContracts=hireRetiredCoaches=honorRetiredPlayers=publishReserveRoster=()=>{};
 playerRetirementProbability=()=>0;`,c);
 return c;
}
const c=setup();
const status=vm.runInContext('playerContractStatus',c);
const player=(profile={},extra={})=>({id:70,name:'계약 검증',teamId:0,level:'1군',salary:100000000,position:'SS',age:28,faService:{creditedSeasons:0,carryDays:0,faUses:0},profile:{contractYears:1,...profile},...extra});
const contract={signedYear:2026,years:1,teamId:0,annualSalary:100000000,signingBonus:50000000,totalValue:150000000};
for(const p of [player({contractYears:5}),player({faContract:contract}),player({}, {foreignPlayer:true,foreignContractYear:2027}),player({contractYears:0},{level:'FA대기'})]){
 const before=JSON.stringify(p);status(p);assert.equal(JSON.stringify(p),before,'contract classification is read-only');
}
assert.equal(status(player({contractYears:5})).type,'annual','legacy random term is not a guaranteed multi-year deal');
assert.equal(status(player({faContract:contract})).type,'fa','one-year FA remains a FA contract');
assert.equal(status(player({faContract:{...contract,signedYear:2020}})).type,'annual','expired FA history is not current');
assert.equal(status(player({faContract:contract},{level:'방출'})).type,'inactive');
assert.equal(status(player({faContract:contract,contractYears:0},{level:'FA대기'})).type,'pending');
assert.equal(status(player({}, {foreignPlayer:true,foreignContractYear:2027,asianQuota:true})).label,'아시아쿼터 1년 계약');
assert.equal(status(player({faContract:{...contract,teamId:1}})).type,'fa','trade carries an unexpired contract');
for(const [p,expected,absent] of [
 [player({contractYears:5}),'매년 연봉협상','현재 잔여 5년'],
 [player({faContract:contract}),'FA 1년 계약','매년 연봉협상'],
 [player({faContract:{...contract,signedYear:2020}}),'일반 연봉계약','FA 계약 이행 중'],
 [player({}, {foreignPlayer:true,foreignContractYear:2027}),'외국인 1년 계약','국내 FA 자격 인정 기간'],
 [player({}, {foreignPlayer:true,asianQuota:true,foreignContractYear:2027}),'아시아쿼터 1년 계약','FA 계약 이력'],
 [player({contractYears:0},{level:'FA대기'}),'FA 미계약','시즌 연봉</small>'],
 ]){
 c.subject=p;
 const html=vm.runInContext('playerContractMoneyPanel(subject)',c);
 assert.ok(html.includes(expected),expected);assert.ok(!html.includes(absent),absent);
}
// Real offseason signing followed by salary negotiations, every guaranteed year, and expiry.
vm.runInContext(`const testPlayer={id:70,name:'FA 계약 검증',teamId:0,level:'1군',position:'SS',age:28,salary:100000000,
 registeredDays:145,games:144,atBats:550,hits:170,homeRuns:25,profile:{contractYears:1},
 faService:{creditedSeasons:7,carryDays:0,faUses:0},faApplicationDecisions:{2027:true},careerStats:{hits:700}};
 ensureProfile(testPlayer);testPlayer.profile.contractYears=1;state.players=[testPlayer];
 state.teams[0].budget=1000000;state.teams[1].budget=10000000000;
 runOffseasonContracts();`,c);
let p=vm.runInContext('testPlayer',c);
assert.equal(p.teamId,1);
assert.ok(p.profile.faContract.years>=2);
assert.equal(p.profile.faContract.startYear,2028);
assert.equal(p.profile.faContract.endYear,2027+p.profile.faContract.years);
const salary=p.salary,original=JSON.stringify(p.profile.faContract),career=JSON.stringify(p.careerStats);
vm.runInContext('annualSalaryNegotiations()',c);assert.equal(p.salary,salary,'new FA salary stays fixed');
const end=p.profile.faContract.endYear;
for(let y=2028;y<end;y++){
 c.testYear=y;
 vm.runInContext('state.year=testYear;state.postseasons[testYear]={finished:true};runOffseasonContracts();annualSalaryNegotiations()',c);
 assert.equal(p.salary,salary,'guaranteed salary stays fixed, including last year');
 assert.equal(p.profile.contractYears,end-y);
 assert.equal(status(p).type,'fa');
}
c.testYear=end;
vm.runInContext('state.year=testYear;state.postseasons[testYear]={finished:true};testPlayer.faService.creditedSeasons=0;runOffseasonContracts();annualSalaryNegotiations()',c);
assert.equal(status(p).type,'annual','expired contract returns to annual negotiation');
assert.equal(JSON.stringify(p.profile.faContract),original,'historical terms are preserved');
assert.equal(JSON.stringify(p.careerStats),career,'career stats are preserved');
assert.ok(vm.runInContext('state.salaryNegotiations[state.year].some(x=>x.playerId===70)',c));
// A foreign deal, an unsigned FA, and a released player must never get an annual salary change.
const other=setup();
vm.runInContext(`state.players=[
 {id:1,name:'외국인',teamId:0,level:'1군',position:'P',age:28,salary:900000000,foreignPlayer:true,foreignContractYear:2028,profile:{contractYears:1}},
 {id:2,name:'미계약 FA',teamId:0,level:'FA대기',position:'SS',age:28,salary:100000000,profile:{contractYears:0},faService:{creditedSeasons:8,carryDays:0,faUses:0},faApplicationDecisions:{2027:false}},
 {id:3,name:'방출',teamId:0,level:'계약종료',position:'SS',age:28,salary:100000000,profile:{contractYears:0}},
 {id:4,name:'FA 미신청',teamId:0,level:'1군',position:'SS',age:28,salary:100000000,profile:{contractYears:1},faService:{creditedSeasons:8,carryDays:0,faUses:0},faApplicationDecisions:{2027:false}},
 {id:5,name:'일반 연봉',teamId:0,level:'1군',position:'SS',age:28,salary:100000000,profile:{contractYears:5}}
 ];for(const p of state.players)ensureProfile(p);
 runOffseasonContracts();const afterOffseason=state.players.map(p=>p.salary);annualSalaryNegotiations();`,other);
const others=vm.runInContext('state.players',other),saved=vm.runInContext('afterOffseason',other);
for(let i=0;i<4;i++)assert.equal(others[i].salary,saved[i],'foreign/unsigned/released/declined-FA not renegotiated again');
assert.equal(others[1].level,'FA대기','pending FA is not automatically renewed by original club');
assert.equal(others[1].profile.contractYears,0);
assert.ok(vm.runInContext('state.salaryNegotiations[2027].some(x=>x.playerId===5)',other),'ordinary legacy term no longer blocks annual negotiation');
// An already-signed next-season contract must not lose a year in the signing offseason.
const future=setup();
vm.runInContext(`state.players=[{id:9,name:'차기 시즌 FA',teamId:0,level:'1군',position:'SS',age:28,salary:300000000,
 profile:{contractYears:3,faContract:{signedYear:2027,startYear:2028,endYear:2030,years:3,annualSalary:300000000,totalValue:1000000000},
 faContractHistory:[{signedYear:2027,years:3,totalValue:1000000000}],customRecord:{keep:true}},
 faService:{creditedSeasons:0,carryDays:0,faUses:1}}];
 ensureProfile(state.players[0]);runOffseasonContracts();annualSalaryNegotiations();`,future);
const fp=vm.runInContext('state.players[0]',future);
assert.equal(fp.profile.contractYears,3,'future term not consumed before first season');
assert.equal(fp.salary,300000000);
assert.equal(fp.profile.faContractHistory.length,1,'profile skill initialization preserves FA history');
assert.equal(fp.profile.customRecord.keep,true,'unknown legacy profile fields survive initialization');
console.log('Contract types, UI, FA final-year salary, expiry, pending FA, foreign exclusion and history: PASS');
