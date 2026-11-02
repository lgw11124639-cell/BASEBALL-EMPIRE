import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir,getPriority} from 'node:os';import {gzipSync} from 'node:zlib';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';import {createNativeSaveCodec} from './native-save-codec.mjs';
import {createAdvanceDayStore} from './advance-day-store.mjs';import {createAdvanceDayService} from './advance-day-service.mjs';import {createPrecomputeController} from './precompute-controller.mjs';
test('worker precomputes without advancing saves; prepared commits are atomic, fast and replay-safe',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'be-prepared-')),database=join(dir,'saves.sqlite'),db=new DatabaseSync(database);let controller;
 try{
  db.exec('PRAGMA journal_mode=WAL;CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field))');
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8'),vm=createOriginalEngineSandbox(source,{year:2027,day:1,players:[],teams:[],gameResults:[]});vm.context.structuredClone=structuredClone;
  const wire=await createNativeSaveCodec().pack(vm.invoke('world(0)')),insert=db.prepare("INSERT INTO be_save_shards VALUES(1,'main',?,?)");let bytes=0;
  for(const [key,value] of Object.entries(wire)){const b=gzipSync(JSON.stringify(value));bytes+=b.length;insert.run(key,b)}
  db.prepare("INSERT INTO be_save_shard_meta VALUES(1,'main',1,'now','seed',?)").run(bytes);
  const store=createAdvanceDayStore(db,{put(){throw Error('Prepared path must never perform full put')}}),priority=getPriority();
  controller=createPrecomputeController({database,metadata:(...args)=>store.metadata(...args),horizon:2});
  const ready=await controller.wait(1,'main',1,'seed',{timeoutMs:30000});assert.ok(ready);assert.equal(store.metadata(1,'main').rev,1,'speculative work cannot advance the canonical slot');assert.equal(getPriority(),priority,'worker niceness cannot change API thread priority');
  let reads=0;const load=store.load;store.load=(...args)=>{reads++;return load(...args)};
  const advance=createAdvanceDayService({store,restoreSave(){throw Error('No whole-save restore on prepared path')},runDay(){throw Error('No foreground simulation on prepared path')},precompute:controller,includeDelta:true});
  db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON be_day_requests BEGIN SELECT RAISE(ABORT,'prepared receipt failure'); END");
  const input={userId:1,expectedRev:1,requestId:'prepared-request-001',nativeWire:true};
  assert.equal((await advance(input)).status,500);assert.equal(store.metadata(1,'main').rev,1);db.exec('DROP TRIGGER fail_receipt');
  const at=performance.now(),first=await advance(input);assert.equal(first.status,200);assert.equal(first.day.timing.precomputed,true);assert.equal(first.rev,2);assert.equal(first.digest,ready.nextDigest);assert.equal(reads,0);
  assert.ok(performance.now()-at<1000,'a prepared small world commits below one second');
  assert.equal((await advance(input)).replayed,true);assert.equal(store.metadata(1,'main').rev,2);
  assert.equal((await advance({...input,requestId:'prepared-request-stale'})).status,409);
  controller.invalidate(1,'main');assert.equal(controller.get(1,'main',2,first.digest),null);
  const regenerated=await controller.wait(1,'main',2,first.digest,{timeoutMs:30000});assert.ok(regenerated);assert.equal(regenerated.result.from.day,2);assert.equal(store.metadata(1,'main').rev,2);
  db.prepare("INSERT INTO be_save_shard_meta VALUES(2,'main',1,'now','second-user',?)").run(bytes);
  db.prepare("INSERT INTO be_save_shards SELECT 2,slot,field,content FROM be_save_shards WHERE user_id=1 AND slot='main'").run();
  // Simultaneous users must each get an earliest prepared day instead of
  // cancelling one another every time their status is polled.
  controller.invalidate(1,'main');
  const both=await Promise.all([controller.wait(1,'main',2,first.digest,{timeoutMs:30000}),controller.wait(2,'main',1,'second-user',{timeoutMs:30000})]);
  assert.ok(both.every(Boolean));assert.equal(store.metadata(2,'main').rev,1);

 }finally{if(controller)await controller.close();db.close();rmSync(dir,{recursive:true,force:true})}
});
