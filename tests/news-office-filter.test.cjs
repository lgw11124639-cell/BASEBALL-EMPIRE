const assert=require('node:assert/strict'),vm=require('node:vm'),c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);state.day=10;state.clubNotices=[];state.clubTransactionArchive={};
const item=(id,kind,extra={})=>({id,kind,year:2027,day:9,title:kind+' 기사',body:'보존된 기사 본문',players:[],teams:[0],...extra});
state.clubNotices=['KPBL 인사','KPBL 정책','KPBL 공인구','KPBL 선수협회','KPBL 징계'].map((kind,i)=>item(i+1,kind));
state.clubNotices.push(item(6,'운영 공지',{kpbl:true}),item(20,'트레이드'),item(21,'감독 교체'),item(22,'국가대표 기사'),item(23,'프런트 보고'),item(24,'KPBL 정책',{year:2026}));
state.clubTransactionArchive[2027]=[structuredClone(state.clubNotices[0]),item(7,'KPBL 정책')];
state.gameResults=[{year:2027,day:9,away:0,home:1,awayRuns:3,homeRuns:2,awayBatters:[],homeBatters:[],awayPitchers:[],homePitchers:[],awayInnings:[0,0,0,3,0,0,0,0,0],homeInnings:[0,0,0,0,0,0,2,0,0],broadcastEvents:[]}];
const original=JSON.stringify(state);`);
const ids=()=>Array.from(run('newsHub()').matchAll(/data-club-notice="([^"]+)"/g),m=>m[1]).sort();
assert.deepEqual(ids(),['1','2','3','4','5','6','7']);assert.match(run('newsHub()'),/data-news-category="office" class="active">사무국/);assert.doesNotMatch(run('newsHub()'),/data-news-category="all"|data-game-article-day/);
run("window.beNewsCategory='all'");assert.deepEqual(ids(),['1','2','3','4','5','6','7'],'old selected all tab resolves to office');
for(const [category,expected] of [['transfer',['20']],['club',['21']],['national',['22']]]){run(`window.beNewsCategory='${category}'`);assert.deepEqual(ids(),expected)}
run("window.beNewsCategory='game'");assert.match(run('newsHub()'),/data-game-article-day="9"/);assert.deepEqual(ids(),[]);
assert.equal(run('JSON.stringify(state)'),run('original'),'filtering never changes saved articles');
run("state.clubNotices=[];state.clubTransactionArchive={};window.beNewsCategory='office'");assert.match(run('newsHub()'),/사무국 관련 기사가 없습니다/);
console.log('PASS office-only default and legacy selection, five office categories, archived deduplication, other filters, empty state and read-only rendering');
