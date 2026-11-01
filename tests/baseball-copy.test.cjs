const assert = require('node:assert/strict');
const vm = require('node:vm');
const context = require('./helpers/game-context.cjs')();
const run = source => vm.runInContext(source, context);

run(`
 state = world(0);
 const archivedNotice = {
  kind: '스카우트 보고', title: 'AI 프런트가 전한 선수 관찰 보고', players: [],
  body: '감독 AI는 최근 기록을 검토합니다.\\n\\n대상 선수 상세 기록은 남아 있지 않습니다.\\n\\n미확정 미래 일정은 가상 연장입니다.\\n\\n부정 청탁 의혹 조사 · 조사 개시는 위반 확정을 뜻하지 않음'
 };
 const noticeBefore = JSON.stringify(archivedNotice);
 const article = beArticleSource({title: archivedNotice.title, body: publicNoticeBody(archivedNotice)});
 const articleFromParagraphs = beArticleSource({paragraphs: [archivedNotice.body]});
`);
assert.match(run('article.title'), /구단 프런트가/);
assert.match(run('article.paragraphs[0]'), /감독은 최근 기록/);
assert.match(run('articleFromParagraphs.paragraphs[0]'), /잠정 일정이며 변경될 수 있습니다/);
assert.ok(run('article.paragraphs.includes("대상 선수 상세 기록은 남아 있지 않습니다.")'));
assert.ok(run('article.paragraphs.includes("부정 청탁 의혹 조사 · 조사 개시는 위반 확정을 뜻하지 않음")'));
assert.equal(run('JSON.stringify(archivedNotice)'), run('noticeBefore'), 'displaying archived copy never rewrites the notice');
assert.equal(run('beBaseballCopy(articleFromParagraphs.paragraphs[0])'), run('articleFromParagraphs.paragraphs[0]'), 'repeat article rendering does not change already normalized prose');

run(`
 const archivedReport = {kind: '육성 보고', year: 2043, players: [], body:
  '【훈련 운영 개요】 감독 AI는 최근 기록을 검토합니다.\\n\\n' +
  '【월간 육성 총괄】 2043년 2월 · 성장 3명(건) · 기량 저하 1명(건) · 변동 선수 1명.\\n\\n' +
  '【선수별 월간 변동】 보존 선수 (2군 · RF · 21세): 성장 3회, 기량 저하 1회'};
 const reportBefore = JSON.stringify(archivedReport);
 const reportModel = trainingReportModel(archivedReport);
 const reportHtml = trainingReportSections(archivedReport);
`);
assert.equal(run('reportModel.growth'), 3);
assert.equal(run('reportModel.decline'), 1);
assert.equal(run('reportModel.rows[0].growth'), 3);
assert.match(run('reportHtml.split(\'<details class="report-original">\')[0]'), /감독은 최근 기록/);
assert.match(run('reportHtml.split(\'<details class="report-original">\')[1]'), /감독 AI는 최근 기록/);
assert.equal(run('JSON.stringify(archivedReport)'), run('reportBefore'), 'report parsing and preserved original remain unchanged');
console.log('PASS natural article copy, immutable archives, provisional wording, missing records, and preserved training report originals');
