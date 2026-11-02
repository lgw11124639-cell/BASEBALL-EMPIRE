const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8'),start=source.indexOf('const beUiBoxGameCache='),end=source.indexOf('function seasonPitcherLeaderboard(',start);
assert.ok(start>=0&&end>start);
const context=vm.createContext({window:{beServerGameMode:true},console:{warn(){}},state:{year:2046,day:20,gameResults:[]}});vm.runInContext(source.slice(start,end),context);
const players=[{id:1,name:'Batter',position:'LF',joinYear:2046,firstEligibleDay:4},{id:2,name:'Pitcher',position:'P',joinYear:2045},{id:3,name:'Missing',position:'C'},{id:4,name:'Pending',position:'P',draftPending:true}];
for(let day=1;day<=20;day++)context.state.gameResults.push({year:2046,day,awayBatters:day%2?[{id:1,name:day===5?'Old identity':'Batter',atBats:4,hits:2}]:[{id:9,name:'Other',atBats:4,hits:1}],homeBatters:[],awayPitchers:day%4===0?[{id:'2',name:'Pitcher',innings:6,strikeouts:5,win:true}]:[],homePitchers:[]});
context.state.gameResults.push({year:2045,day:1,awayBatters:[{id:1,name:'Batter',hits:999}]});
function compare(){for(const player of players){context.player=player;const fast=vm.runInContext('currentSeasonBoxStats(player)',context),full=vm.runInContext('currentSeasonBoxStats(player,state.gameResults)',context);assert.deepEqual(JSON.parse(JSON.stringify(fast)),JSON.parse(JSON.stringify(full)));}}
compare();context.player=players[0];assert.ok(vm.runInContext('beUiBoxGames(player).length',context)<context.state.gameResults.length);
context.state.gameResults.push({year:2046,day:21,homeBatters:[{id:1,name:'Batter',atBats:4,hits:4}]});compare();
context.state={...context.state,day:22,gameResults:[{year:2046,day:22,awayPitchers:[{id:2,name:'Pitcher',innings:7,strikeouts:9}]}]};compare();
console.log('UI indexed game stats preserve identity, eligibility, totals and snapshot invalidation: PASS');
