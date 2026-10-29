// Run: node tests/national-return.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const begin=source.indexOf('function nationalTeamReturnDay(){');
const end=source.indexOf('function countDailyFaRegistration(',begin+10);
assert.ok(begin>=0&&end>begin,'nationalTeamReturnDay boundaries exist');
const notices=[];
const players=[
 {id:1,name:'선수 A',teamId:1,nationalDutyUntil:'2048-08-19',profile:{injury:{days:0}}},
 {id:2,name:'선수 B',teamId:1,nationalDutyUntil:'2048-08-19',profile:{injury:{days:5}}}
];
const context=vm.createContext({state:{day:0,players},seasonDate:()=>new Date('2048-08-19T12:00:00Z'),clubNotice:(...args)=>notices.push(args)});
vm.runInContext(source.slice(begin,end),context);
vm.runInContext('nationalTeamReturnDay()',context);
assert.equal(notices.length,0,'no early return on final day');
context.seasonDate=()=>new Date('2048-08-20T12:00:00Z');
vm.runInContext('nationalTeamReturnDay();nationalTeamReturnDay()',context);
assert.equal(notices.length,1,'return notice grouped once per duty-end date');
assert.equal(players[0].nationalReturnNotified,'2048-08-19','return notification persisted on player');
assert.equal(players[1].nationalReturnNotified,'2048-08-19','injured player return notification persisted');
assert.ok(notices[0][2].includes('각 소속 구단으로 복귀'),'healthy player returned to club');
assert.ok(notices[0][2].includes('5일 잔여'),'injured player cannot immediately play');
console.log('National return day, duplicate notices and injury notice: PASS');
