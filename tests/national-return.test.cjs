// Run: node tests/national-return.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const begin=source.indexOf('function nationalTeamReturnDay(){');
const end=source.indexOf('\nfunction ',begin+10);
assert.ok(begin>=0&&end>begin,'nationalTeamReturnDay exists');
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
assert.equal(notices.length,2,'return notice emitted exactly once per player');
assert.ok(notices[1][2].includes('부상 재활 5일'),'injured player cannot immediately play');
console.log('National return day, duplicate notices and injury notice: PASS');
