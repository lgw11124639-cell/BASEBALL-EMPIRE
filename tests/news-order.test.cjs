const assert=require('node:assert/strict');
const vm=require('node:vm');
const gameContext=require('./helpers/game-context.cjs');
const c=gameContext();
vm.runInContext(`state=world(0);state.year=2039;state.day=314;state.clubNotices=[];state.clubTransactionArchive={};state.clubNoticeSeq=0;
clubNotice('해외 진출','관심 보도','관심',[0],[1]);
clubNotice('해외 진출','협상 개시','협상',[0],[1]);
clubNotice('해외 진출','협상 결렬','결과',[0],[1]);
clubNotice('FA 보상','이적 보상','보상',[0,1],[2]);
clubNotice('FA 계약','계약 합의','계약',[0,1],[2]);
clubNotice('FA 협상','이전 협상','이전',[0],[3]);
clubNotice('FA 협상','최신 협상','최신',[0],[3]);
state.day++;clubNotice('지도자 재계약','다음 날 소식','재계약',[0],[]);
// Legacy saves can restore the active list and archive in different orders.
state.clubTransactionArchive[2039].reverse();state.clubNotices.reverse();
`,c);
const before=vm.runInContext('JSON.stringify(state)',c);
function titles(){return Array.from(vm.runInContext('newsHub()',c).matchAll(/data-club-notice="[^"]+"><span><small>[^<]*<\/small><strong>([^<]*)<\/strong>/g),m=>m[1]);}
assert.deepEqual(titles(),['다음 날 소식','최신 협상','계약 합의','이적 보상','협상 결렬','협상 개시','관심 보도']);
assert.equal(vm.runInContext('JSON.stringify(state)',c),before,'rendering preserves saved notices');
vm.runInContext("window.beNewsCategory='transfer'",c);
assert.deepEqual(titles(),['최신 협상','계약 합의','이적 보상','협상 결렬','협상 개시','관심 보도']);
vm.runInContext("window.beNewsCategory='club';window.beNewsClub='0'",c);
assert.deepEqual(titles(),['다음 날 소식']);
console.log('PASS: latest-first same-day overseas/FA chronology, archive order/deduplication, filters and read-only rendering');
