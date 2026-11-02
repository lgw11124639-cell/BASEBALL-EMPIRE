import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';
import {createOriginalEngineSandbox} from './original-engine-sandbox.mjs';import {createNativeSaveCodec} from './native-save-codec.mjs';
test('detached benchmark leaves the source database byte-for-byte unchanged',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'be-benchmark-')),path=join(dir,'saves.sqlite');
 try{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8'),sandbox=createOriginalEngineSandbox(source,{year:2027,day:1,players:[],teams:[],gameResults:[]});sandbox.context.structuredClone=structuredClone;
  const wire=await createNativeSaveCodec().pack(sandbox.invoke('world(0)'));
  const db=new DatabaseSync(path);db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field))');
  db.prepare("INSERT INTO be_save_shard_meta VALUES(1,'main',7,'now','seed',1)").run();const insert=db.prepare("INSERT INTO be_save_shards VALUES(1,'main',?,?)");for(const [key,value] of Object.entries(wire))insert.run(key,gzipSync(JSON.stringify(value)));db.close();
  const before=readFileSync(path),result=spawnSync(process.execPath,['--experimental-sqlite',new URL('./benchmark-owned-day.mjs',import.meta.url).pathname,'--database',path,'--days','1','--profile'],{encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes('"productionDayUnchanged":true'));assert.ok(result.stdout.includes('"stage":"engine-cpu-profile"'));assert.ok(result.stdout.includes('"cpuToWall"'));assert.deepEqual(readFileSync(path),before);
  const prepared=spawnSync(process.execPath,['--experimental-sqlite',new URL('./benchmark-prepared-api.mjs',import.meta.url).pathname,'--database',path],{encoding:'utf8',timeout:120000});
  assert.equal(prepared.status,0,prepared.stdout+'\n'+prepared.stderr);assert.ok(prepared.stdout.includes('"stage":"prepared-advance-benchmark"'));assert.ok(prepared.stdout.includes('"precomputed":true'));assert.deepEqual(readFileSync(path),before);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
