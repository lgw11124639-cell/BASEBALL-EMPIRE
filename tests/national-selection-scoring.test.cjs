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
const ctx=vm.createContext({state:{players:players.map(p=>({...p,age:25}))},nationalTeamFormScore:p=>{calls++;return p.form}});
const actual=Array.from(vm.runInContext(expr,ctx),p=>p.id);
assert.deepEqual(actual,players.slice().sort((a,b)=>b.form-a.form).map(p=>p.id),'available ranking preserves score and tie order');
assert.equal(calls,players.length,'available ranking scores once per candidate');
console.log('National selection scoring and roster parity: PASS');
