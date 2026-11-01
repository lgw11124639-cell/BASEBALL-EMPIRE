const assert=require('node:assert/strict');
const vm=require('node:vm');
const context=require('./helpers/game-context.cjs')();
vm.runInContext(`state=world(0);state.year=2039;state.day=314;state.clubNotices=[];state.clubTransactionArchive={};state.clubNoticeSeq=0;window.beNewsCategory='transfer';
for(let club=0;club<10;club++)for(let i=0;i<5;i++){
 const player=state.players.filter(p=>p.teamId===club)[i];
 clubNotice('방출',player.name+' 보류선수 제외','방출 사유 '+club+'-'+i,[club],[player.id]);
}
`,context);
const before=vm.runInContext('JSON.stringify(state)',context);
const run=code=>vm.runInContext(code,context);
assert.equal(run('groupReleaseNews(state.clubNotices).length'),10);
assert.equal(run('groupReleaseNews([...state.clubNotices,...state.clubTransactionArchive[2039]]).length'),10,'archive copies do not inflate groups');
const html=run('newsHub()');
assert.equal((html.match(/data-club-notice="release:/g)||[]).length,10,'group before list cap');
assert.match(html,/방출 선수 발표 · 5명/);
assert.equal((run('clubNewsPanel()').match(/data-club-notice="release:/g)||[]).length,10);
assert.equal((run('allClubsLeagueNews()').match(/data-club-notice="release:/g)||[]).length,10);
const article=run('releaseGroupArticle(groupReleaseNews(state.clubNotices)[0])');
assert.equal((article.match(/data-notice-player=/g)||[]).length,5);
for(let i=0;i<5;i++)assert.ok(article.includes('방출 사유 0-'+i));
run("window.beNewsCategory='transfer'");
assert.equal((run('newsHub()').match(/data-club-notice="release:/g)||[]).length,10,'release groups appear in transfer category');
run("window.beNewsCategory='office'");
assert.equal(run('JSON.stringify(state)'),before,'rendering leaves saves and archive intact');
run("state.day++;clubNotice('방출','다음 날 방출','다른 날짜',[0],[state.players[0].id]);clubNotice('영입','영입 발표','영입',[0],[state.players[1].id])");
assert.equal(run('groupReleaseNews(state.clubNotices).length'),12,'different dates and other transactions remain separate');
console.log('PASS: club/day release grouping, archive deduplication, reasons, profile links, filters and immutable rendering');
