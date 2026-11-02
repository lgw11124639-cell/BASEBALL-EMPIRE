import {gzipSync} from 'node:zlib';
import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createPreparedDayStore} from './prepared-day-store.mjs';
test('prepared deltas are isolated by user, slot, revision, source digest and engine',()=>{
 const store=createPreparedDayStore(new DatabaseSync(':memory:'));
 const payload={set:[['day','2']],unset:[],result:{from:{day:1},to:{day:2}}};
 assert.equal(store.put(1,'main','engine-a',7,'old','next',payload),true);
 assert.deepEqual(store.get(1,'main','engine-a',7,'old'),{...payload,nextDigest:'next'});
 for(const args of [[2,'main','engine-a',7,'old'],[1,'other','engine-a',7,'old'],[1,'main','engine-b',7,'old'],[1,'main','engine-a',8,'old'],[1,'main','engine-a',7,'changed']])assert.equal(store.get(...args),null);
 assert.equal(store.status(1,'main','engine-a',7).ready,1);store.prune(1,'main','engine-a',8);assert.equal(store.get(1,'main','engine-a',7,'old'),null);store.close();
});
test('disk cache budget stops preparation without deleting authoritative state',()=>{
 const store=createPreparedDayStore(new DatabaseSync(':memory:'),{maxBytes:1});
 assert.equal(store.put(1,'main','engine',1,'a','b',{set:[],unset:[]}),false);assert.equal(store.status(1,'main','engine',1).ready,0);store.close();
});
test('invalidating a branch prevents an old background worker from repopulating it',()=>{
 const store=createPreparedDayStore(new DatabaseSync(':memory:')),old=store.generation(1,'main');
 store.invalidate(1,'main');assert.ok(store.generation(1,'main')>old);
 const body={set:[['day','2']],unset:[]};
 assert.equal(store.put(1,'main','engine',1,'old','next',body,old),false);
 assert.equal(store.put(1,'main','engine',1,'new','next',body),true);
 assert.equal(store.status(1,'main','engine',1,'old').ready,0);assert.equal(store.status(1,'main','engine',1,'new').ready,1);store.close();
});
test('an annual queue is contiguous and survives normal consumption without exposing stale forks',()=>{
 const store=createPreparedDayStore(new DatabaseSync(':memory:'));let digest='root';const chain=[digest];
 for(let i=0;i<366;i++){const next='digest-'+i;assert.equal(store.put(1,'main','engine',100+i,digest,next,{set:[['day',String(i+2)]],unset:[]}),true);chain.push(next);digest=next}
 assert.equal(store.status(1,'main','engine',100,'root').ready,366);
 for(let i=0;i<366;i++){assert.equal(store.get(1,'main','engine',100+i,chain[i]).nextDigest,chain[i+1]);store.prune(1,'main','engine',101+i);assert.equal(store.status(1,'main','engine',101+i,chain[i+1]).ready,365-i)}
 assert.equal(store.status(2,'main','engine',100,'root').ready,0);store.close();
});
test('a second worker cannot replace an already published day on the same branch',()=>{
 const store=createPreparedDayStore(new DatabaseSync(':memory:'));
 const original={set:[['day','2']],unset:[]};assert.equal(store.put(1,'main','engine',1,'input','first',original),true);
 assert.equal(store.put(1,'main','engine',1,'input','different',{set:[['day','999']],unset:[]}),false);
 assert.equal(store.get(1,'main','engine',1,'input').nextDigest,'first');store.close();
});
test('compact artifacts preserve legacy reads and remain isolated after branch invalidation',()=>{
 const store=createPreparedDayStore(new DatabaseSync(':memory:')),raw='{"value":2}',fast={shards:[['custom',gzipSync(raw).toString('base64')]],delta:{set:{custom:{value:2}},patches:{},unset:[]}};
 const payload={set:[['custom',raw]],unset:[],result:{}};
 assert.equal(store.put(1,'main','compact',1,'before','after',payload,0,fast),true);
 assert.deepEqual(store.get(1,'main','compact',1,'before'),{...payload,nextDigest:'after'});
 assert.deepEqual(store.getFast(1,'main','compact',1,'before'),{...fast,nextDigest:'after'});
 for(const args of [[2,'main','compact',1,'before'],[1,'main','compact',1,'different']])assert.equal(store.getFast(...args),null);
 store.invalidate(1,'main');assert.equal(store.getFast(1,'main','compact',1,'before'),null);store.close();
});
