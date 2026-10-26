// Regression: player detail must show archived completed seasons, live current season,
// and a career total without overwriting historical stats.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function playerSeasonHistory(p){');
const end=source.indexOf('function ',start+25);
assert.ok(start>=0&&end>start,'player history renderer found');
const p={id:7,name:'Example',joinYear:2026,position:'OF',teamId:0};
const row=(year,hits)=>({year,players:[{id:7,teamId:0,games:100,atBats:400,hits,homeRuns:10}],complete:true});
const state={year:2027,players:[p],teams:[{id:0,name:'Example Club'}],gameResults:[],history:{seasons:{2026:row(2026,101),2027:{...row(2027,75),complete:false}}}};
let calls=0;
let liveHits=88;
const context=vm.createContext({state,Number,Math,Map,Set,Object,
 currentSeasonBoxStats:()=>{calls++;return {id:7,teamId:0,games:100,atBats:400,hits:liveHits,homeRuns:10}},
 hasPlayedFirstTeamSeason:v=>(Number(v.games)||0)>0,
 esc:x=>String(x),baseballIP:x=>String(x),
});
vm.runInContext(source.slice(start,end),context);
const render=()=>vm.runInContext('playerSeasonHistory(state.players[0])',context);
const cells=html=>[...html.matchAll(/<tr[^>]*><th[^>]*>(2026|2027|통산[^<]*)<\/th>(.*?)<\/tr>/g)].map(m=>({year:m[1],html:m[2]}));
let html=render();
assert.equal(calls,1,'live season recalculated once');
assert.deepEqual(cells(html).map(r=>r.year),['2027','2026','통산 · 2시즌'],'year order and career total');
assert.match(cells(html)[0].html,/>88<\/td>/,'live 2027 hits shown');
assert.match(cells(html)[1].html,/>101<\/td>/,'archived 2026 hits shown');
assert.match(cells(html)[2].html,/>189<\/td>/,'career total adds two seasons');
assert.equal(state.history.seasons[2027].players[0].hits,75,'render does not mutate pending archive');
state.history.seasons[2027].complete=true;
liveHits=999;
html=render();
assert.equal(calls,1,'completed current season does not recompute');
assert.match(cells(html)[0].html,/>75<\/td>/,'completed 2027 archive used');
assert.match(cells(html)[1].html,/>101<\/td>/,'completed 2026 archive used');
assert.match(cells(html)[2].html,/>176<\/td>/,'completed career total uses archived seasons');
assert.equal(state.history.seasons[2026].players[0].hits,101,'old archive remains unchanged');
console.log('Player season history and career totals: PASS');
