const assert=require('node:assert/strict'),vm=require('node:vm'),context=require('./helpers/game-context.cjs')();const run=s=>vm.runInContext(s,context,{timeout:10000});
run(`state=world(0);state.day=347;state.beWatchedCompletedDay=347;state.teams[0].budget=44711304697;state.teams[0].finance={annualTotals:{[state.year]:{income:48062763333,expense:54812583518}},unpaidOperatingCosts:0};`);
assert.equal(run('frontReportHeadlines(state.teams[0]).finance'),'재무 운영 현황 보고');
assert.equal(run('frontReportAmount(44711304697)'),'447.11억원');
const finance=run('frontReportArticle(state.teams[0],"finance")');assert.match(finance,/480\.63억원/);assert.match(finance,/548\.13억원/);assert.match(finance,/67\.5억원/);assert.match(finance,/순유출/);assert.equal((finance.match(/class="front-report-table"/g)||[]).length,1);assert.match(finance,/front-report-chart/);
const camp=run('frontReportArticle(state.teams[0],"camp")');assert.match(camp,/基準|기준 일정/);assert.match(camp,/경과했으나/);assert.doesNotMatch(camp,/에 열린다/);
const plan=run('frontReportArticle(state.teams[0],"plans")');assert.equal((plan.match(/class="front-report-table"/g)||[]).length,2);assert.match(plan,/모두 기준 인원을 충족|기준 인원에 미달/);assert.match(plan,/집행의|지출의 확정/);
const before=run('JSON.stringify(state)');run('frontReportArticle(state.teams[0],"finance")');assert.equal(run('JSON.stringify(state)'),before);
console.log('PASS formal report tables, source totals, readable units, elapsed events and immutable financial rendering');
