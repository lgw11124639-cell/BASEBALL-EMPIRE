// Detached benchmark. The production DB is opened READ ONLY; no revision,
// request receipt, game date or player record is ever committed.
import {Session} from 'node:inspector';
import {cpus} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createNativeSaveCodec,nativeWireDelta} from './native-save-codec.mjs';
import {restoreNativeSave,isNativeSave} from '../native-save.js';
import {runOriginalEngineDay} from './original-engine-day.mjs';
const args=process.argv.slice(2),databaseIndex=args.indexOf('--database');
if(databaseIndex<0||!args[databaseIndex+1])throw Error('Usage: node --max-old-space-size=2496 server/benchmark-owned-day.mjs --database /opt/baseball-empire-api/data/saves.sqlite');
const days=Math.min(5,Math.max(1,Number(args[args.indexOf('--days')+1])||3));
const db=new DatabaseSync(resolve(args[databaseIndex+1]),{readOnly:true});
let wire={},hashes=new Map(),source;
const started=performance.now();
try{
 db.exec('BEGIN');
 source=db.prepare("SELECT * FROM be_save_shard_meta WHERE slot='main' ORDER BY compressed_bytes DESC LIMIT 1").get();
 if(!source)throw Error('No saved main slot');
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='be_day_requests'").get()){
  for(const row of db.prepare("SELECT response FROM be_day_requests WHERE user_id=? AND slot='main' ORDER BY rowid DESC LIMIT 5").all(source.user_id)){
   const receipt=JSON.parse(row.response);if(receipt.day?.from&&receipt.day?.to)console.log(JSON.stringify({stage:'latest-committed-day',productionWrites:false,revision:receipt.rev,requestId:receipt.request_id,from:receipt.day.from,to:receipt.day.to,timing:receipt.day.timing}));
  }
 }

 for(const row of db.prepare('SELECT field,content FROM be_save_shards WHERE user_id=? AND slot=?').all(source.user_id,'main')){
  const bytes=gunzipSync(row.content);hashes.set(row.field,createHash('sha256').update(bytes).digest('hex'));Object.defineProperty(wire,row.field,{value:JSON.parse(bytes.toString()),enumerable:true,writable:true,configurable:true});
 }
 db.exec('ROLLBACK');
}finally{db.close()}
if(!isNativeSave(wire))throw Error('This benchmark requires an already migrated server JSON save');
const codec=createNativeSaveCodec(),appSource=readFileSync(new URL('../app.js',import.meta.url),'utf8');
let state=await codec.restore(wire,{takeOwnership:true}),runtime=null;
console.log(JSON.stringify({cpuModel:cpus()[0]?.model,cpuCount:cpus().length,leagueCases:state.leagueOffice?.governance?.cases?.length||0,stage:'read-only-source-loaded',databaseReadOnly:true,productionWrites:false,coldReadMs:Math.round(performance.now()-started),sourceRevision:source.rev}));
for(let index=0;index<days;index++){
 let profiler=null;const post=(session,method)=>new Promise((ok,fail)=>session.post(method,(error,result)=>error?fail(error):ok(result)));
 if(args.includes('--profile')){profiler=new Session();profiler.connect();await post(profiler,'Profiler.enable');await post(profiler,'Profiler.start')}
 const t=performance.now(),tracked=codec.track(state,wire),assembled=performance.now();
 const cpuBefore=process.cpuUsage();
 let outcome;const requested={year:state.year,day:state.day};
 try{outcome=runOriginalEngineDay(state,{appSource},{takeOwnership:true,runtime,cloneState:tracked.clone,readArchive:tracked.raw})}catch(error){console.error(JSON.stringify({stage:'detached-day-error',requested,productionWrites:false,message:String(error?.message||error),stack:String(error?.stack||'').slice(0,5000)}));throw error}
 const engineDone=performance.now(),cpuAfter=process.cpuUsage(cpuBefore),engineCpuMs=(cpuAfter.user+cpuAfter.system)/1000;
 if(profiler){const {profile}=await post(profiler,'Profiler.stop');profiler.disconnect();const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();for(const id of profile.samples||[]){const f=nodes.get(id)?.callFrame;if(!f)continue;const key=(f.functionName||'<anonymous>')+':'+(f.lineNumber+1)+' '+String(f.url).split('/').at(-1);counts.set(key,(counts.get(key)||0)+1)}console.log(JSON.stringify({stage:'engine-cpu-profile',engineCpuMs:Math.round(engineCpuMs),cpuToWall:+(engineCpuMs/(engineDone-assembled)).toFixed(2),top:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([functionName,samples])=>({functionName,samplePercent:+(100*samples/(profile.samples?.length||1)).toFixed(1)}))}))}
 const packed=await codec.pack(outcome.state),packedAt=performance.now(),delta=nativeWireDelta(wire,packed,hashes,codec.reusedFields()),comparedAt=performance.now();
 const normalized={...packed};for(const [key,raw] of delta.serializedFields)normalized[key]=JSON.parse(raw);
 state=restoreNativeSave(normalized,{previousWire:packed,previousState:outcome.state,changedKeys:[...delta.serializedFields.keys()]});
 codec.release();runtime=outcome.runtime;runtime?.park(state);wire=normalized;hashes=delta.fieldHashes;
 const memory=process.memoryUsage();
 console.log(JSON.stringify({stage:'detached-day-benchmark',day:index+1,processedDate:outcome.result.from?.date,productionWrites:false,totalMs:Math.round(performance.now()-t),assembleMs:Math.round(assembled-t),engineMs:Math.round(engineDone-assembled),engineReused:index>0,engineCpuMs:Math.round(engineCpuMs),cpuToWall:+(engineCpuMs/(engineDone-assembled)).toFixed(2),packMs:Math.round(packedAt-engineDone),compareMs:Math.round(comparedAt-packedAt),normalizeMs:Math.round(performance.now()-comparedAt),changedFields:Object.keys(delta.set).length,reusedFields:hashes.size-delta.serializedFields.size,rssMiB:Math.round(memory.rss/1048576),heapUsedMiB:Math.round(memory.heapUsed/1048576),peakRssMiB:Math.round(process.resourceUsage().maxRSS/1024),enginePhases:outcome.result.enginePhases}));
}
const verification=new DatabaseSync(resolve(args[databaseIndex+1]),{readOnly:true});try{const final=verification.prepare('SELECT rev,digest FROM be_save_shard_meta WHERE user_id=? AND slot=?').get(source.user_id,'main');if(final?.rev!==source.rev||final?.digest!==source.digest)throw Error('Source save changed concurrently during detached benchmark')}finally{verification.close()}
console.log(JSON.stringify({success:true,productionWrites:false,productionDayUnchanged:true}));
