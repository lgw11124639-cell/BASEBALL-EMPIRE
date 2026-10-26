const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function careerSeasonRows(p){');
const end=source.indexOf('function careerTable(p)',start);
assert.ok(start>=0&&end>start,'career rows helper exists');
const player={id:7,name:'Example',joinYear:2025,teamId:2,position:'OF'};
const state={year:2027,careerRecords:{7:[{year:2025,teamId:0,games:90,hits:85},{year:2026,teamId:1,games:110,hits:120},{year:2027,teamId:2,games:120,hits:130}]},history:{seasons:{2027:{complete:true}}}};
let calls=0;
const context=vm.createContext({state,Number,Map,Date,
 hasPlayedFirstTeamSeason:r=>Number(r.games)>0,
 currentSeasonBoxStats:()=>{calls++;return {games:140,hits:999}},
});
vm.runInContext(source.slice(start,end),context);
const rows=()=>Array.from(vm.runInContext('careerSeasonRows(player)',vm.createContext({...context,player})));
let result=rows();
assert.deepEqual(result.map(x=>x.year),[2027,2026,2025],'three career seasons in descending order');
assert.deepEqual(result.map(x=>x.teamId),[2,1,0],'historic team identities retained');
assert.deepEqual(result.map(x=>x.hits),[130,120,85],'career seasons remain independent');
assert.equal(calls,0,'completed year does not recompute live statistics');
state.year=2028;state.history.seasons[2028]={complete:false};
result=rows();
assert.equal(calls,1,'live season computed only for active year');
assert.equal(result[0].year,2028,'live year shown first');
assert.equal(result[0].hits,999,'live stats shown for active year');
assert.deepEqual(result.slice(1).map(x=>x.hits),[130,120,85],'previous clubs and years remain unchanged');
console.log('Career season rows after transfers and completed season: PASS');
