import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerSaveClient} from '../server-save-client.js';
const session={token:'test',username:'test'};
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),all:()=>[...data.values()]}}
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
test('lost restore response is recovered after reload without storing the backup',async()=>{
 const saved=storage();let posts=0,receipt;
 const options={api:'https://example.test',getSession:()=>session,storage:saved,newId:()=> 'save-client-request-001'};
 const first=createServerSaveClient({...options,fetchImpl:async(url,init)=>{posts++;receipt={request_id:JSON.parse(init.body).requestId,rev:8,operation:'restore'};throw Error('response lost')}});
 await assert.rejects(first.perform(7,'restore',{save:{privateBackup:'PRIVATE SAVE CONTENT'}},'file-hash'));
 assert.equal(posts,1);assert.equal(saved.all().length,1);assert.ok(!saved.all()[0].includes('PRIVATE SAVE CONTENT'));
 const next=createServerSaveClient({...options,fetchImpl:async(url,init)=>{assert.equal(init.method,undefined);assert.match(url,/save-request/);return response(200,receipt)}});
 assert.equal((await next.recover()).rev,8);assert.equal(saved.all().length,0);assert.equal(posts,1);
});
test('uncommitted restore retries the same ID/revision and rejects a different file',async()=>{
 const saved=storage(),posted=[];
 const opts={api:'https://example.test',getSession:()=>session,storage:saved,newId:()=> 'save-client-request-002'};
 const first=createServerSaveClient({...opts,fetchImpl:async(url,init)=>{posted.push(init);throw Error('network')}});
 await assert.rejects(first.perform(4,'restore',{save:{a:1}},'same-file'));
 const next=createServerSaveClient({...opts,fetchImpl:async(url,init)=>{if(!init.method)return response(404,{error:'request not committed'});posted.push(init);return response(200,{request_id:JSON.parse(init.body).requestId,rev:5,operation:'restore'})}});
 await assert.rejects(next.perform(4,'restore',{save:{a:2}},'different-file'));assert.equal(posted.length,1);
 await next.perform(5,'restore',{save:{a:1}},'same-file');assert.equal(posted.length,2);assert.equal(posted[0].body,posted[1].body);assert.equal(posted[1].headers['If-Match'],'4');
});
test('concurrent new-game taps share one request and storage failure transmits nothing',async()=>{
 const opts={api:'https://example.test',getSession:()=>session,newId:()=> 'save-client-request-003'};let calls=0;
 const client=createServerSaveClient({...opts,storage:storage(),fetchImpl:async(url,init)=>{calls++;return response(200,{request_id:JSON.parse(init.body).requestId,rev:1,operation:'new-game'})}});
 const first=client.perform(0,'new-game',{teamId:0},'team:0'),second=client.perform(0,'new-game',{teamId:0},'team:0');assert.equal(first,second);await first;assert.equal(calls,1);
 const blocked=createServerSaveClient({...opts,storage:{getItem:()=>null,setItem:()=>{throw Error('storage denied')}},fetchImpl:async()=>{throw Error('must not send')}});
 await assert.rejects(blocked.perform(0,'new-game',{teamId:0},'team:0'),/storage denied/);
});
test('large restore requests use gzip while retry storage contains no save body',async()=>{
 const {gunzipSync}=await import('node:zlib');const saved=storage();
 const content='private-content-'.repeat(10000);
 const client=createServerSaveClient({api:'https://example.test',getSession:()=>session,storage:saved,newId:()=> 'save-client-request-004',fetchImpl:async(url,init)=>{
  assert.equal(init.headers['Content-Encoding'],'gzip');
  const input=JSON.parse(gunzipSync(Buffer.from(init.body)).toString());assert.equal(input.save.content,content);
  assert.ok(saved.all().every(text=>!text.includes('private-content')));
  return response(200,{request_id:input.requestId,rev:2,operation:'restore'});
 }});
 await client.perform(1,'restore',{save:{content}},'backup-digest');
});
