const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function runOffseasonContracts(){');
const end=source.indexOf('function ',start+30);
assert.ok(start>=0&&end>start);
const player={id:7,name:'Free Agent',age:29,position:'OF',teamId:0,level:'1군',overall:85,salary:40000000,profile:{contractYears:1},faService:{creditedSeasons:8,carryDays:0,faUses:0},careerStats:{hits:800},faApplicationDecisions:{2026:true}};
const state={year:2026,day:350,teamId:0,players:[player],teams:[{id:0,name:'Old',budget:10000000},{id:1,name:'New',budget:900000000}],postseasons:{2026:{finished:true}},history:{seasons:{2026:{complete:true,players:[{id:7,hits:100}]}}}};
const ledger=[];
const context=vm.createContext({state,Math,Number,Map,Set,
 seasonDate:day=>{const d=new Date('2026-01-01T12:00:00');d.setDate(d.getDate()+day-1);return d},
 awardsFinished:()=>true,snapshotOverseasInterest:()=>{},processOverseasPosting:()=>{},resolveOverseasNegotiations:()=>{},saveSeasonSnapshot:()=>{},renewStaffContracts:()=>{},hireRetiredCoaches:()=>{},
 rng:()=>()=>0.1,ensureProfile:p=>p.profile,creditFaSeason:()=>{},
 faServiceStatus:p=>({eligible:true,record:p.faService}),
 bePlayerEvaluation:()=>85,
 faCompensationGrade:()=> 'B',
 financeTeam:id=>state.teams[id],
 financeEntry:(id,amount,kind)=>{if(state.teams[id].budget+amount<0)return false;state.teams[id].budget+=amount;ledger.push({id,amount,kind});return true},
 faCompensationTransfer:(p,from,to,grade,salary)=>{const amount=salary*2;state.teams[to].budget-=amount;state.teams[from].budget+=amount;state.faCompensations=[{from,to,grade,amount}];return true},
 publishMajorFaArticle:()=>{},honorRetiredPlayers:()=>{},publishReserveRoster:()=>{},clubNotice:()=>{},money:x=>String(x),
});
vm.runInContext(source.slice(source.indexOf('function playerRetirementProbability('),source.indexOf('function runOffseasonContracts(')),context);
vm.runInContext(source.slice(start,end),context);
vm.runInContext('runOffseasonContracts()',context);
vm.runInContext('state.day+=22;negotiateFaContract(state.players[0],state.faMarket[0])',context);
assert.equal(player.teamId,1,'FA signs with new club');
assert.equal(player.profile.faContract.previousTeamId,0,'original club in contract');
assert.equal(player.profile.faContract.teamId,1,'destination in contract');
assert.equal(player.teamHistory.length,1,'transfer history appended');
assert.equal(player.teamHistory[0].reason,'FA 이적','transfer reason');
assert.equal(state.freeAgents.length,1,'FA transfer archived');
assert.equal(state.faCompensations[0].amount,80000000,'grade B compensation');
assert.equal(ledger.filter(x=>x.kind==='FA 계약금').length,1,'signing bonus paid once');
assert.equal(player.careerStats.hits,800,'career history preserved');
assert.equal(state.history.seasons[2026].players[0].hits,100,'season archive preserved');
vm.runInContext('runOffseasonContracts()',context);
assert.equal(state.freeAgents.length,1,'no duplicate FA transfer');
assert.equal(ledger.filter(x=>x.kind==='FA 계약금').length,1,'no duplicate signing bonus');
console.log('Real FA offseason transfer and financial settlement: PASS');
