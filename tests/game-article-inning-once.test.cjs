const assert=require('node:assert/strict'),vm=require('node:vm');
const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);const game={year:state.year,day:20,away:0,home:1,awayRuns:4,homeRuns:5,awayInnings:[0,2,0,0,0,0,0,0,2],homeInnings:[0,0,1,0,0,4,0,0,0],awayBatters:[],homeBatters:[],awayPitchers:[],homePitchers:[]};const before=JSON.stringify(game);`);
const html=run('gameArticle(game)');
const copy=html.slice(html.indexOf('editorial-caption'),html.indexOf('article-pitchers'));
// The opening 2-run inning is narrated once, never repeated as another rally.
assert.equal((copy.match(/2회/g)||[]).length,1);
assert.equal(run('JSON.stringify(game)'),run('before'));
console.log('PASS game article never narrates the opening scoring inning twice');
