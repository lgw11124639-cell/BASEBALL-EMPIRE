// Run the actual season snapshot function and verify no duplicate/lost yearly archives.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function saveSeasonSnapshot(){');
const end=source.indexOf('function postseasonPanel()',start);
assert.ok(start>=0&&end>start,'snapshot function found');
const player={id:1,name:'Sample',teamId:0,position:'OF',joinYear:2025,atBats:200,hits:80,homeRuns:12};
const state={year:2026,day:350,players:[player],teams:[{id:0,city:'Test',name:'Club',wins:80,losses:60,draws:4}],gameResults:[],history:{seasons:{}},postseasons:{2026:{finished:true},2027:{finished:true}}};
let snapshotCalls=0;
const context=vm.createContext({
 state,Number,Map,Set,Object,
 awardsFinished:()=>true,
 gameMilestoneEntries:()=>[],
 seasonTeamHonorStats:()=>({}),
 currentSeasonBoxStats:p=>{snapshotCalls++;return {games:100,atBats:p.atBats,hits:p.hits,homeRuns:p.homeRuns}},
});
vm.runInContext(source.slice(start,end),context);
const snapshot=()=>vm.runInContext('saveSeasonSnapshot()',context);
snapshot();
assert.equal(state.history.seasons[2026].complete,true,'2026 completed');
assert.equal(state.history.seasons[2026].players[0].hits,80,'2026 hits');
assert.equal(state.history.seasons[2026].players[0].homeRuns,12,'2026 home runs');
snapshot();
assert.equal(snapshotCalls,1,'completed year cannot be duplicated or recalculated');
state.year=2027;state.day=350;player.hits=110;player.homeRuns=19;
snapshot();
assert.equal(state.history.seasons[2027].players[0].hits,110,'2027 hits');
assert.equal(state.history.seasons[2027].players[0].homeRuns,19,'2027 home runs');
assert.equal(state.history.seasons[2026].players[0].hits,80,'2026 history unchanged');
assert.equal(Object.keys(state.history.seasons).length,2,'two unique years archived');
snapshot();
assert.equal(snapshotCalls,2,'no repeat archive calculation for 2027');
console.log('Season snapshot isolation and deduplication: PASS');
