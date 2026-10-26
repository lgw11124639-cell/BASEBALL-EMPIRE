const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function runOffseasonContracts(){');
const end=source.indexOf('function ',start+30);
assert.ok(start>=0&&end>start,'real offseason contract function found');
const player={id:1,name:'Veteran',age:40,position:'OF',teamId:0,level:'1군',retired:false,salary:40000000,profile:{contractYears:1},careerStats:{hits:1000},teamHistory:[{year:2025,from:1,to:0,reason:'FA 이적'}]};
const state={year:2026,teamId:0,players:[player],teams:[{id:0,name:'Club'}],postseasons:{2026:{finished:true}},history:{seasons:{2026:{complete:true,players:[{id:1,hits:150}]}}},freeAgents:[],retiredPlayers:undefined};
const notices=[];let snapshotCalls=0,faCredits=0;
const context=vm.createContext({state,Math,Number,Map,Set,
 awardsFinished:()=>true,
 snapshotOverseasInterest:()=>{},processOverseasPosting:()=>{},resolveOverseasNegotiations:()=>{},
 saveSeasonSnapshot:()=>snapshotCalls++,renewStaffContracts:()=>{},hireRetiredCoaches:()=>{},
 rng:()=>()=>0,ensureProfile:p=>p.profile,
 creditFaSeason:()=>faCredits++,honorRetiredPlayers:()=>{},publishReserveRoster:()=>{},
 clubNotice:(...args)=>notices.push(args),
});
vm.runInContext(source.slice(start,end),context);
vm.runInContext('runOffseasonContracts()',context);
assert.equal(player.retired,true,'veteran retires');
assert.equal(player.level,'은퇴','retired roster level');
assert.equal(state.retiredPlayers.length,1,'retirement archived');
assert.equal(state.retiredPlayers[0].id,1,'retirement identity');
assert.equal(player.careerStats.hits,1000,'career stats preserved');
assert.equal(player.teamHistory.length,1,'FA team history preserved');
assert.equal(state.history.seasons[2026].players[0].hits,150,'season snapshot preserved');
assert.equal(faCredits,1,'FA service credited once');
vm.runInContext('runOffseasonContracts()',context);
assert.equal(state.retiredPlayers.length,1,'retirement not duplicated');
assert.equal(snapshotCalls,1,'season snapshot invoked once');
assert.equal(faCredits,1,'FA service not double credited');
console.log('Real offseason retirement archival and idempotence: PASS');
