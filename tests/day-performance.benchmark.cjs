// Optional benchmark: no save/network calls; real daily league and development services.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
if(process.env.BASEBALL_BENCH_SOURCE){const read=fs.readFileSync;fs.readFileSync=function(file,...args){return read.call(this,String(file).endsWith('/app.js')?process.env.BASEBALL_BENCH_SOURCE:file,...args)}}
const c=require('./helpers/game-context.cjs')();
vm.runInContext("state=world(0);state.created='2027-01-01T00:00:00.000Z';state.gameResults=[];state.day=100",c);
const times=[];
for(let i=0;i<3;i++){const start=performance.now();vm.runInContext('simulateLeagueDay()',c);times.push(performance.now()-start)}
const json=vm.runInContext('JSON.stringify(state)',c);
console.log(JSON.stringify({milliseconds:times,totalMilliseconds:times.reduce((n,v)=>n+v,0),stateHash:crypto.createHash('sha256').update(json).digest('hex'),games:vm.runInContext('state.gameResults.length',c)}));
