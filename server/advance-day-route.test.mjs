import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAdvanceDayRoute} from './advance-day-route.mjs';
test('route requires a session, defaults off, rejects caller-selected owners',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field))');
 let calls=0,reply;
 const dependencies={db,shards:{get(){calls++;return null}},restoreSave:s=>s,body:async req=>req.input,response:(res,status,payload)=>{reply={status,payload}}};
 const req={url:'/v2/engine/advance',method:'POST',headers:{'if-match':'1'},input:{requestId:'route-request-001'}};
 const disabled=createAdvanceDayRoute(dependencies);
 await disabled(req,{},null,null);assert.equal(reply.status,401);
 await disabled(req,{},null,{user_id:1});assert.equal(reply.status,503);assert.equal(calls,0);
 const enabled=createAdvanceDayRoute({...dependencies,enabled:true});
 await enabled({...req,input:{...req.input,userId:2}},{},null,{user_id:1});assert.equal(reply.status,400);assert.equal(calls,0);
 await enabled(req,{},null,{user_id:1});assert.equal(reply.status,404);assert.equal(calls,0);
 db.close();
});
test('production ignores the former preparation flag and never starts a speculative worker',async()=>{
 const {mkdtempSync,existsSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const directory=mkdtempSync(join(tmpdir(),'be-precompute-off-')),db=new DatabaseSync(join(directory,'saves.sqlite'));
 try{
  db.exec("CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field));INSERT INTO be_save_shard_meta VALUES(1,'main',1,'now','source',0)");
  let reply;const route=createAdvanceDayRoute({db,shards:{},restoreSave(){throw Error('status must not calculate a game')},enabled:true,precompute:true,response:(res,status,payload)=>reply={status,payload}});
  await route({url:'/v2/engine/status',method:'GET'},{},null,{user_id:1});assert.equal(reply.status,200);assert.equal(reply.payload.preparation,undefined);assert.equal(existsSync(join(directory,'prepared-days')),false);assert.equal(db.prepare('SELECT rev FROM be_save_shard_meta').get().rev,1);
 }finally{db.close();rmSync(directory,{recursive:true,force:true})}
});
