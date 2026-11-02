// Server JSON wire format. Parts contain plain JSON values, never inner gzip/Base64.
export const NATIVE_SAVE_MANIFEST='beServerNativeManifest';
const PREFIX='beServerPart_';
const roots=new Set(['allStarVoting','allStarGames','clubScrimmages','springCamps','players','gameResults','clubNotices','clubTransactionArchive','trainingReports','highSchoolBaseball','collegeBaseball','independentBaseball','amateurCareerArchive','nationalTeamResults','minorLeague','history','international','careerRecords','draftResults','faMarket','leagueOffice','postseasons','retiredPlayers']);
const unsafe=key=>['__proto__','constructor','prototype'].includes(key);
const segment=key=>encodeURIComponent(String(key)).replace(/_/g,'%5F');
export const isNativeSave=wire=>!!wire&&Object.hasOwn(wire,NATIVE_SAVE_MANIFEST);
export function packNativeSave(state,{reuseNode=null,reusePart=null}={}){
 const wire={},fields={};
 function part(path,index,value){const name=PREFIX+path.map(segment).join('_')+'_'+index;const old=reusePart?.(value,path,index,name);Object.defineProperty(wire,name,{value:old?.value??value,enumerable:true,writable:true,configurable:true});return name}
 function node(value,path,depth=0){
  const reused=reuseNode?.(value,path);if(reused){for(const key of partKeys(reused.descriptor))wire[key]=reused.wire[key];return reused.descriptor}
  if(value===null||typeof value!=='object')return {kind:'value',value:typeof value==='number'&&!Number.isFinite(value)?null:value};
  if(typeof value.toJSON==='function')return node(value.toJSON(),path,depth);
  if(Array.isArray(value)){
   const size=path[0]==='gameResults'?1:64,parts=[];
   for(let i=0;i<value.length;i+=size)parts.push(part(path,i/size,value.slice(i,i+size)));
   return {kind:'array',length:value.length,parts};
  }
  const keys=Object.keys(value).filter(key=>value[key]!==undefined&&typeof value[key]!=='function'&&typeof value[key]!=='symbol');
  if(keys.length>128){
   const parts=[];for(let i=0;i<keys.length;i+=128)parts.push(part(path,i/128,keys.slice(i,i+128).map(key=>[key,value[key]])));
   return {kind:'map',length:keys.length,parts};
  }
  if(depth>=3)return {kind:'part',part:part(path,'v',value)};
  return {kind:'object',fields:Object.fromEntries(keys.map(key=>[key,node(value[key],[...path,key],depth+1)]))};
 }
 for(const [key,value] of Object.entries(state)){
  if(unsafe(key)||key===NATIVE_SAVE_MANIFEST||key.startsWith(PREFIX))throw Error('Reserved native save field');
  if(value===undefined||typeof value==='function'||typeof value==='symbol')continue;
  if(roots.has(key)&&value&&typeof value==='object')fields[key]=node(value,[key]);
  else Object.defineProperty(wire,key,{value,enumerable:true,writable:true,configurable:true});
 }
 wire[NATIVE_SAVE_MANIFEST]={version:1,fields,compatFields:[]};return wire;
}
function partKeys(node){
 if(node.kind==='part')return [node.part];
 if(node.kind==='array'||node.kind==='map')return node.parts;
 if(node.kind==='object')return Object.values(node.fields).flatMap(partKeys);
 return [];
}
export function restoreNativeSave(input,{clone=false,previousWire=null,previousState=null,changedKeys=null}={}){
 const wire=clone?structuredClone(input):input,manifest=wire?.[NATIVE_SAVE_MANIFEST];
 if(manifest?.version!==1||!manifest.fields||typeof manifest.fields!=='object'||Array.isArray(manifest.fields))throw Error('Invalid server JSON manifest');
 if(isLazyNativeWire(wire))return restoreLazyNative(wire,manifest,{previousWire,previousState,changedKeys});
 const state={...wire};delete state[NATIVE_SAVE_MANIFEST];
 for(const key of Object.keys(state))if(key.startsWith(PREFIX))delete state[key];
 for(const key of manifest.compatFields||[]){if(typeof key!=='string'||!/^beShard_teams_\d+$/.test(key))throw Error('Invalid compatibility field');delete state[key]}
 function read(key){if(typeof key!=='string'||!key.startsWith(PREFIX)||!Object.hasOwn(wire,key))throw Error('Missing server JSON part');return wire[key]}
 function decode(node,depth=0){
  if(!node||depth>16)throw Error('Invalid server JSON descriptor');
  if(node.kind==='value')return node.value;
  if(node.kind==='part')return read(node.part);
  if(node.kind==='object')return Object.fromEntries(Object.entries(node.fields||{}).map(([key,value])=>[key,decode(value,depth+1)]));
  if(!['array','map'].includes(node.kind)||!Array.isArray(node.parts)||node.parts.length>100000||!Number.isSafeInteger(node.length)||node.length<0)throw Error('Invalid server JSON array descriptor');
  const pieces=node.parts.map(key=>{const value=read(key);if(!Array.isArray(value))throw Error('Invalid server JSON part rows');return value}),rows=pieces.flat();
  if(rows.length!==node.length)throw Error('Server JSON row count mismatch');
  if(node.kind==='array')return rows;
  if(rows.some(row=>!Array.isArray(row)||row.length!==2||typeof row[0]!=='string')||new Set(rows.map(row=>row[0])).size!==rows.length)throw Error('Invalid server JSON map rows');
  return Object.fromEntries(rows);
 }
 const changed=changedKeys?new Set(changedKeys):null;
 for(const [key,descriptor] of Object.entries(manifest.fields)){
  if(unsafe(key))throw Error('Invalid server JSON root');
  const old=previousWire?.[NATIVE_SAVE_MANIFEST]?.fields?.[key];
  const reused=changed&&previousState&&Object.hasOwn(previousState,key)&&old&&JSON.stringify(old)===JSON.stringify(descriptor)&&partKeys(descriptor).every(name=>!changed.has(name));
  Object.defineProperty(state,key,{value:reused?previousState[key]:decode(descriptor),enumerable:true,writable:true,configurable:true});
 }
 return state;
}

