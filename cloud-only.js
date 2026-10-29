// Cloud-only save transport. Never persists game state to local storage.
const API='https://baseball-empire-save.duckdns.org';
const KEY='be-cloud-session-v1';
let token=null,username='',revision=null,verified=false,baseline=null;
let gzipSaveSupported=false; // Temporarily disable gzip uploads: Content-Encoding can fail CORS preflight; retain uncompressed cloud-only PUT with If-Match.
let gzipRejectedStatus=null;
// Snapshot of the last server-acknowledged wire representation. Never stored locally.
let acknowledgedWireSave=null;
let incrementalSaveSupported=true;
const deltaProtocol='be-top-level-delta-v1';
function makeCloudDelta(previous,current){
 if(!previous||typeof previous!=='object'||!current||typeof current!=='object')return null;
 const set=Object.create(null),unset=[];
 for(const key of Object.keys(previous))if(!Object.prototype.hasOwnProperty.call(current,key))unset.push(key);
 for(const [key,value] of Object.entries(current)){
  if(!Object.prototype.hasOwnProperty.call(previous,key)){set[key]=value;continue;}
  const before=previous[key];
  // Shard payloads are immutable base64 strings. Compare them directly rather
  // than JSON-encoding both multi-kilobyte strings on every save.
  if(typeof value==='string'&&typeof before==='string'){if(value!==before)set[key]=value;continue;}
  if(value===before)continue;
  if(JSON.stringify(value)!==JSON.stringify(before))set[key]=value;
 }
 return {protocol:deltaProtocol,set,unset};
}
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s?.token&&s?.username&&Number(s.expiresAt)>Date.now()){token=s.token;username=s.username}else localStorage.removeItem(KEY)}catch(_){try{localStorage.removeItem(KEY)}catch(_){}}
function remember(){try{if(token)localStorage.setItem(KEY,JSON.stringify({token,username,expiresAt:Date.now()+6*24*60*60*1000}));else localStorage.removeItem(KEY)}catch(_){}}
// Lossless replay-event packing inside the JSON save (no Content-Encoding header).
// The live game state is never mutated; old uncompressed saves remain readable.
const replayCompressionCache=new WeakMap();
async function packReplayResults(state){
 if(typeof CompressionStream!=='function'||typeof TextEncoder==='undefined'||!Array.isArray(state?.gameResults))return state;
 const games=state.gameResults;let changed=false;
 const packed=await Promise.all(games.map(async game=>{
  if(!Array.isArray(game?.broadcastEvents)||!game.broadcastEvents.length)return game;
  const events=game.broadcastEvents;
  // Validate the full event payload before reusing compressed replay data.
  const raw=JSON.stringify(events);
  const prior=replayCompressionCache.get(events);
  if(prior&&prior.raw===raw){
   if(!prior.encoded)return game;
   changed=true;if(prior.game===game&&prior.packedGame)return prior.packedGame;
   const copy={...game};delete copy.broadcastEvents;copy.bePackedBroadcastGzip=prior.encoded;
   prior.game=game;prior.packedGame=copy;return copy;
  }
  if(raw.length<1500)return game;
  try{
   const bytes=new TextEncoder().encode(raw);
   const zipped=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
   let binary='';for(let i=0;i<zipped.length;i+=8192)binary+=String.fromCharCode(...zipped.subarray(i,i+8192));
   const encoded=btoa(binary);
   const useful=encoded.length<raw.length*.85;
   if(!useful){replayCompressionCache.set(events,{raw,encoded:null});return game;}
   changed=true;const copy={...game};delete copy.broadcastEvents;copy.bePackedBroadcastGzip=encoded;
   replayCompressionCache.set(events,{raw,encoded,game,packedGame:copy});return copy;
  }catch(_){return game}
 }));
 return changed?{...state,gameResults:packed}:state;
}
async function unpackReplayResults(state){
 if(!Array.isArray(state?.gameResults))return state;
 const packed=state.gameResults.filter(g=>typeof g?.bePackedBroadcastGzip==='string');
 if(!packed.length)return state;
 if(typeof DecompressionStream!=='function')throw Error('이 저장 데이터를 불러오려면 gzip 압축 해제를 지원하는 브라우저가 필요합니다');
 await Promise.all(packed.map(async game=>{
  const binary=atob(game.bePackedBroadcastGzip);const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const events=JSON.parse(await new Response(stream).text());
  if(!Array.isArray(events))throw Error('경기 다시보기 데이터 형식이 올바르지 않습니다');
  game.broadcastEvents=events;delete game.bePackedBroadcastGzip;
 }));return state;
}
// Split the two frequently updated archives into independently replaceable top-level
// gzip shards. The server's existing revision-checked top-level PATCH needs no changes.
// Old saves remain readable; new saves reconstruct identical arrays on load.
const shardArrayFields={players:64,gameResults:24};
// Auxiliary archives may contain nested objects, not arrays; inspect their shape
// before selecting a lossless sharding strategy. Read-only diagnostics only.
const shardGzipCache=new Map();
async function encodeCloudShard(raw,cacheKey){
 const prior=shardGzipCache.get(cacheKey);
 if(prior?.raw===raw)return prior.encoded;
 const zipped=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 let binary='';for(let i=0;i<zipped.length;i+=8192)binary+=String.fromCharCode(...zipped.subarray(i,i+8192));
 const encoded=btoa(binary);
 shardGzipCache.set(cacheKey,{raw,encoded});
 return encoded;
}
async function packCloudShards(state){
 if(typeof CompressionStream!=='function'||typeof TextEncoder==='undefined')return state;
 const targets=Object.entries(shardArrayFields).filter(([key])=>Array.isArray(state?.[key]));
 if(!targets.length)return state;
 const copy={...state},manifest={version:1,fields:{}};
 const packed=await Promise.all(targets.map(async([key,size])=>{
  const array=state[key],count=Math.ceil(array.length/size);
  const entries=await Promise.all(Array.from({length:count},async(_,i)=>{
   const raw=JSON.stringify(array.slice(i*size,(i+1)*size));
   return [`beShard_${key}_${i}`,await encodeCloudShard(raw,`${key}:${i}`)];
  }));
  return {key,size,length:array.length,count,entries};
 }));
 for(const {key,size,length,count,entries} of packed){
  manifest.fields[key]={count,length,size};
  for(const [name,encoded] of entries)copy[name]=encoded;
  delete copy[key];
 }
 copy.beShardManifest=manifest;
 return copy;
}
async function unpackCloudShards(state){
 const manifest=state?.beShardManifest;
 if(!manifest)return state;
 if(manifest.version!==1||!manifest.fields||typeof manifest.fields!=='object')throw Error('클라우드 분할 저장 형식이 올바르지 않습니다');
 if(typeof DecompressionStream!=='function')throw Error('클라우드 분할 저장을 해제할 수 없는 브라우저입니다');
 for(const [key,meta] of Object.entries(manifest.fields)){
  if(!Object.prototype.hasOwnProperty.call(shardArrayFields,key)||!Number.isSafeInteger(meta.count)||meta.count<0||meta.count>100000||!Number.isSafeInteger(meta.length)||meta.length<0)throw Error('클라우드 분할 저장 메타데이터가 올바르지 않습니다');
  const pieces=await Promise.all(Array.from({length:meta.count},async(_,i)=>{
   const name=`beShard_${key}_${i}`,encoded=state[name];
   if(typeof encoded!=='string')throw Error('클라우드 저장 데이터 일부가 누락되었습니다: '+name);
   const binary=atob(encoded),bytes=new Uint8Array(binary.length);
   for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);
   const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
   const decoded=JSON.parse(raw);
   if(!Array.isArray(decoded))throw Error('클라우드 저장 배열 형식 오류: '+name);
   delete state[name];return decoded;
  }));
  state[key]=pieces.flat();
  if(state[key].length!==meta.length)throw Error('클라우드 저장 배열 길이가 일치하지 않습니다: '+key);
 }
 delete state.beShardManifest;
 return state;
}
// Versioned league archive shards; legacy whole-field gzip remains supported.
const leagueShardFields=['highSchoolBaseball','collegeBaseball','minorLeague','independentBaseball'];
// Twenty-four players per chunk; the manifest records array lengths and chunk counts for backward compatibility.
const leagueShardSize=24;
function leagueShardName(field,season,name,i){return 'beLeaguePart_'+field+'_'+encodeURIComponent(season)+'_'+encodeURIComponent(name)+'_'+i}
async function packLeagueShards(state){
 if(typeof CompressionStream!=='function')return state;
 const targets=leagueShardFields.filter(field=>state?.[field]&&typeof state[field]==='object'&&!Array.isArray(state[field]));
 if(!targets.length)return state;
 const copy={...state},manifest={version:1,fields:{}};
 const packed=await Promise.all(targets.map(async field=>{
  const seasons={},parts=[];
  for(const [season,node] of Object.entries(state[field])){
   if(!node||typeof node!=='object'||Array.isArray(node))return null;
   const descriptors=[];
   for(const [name,value] of Object.entries(node)){
    const isArray=Array.isArray(value),count=isArray?Math.ceil(value.length/leagueShardSize):1;
    descriptors.push({name,kind:isArray?'array':'value',length:isArray?value.length:null,count});
    for(let i=0;i<count;i++)parts.push({name:leagueShardName(field,season,name,i),raw:JSON.stringify(isArray?value.slice(i*leagueShardSize,(i+1)*leagueShardSize):value)});
   }
   seasons[season]=descriptors;
  }
  const started=performance.now();
  let cacheHits=0,changed=0,rawBytes=0,encodedBytes=0;
  const changedFields=Object.create(null);
  const changedPlayerChunks=Object.create(null);
  const changedPlayerProperties=Object.create(null);
  const encoded=await Promise.all(parts.map(async p=>{
   rawBytes+=p.raw.length;
   if(shardGzipCache.get(p.name)?.raw===p.raw)cacheHits++;else{changed++;const fieldName=p.name.split('_').slice(2,-1).join('_');changedFields[fieldName]=(changedFields[fieldName]||0)+1;if(window.beCloudDeepPlayerDiagnostics===true&&(fieldName.includes('players')||fieldName.includes('prospects'))){const prior=shardGzipCache.get(p.name)?.raw;try{const before=prior?JSON.parse(prior):null;const after=JSON.parse(p.raw);if(Array.isArray(before)&&Array.isArray(after)){let altered=0;for(let i=0;i<after.length;i++)if(JSON.stringify(before[i])!==JSON.stringify(after[i])){altered++;if(before[i]&&after[i]&&typeof before[i]==='object'&&typeof after[i]==='object'){for(const k of new Set([...Object.keys(before[i]),...Object.keys(after[i])])){if(JSON.stringify(before[i][k])!==JSON.stringify(after[i][k])){const label=fieldName+'/'+k;changedPlayerProperties[label]=(changedPlayerProperties[label]||0)+1;}}}}changedPlayerChunks[fieldName]=(changedPlayerChunks[fieldName]||0)+altered;}}catch(_){}}}
   const value=await encodeCloudShard(p.raw,p.name);
   encodedBytes+=value.length;
   return [p.name,value];
  }));
  return {field,seasons,encoded,diagnostic:{field,parts:parts.length,cacheHits,changed,rawBytes,encodedBytes,changedFields,changedPlayerChunks,changedPlayerProperties,gzipMs:+(performance.now()-started).toFixed(1)}};
 }));
 if(packed.some(x=>!x))return state;
 window.beCloudLeagueShardTiming=packed.map(x=>x.diagnostic);
 for(const {field,seasons,encoded} of packed){
  manifest.fields[field]={seasons};
  for(const [name,value] of encoded)copy[name]=value;
  delete copy[field];
 }
 copy.beLeagueShardManifest=manifest;
 return copy;
}
async function unpackLeagueShards(state){
 const manifest=state?.beLeagueShardManifest;
 if(!manifest)return state;
 if(manifest.version!==1||!manifest.fields||typeof manifest.fields!=='object')throw Error('리그 저장 메타데이터 오류');
 if(typeof DecompressionStream!=='function')throw Error('리그 기록 압축 해제 불가');
 for(const [field,meta] of Object.entries(manifest.fields)){
  if(!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(field)||field==='__proto__'||field==='constructor'||field==='prototype'||!meta?.seasons||typeof meta.seasons!=='object')throw Error('리그 저장 필드 오류: '+field);
  const root={};
  for(const [season,descriptors] of Object.entries(meta.seasons)){
   if(!Array.isArray(descriptors))throw Error('리그 시즌 메타데이터 오류');
   const entries=await Promise.all(descriptors.map(async d=>{
    if(typeof d.name!=='string'||!Number.isSafeInteger(d.count)||d.count<0||d.count>100000||!['array','value'].includes(d.kind)||d.kind==='array'&&(!Number.isSafeInteger(d.length)||d.length<0)||d.kind==='value'&&d.count!==1)throw Error('리그 묶음 메타데이터 오류');
    const pieces=await Promise.all(Array.from({length:d.count},async(_,i)=>{
     const key=leagueShardName(field,season,d.name,i),encoded=state[key];
     if(typeof encoded!=='string')throw Error('리그 기록 누락: '+key);
     const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
     const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
     return {key,value:JSON.parse(raw)};
    }));
    const value=d.kind==='array'?pieces.flatMap(p=>{
     if(!Array.isArray(p.value))throw Error('리그 배열 형식 오류');
     return p.value;
    }):pieces[0].value;
    if(d.kind==='array'&&value.length!==d.length)throw Error('리그 기록 길이 불일치');
    return {name:d.name,value,keys:pieces.map(p=>p.key)};
   }));
   const node={};
   for(const e of entries){if(Object.prototype.hasOwnProperty.call(node,e.name))throw Error('리그 중복 필드');node[e.name]=e.value;for(const key of e.keys)delete state[key]}
   root[season]=node;
  }
  state[field]=root;
 }
 delete state.beLeagueShardManifest;
 return state;
}
// Stable, independently compressed amateur-career buckets. Old saves remain readable.
const amateurBucketCount=32;
function amateurBucket(key){let h=2166136261;for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0)%amateurBucketCount}
async function packAmateurBuckets(state){
 const data=state?.amateurCareerArchive;
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof CompressionStream!=='function')return state;
 const buckets=Array.from({length:amateurBucketCount},()=>({}));
 for(const [key,value] of Object.entries(data))buckets[amateurBucket(key)][key]=value;
 const encoded=await Promise.all(buckets.map((bucket,i)=>encodeCloudShard(JSON.stringify(bucket),'amateur:'+i)));
 const copy={...state};
 encoded.forEach((value,i)=>{copy['beAmateurBucket_'+i]=value});
 copy.beAmateurBucketManifest={version:1,count:amateurBucketCount,entries:Object.keys(data).length};
 delete copy.amateurCareerArchive;
 return copy;
}
async function unpackAmateurBuckets(state){
 const meta=state?.beAmateurBucketManifest;
 if(!meta)return state;
 if(meta.version!==1||meta.count!==amateurBucketCount||!Number.isSafeInteger(meta.entries)||meta.entries<0)throw Error('아마추어 경력 메타데이터 오류');
 if(typeof DecompressionStream!=='function')throw Error('아마추어 경력 압축 해제 불가');
 const chunks=await Promise.all(Array.from({length:meta.count},async(_,i)=>{
  const name='beAmateurBucket_'+i,encoded=state[name];
  if(typeof encoded!=='string')throw Error('아마추어 경력 묶음 누락: '+name);
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const obj=JSON.parse(raw);
  if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('아마추어 경력 묶음 오류');
  return obj;
 }));
 const restored={};
 for(const chunk of chunks)for(const [key,value] of Object.entries(chunk)){
  if(Object.prototype.hasOwnProperty.call(restored,key))throw Error('아마추어 경력 중복 기록');
  restored[key]=value;
 }
 if(Object.keys(restored).length!==meta.entries)throw Error('아마추어 경력 기록 개수 불일치');
 chunks.forEach((_,i)=>delete state['beAmateurBucket_'+i]);
 delete state.beAmateurBucketManifest;
 state.amateurCareerArchive=restored;
 return state;
}
// Lossless packing for large auxiliary league datasets. Only the wire snapshot changes.
const auxiliarySaveFields=['gameResults','highSchoolBaseball','collegeBaseball','nationalTeamResults','minorLeague','amateurCareerArchive','players'];
// Reuse compressed bytes when an auxiliary dataset has not changed identity.
const auxiliaryCompressionCache=new WeakMap();
// Cross-object cache: safe even when a render/simulation rebuilds an archive object.
// Reuse only after exact serialized JSON equality; never trust reference identity alone.
const auxiliaryLastCompressed=new Map();
const auxiliaryArchiveProbe=new Map();
function beProbeAuxiliaryArchive(key,raw){
 const prior=auxiliaryArchiveProbe.get(key);
 const now={bytes:raw.length,changed:prior!==undefined&&prior!==raw,initial:prior===undefined};
 auxiliaryArchiveProbe.set(key,raw);
 return now;
}

