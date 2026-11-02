import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerDayClient} from '../server-day-client.js';
const session={username:'test',token:'test-token',expiresAt:Date.now()+60000};
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
const ok=(requestId,rev)=>({ok:true,json:async()=>({request_id:requestId,rev})});
test('lost response and reload reuse original request ID and revision',async()=>{
 const saved=storage(),calls=[];
 const options={api:'https://example.test',getSession:()=>session,storage:saved,newId:()=> 'client-request-0001',fetchImpl:async(url,init)=>{calls.push(init);throw Error('lost response')}};
 await assert.rejects(createServerDayClient(options).advance(10));
 const next=createServerDayClient({...options,newId:()=>{throw Error('must not generate another ID')},fetchImpl:async(url,init)=>{calls.push(init);return ok(JSON.parse(init.body).requestId,11)}});
 assert.equal(next.hasPending(),true);await next.advance(11);
 assert.equal(calls[1].headers['If-Match'],'10');assert.equal(calls[0].body,calls[1].body);assert.equal(next.hasPending(),false);
});
test('concurrent taps share one request; errors retain the pending ID',async()=>{
 const saved=storage();let calls=0;
 const client=createServerDayClient({api:'https://example.test',getSession:()=>session,storage:saved,newId:()=> 'client-request-0002',fetchImpl:async()=>{calls++;return {ok:false,status:409,json:async()=>({})}}});
 const first=client.advance(2),second=client.advance(2);assert.equal(first,second);
 await assert.rejects(first);assert.equal(calls,1);assert.equal(client.hasPending(),true);
});
test('cannot send a mutation if retry metadata cannot be persisted',async()=>{
 let sent=false;
 const client=createServerDayClient({api:'https://example.test',getSession:()=>session,storage:{getItem:()=>null,setItem:()=>{throw Error('storage denied')}},newId:()=> 'client-request-0003',fetchImpl:async()=>{sent=true}});
 await assert.rejects(client.advance(1));assert.equal(sent,false);
});
test('definitive stale revision requires refresh and another click, never auto-advances',async()=>{
 let calls=0;
 const client=createServerDayClient({api:'https://example.test',getSession:()=>session,storage:storage(),newId:()=> 'client-request-0004',fetchImpl:async()=>{calls++;return {ok:false,status:409,json:async()=>({error:'revision conflict',current_rev:3})}}});
 await assert.rejects(client.advance(2));assert.equal(calls,1);assert.equal(client.hasPending(),false);
});
test('command retries preserve the original payload and do not submit another mutation',async()=>{
 const saved=storage(),requests=[];
 const opts={api:'https://example.test',getSession:()=>session,storage:saved,newId:()=> 'client-command-0001'};
 const command={type:'club-hall-vote',voteId:'vote',choice:'yes'};
 const first=createServerDayClient({...opts,fetchImpl:async(url,init)=>{requests.push({url,body:init.body});throw Error('lost response')}});
 await assert.rejects(first.command(4,command));
 const next=createServerDayClient({...opts,fetchImpl:async(url,init)=>{requests.push({url,body:init.body});return ok(JSON.parse(init.body).requestId,5)}});
 await assert.rejects(next.command(4,{...command,choice:'no'}));assert.equal(requests.length,1);
 await next.command(5,command);assert.deepEqual(requests[0],requests[1]);assert.match(requests[1].url,/\/engine\/command$/);
});
test('HTTP failure status is visible even for a non-JSON proxy error and retry keeps the same request',async()=>{
 const saved=storage(),calls=[];let fail=true;
 const client=createServerDayClient({api:'https://example.test',getSession:()=>session,storage:saved,newId:()=> 'client-http-error-001',fetchImpl:async(url,init)=>{calls.push(init);if(fail)return {ok:false,status:502,json:async()=>{throw Error('HTML proxy error')}};return ok(JSON.parse(init.body).requestId,2)}});
 await assert.rejects(client.advance(1),/HTTP 502/);assert.equal(client.hasPending(),true);fail=false;await client.advance(1);assert.equal(calls[0].body,calls[1].body);assert.equal(client.hasPending(),false);
});
