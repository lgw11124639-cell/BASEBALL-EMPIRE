import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {statfsSync} from 'node:fs';
import {dirname} from 'node:path';
import {setPriority} from 'node:os';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {createPreparedDayStore} from './prepared-day-store.mjs';
import {createNativeSaveCodec,nativeWireDelta,nativeDeltaDigest} from './native-save-codec.mjs';
import {restoreNativeSave,isNativeSave,diffNativeValue} from '../native-save.js';
import {preparedEngineSource} from './precompute-engine-key.mjs';
import {runOriginalEngineDay} from './original-engine-day.mjs';
if(process.platform==='linux'){try{setPriority(0,5)}catch{}}
const source=new DatabaseSync(workerData.database,{readOnly:true}),prepared=createPreparedDayStore(new DatabaseSync(workerData.cache));
const metadata=source.prepare('SELECT * FROM be_save_shard_meta WHERE user_id=? AND slot=?');
const fields=source.prepare('SELECT field,content FROM be_save_shards WHERE user_id=? AND slot=?');
const {key:engineKey,appSource}=preparedEngineSource();if(engineKey!==workerData.engine)throw Error('Engine sources changed before preparation');
let pending=null,active=null,running=false,idleTimer=null;
const send=value=>parentPort.postMessage({user:active?.user,slot:active?.slot,token:active?.token,...value});
function load(job){
 let meta,rows;source.exec('BEGIN');try{
  meta=metadata.get(job.user,job.slot);if(meta&&meta.rev===job.rev&&meta.digest===job.digest)rows=fields.all(job.user,job.slot);
 }finally{source.exec('ROLLBACK')}
 if(!rows)return null;
 // Release the SQLite read snapshot before CPU-heavy decompression, so a
 // non-WAL source cannot hold up an otherwise prepared foreground commit.
 const wire={},hashes=new Map(),compressed=new Map();for(const row of rows){
  compressed.set(row.field,row.content);const bytes=gunzipSync(row.content);hashes.set(row.field,createHash('sha256').update(bytes).digest('hex'));
  Object.defineProperty(wire,row.field,{value:JSON.parse(bytes.toString()),enumerable:true,writable:true,configurable:true});
 }
 return {meta,wire,hashes,compressed};
}

