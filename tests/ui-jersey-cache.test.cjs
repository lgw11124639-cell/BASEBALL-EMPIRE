const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8'),start=source.indexOf('const beUiJerseyCache='),end=source.indexOf('function positionName(',start);
assert.ok(start>=0&&end>start);
const fixture={year:2046,day:100,players:Array.from({length:125},(_,id)=>({id,teamId:id<120?0:1,level:id<60?'1군':id<100?'2군':'육성',retired:id===119,jerseyNumber:id%4===0?7:id%5===0?0:null})),history:{retiredNumbers:[{teamId:0,number:7},{teamId:0,number:1},{teamId:1,number:99}]}};
function create(ui){const state=structuredClone(fixture);let scans=0;Object.defineProperty(state.players,'filter',{value:function(...args){scans++;return Array.prototype.filter.apply(this,args)}});const c=vm.createContext({state,window:{beServerGameMode:ui}});vm.runInContext(source.slice(start,end),c);return {state,c,scans:()=>scans,run:id=>{c.player=state.players[id];return vm.runInContext('jerseyNumber(player)',c)}}}
const reference=create(false),cached=create(true);
for(let pass=0;pass<3;pass++)for(let id=0;id<125;id++)assert.equal(cached.run(id),reference.run(id));
assert.equal(cached.scans(),2,'one assignment pass per team, not per sort comparison');assert.ok(reference.scans()>300);
for(const env of [reference,cached]){env.state.day++;env.state.players[3].teamId=1;env.state.players[4].level='은퇴';}
for(let id=0;id<125;id++)assert.equal(cached.run(id),reference.run(id));assert.equal(cached.scans(),4,'new snapshots/dates rebuild team allocations');
console.log('UI jersey cache preserves reserved, duplicate and overflow numbers with one scan per club: PASS');
