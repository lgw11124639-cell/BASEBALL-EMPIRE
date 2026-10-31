const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf('function cloneDailyRollback('),end=source.indexOf('\nbackup=cloneDailyRollback',start);
assert.ok(start>0&&end>start);
const clone=new Function(source.slice(start,end)+';return cloneDailyRollback')();
const shared={x:undefined,n:NaN,text:'기록'.repeat(500)},value={a:shared,b:shared,sparse:new Array(5)};value.self=value;value.sparse[3]=shared;Object.defineProperty(value,'__proto__',{value:{safe:true},enumerable:true});
assert.deepEqual(clone(value),structuredClone(value));const copied=clone(value);assert.equal(copied.a,copied.b);assert.equal(copied.self,copied);assert.notEqual(copied.a,shared);copied.a.text='changed';assert.notEqual(copied.a.text,shared.text);
for(const special of [new Date(),new Map([['a',1]]),new Set([2]),new Uint8Array([1,2])])assert.deepEqual(clone({special}),structuredClone({special}));
assert.equal(source.includes('autoSeasonSpeed=Number(e.target.value)||1000'),false,'zero wait must remain zero');
// Representative long archive: compare medians, not a flaky speed assertion.
const data={rows:Array.from({length:30000},(_,i)=>({id:i,stats:{ab:12,h:3},history:'중계'.repeat(180),notes:['a','b']}))};
assert.deepEqual(clone(data),structuredClone(data));
function median(fn){const times=[];for(let i=0;i<7;i++){const at=performance.now();fn(data);times.push(performance.now()-at)}return times.sort((a,b)=>a-b)[3]}
console.log('PASS rollback isolation, aliases, cycles, sparse arrays, special types and zero-wait speed');
console.log(JSON.stringify({nativeMedianMs:median(structuredClone),optimizedMedianMs:median(clone)}));
