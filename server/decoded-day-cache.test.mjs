import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecodedDayCache} from './decoded-day-cache.mjs';
test('decoded cache is consumed once and requires matching owner, revision and digest',()=>{
 let now=0;const cache=createDecodedDayCache({now:()=>now,ttlMs:1000}),codec={};
 const entry={user:1,slot:'main',rev:2,digest:'a',state:{day:2},wire:{day:2},codec};
 cache.put(entry);assert.equal(cache.take(2,'main',2,'a'),null);
 assert.equal(cache.take(1,'main',2,'a').state.day,2);
 assert.equal(cache.take(1,'main',2,'a'),null);
 cache.put(entry);assert.equal(cache.take(1,'main',2,'different'),null);
 cache.put(entry);assert.equal(cache.take(1,'main',3,'a'),null);
 cache.put(entry);now=1000;assert.equal(cache.take(1,'main',2,'a'),null);
 cache.clear();
});
test('cache retains one world and periodically drops codec histories',()=>{
 const cache=createDecodedDayCache({maxReuse:2}),codec={};
 const entry={user:1,slot:'main',rev:1,digest:'a',state:{},wire:{},codec};
 cache.put(entry);cache.put({...entry,user:2});assert.equal(cache.take(1,'main',1,'a'),null);
 assert.ok(cache.take(2,'main',1,'a'));
 cache.put(entry);assert.equal(cache.take(1,'main',1,'a'),null);
 cache.clear();
});
test('memory pressure drops the cache without changing authoritative persistence',()=>{
 const cache=createDecodedDayCache({maxRssBytes:100,rss:()=>101});
 cache.put({user:1,slot:'main',rev:1,digest:'a',state:{day:1},wire:{},codec:{mode:'server-json-v1'}});
 assert.equal(cache.take(1,'main',1,'a'),null);cache.clear();
});
test('retained engine runtimes follow owner, digest and consume-once cache ownership',()=>{
 const cache=createDecodedDayCache(),runtime={private:'owner-one'},codec={mode:'server-json-v1'};
 cache.put({user:1,slot:'main',rev:1,digest:'a',codec,state:{},wire:{},runtime});
 assert.equal(cache.take(2,'main',1,'a'),null);assert.equal(cache.take(1,'main',1,'a').runtime,runtime);assert.equal(cache.take(1,'main',1,'a'),null);
 cache.put({user:1,slot:'main',rev:1,digest:'a',codec,state:{},wire:{},runtime});assert.equal(cache.take(1,'main',2,'b'),null);assert.equal(cache.take(1,'main',1,'a'),null);cache.clear();
});