async function packAuxiliaryFields(state){
 if(typeof CompressionStream!=='function'||typeof TextEncoder==='undefined')return state;
 // Independent league archives can be compressed concurrently, while preserving
 // byte-for-byte JSON content and the existing cache / unpack format.
 const fieldTimings=[];
 // Expensive subtree diagnostics are opt-in; normal saves must not stringify archives twice.
 if(window.beCloudArchiveDiagnosticsRequested===true){
  window.beCloudArchiveDiagnosticsRequested=false;
 // Diagnostic only: discover stable internal subtrees before changing the save format.
 const archiveSubtreeShapes={};
 for(const key of ['highSchoolBaseball','collegeBaseball','minorLeague']){
  const root=state?.[key];
  if(!root||typeof root!=='object'||Array.isArray(root))continue;
  const top=Object.keys(root);
  archiveSubtreeShapes[key]=top.map(name=>{
   const node=root[name];
   const children=node&&typeof node==='object'&&!Array.isArray(node)?Object.keys(node):[];
   return {rootKey:name,kind:Array.isArray(node)?'array':typeof node,
    length:Array.isArray(node)?node.length:null,childCount:children.length,
    children:children.slice(0,20).map(k=>({key:k,kind:Array.isArray(node[k])?'array':typeof node[k],
     length:Array.isArray(node[k])?node[k].length:null}))};
  });
 }
 window.beCloudArchiveSubtreeShapes=archiveSubtreeShapes;
 window.beCloudArchiveSubtreeBytes=Object.fromEntries(
  ['highSchoolBaseball','collegeBaseball','minorLeague'].map(key=>{
   const root=state?.[key];
   const seasons=root&&typeof root==='object'&&!Array.isArray(root)?
    Object.entries(root).map(([season,node])=>({
     season,
     children:node&&typeof node==='object'&&!Array.isArray(node)?
      Object.entries(node).map(([field,value])=>({
       field,bytes:JSON.stringify(value)?.length??0,
       kind:Array.isArray(value)?'array':typeof value,
       count:Array.isArray(value)?value.length:null
      })).sort((a,b)=>b.bytes-a.bytes):[]
    })):[];
   return [key,seasons];
  })
 );

 }

 const entries=await Promise.all(auxiliarySaveFields.map(async key=>{
  if(state?.[key]===undefined)return null;
  const fieldStart=performance.now();
  const value=state[key];
  const raw=JSON.stringify(value);
  const serializedAt=performance.now();
  const archiveProbe=beProbeAuxiliaryArchive(key,raw);
  const cached=(value&&typeof value==='object'?auxiliaryCompressionCache.get(value):null)||auxiliaryLastCompressed.get(key);
  if(cached&&cached.key===key&&cached.raw===raw){fieldTimings.push({key,serializeMs:+(serializedAt-fieldStart).toFixed(1),gzipMs:0,cacheHit:true,rawBytes:raw.length,changedSinceLastSave:archiveProbe.changed,initial:archiveProbe.initial});return cached.encoded?{key,encoded:cached.encoded}:null;}
  if(!raw||raw.length<20000){fieldTimings.push({key,serializeMs:+(serializedAt-fieldStart).toFixed(1),gzipMs:0,cacheHit:false,rawBytes:raw?.length||0});return null;}
  try{
   const zipped=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
   let binary='';for(let i=0;i<zipped.length;i+=8192)binary+=String.fromCharCode(...zipped.subarray(i,i+8192));
   const encoded=btoa(binary);
   const useful=encoded.length<raw.length*.8;
   fieldTimings.push({key,serializeMs:+(serializedAt-fieldStart).toFixed(1),gzipMs:+(performance.now()-serializedAt).toFixed(1),cacheHit:false,rawBytes:raw.length,packedBytes:encoded.length,changedSinceLastSave:archiveProbe.changed,initial:archiveProbe.initial});
   const cacheEntry={key,raw,encoded:useful?encoded:null};
   if(value&&typeof value==='object')auxiliaryCompressionCache.set(value,cacheEntry);
   auxiliaryLastCompressed.set(key,cacheEntry);
   return useful?{key,encoded}:null;
  }catch(_){fieldTimings.push({key,serializeMs:+(serializedAt-fieldStart).toFixed(1),gzipMs:+(performance.now()-serializedAt).toFixed(1),failed:true});return null}
 }));
 window.beCloudFieldPackingTiming=fieldTimings.sort((a,b)=>(b.serializeMs+b.gzipMs)-(a.serializeMs+a.gzipMs));
 window.beCloudArchiveShapes=Object.fromEntries(auxiliarySaveFields.filter(key=>state?.[key]!==undefined).map(key=>{
  const value=state[key];
  const kind=Array.isArray(value)?'array':value===null?'null':typeof value;
  const keys=value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value):[];
  return [key,{kind,length:Array.isArray(value)?value.length:undefined,keyCount:keys.length,
   topKeys:keys.slice(0,15).map(k=>({key:k,kind:Array.isArray(value[k])?'array':typeof value[k],
    size:Array.isArray(value[k])?value[k].length:undefined}))}];
 }));
 window.beCloudAuxiliaryDiagnostics={fields:fieldTimings.map(x=>({...x})),totalRawBytes:fieldTimings.reduce((n,x)=>n+(x.rawBytes||0),0),cacheHits:fieldTimings.filter(x=>x.cacheHit).length,compressedFields:fieldTimings.filter(x=>x.packedBytes).length};
 const active=entries.filter(Boolean);
 if(!active.length)return state;
 const copy={...state};
 // Each auxiliary archive is an independent PATCH field, avoiding a full
 // bePackedAuxiliaryGzip retransmission when only one archive changes.
 for(const {key,encoded} of active){
  copy['bePackedAux_'+key]=encoded;
  delete copy[key];
 }
 return copy;
}
async function unpackAuxiliaryFields(state){
 const packed=state?.bePackedAuxiliaryGzip;
 const hasLegacy=packed&&typeof packed==='object';
 if(!hasLegacy&&!auxiliarySaveFields.some(key=>typeof state?.['bePackedAux_'+key]==='string'))return state;
 if(typeof DecompressionStream!=='function')throw Error('저장 데이터 압축 해제를 지원하는 브라우저가 필요합니다');
 for(const key of auxiliarySaveFields){
  const individual=state['bePackedAux_'+key];
  const encoded=typeof individual==='string'?individual:hasLegacy?packed[key]:null;
  if(typeof encoded!=='string')continue;
  const binary=atob(encoded),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  state[key]=JSON.parse(await new Response(stream).text());
  delete state['bePackedAux_'+key];
 }
 delete state.bePackedAuxiliaryGzip;
 return state;
}
// Track actual wire-payload growth without serializing the state a second time.
const cloudPayloadHistory=[];
function recordCloudPayload(bytes){
 const previous=cloudPayloadHistory.length?cloudPayloadHistory[cloudPayloadHistory.length-1]:null;
 cloudPayloadHistory.push(bytes);
 if(cloudPayloadHistory.length>11)cloudPayloadHistory.shift();
 const first=cloudPayloadHistory[0];
 window.beCloudPayloadGrowth={
  bytes,deltaBytes:previous===null?null:bytes-previous,
  windowSaves:cloudPayloadHistory.length,
  windowDeltaBytes:cloudPayloadHistory.length>1?bytes-first:0,
  averageDeltaBytes:cloudPayloadHistory.length>1?Math.round((bytes-first)/(cloudPayloadHistory.length-1)):0
 };
}
async function call(path,method='GET',data,rev,preSerializedJson){
 const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;
 if(data!==undefined)headers['Content-Type']='application/json';
 if(rev!==undefined)headers['If-Match']=String(rev);
 const measure=path==='/v2/saves/main'&&(method==='PUT'||method==='PATCH');
 const start=measure?performance.now():0;
 const json=data===undefined?undefined:(preSerializedJson===undefined?JSON.stringify(data):preSerializedJson);
 const serializedAt=measure?performance.now():0;
 let body=json;
 // Large saves are transferred compressed only when the browser supports it.
 // Retry uncompressed on unsupported-content-encoding responses; never retry conflicts.
 let compressed=false;
 if(path==='/v2/saves/main'&&method==='PUT'&&json&&json.length>100000&&gzipSaveSupported&&typeof CompressionStream==='function'){
  try{
   const stream=new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
   body=await new Response(stream).arrayBuffer();
   headers['Content-Encoding']='gzip';
   compressed=true;
  }catch(e){body=json;delete headers['Content-Encoding']}
 }
 // Audit once per page load, or when explicitly requested; avoid extra multi-megabyte JSON serialization on routine saves.
 // To request the next save audit: window.beCloudPayloadAuditRequested=true.
 // This is diagnostic only; it never changes the saved state or cloud revision.
 if(measure&&data&&typeof data==='object'&&(window.beCloudPayloadAuditRequested===true||(window.beCloudPayloadAuditSaveCount=(window.beCloudPayloadAuditSaveCount||0)+1)===1)){
  window.beCloudPayloadAuditRequested=false;
  const auditStart=performance.now();
  const previousAudit=window.beCloudPayloadAuditSnapshot||null;
  try{const sizes=Object.entries(data).map(([key,value])=>({key,bytes:JSON.stringify(value)?.length||0})).sort((a,b)=>b.bytes-a.bytes);window.beCloudPayloadAudit=sizes.slice(0,10);
   const currentAudit=Object.fromEntries(sizes.map(item=>[item.key,item.bytes]));
   window.beCloudPayloadAuditGrowth=sizes.map(item=>({key:item.key,bytes:item.bytes,delta:previousAudit===null?null:item.bytes-(previousAudit[item.key]||0)})).sort((a,b)=>(b.delta||0)-(a.delta||0)).slice(0,10);
   window.beCloudPayloadAuditSnapshot=currentAudit;
   const results=Array.isArray(data.gameResults)?data.gameResults:[];
   const sample=results.slice(-Math.min(20,results.length));
   const sampleBytes=sample.reduce((n,g)=>n+JSON.stringify(g).length,0);
   const broadcastBytes=sample.reduce((n,g)=>n+JSON.stringify(g.broadcastEvents||[]).length,0);
   window.beCloudGameResultsAudit={games:results.length,sampleGames:sample.length,sampleBytes,broadcastBytes,broadcastShare:sampleBytes?Math.round(broadcastBytes/sampleBytes*100):0};
  }catch(_){}finally{window.beCloudPayloadAuditMs=Math.round((performance.now()-auditStart)*10)/10}
 }
 const encodedAt=measure?performance.now():0;
 let response=await fetch(API+path,{method,headers,body,cache:'no-store'});
 const firstStatus=response.status;
 const firstRequestMs=measure?performance.now()-encodedAt:0;
 let retriedUncompressed=false;
 if(compressed&&(response.status===400||response.status===415)){
  gzipSaveSupported=false;
  gzipRejectedStatus=response.status;
  retriedUncompressed=true;
  delete headers['Content-Encoding'];
  response=await fetch(API+path,{method,headers,body:json,cache:'no-store'});
 }
 const receivedAt=measure?performance.now():0;
 const serverTiming=measure?response.headers.get('Server-Timing'):null;
 const serverMs=serverTiming;
 const resourceTiming=measure?performance.getEntriesByName(API+path,'resource').slice(-1)[0]:null;
 const timingBreakdown=resourceTiming?{
  dns:Math.max(0,resourceTiming.domainLookupEnd-resourceTiming.domainLookupStart),
  connect:Math.max(0,resourceTiming.connectEnd-resourceTiming.connectStart),
  requestToResponse:Math.max(0,resourceTiming.responseStart-resourceTiming.requestStart),
  download:Math.max(0,resourceTiming.responseEnd-resourceTiming.responseStart),
  duration:resourceTiming.duration,
  detailed:resourceTiming.responseStart>0&&resourceTiming.requestStart>0
 }:null;
 let result={};try{result=await response.json()}catch(_){}
 if(measure){window.beCloudSaveTiming={method,serialize:serializedAt-start,compress:encodedAt-serializedAt,network:receivedAt-encodedAt,response:performance.now()-receivedAt,bytes:json?.length||0,transferred:typeof body==='string'?body.length:body?.byteLength||0,compressed:compressed&&!retriedUncompressed,compressionAttempted:compressed,retriedUncompressed,firstStatus,firstRequestMs,gzipRejectedStatus,serverMs,timingBreakdown,finalStatus:response.status};}
 if(!response.ok){if(response.status===401){token=null;username='';verified=false;remember()}const err=Error(result.error||'HTTP '+response.status);err.status=response.status;throw err}
 return result;
}
// Read-only capability inspection for a future revision-safe incremental save API.
// Never sends a PATCH or modifies a cloud save. The existing full PUT remains authoritative.
window.beInspectIncrementalSaveSupport=async()=>{
 if(!token||!verified)throw Error('클라우드 로그인 후 실행하세요');
 const started=performance.now();
 const response=await fetch(API+'/v2/saves/main',{
  method:'OPTIONS',headers:{Accept:'application/json',Authorization:'Bearer '+token},cache:'no-store'
 });
 const allow=response.headers.get('Allow')||'';
 const acceptPatch=response.headers.get('Accept-Patch')||'';
 const accessControl=response.headers.get('Access-Control-Allow-Methods')||'';
 const methods=[allow,accessControl].join(',').split(/[\\s,]+/).filter(Boolean);
 const result={status:response.status,allow,acceptPatch,accessControl,
  patchAdvertised:methods.some(m=>m.toUpperCase()==='PATCH'),
  patchSchemaVerified:false,revisionConflictSafetyVerified:false,
  safeToEnableIncrementalSave:false,ms:Math.round(performance.now()-started),
  note:'Read-only OPTIONS probe. PATCH advertisement alone does not establish a safe delta-save contract.'};
 window.beIncrementalSaveSupport=result;return result;
};
const revisionOf=x=>{const n=Number(x?.revision??x?.rev??x?.saveRevision);return Number.isSafeInteger(n)&&n>=0?n:null};
async function snapshot(){try{return await call('/v2/saves/main')}catch(e){if(e.status===404)return null;throw e}}
// Read-only verification against the actual server snapshot; never overwrites the running game.
function canonicalCloudValue(value){
 return JSON.stringify(value,function(_key,v){
  if(v&&typeof v==='object'&&!Array.isArray(v)){
   const ordered={};for(const k of Object.keys(v).sort())ordered[k]=v[k];return ordered;
  }
  return v;
 });
}
window.beVerifyCloudServer=async()=>{
 if(!token||!verified||revision===null)throw Error('먼저 클라우드 저장을 정상적으로 불러와야 합니다');
 const start=performance.now();
 const remote=await snapshot();
 if(!remote?.save)throw Error('서버에 저장된 게임이 없습니다');
 const serverRevision=revisionOf(remote);
 const restored=await unpackReplayResults(await unpackCloudShards(await unpackLeagueShards(await unpackAmateurBuckets(await unpackAuxiliaryFields(structuredClone(remote.save))))));
 const current=baseline?.save;
 if(!current)throw Error('비교할 현재 게임 저장 상태가 없습니다');
 const keys=[...new Set([...auxiliarySaveFields,...Object.keys(shardArrayFields),...leagueShardFields,'teams','season','date','year','events'])].filter(k=>current[k]!==undefined||restored[k]!==undefined);
 const mismatches=keys.filter(k=>canonicalCloudValue(current[k])!==canonicalCloudValue(restored[k]));
 const result={ok:serverRevision===revision&&mismatches.length===0,revisionMatches:serverRevision===revision,serverRevision,localRevision:revision,checked:keys,mismatches,gameResultsCount:Array.isArray(restored.gameResults)?restored.gameResults.length:null,ms:Math.round(performance.now()-start),note:'Read-only server GET; current game state unchanged'};
 window.beCloudServerAudit=result;
 return result;
};
async function check(){if(!token)throw Error('클라우드 로그인이 필요합니다');const s=await snapshot();const rev=s?revisionOf(s):0;if(rev===null)throw Error('서버 저장 버전 확인 실패');revision=rev;verified=true;acknowledgedWireSave=s?.save||null;const restored=s?.save?await unpackReplayResults(await unpackCloudShards(await unpackLeagueShards(await unpackAmateurBuckets(await unpackAuxiliaryFields(structuredClone(s.save)))))):null;baseline={save:restored,revision:rev};return restored}
// Read-only cloud consistency audit. Never overwrites game state or save revision.
window.beAuditCloudConsistency=async function(){
 if(!token||!verified)throw Error('클라우드 로그인이 필요합니다');
 const remote=await snapshot();
 if(!remote?.save)return {ok:false,reason:'server save missing'};
 const serverRev=revisionOf(remote);
 // Compare two immutable wire snapshots. baseline.save points at the mutable
 // simulation state and can change after the save, producing false team diffs.
 const expected=acknowledgedWireSave;
 if(!expected)return {ok:false,reason:'acknowledged wire snapshot unavailable',serverRev,clientRev:revision};
 const actual=remote.save;
 const keys=[...new Set([...Object.keys(expected),...Object.keys(actual)])].sort();
 const canonical=value=>JSON.stringify(value,function(k,v){
  if(v&&typeof v==='object'&&!Array.isArray(v)){
   const ordered={};for(const name of Object.keys(v).sort())ordered[name]=v[name];return ordered;
  }return v;
 });
 const differences=[];
 for(const key of keys){
  if(canonical(expected[key])!==canonical(actual[key]))
   differences.push({field:key,localLength:Array.isArray(expected[key])?expected[key].length:null,serverLength:Array.isArray(actual[key])?actual[key].length:null});
 }
 const result={ok:serverRev===revision&&differences.length===0,clientRev:revision,serverRev,
  differences,teamDetails:[],checked:keys,comparison:'last acknowledged wire snapshot vs server wire snapshot',
  readOnly:true,at:new Date().toISOString()};
 window.beCloudTeamDiff=[];
 window.beCloudConsistencyAudit=result;
 return result;
};

