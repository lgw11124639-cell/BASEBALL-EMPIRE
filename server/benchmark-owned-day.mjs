// Detached benchmark. The production DB is opened READ ONLY; no revision,
// request receipt, game date or player record is ever committed.
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
 for(const row of db.prepare('SELECT field,content FROM be_save_shards WHERE user_id=? AND slot=?').all(source.user_id,'main')){
  const bytes=gunzipSync(row.content);hashes.set(row.field,createHash('sha256').update(bytes).digest('hex'));Object.defineProperty(wire,row.field,{value:JSON.parse(bytes.toString()),enumerable:true,writable:true,configurable:true});
 }
 db.exec('ROLLBACK');
}finally{db.close()}
if(!isNativeSave(wire))throw Error('This benchmark requires an already migrated server JSON save');
const codec=createNativeSaveCodec(),appSource=readFileSync(new URL('../app.js',import.meta.url),'utf8');
let state=await codec.restore(wire,{takeOwnership:true});
console.log(JSON.stringify({stage:'read-only-source-loaded',databaseReadOnly:true,productionWrites:false,coldReadMs:Math.round(performance.now()-started),sourceRevision:source.rev}));
for(let index=0;index<days;index++){
 const t=performance.now(),tracked=codec.track(state,wire),assembled=performance.now();
 const outcome=runOriginalEngineDay(state,{appSource},{takeOwnership:true,cloneState:tracked.clone,readArchive:tracked.raw}),engineDone=performance.now();
 const packed=await codec.pack(outcome.state),packedAt=performance.now(),delta=nativeWireDelta(wire,packed,hashes,codec.reusedFields()),comparedAt=performance.now();
 const normalized={...packed};for(const [key,raw] of delta.serializedFields)normalized[key]=JSON.parse(raw);
 state=restoreNativeSave(normalized,{previousWire:packed,previousState:outcome.state,changedKeys:[...delta.serializedFields.keys()]});
 codec.release();wire=normalized;hashes=delta.fieldHashes;
 const memory=process.memoryUsage();
 console.log(JSON.stringify({stage:'detached-day-benchmark',day:index+1,productionWrites:false,totalMs:Math.round(performance.now()-t),assembleMs:Math.round(assembled-t),engineMs:Math.round(engineDone-assembled),packMs:Math.round(packedAt-engineDone),compareMs:Math.round(comparedAt-packedAt),normalizeMs:Math.round(performance.now()-comparedAt),changedFields:Object.keys(delta.set).length,reusedFields:hashes.size-delta.serializedFields.size,rssMiB:Math.round(memory.rss/1048576),heapUsedMiB:Math.round(memory.heapUsed/1048576),peakRssMiB:Math.round(process.resourceUsage().maxRSS/1024),enginePhases:outcome.result.enginePhases}));
}
console.log(JSON.stringify({success:true,productionWrites:false,productionDayUnchanged:true}));