// Sparse field changes retain historical rows on the client. Applied only to an
// exact acknowledged revision; copy each affected container once.
export function diffNativeValue(before,after,{json=false}={}){
 const ops=[];
 function walk(a,b,path){
  if(Object.is(a,b))return;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b)){ops.push(['set',path,b]);return}
  // Only normalized JSON callers may compare serialized subtrees. This skips
  // unchanged long histories without allocating a path for every old record.
  if(json&&path.length&&(Array.isArray(b)?b.length>=8:Object.keys(b).length>=8)&&JSON.stringify(a)===JSON.stringify(b))return;
  if(Array.isArray(b)){
   for(let i=0;i<b.length;i++){if(i>=a.length)ops.push(['set',[...path,i],b[i]]);else walk(a[i],b[i],[...path,i])}
   if(b.length<a.length)ops.push(['length',path,b.length]);return;
  }
  for(const key of Object.keys(a))if(!Object.hasOwn(b,key))ops.push(['delete',[...path,key]]);
  for(const key of Object.keys(b)){if(!Object.hasOwn(a,key))ops.push(['set',[...path,key],b[key]]);else walk(a[key],b[key],[...path,key])}
 }
 walk(before,after,[]);return ops;
}
export function applyNativeValuePatch(before,ops){
 const owned=new WeakSet();let root=before;
 const copy=value=>{if(!value||typeof value!=='object')throw Error('Invalid patch container');if(owned.has(value))return value;const out=Array.isArray(value)?value.slice():{...value};owned.add(out);return out};
 for(const op of ops){
  const [type,path,value]=op;if(!['set','delete','length'].includes(type)||!Array.isArray(path)||path.length>64||path.some(key=>!(typeof key==='string'||Number.isSafeInteger(key)&&key>=0)||unsafe(String(key))))throw Error('Invalid native patch');
  if(!path.length&&type==='set'){root=value;continue}
  root=copy(root);let parent=root;const end=type==='length'?path.length:path.length-1;
  if(end<0)throw Error('Invalid root patch');
  for(let i=0;i<end;i++){const key=path[i];if(!Object.hasOwn(parent,key))throw Error('Missing patch path');parent[key]=copy(parent[key]);parent=parent[key]}
  if(type==='length'){if(!Array.isArray(parent)||!Number.isSafeInteger(value)||value<0||value>parent.length)throw Error('Invalid patch length');parent.length=value}
  else if(type==='delete')delete parent[path.at(-1)];
  else Object.defineProperty(parent,path.at(-1),{value,enumerable:true,writable:true,configurable:true});
 }
 return root;
}