// Register diagnostics at module initialization, including immediately after login/load.
// Audit only the most recent packed save; never mutate or transmit game data.
let lastPackingAuditPayload=null,lastPackingAuditState=null;
// On-demand, read-only round-trip audit. No extra network calls or mutations to live state.
window.beVerifyCloudPacking=async()=>{
 if(!lastPackingAuditPayload||!lastPackingAuditState)return {ok:false,reason:'No in-memory packed save yet. Save one game day, then retry.',readOnly:true};
 const start=performance.now();
 const snapshot=JSON.parse(JSON.stringify(lastPackingAuditPayload));
 await unpackReplayResults(await unpackCloudShards(await unpackLeagueShards(await unpackAmateurBuckets(await unpackAuxiliaryFields(snapshot)))));
 const keys=[...new Set([...auxiliarySaveFields,...Object.keys(shardArrayFields),...leagueShardFields,'amateurCareerArchive'])];
 // Compare canonical JSON semantics, not object insertion order. Packed replay
 // events are restored after the auxiliary archive, changing property order.
 const canonical=value=>JSON.stringify(value, function(key,v){
  if(v&&typeof v==='object'&&!Array.isArray(v)){
   const ordered={};for(const k of Object.keys(v).sort())ordered[k]=v[k];return ordered;
  }
  return v;
 });
 const mismatches=keys.filter(key=>canonical(snapshot[key])!==canonical(lastPackingAuditState[key]));
 const result={ok:mismatches.length===0,checked:keys.filter(key=>lastPackingAuditState[key]!==undefined),mismatches,ms:Math.round(performance.now()-start),source:'latest in-memory save payload; does not test server reload'};
 window.beCloudRoundTripAudit=result;
 return result;
};

