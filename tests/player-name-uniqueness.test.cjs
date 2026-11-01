const assert=require('node:assert/strict'),vm=require('node:vm'),context=require('./helpers/game-context.cjs')();
vm.runInContext(`
state=world(0);
window.names={world:state.players.map(p=>p.name)};
const used=new Set(),constant=()=>0;let calls=0;
window.names.stress=Array.from({length:4000},()=>uniqueKoreanPlayerName(()=>{calls++;return 0},used));window.names.calls=calls;
const a=new Set(),b=new Set(),r1=rng(37),r2=rng(37);
window.names.deterministic=JSON.stringify(Array.from({length:800},()=>uniqueKoreanPlayerName(r1,a)))===JSON.stringify(Array.from({length:800},()=>uniqueKoreanPlayerName(r2,b)));
state.players.push({id:9001,name:'김민준',retired:true});state.highSchoolBaseball={2027:{prospects:[{id:9002,name:'김민서'}]}};state.history.seasons={2026:{players:[{id:9003,name:'김민도'}]}};
const before=JSON.stringify(state),registry=playerNameRegistry();window.names.reserved=['김민준','김민서','김민도'].every(name=>registry.has(name));window.names.next=uniqueKoreanPlayerName(()=>0,registry);window.names.unchanged=before===JSON.stringify(state);
const japan=internationalOpponentRoster(2027,'JP'),again=internationalOpponentRoster(2027,'JP'),next=internationalOpponentRoster(2028,'JP');window.names.international=[...japan,...next].map(p=>p.name);window.names.stable=JSON.stringify(japan)===JSON.stringify(again);
`,context);
const n=context.window.names;
for(const names of [n.world,n.stress,n.international]){assert.equal(new Set(names).size,names.length);assert.ok(names.every(name=>!/[0-9]/.test(name)))}
assert.equal(n.calls,8000);assert.ok(n.deterministic&&n.reserved&&n.unchanged&&n.stable);assert.ok(!['김민준','김민서','김민도'].includes(n.next));
vm.runInContext(`
state=world(0);state.day=60;
state.highSchoolBaseball={2027:{schools:[{id:0}],prospects:[]}};state.collegeBaseball={2027:{teams:[{id:0}],players:[]}};state.independentBaseball={2027:{teams:[{id:0}],players:[]}};
normalizeAmateurRoster(state.highSchoolBaseball[2027],'highSchool');normalizeAmateurRoster(state.collegeBaseball[2027],'college');normalizeAmateurRoster(state.independentBaseball[2027],'independent');
window.names.batch=[...state.players,...state.highSchoolBaseball[2027].prospects,...state.collegeBaseball[2027].players,...state.independentBaseball[2027].players].map(p=>p.name);
archiveAmateurCareer(state.highSchoolBaseball[2027],'highSchool',2027);window.names.archived=state.highSchoolBaseball[2027].prospects.map(p=>p.name);delete state.highSchoolBaseball[2027];window.names.archiveReserved=window.names.archived.every(name=>playerNameRegistry().has(foreignNameKey(name)));
`,context);
assert.equal(new Set(n.batch).size,n.batch.length);assert.ok(n.archiveReserved);
console.log('PASS unique initial, constant-random and international names; fixed RNG draws, reserved archives and saved identity preservation');
