// Compare the real SQLite write path on synthetic data in memory only.
// No production database, user save or game simulation is opened.
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createAdvanceDayStore} from './advance-day-store.mjs';
const set=new Map(Array.from({length:32},(_,i)=>['beServerPart_fixture_'+i,JSON.stringify({id:i,image:randomBytes(262144).toString('hex'),fatigue:3})])),unset=[],results=[];
for(const asyncCompression of [false,true]){
 const db=new DatabaseSync(':memory:');try{
 db.exec('CREATE TABLE be_save_shard_meta(user_id INTEGER,slot TEXT,rev INTEGER,updated_at TEXT,digest TEXT,compressed_bytes INTEGER,PRIMARY KEY(user_id,slot));CREATE TABLE be_save_shards(user_id INTEGER,slot TEXT,field TEXT,content BLOB,PRIMARY KEY(user_id,slot,field))');
 db.prepare("INSERT INTO be_save_shard_meta VALUES(1,'main',1,'now','baseline',0)").run();const store=createAdvanceDayStore(db,{});
 let eventLoopResponsive=false;const tick=new Promise(resolve=>setImmediate(()=>{eventLoopResponsive=true;resolve()}));
 const start=performance.now(),token=asyncCompression?await store.prepareSerializedDelta({user:1,slot:'main',expectedRev:1,set,unset}):null,prepared=performance.now();
 const result=store.commit({user:1,slot:'main',expectedRev:1,requestId:'synthetic-native-write',serializedDelta:set,delta:{unset},...(token?{compressionToken:token}:{}),result:{}}),end=performance.now();
 if(result.status!==200)throw Error('Synthetic commit failed');results.push({mode:asyncCompression?'two-background-jobs':'prior-synchronous',totalMs:+(end-start).toFixed(2),preparationMs:+(prepared-start).toFixed(2),transactionMs:+(end-prepared).toFixed(2),eventLoopResponsive,compressedBytes:result.compressed_bytes,digest:result.digest});await tick;
 }finally{db.close()}
}
if(results[0].digest!==results[1].digest||results[0].compressedBytes!==results[1].compressedBytes)throw Error('Stored content changed');
console.log(JSON.stringify({stage:'native-compression-benchmark',productionWrites:false,syntheticJsonMiB:+([...set.values()].reduce((n,s)=>n+Buffer.byteLength(s),0)/1048576).toFixed(2),results}));