export async function cloudSave(state){
 if(!state)throw Error('저장할 게임이 없습니다');
 if(!token||!verified||revision===null)throw Error('클라우드 로그인 또는 저장 상태 확인이 필요합니다');
 // Optimistic concurrency: the server validates If-Match atomically on PUT.
 // Avoid a redundant full snapshot GET before every daily save.
 // A 409/412 still blocks progress and requires a fresh login/load.
 let result;
 let payload;
 try{
  const packStarted=performance.now();
  // gameResults is already losslessly gzip-packed by packAuxiliaryFields.
  // Avoid individually gzipping every broadcast and then gzipping the entire archive again.
  // Legacy bePackedBroadcastGzip saves are still decoded by unpackReplayResults on load.
  const replayPacked=state;
  const replayPackedAt=performance.now();
  const shards=await packCloudShards(replayPacked);
  const shardPackedAt=performance.now();
  const amateur=await packAmateurBuckets(shards);
  const amateurPackedAt=performance.now();
  const leagues=await packLeagueShards(amateur);
  const leaguePackedAt=performance.now();
  payload=await packAuxiliaryFields(leagues);
  const auxiliaryPackedAt=performance.now();
  window.beCloudPackingStages={shardsMs:+(shardPackedAt-replayPackedAt).toFixed(1),amateurMs:+(amateurPackedAt-shardPackedAt).toFixed(1),leaguesMs:+(leaguePackedAt-amateurPackedAt).toFixed(1),auxiliaryMs:+(auxiliaryPackedAt-leaguePackedAt).toFixed(1),totalMs:+(auxiliaryPackedAt-packStarted).toFixed(1),deepPlayerDiagnostics:window.beCloudDeepPlayerDiagnostics===true};
  lastPackingAuditPayload=payload;
  lastPackingAuditState=state;
  // Use PATCH only when a full, server-acknowledged baseline exists.
  // Compare the exact packed wire fields, not the mutable in-game state.
  const deltaStarted=performance.now();
  const delta=incrementalSaveSupported?makeCloudDelta(acknowledgedWireSave,payload):null;
  const deltaJson=delta?JSON.stringify(delta):null;
  // Estimate full size without another multi-megabyte JSON.stringify.
  // The estimate is conservative for normal ASCII keys and compressed shards.
  const fullJsonLength=delta?Object.entries(payload).reduce((n,[key,value])=>
   n+JSON.stringify(key).length+1+(typeof value==='string'?value.length+2:JSON.stringify(value)?.length||4)+1,1):0;
  const useDelta=!!deltaJson&&deltaJson.length<fullJsonLength*.85;
  // Record what actually changes; the full snapshot size is not the upload size.
  // Field-level diagnostics identify whether a finer-grained protocol is worthwhile.
  // A field-by-field breakdown of the actual PATCH payload. Avoid re-stringifying
  // already-encoded shards; the size of their JSON value is length + two quotes.
  const changedFields=delta?Object.entries(delta.set).map(([key,value])=>({
   key,bytes:typeof value==='string'?value.length+2:JSON.stringify(value)?.length||0
  })).sort((a,b)=>b.bytes-a.bytes):[];
  const changedGroups=Object.create(null);
  for(const {key,bytes} of changedFields){
   const group=key.startsWith('beLeaguePart_')?'league archive':
    key.startsWith('beShard_')?'player/game shards':
    key.startsWith('beAmateur')?'amateur archive':
    key.startsWith('bePackedAux_')?'auxiliary archive':'other state';
   const entry=changedGroups[group]||(changedGroups[group]={fields:0,bytes:0});
   entry.fields++;entry.bytes+=bytes;
  }
  window.beCloudPatchBreakdown=Object.entries(changedGroups).map(([group,value])=>({group,...value})).sort((a,b)=>b.bytes-a.bytes);
  // Read-only diagnosis of large game-result chunks. No save format changes.
  // Compute only when explicitly requested to avoid adding daily JSON overhead.
  if(window.beCloudGameShardDiagnosticsRequested===true){
   window.beCloudGameShardDiagnosticsRequested=false;
   const games=state?.gameResults;
   const rows=[];
   if(Array.isArray(games)){
    const shardSize=shardArrayFields.gameResults;
    const changedIndices=new Set(changedFields.filter(x=>/^beShard_gameResults_\\d+$/.test(x.key)).map(x=>Number(x.key.slice('beShard_gameResults_'.length))));
    const count=Math.ceil(games.length/shardSize);
    const candidates=Array.from({length:count},(_,i)=>i).sort((a,b)=>Number(changedIndices.has(b))-Number(changedIndices.has(a))||b-a).slice(0,5);
    for(const index of candidates){
     const subset=games.slice(index*shardSize,(index+1)*shardSize);
     const propertySizes=Object.create(null);
     let rawBytes=0;
     for(const game of subset){
      for(const [key,value] of Object.entries(game||{})){
       const size=JSON.stringify(value)?.length||0;
       propertySizes[key]=(propertySizes[key]||0)+size;
       rawBytes+=size;
      }
     }
     const shard='beShard_gameResults_'+index;
     rows.push({shard,games:subset.length,changed:changedIndices.has(index),
      encodedBytes:changedFields.find(x=>x.key===shard)?.bytes??null,rawBytes,
      largestProperties:Object.entries(propertySizes).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([key,bytes])=>({key,bytes}))});
    }
   }
   window.beCloudGameShardDiagnosis=rows;
  }
  // Inspect only the changed independent-league field; do not mutate the save.
  // Capture sizes by season/subtree to select a safe lossless sharding scheme.
  if(delta?.set&&Object.prototype.hasOwnProperty.call(delta.set,'independentBaseball')){
   const root=delta.set.independentBaseball;
   const rows=[];
   if(root&&typeof root==='object'){
    for(const [key,value] of Object.entries(root)){
     const size=JSON.stringify(value)?.length||0;
     rows.push({path:key,kind:Array.isArray(value)?'array':typeof value,
      entries:Array.isArray(value)?value.length:value&&typeof value==='object'?Object.keys(value).length:0,bytes:size});
     if(value&&typeof value==='object'&&!Array.isArray(value)){
      for(const [child,part] of Object.entries(value)){
       rows.push({path:key+'/'+child,kind:Array.isArray(part)?'array':typeof part,
        entries:Array.isArray(part)?part.length:part&&typeof part==='object'?Object.keys(part).length:0,
        bytes:JSON.stringify(part)?.length||0});
      }
     }
    }
   }
   window.beIndependentBaseballPayloadShape=rows.sort((a,b)=>b.bytes-a.bytes);
  }
  window.beCloudDeltaTiming={compareMs:+(performance.now()-deltaStarted).toFixed(1),
   fullBytes:fullJsonLength,deltaBytes:deltaJson?.length||0,used:useDelta,
   changedFieldCount:changedFields.length,changedFields:changedFields.slice(0,12),
   removedFields:delta?.unset||[]};
  if(useDelta){
   try{result=await call('/v2/saves/main','PATCH',delta,revision,deltaJson);}
   catch(e){
    // Only a definite unsupported-method response permits a safe full PUT retry.
    // Never retry an ambiguous network failure or a revision conflict.
    if(e.status!==404&&e.status!==405&&e.status!==501)throw e;
    incrementalSaveSupported=false;
    result=await call('/v2/saves/main','PUT',payload,revision);
   }
  }else result=await call('/v2/saves/main','PUT',payload,revision);
  window.beCloudDeltaTiming.actualMethod=window.beCloudSaveTiming?.method||null;
  window.beCloudDeltaTiming.actualUploadBytes=window.beCloudSaveTiming?.transferred||0;
  window.beCloudPackingTiming={replay:Math.round((replayPackedAt-packStarted)*10)/10,auxiliary:Math.round((auxiliaryPackedAt-replayPackedAt)*10)/10,total:Math.round((auxiliaryPackedAt-packStarted)*10)/10};
 }
 catch(e){if(e.status===409||e.status===412)verified=false;throw e}
 const next=revisionOf(result);
 if(next===null){verified=false;throw Error('서버 저장 성공 응답의 버전이 확인되지 않았습니다. 다시 로그인하여 상태를 확인하세요')}
 revision=next;acknowledgedWireSave=structuredClone(payload);baseline={save:state,revision:next};if(window.beCloudSaveTiming?.finalStatus>=200&&window.beCloudSaveTiming.finalStatus<300)recordCloudPayload(window.beCloudSaveTiming.bytes);return result;
}
export async function cloudGate(onReady){
 const overlay=document.createElement('div');overlay.id='be-cloud-gate';
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483646;background:#eaf1f9;display:flex;align-items:center;justify-content:center;padding:18px;font:15px system-ui;color:#183b60';
 const card=document.createElement('section');card.style.cssText='background:#fff;border-radius:18px;padding:26px;max-width:390px;width:100%;box-shadow:0 10px 45px #1233';
 const title=document.createElement('h2');title.textContent='⚾ BASEBALL EMPIRE';
 const intro=document.createElement('p');intro.textContent='클라우드 계정에 로그인해야 게임을 시작할 수 있습니다.';
 const name=document.createElement('input'),pass=document.createElement('input'),confirmPass=document.createElement('input');
 let signup=false;
 for(const e of [name,pass,confirmPass])e.style.cssText='box-sizing:border-box;width:100%;padding:12px;margin:7px 0;border:1px solid #bccddd;border-radius:9px;font-size:16px';
 name.placeholder='아이디';name.autocomplete='username';pass.placeholder='비밀번호';pass.type='password';pass.autocomplete='current-password';confirmPass.type='password';confirmPass.placeholder='비밀번호 확인';confirmPass.autocomplete='new-password';confirmPass.hidden=true;
 const button=document.createElement('button');button.textContent='로그인';button.style.cssText='width:100%;padding:13px;margin:10px 0;border:0;border-radius:9px;background:#2365a2;color:#fff;font-weight:700';
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='계정이 없나요? 회원가입';toggle.style.cssText='width:100%;padding:10px;border:0;background:transparent;color:#2365a2;text-decoration:underline;font-weight:700';
 const msg=document.createElement('p');msg.style.cssText='white-space:pre-wrap;line-height:1.5';
 card.append(title,intro,name,pass,confirmPass,button,toggle,msg);overlay.append(card);document.body.append(overlay);
 const setMode=mode=>{signup=mode;confirmPass.hidden=!mode;button.textContent=mode?'회원가입':'로그인';toggle.textContent=mode?'이미 계정이 있나요? 로그인':'계정이 없나요? 회원가입';pass.autocomplete=mode?'new-password':'current-password';msg.textContent='';};
 toggle.onclick=()=>setMode(!signup);
 const start=async()=>{button.disabled=true;toggle.disabled=true;try{
  if(!token){if(!name.value.trim()||!pass.value)throw Error('아이디와 비밀번호를 입력하세요');let r;
   if(signup){if(!/^[a-zA-Z0-9_]{4,24}$/.test(name.value.trim()))throw Error('아이디는 영문·숫자·밑줄 4~24자로 입력하세요');if(pass.value.length<12||pass.value.length>128)throw Error('비밀번호는 12~128자로 입력하세요');if(pass.value!==confirmPass.value)throw Error('비밀번호 확인이 일치하지 않습니다');r=await call('/v2/auth/register','POST',{username:name.value.trim(),password:pass.value});if(!r.token){r=await call('/v2/auth/login','POST',{username:name.value.trim(),password:pass.value})}}
   else r=await call('/v2/auth/login','POST',{username:name.value.trim(),password:pass.value});if(!r.token)throw Error('로그인 응답 오류');token=r.token;username=name.value.trim();remember()}
  pass.value='';confirmPass.value='';
  const data=await check();
  if(data&&(!Array.isArray(data.teams)||data.teams.length!==10||!Array.isArray(data.players)||data.schema!==1))throw Error('서버 저장 데이터 형식이 잘못됐습니다');
  await onReady(data);
  overlay.remove();
  let logout=document.getElementById('be-cloud-logout');
  if(!logout){
   logout=document.createElement('button');logout.id='be-cloud-logout';logout.type='button';logout.textContent='로그아웃';
   logout.style.cssText='position:fixed;right:14px;top:12px;z-index:2147483000;padding:9px 13px;border:1px solid #c5d5e4;border-radius:20px;background:#fff;color:#214c72;font:700 13px system-ui';
   logout.style.display=(document.body.classList.contains('be-start-screen')?'':'none');
   new MutationObserver(()=>{logout.style.display=document.body.classList.contains('be-start-screen')?'':'none'}).observe(document.body,{attributes:true,attributeFilter:['class']});
   logout.onclick=async()=>{if(!confirm('로그아웃할까요?'))return;logout.disabled=true;try{await call('/v2/auth/logout','POST')}catch(_){}token=null;username='';revision=null;verified=false;baseline=null;acknowledgedWireSave=null;remember();location.reload()};
   document.body.append(logout);
  }
  let reset=document.getElementById('be-cloud-reset');
  if(!reset){
   reset=document.createElement('button');reset.id='be-cloud-reset';reset.type='button';reset.textContent='클라우드 초기화';
   reset.style.cssText='position:fixed;right:14px;top:58px;z-index:2147483000;padding:9px 13px;border:1px solid #e3b5b5;border-radius:20px;background:#fff;color:#a32626;font:700 13px system-ui';
   const syncVisibility=()=>{const show=document.body.classList.contains('be-start-screen');logout.style.display=show?'':'none';reset.style.display=show?'':'none'};
   reset.onclick=async()=>{if(!confirm('정말 클라우드 저장 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))return;if(!confirm('마지막 확인: 이 계정의 클라우드 게임 저장을 영구 삭제합니다. 계속할까요?'))return;reset.disabled=true;try{const current=await snapshot();if(!current){alert('초기화할 클라우드 저장 데이터가 없습니다.');return}const currentRev=revisionOf(current);if(currentRev===null)throw Error('저장 버전을 확인하지 못했습니다');if(!verified||revision!==currentRev)throw Error('다른 기기에서 저장 데이터가 변경됐습니다. 새로고침 후 다시 시도하세요');await call('/v2/saves/main','DELETE',undefined,currentRev);revision=0;verified=true;baseline=null;alert('클라우드 저장 데이터가 삭제되었습니다. 새 게임을 시작할 수 있습니다.');location.reload()}catch(e){alert('클라우드 초기화 실패: '+(e.message||e)+'\n서버가 저장 삭제 API를 지원하는지 확인해야 합니다.')}finally{reset.disabled=false}};
   document.body.append(reset);
   new MutationObserver(syncVisibility).observe(document.body,{attributes:true,attributeFilter:['class']});syncVisibility();
  }
 }catch(e){msg.textContent='로그인 또는 불러오기 실패: '+(e.message||e);if(!token){name.hidden=false;pass.hidden=false;button.textContent='로그인'}else{button.textContent='다시 시도';name.hidden=true;pass.hidden=true}}finally{button.disabled=false;toggle.disabled=false}};
 button.onclick=start;pass.onkeydown=e=>{if(e.key==='Enter'&&!signup)start()};confirmPass.onkeydown=e=>{if(e.key==='Enter'&&signup)start()};
 if(token){name.hidden=true;pass.hidden=true;button.textContent='다시 연결';toggle.hidden=true;msg.textContent='자동 로그인 중입니다.';start()}
}
