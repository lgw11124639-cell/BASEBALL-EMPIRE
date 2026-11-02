// Runs only against in-memory SQLite. Pass a staged SAVEPOINT shard-store module.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createAdvanceDayStore} from './advance-day-store.mjs';
import {createAdvanceDayService} from './advance-day-service.mjs';
export async function verifyAdvanceStore(createShardStore){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));
 CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field));
 CREATE TABLE be_user_saves(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,content BLOB,PRIMARY KEY(user_id,slot));`);
 const shards=createShardStore(db),store=createAdvanceDayStore(db,shards);
 const initial={year:2046,day:50,players:[],teams:[],gameResults:[]};
 shards.put(1,'main',0,initial);shards.put(2,'main',0,initial);
 let runs=0;
 const runDay=async state=>{runs++;state.day++;return {state,result:{to:{day:state.day}}}};
 const advance=createAdvanceDayService({store,restoreSave:async s=>s,runDay,includeDelta:true});
 const request={userId:1,requestId:'atomic-request-0001',expectedRev:1};
 const [first,concurrent]=await Promise.all([advance(request),advance(request)]);
 assert.equal(first.status,200);assert.equal(first.wireDelta.fromRevision,1);assert.equal(first.wireDelta.toRevision,2);assert.deepEqual(first.wireDelta.set.day,51);
 assert.equal(store.receipt(1,'main',request.requestId,1).wireDelta,undefined,'wire payload is not duplicated in durable receipts');assert.deepEqual(concurrent,first);assert.equal(runs,1);
 assert.equal(first.day.timing.changedFields,1);
 assert.equal(first.day.timing.removedFields,0);
 assert.equal(store.load(1,'main').save.day,51);assert.equal(store.load(2,'main').save.day,50);
 const restarted=createAdvanceDayService({store:createAdvanceDayStore(db,shards),restoreSave:async s=>s,runDay});
 assert.equal((await restarted(request)).replayed,true);assert.equal(runs,1);
 assert.equal((await restarted({...request,expectedRev:2})).status,409);
 assert.equal((await advance({...request,requestId:'atomic-request-0002'})).status,409);assert.equal(runs,1);
 // A legacy writer wins while asynchronous decoding runs: discard computed result.
 let release;
 const delayed=createAdvanceDayService({store,restoreSave:s=>new Promise(r=>{release=()=>r(s)}),runDay});
 const work=delayed({...request,requestId:'atomic-request-race',expectedRev:2});
 await Promise.resolve();assert.equal((await delayed({...request,requestId:'atomic-request-busy',expectedRev:2})).status,409);
 shards.put(1,'main',2,{...initial,day:70});release();
 assert.equal((await work).status,409);assert.equal(store.load(1,'main').save.day,70);
 // A failure writing the receipt must roll back the already-written shard data.
 db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON be_day_requests BEGIN SELECT RAISE(ABORT,'test receipt failure'); END");
 const before=store.load(1,'main');
 const oldFields=db.prepare('SELECT field,hex(content) AS bytes FROM be_save_shards WHERE user_id=1 AND slot=? ORDER BY field').all('main');
 assert.throws(()=>store.commit({user:1,slot:'main',requestId:'atomic-fail-receipt',expectedRev:before.rev,state:{...initial,day:99},delta:{set:{day:99},unset:[]},result:{}}),/test receipt failure/);
 assert.equal(store.load(1,'main').rev,before.rev);assert.equal(store.load(1,'main').save.day,70);
 assert.equal(store.receipt(1,'main','atomic-fail-receipt',before.rev),null);
 assert.deepEqual(db.prepare('SELECT field,hex(content) AS bytes FROM be_save_shards WHERE user_id=1 AND slot=? ORDER BY field').all('main'),oldFields);
 db.exec('DROP TRIGGER fail_receipt');
 // An engine exception must neither write state nor consume the request ID.
 const failing=createAdvanceDayService({store,restoreSave:async s=>s,runDay:()=>{throw Error('test engine failure')}});
 const errorRequest={...request,requestId:'atomic-engine-fail',expectedRev:before.rev};
 assert.equal((await failing(errorRequest)).status,500);assert.equal(store.load(1,'main').rev,before.rev);
 assert.equal((await advance(errorRequest)).status,200);
 const command=createAdvanceDayService({store,restoreSave:async s=>s,runDay:async state=>({state,result:{type:'test-command'}}),fingerprint:op=>'command:'+op.choice});
 const commandRequest={userId:1,requestId:'atomic-command-id',expectedRev:store.load(1,'main').rev,operation:{choice:'yes'}};
 assert.equal((await command(commandRequest)).status,200);
 assert.equal((await command(commandRequest)).replayed,true);
 assert.equal((await command({...commandRequest,operation:{choice:'no'}})).status,409);
 assert.equal((await advance(commandRequest)).status,409);
 assert.equal((await advance({...request,userId:0})).status,401);
 assert.equal((await advance({...request,slot:'other'})).status,400);
 db.close();
 return {success:true,stage:'atomic-day-store',durableRetry:true,concurrentDuplicate:true,revisionRace:true,receiptFailureRollback:true,engineFailureRollback:true,userIsolation:true,productionDatabaseOpened:false};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 if(!process.argv[2])throw Error('Usage: node server/verify-advance-day-store.mjs STAGED-SHARD-STORE.mjs');
 const {createShardStore}=await import(pathToFileURL(resolve(process.argv[2])).href);
 console.log(JSON.stringify(await verifyAdvanceStore(createShardStore)));
}
