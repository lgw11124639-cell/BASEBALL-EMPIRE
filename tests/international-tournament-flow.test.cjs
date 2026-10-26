// Execute the real tournament-day controller with stubbed match results.
// Run: node tests/international-tournament-flow.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function nationalTeamTournamentDay(){');
const end=source.indexOf('function nationalTeamReturnDay()',start);
assert.ok(start>=0&&end>start,'tournament controller exists');
const groups=[['KR','JP','TW'],['US','AU','DO']];
const notices=[];
const players=[{id:1,name:'대표 선수',teamId:0,position:'P',nationalDutyUntil:'2028-08-18',nationalTeamHistory:[{year:2028,event:'올림픽',games:0,result:'대회 진행 중'}]}];
const record={year:2028,event:'올림픽',finished:false,players:['1'],start:'2028-08-01',end:'2028-08-18',matchResults:[],otherMatches:[],groups};
const state={day:0,players,teams:[{id:0}],nationalTeamResults:{'2028-올림픽':record}};
let current=new Date(2028,7,1,12);
const context=vm.createContext({
 state,seasonDate:()=>current,Date,Math,Map,Set,String,Number,
 internationalGroupStandings:(r,i)=>r.groups[i].map(code=>({code})),
 internationalRivalResult:(year,event,round,home,away)=>({round,home,away,winner:home,homeRuns:4,awayRuns:1}),
 internationalOpeningGame:(year,event,roster,opponent)=>({homeRuns:3,awayRuns:1,opponent,homeBatters:[],homePitchers:[]}),
 playerBaseball:()=>({fatigue:0}),
 clubNotice:(...args)=>notices.push(args),
 awardNationalTeamServicePoints:()=>{},
});
vm.runInContext(source.slice(start,end),context);
for(let day=1;day<=20;day++){
 current=new Date(2028,7,day,12);
 state.day=day;
 vm.runInContext('nationalTeamTournamentDay()',context);
 const count=record.matchResults.length+record.otherMatches.length;
 vm.runInContext('nationalTeamTournamentDay()',context);
 assert.equal(record.matchResults.length+record.otherMatches.length,count,'idempotent on day '+day);
 if(record.finished)break;
}
assert.equal(record.finished,true,'tournament finishes');
assert.equal(record.finalStandings.length,4,'final standings');
assert.equal(record.medals.gold,record.finalStandings[0],'medal order');
assert.equal(new Set(record.matchResults.map(g=>g.round)).size,record.matchResults.length,'no duplicated Korean games');
assert.equal(new Set(record.otherMatches.map(g=>g.round+g.home+g.away)).size,record.otherMatches.length,'no duplicated other games');
assert.equal(players[0].nationalDutyUntil,record.end,'release date matches final');
assert.equal(players[0].nationalTeamHistory[0].result,record.medal,'career history finalized');
console.log('International tournament full progression: PASS');
