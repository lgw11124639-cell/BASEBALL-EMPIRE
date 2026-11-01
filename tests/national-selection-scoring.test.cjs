const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const begin=source.indexOf('function selectNationalHitters(');
const end=source.indexOf('function recoverClub(',begin);
const selection=source.slice(begin,end);
const players=Array.from({length:40},(_,i)=>({id:i,name:'Test '+i,position:i<5?'P':i%7===0?'C':'LF',form:(i*17)%11}));
function select(code){
 const calls=new Map();
 const score=p=>{calls.set(p,(calls.get(p)||0)+1);return p.form};
 const ctx=vm.createContext({players,score,nationalTeamFormScore:score,defensiveFit:(p,slot)=>p.position===slot?10:0,
  chooseBattingNine:(all,hand,form)=>all.slice().sort((a,b)=>form(b)-form(a)||String(a.id).localeCompare(String(b.id))).slice(0,9)});
 vm.runInContext(code,ctx);
 return {ids:Array.from(vm.runInContext('selectNationalHitters(players,12,score).map(p=>p.id)',ctx)),calls};
}
const cached=select(selection);
const uncached=select(selection.replace(/ const originalScore=score,forms=new Map\(\);\n score=p=>\{[^\n]+\};\n/,''));
assert.deepEqual(cached.ids,uncached.ids,'roster order including catcher reserves remains identical');
assert.ok([...cached.calls.values()].every(n=>n===1),'score evaluated once per hitter');
assert.equal(cached.calls.size,players.filter(p=>p.position!=='P').length);
assert.ok([...uncached.calls.values()].some(n=>n>1),'comparison exercises repeated scoring');
const expr=source.slice(source.indexOf('const available=state.players.filter',source.indexOf('function nationalTeamTournamentDay')),source.indexOf('\n  const fill=',source.indexOf('function nationalTeamTournamentDay'))).replace(/^const available=/,'').replace(/;$/,'');
let calls=0;
const ctx=vm.createContext({state:{players:players.map(p=>({...p,age:25}))},formScore:p=>{calls++;return p.form}});
const actual=Array.from(vm.runInContext(expr,ctx),p=>p.id);
assert.deepEqual(actual,players.slice().sort((a,b)=>b.form-a.form).map(p=>p.id),'available ranking preserves score and tie order');
assert.equal(calls,players.length,'available ranking scores once per candidate');
console.log('National selection scoring and roster parity: PASS');
// Compare the actual box-score aggregation and form formulas, including missing,
// mismatched, duplicate and ineligible identities, with and without the index.
const formStart=source.indexOf('function nationalTeamFormScore(');
const formEnd=source.indexOf('function nationalTeamLineup(',formStart);
const boxStart=source.indexOf('function currentSeasonBoxStats(');
const boxEnd=source.indexOf('function seasonPitcherLeaderboard(',boxStart);
const fixtures=[
 {id:1,name:'Batter',position:'LF',joinYear:2046,firstEligibleDay:2},
 {id:2,name:'Pitcher',position:'P',joinYear:2045},
 {id:3,name:'No games',position:'C'},
 {id:4,name:'Pending',position:'LF',draftPending:true},
 {id:5,name:'New identity',position:'LF'},
 {id:'1',name:'Other identity',position:'P'},
];
const games=Array.from({length:15},(_,i)=>({year:2046,day:i+1,
 homeBatters:[{id:1,name:'Batter',atBats:4,hits:2,homeRuns:1,walks:1},{id:4,name:'Pending',atBats:4,hits:4},{id:5,name:'Old identity',atBats:4,hits:3}],
 awayBatters:i===2?[{id:'1',name:'Batter',atBats:1,hits:1}]:[],
 homePitchers:[{id:2,name:'Pitcher',innings:2,earnedRuns:1,strikeouts:3,walksAllowed:1},{id:'1',name:'Other identity',innings:1,earnedRuns:0,strikeouts:1}]}));
games.push({...games[0],year:2045});
const state={year:2046,day:20,gameResults:games};
const scored=vm.createContext({state,fixtures,console:{warn(){}},bePlayerEvaluation:()=>60});
vm.runInContext(source.slice(boxStart,boxEnd)+source.slice(formStart,formEnd),scored);
const expected=Array.from(vm.runInContext('fixtures.map(p=>nationalTeamFormScore(p))',scored));
const indexed=Array.from(vm.runInContext('var indexed=createNationalTeamFormScorer();fixtures.map(p=>indexed(p))',scored));
assert.deepEqual(indexed,expected,'indexed scoring preserves actual canonical form values');
// A newly created scorer must observe new results rather than retaining old forms.
state.gameResults.push({year:2046,day:21,homeBatters:[{id:1,name:'Batter',atBats:4,hits:0}]});
assert.equal(vm.runInContext('createNationalTeamFormScorer()(fixtures[0])',scored),vm.runInContext('nationalTeamFormScore(fixtures[0])',scored));
assert.notEqual(vm.runInContext('createNationalTeamFormScorer()(fixtures[0])',scored),indexed[0]);
console.log('Indexed canonical form parity and fresh-selection invalidation: PASS');
