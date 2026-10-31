const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);leaguePane='history';`);
for(const pane of ['ranking','season','milestones','honors']){c.historyPane=pane;run('window.beHistoryPane=historyPane');assert.ok(run('league()').includes('리그 역사 · 기록실'),'empty archive can open '+pane)}
run(`state.year=2029;state.seasonStartDate='2029-01-01';state.history.seasons={2027:{year:2027,complete:true,teams:state.teams.map(t=>({...t,wins:72,losses:60,draws:12})),players:[{id:13,teamId:0,games:100,atBats:400,hits:120,homeRuns:20}]},2028:{year:2028,complete:true,players:[{id:13,teamId:0,games:110,atBats:420,hits:130,homeRuns:25}]}};const historyBefore=JSON.stringify(state);`);
assert.equal(run('CAREER_LEADER_CATEGORIES.length'),13);
for(const pane of ['ranking','season','milestones','honors']){c.historyPane=pane;run('window.beHistoryPane=historyPane');assert.ok(run('history()').includes('리그 역사 · 기록실'),'partial old archives cannot block '+pane)}
run("window.beHistoryPane='ranking'");for(const metric of run('CAREER_LEADER_CATEGORIES.map(([key,label,type])=>type+\':\'+key)')){c.historyMetric=metric;run('window.beCareerMetric=historyMetric');assert.ok(run('history()').includes('역대 선수 통산 기록 순위'),metric)}
run("window.beHistoryPane='season';window.beHistoryYear='2027'");assert.ok(run('history()').includes('history-standings'));
run("window.beHistoryYear='2028'");assert.ok(run('history()').includes('해당 시즌의 구단 순위 기록이 보존되지 않았습니다.'));
assert.equal(run('JSON.stringify(state)'),run('historyBefore'),'history navigation never modifies saved seasons');
console.log('PASS league history entry, all four panes, thirteen metrics, season switching, partial archives and read-only state');