async function calculate(job){
 const snapshot=load(job);if(!snapshot)return;
 const codec=createNativeSaveCodec();let {wire,hashes,compressed}=snapshot,state=await codec.restore(wire,{takeOwnership:true}),rev=job.rev,digest=job.digest;
 active.known=new Map([[rev,digest]]);
 for(let index=0;index<job.horizon&&!active.cancelled;index++){
  await yieldLoop();if(active.cancelled||Date.now()-active.lastTouch>60000||prepared.generation(job.user,job.slot)!==job.generation)break;
  const current=metadata.get(job.user,job.slot);
  if(!current||active.known.get(current.rev)!==current.digest){send({type:'invalidated',user:job.user,slot:job.slot});break}
  if(process.memoryUsage().rss>workerData.maxRssBytes){send({type:'paused',reason:'memory-budget'});break}
  const disk=statfsSync(dirname(workerData.cache));if(disk.bavail*disk.bsize<1024**3){send({type:'paused',reason:'disk-budget'});break}
  const existing=prepared.get(job.user,job.slot,workerData.engine,rev,digest);
  if(existing){
   const previous=wire,next={...wire};for(const [key,raw] of existing.set){next[key]=JSON.parse(raw);compressed.set(key,gzipSync(raw,{level:1}));hashes.set(key,createHash('sha256').update(raw).digest('hex'))}
   for(const key of existing.unset){delete next[key];compressed.delete(key);hashes.delete(key)}
   state=restoreNativeSave(next,{previousWire:previous,previousState:state,changedKeys:[...existing.set.map(([key])=>key),...existing.unset]});wire=next;rev++;digest=existing.nextDigest;active.known.set(rev,digest);continue;
  }
  const started=performance.now(),tracked=isNativeSave(wire)?codec.track(state,wire):null,assembled=performance.now();
  const outcome=runOriginalEngineDay(state,{appSource},{takeOwnership:true,...(tracked?{cloneState:tracked.clone,readArchive:tracked.raw}:{})}),engineDone=performance.now();
  const packed=await codec.pack(outcome.state),packedAt=performance.now(),delta=nativeWireDelta(wire,packed,hashes,codec.reusedFields()),compared=performance.now();
  const nextDigest=nativeDeltaDigest(digest,rev+1,delta.serializedSet,delta.unset);
  const normalized={...packed};for(const [key,raw] of delta.serializedFields)normalized[key]=JSON.parse(raw);
  state=restoreNativeSave(normalized,{previousWire:packed,previousState:outcome.state,changedKeys:[...delta.serializedFields.keys()]});
  codec.release();wire=normalized;hashes=delta.fieldHashes;
  const timing={storageFormat:'server-json-v1',restoreMs:Math.round(assembled-started),engineMs:Math.round(engineDone-assembled),packMs:Math.round(packedAt-engineDone),deltaMs:Math.round(compared-packedAt),totalMs:Math.round(performance.now()-started),changedFields:delta.serializedSet.size,totalFields:Object.keys(wire).length};
  const compact={set:{},patches:{},unset:delta.unset},shards=[];
  for(const [key,raw] of delta.serializedSet){
   const bytes=gzipSync(raw,{level:1});shards.push([key,bytes.toString('base64')]);
   const nextValue=wire[key],old=compressed.get(key);
   if(old){const ops=diffNativeValue(JSON.parse(gunzipSync(old).toString()),nextValue);if(ops.every(([,path])=>path.length<=64&&path.every(key=>!['__proto__','constructor','prototype'].includes(String(key))))&&JSON.stringify(ops).length<raw.length*.75)compact.patches[key]=ops;else compact.set[key]=nextValue}
   else compact.set[key]=nextValue;
   compressed.set(key,bytes);
  }
  for(const key of delta.unset)compressed.delete(key);
  timing.compactJsonBytes=Buffer.byteLength(JSON.stringify(compact));timing.preparedShardBytes=shards.reduce((sum,[,b])=>sum+Buffer.byteLength(b,'base64'),0);
  timing.artifactMs=Math.round(performance.now()-started-timing.totalMs);timing.totalMs=Math.round(performance.now()-started);
  const fast={shards,delta:compact,result:{...outcome.result,timing}};
  const saved=prepared.put(job.user,job.slot,workerData.engine,rev,digest,nextDigest,{set:[...delta.serializedSet],unset:delta.unset,result:{...outcome.result,timing}},job.generation,fast);
  if(!saved){send({type:'paused',reason:'cache-budget'});break}
  rev++;digest=nextDigest;active.known.set(rev,digest);
  send({type:'ready',user:job.user,slot:job.slot,revision:rev,prepared:index+1,horizon:job.horizon});
 }
}
async function drain(){
 if(running)return;running=true;let last=null;
 try{while(pending){const job=pending;pending=null;active={...job,cancelled:false,lastTouch:Date.now(),known:new Map([[job.rev,job.digest]])};last=active;try{await calculate(job)}catch(error){send({type:'paused',reason:'engine-error'});console.error('Background day preparation failed:',error?.message)}active=null;}}
 finally{running=false;idleTimer=setTimeout(()=>process.exit(0),300000);idleTimer.unref();send({type:'idle',user:last?.user,slot:last?.slot,token:last?.token})}
}
parentPort.on('message',job=>{
 if(job.type==='cancel'){if(active&&active.user===job.user&&active.slot===job.slot)active.cancelled=true;if(pending&&pending.user===job.user&&pending.slot===job.slot)pending=null;return}
 if(job.type!=='ensure')return;
 if(idleTimer)clearTimeout(idleTimer);
 if(active&&!active.cancelled&&active.generation===job.generation&&active.user===job.user&&active.slot===job.slot&&active.known.get(job.rev)===job.digest){active.token=job.token;active.lastTouch=Date.now();return;}
 if(active)active.cancelled=true;pending=job;void drain();
});