const lazyWires=new WeakSet();
export const isLazyNativeWire=wire=>!!wire&&lazyWires.has(wire);
export function copyNativeWire(wire,set={},unset=[]){
 const out=Object.defineProperties({},Object.getOwnPropertyDescriptors(wire));
 for(const [key,value] of Object.entries(set))Object.defineProperty(out,key,{value,enumerable:true,writable:true,configurable:true});
 for(const key of unset)delete out[key];if(isLazyNativeWire(wire))lazyWires.add(out);return out;
}
export function compressedNativeWire(encoded,{decode,maxChars=4000000,onDecode=()=>{}}){
 if(typeof decode!=='function'||!isNativeSave(encoded))throw Error('Invalid compressed native snapshot');
 const wire={},cache=new Map();let chars=0;
 for(const key of Object.keys(encoded)){
  if(unsafe(key))throw Error('Invalid compressed native field');
  if(!key.startsWith(PREFIX)){wire[key]=encoded[key];continue}
  const gzip=encoded[key],token={};if(typeof gzip!=='string')throw Error('Invalid compressed native part');
  const load=()=>{
   let entry=cache.get(token);if(entry){cache.delete(token);cache.set(token,entry);return entry.value}
   const text=decode(gzip);entry={value:JSON.parse(text),chars:text.length};onDecode(key,text.length);
   cache.set(token,entry);chars+=entry.chars;
   while(chars>maxChars&&cache.size>1){const [id,old]=cache.entries().next().value;cache.delete(id);chars-=old.chars}
   return entry.value;
  };
  let summary=null;
  const read=key.startsWith(PREFIX+'players_')?()=>{if(!summary)summary=load();return summary}:key.startsWith(PREFIX+'gameResults_')?()=>{
   if(summary)return summary;
   summary=load().map((game,i)=>{
    const view={};for(const field of Object.keys(game)){
     if(field==='broadcastEvents')Object.defineProperty(view,field,{enumerable:true,configurable:true,get:()=>load()[i][field],set(value){Object.defineProperty(this,field,{value,writable:true,enumerable:true,configurable:true})}});
     else Object.defineProperty(view,field,{value:game[field],writable:true,enumerable:true,configurable:true});
    }return view;
   });return summary;
  }:load;
  Object.defineProperty(wire,key,{enumerable:true,configurable:true,get:read});
 }
 lazyWires.add(wire);return wire;
}
function restoreLazyNative(wire,manifest,{previousWire,previousState,changedKeys}){
 const property=(object,key,get)=>Object.defineProperty(object,key,{enumerable:true,configurable:true,get,set(value){Object.defineProperty(this,key,{value,writable:true,enumerable:true,configurable:true})}});
 const changed=changedKeys?new Set(changedKeys):null,state={};
 for(const key of Object.keys(wire))if(key!==NATIVE_SAVE_MANIFEST&&!key.startsWith(PREFIX)&&!(manifest.compatFields||[]).includes(key))Object.defineProperty(state,key,Object.getOwnPropertyDescriptor(wire,key));
 const reader=name=>{const d=Object.getOwnPropertyDescriptor(wire,name);if(!d||!name.startsWith(PREFIX))throw Error('Missing native part');return d.get?d.get:()=>d.value};
 function build(node,root){
  if(node.kind==='value')return ()=>node.value;
  if(node.kind==='part')return reader(node.part);
  if(node.kind==='object'){
   const object={};for(const [key,child] of Object.entries(node.fields))property(object,key,build(child,root));return ()=>object;
  }
  if(!['array','map'].includes(node.kind)||!Number.isSafeInteger(node.length)||node.length<0||!Array.isArray(node.parts))throw Error('Invalid native descriptor');
  const reads=node.parts.map(reader);
  if(node.kind==='map'){
   const object={};for(const read of reads){const rows=read();for(let i=0;i<rows.length;i++){const key=rows[i][0];property(object,key,()=>read()[i][1])}}return ()=>object;
  }
  // The live player directory is scanned by almost every screen. Keep stable
  // player objects once read; only historical leagues and replays use eviction.
  if(root==='players'){let players=null;return ()=>{if(!players){players=[];for(const read of reads)players.push(...read())}return players}}
  const size=root==='gameResults'?1:64,target=new Array(node.length),deleted=new Set();
  const index=key=>typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)?Number(key):null;
  const value=i=>reads[Math.floor(i/size)]()[i%size];
  const array=new Proxy(target,{
   get(a,key,receiver){const i=index(key);return i!==null&&i<a.length&&i<node.length&&!Object.hasOwn(a,key)&&!deleted.has(i)?value(i):Reflect.get(a,key,receiver)},
   has(a,key){const i=index(key);return i!==null&&i<a.length&&i<node.length&&!deleted.has(i)||Reflect.has(a,key)},
   set(a,key,value){const i=index(key);if(i!==null)deleted.delete(i);return Reflect.set(a,key,value)},
   deleteProperty(a,key){const i=index(key);if(i!==null)deleted.add(i);return Reflect.deleteProperty(a,key)},
   ownKeys(a){return [...Array.from({length:Math.min(a.length,node.length)},(_,i)=>String(i)).filter(i=>!deleted.has(Number(i))),...Reflect.ownKeys(a).filter(key=>index(key)===null||Number(key)>=node.length)]},
   getOwnPropertyDescriptor(a,key){const i=index(key);if(i!==null&&i<a.length&&i<node.length&&!deleted.has(i))return Object.getOwnPropertyDescriptor(a,key)||{value:value(i),writable:true,enumerable:true,configurable:true};return Reflect.getOwnPropertyDescriptor(a,key)}
  });return ()=>array;
 }
 for(const [key,node] of Object.entries(manifest.fields)){
  if(unsafe(key))throw Error('Invalid native root');const old=previousWire?.[NATIVE_SAVE_MANIFEST]?.fields?.[key];
  const reused=changed&&previousState&&old&&JSON.stringify(old)===JSON.stringify(node)&&partKeys(node).every(name=>!changed.has(name));
  if(reused){const prior=previousState[key];property(state,key,()=>prior)}else property(state,key,build(node,key));
 }
 return state;
}
