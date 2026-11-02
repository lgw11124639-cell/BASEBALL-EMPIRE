import {Worker} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {totalmem} from 'node:os';
import {preparedEngineSource} from './precompute-engine-key.mjs';
import {setTimeout as pause} from 'node:timers/promises';
import {createPreparedDayStore} from './prepared-day-store.mjs';
export function createPrecomputeController({database,metadata,horizon=366,cachePath=null}){
 horizon=Math.max(1,Math.min(366,Number(horizon)||366));
 const directory=cachePath?dirname(cachePath):resolve(dirname(database),'prepared-days');mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
 const cache=cachePath||resolve(directory,'queue.sqlite'),engineKey=preparedEngineSource().key,queue=createPreparedDayStore(new DatabaseSync(cache),{busyTimeoutMs:20}),requests=new Map(),paused=new Map();chmodSync(cache,0o600);queue.pruneEngine(engineKey);
 let worker=null,working=false,owner=null,closed=false,serial=0,suspensions=0;
 const key=(user,slot)=>JSON.stringify([user,slot]),same=(a,b)=>a&&b&&a.user===b.user&&a.slot===b.slot;
 function dispatch(job){
  if(closed)return;
  job={...job,token:same(owner,job)&&working?owner.token:++serial};
  if(!worker){
   const instance=new Worker(new URL('./precompute-worker.mjs',import.meta.url),{workerData:{database,cache,engine:engineKey,maxRssBytes:totalmem()*.70},resourceLimits:{maxOldGenerationSizeMb:Math.min(1536,Math.floor(totalmem()/1048576*.4))}});worker=instance;
   instance.on('message',event=>{
    if(worker!==instance||event.token!==owner?.token)return;
    if(event.type==='ready'&&same(owner,event)){working=true;paused.delete(key(event.user,event.slot));if(requests.size)next()}
    if(event.type==='paused'){paused.set(key(event.user,event.slot),{reason:event.reason,until:Date.now()+60000});if(same(owner,event))working=false}
    if(event.type==='invalidated'){working=false;const current=metadata(event.user,event.slot);if(current)requests.set(key(event.user,event.slot),{type:'ensure',user:event.user,slot:event.slot,rev:current.rev,digest:current.digest,horizon,generation:queue.generation(event.user,event.slot)})}
    if(event.type==='idle'&&same(owner,event)){
     working=false;if(requests.size)next();else{worker=null;owner=null;void instance.terminate()}
    }
   });
   instance.on('error',()=>{if(worker===instance&&owner)paused.set(key(owner.user,owner.slot),{reason:'worker-error',until:Date.now()+60000})});
   instance.on('exit',()=>{if(worker===instance){worker=null;working=false;owner=null;next()}});instance.unref();
  }
  owner=job;working=true;try{worker.postMessage(job)}catch{requests.set(key(job.user,job.slot),job)}
 }
 function next(){if(!closed&&!suspensions&&requests.size){const [id,job]=requests.entries().next().value;requests.delete(id);const current=metadata(job.user,job.slot);if(current)dispatch({...job,rev:current.rev,digest:current.digest,generation:queue.generation(job.user,job.slot)});else next()}}
 function ensure(user,slot,revision,digest){
  if(closed||!Number.isSafeInteger(revision)||revision<1||typeof digest!=='string')return;
  const id=key(user,slot);if((paused.get(id)?.until||0)>Date.now())return;paused.delete(id);
  try{
   queue.prune(user,slot,engineKey,revision);const status=queue.status(user,slot,engineKey,revision,digest);
   if((!worker||!same(owner,{user,slot}))&&status.ready>=30&&queue.has(user,slot,engineKey,revision,digest))return;
   const job={type:'ensure',user,slot,rev:revision,digest,horizon,generation:queue.generation(user,slot)};
   if(suspensions||(worker&&working&&!same(owner,job))){if(requests.size<32||requests.has(id))requests.set(id,job);return}
   dispatch(job);
  }catch{paused.set(id,{reason:'cache-unavailable',until:Date.now()+60000})}
 }
 return {
  async pause(){
   suspensions++;
   if(worker){const instance=worker;if(owner){const current=metadata(owner.user,owner.slot);if(current&&queue.status(owner.user,owner.slot,engineKey,current.rev,current.digest).ready<30)requests.set(key(owner.user,owner.slot),owner);}worker=null;working=false;owner=null;instance.ref();await instance.terminate()}
  },
  resume(){suspensions=Math.max(0,suspensions-1);if(!suspensions)next()},
  getFast(user,slot,revision,digest){return queue.getFast(user,slot,engineKey,revision,digest)},
  get(user,slot,revision,digest){return queue.get(user,slot,engineKey,revision,digest)},
  ensure,
  async wait(user,slot,revision,digest,{timeoutMs=120000}={}){
   ensure(user,slot,revision,digest);const until=Date.now()+timeoutMs;
   while(Date.now()<until&&!closed){
    const ready=queue.get(user,slot,engineKey,revision,digest);if(ready)return ready;
    const current=metadata(user,slot);if(!current||current.rev!==revision||current.digest!==digest||paused.has(key(user,slot)))return null;
    if(!worker)ensure(user,slot,revision,digest);
    await pause(100);
   }
   return null;
  },
  committed(user,slot,revision,digest){setImmediate(()=>{if(!closed)ensure(user,slot,revision,digest)})},
  invalidate(user,slot){const id=key(user,slot);paused.delete(id);requests.delete(id);try{queue.invalidate(user,slot)}catch{paused.set(id,{reason:'cache-unavailable',until:Date.now()+60000})}worker?.postMessage({type:'cancel',user,slot});if(same(owner,{user,slot})){working=false;owner.token=++serial}},
  status(user,slot,revision){const current=metadata(user,slot);return {enabled:true,...(current?queue.status(user,slot,engineKey,revision,current.digest):{ready:0,bytes:0}),working:working&&same(owner,{user,slot}),horizon,pausedReason:suspensions?'save-operation':paused.get(key(user,slot))?.reason||null}},
  async close(){closed=true;requests.clear();if(worker){worker.ref();await worker.terminate()}queue.close()}
 };
}
