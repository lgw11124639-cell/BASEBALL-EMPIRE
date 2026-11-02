import {trackArchiveWrites} from './archive-write-tracker.mjs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {packNativeSave,restoreNativeSave,isNativeSave,NATIVE_SAVE_MANIFEST} from '../native-save.js';
import {createSaveWireCodec} from './save-wire-codec.mjs';
export function createNativeSaveCodec(){
 let legacy=null,tracking=null,baseline=null,refs=null,reusedFields=new Set();
 return {
  mode:'server-json-v1',
  track(state,wire){
   baseline=wire;refs=new Map();
   const visit=(value,node,path)=>{refs.set(JSON.stringify(path),value);if(node.kind==='object')for(const [key,child] of Object.entries(node.fields))visit(value?.[key],child,[...path,key])};
   for(const [key,node] of Object.entries(wire[NATIVE_SAVE_MANIFEST].fields))visit(state[key],node,[key]);
   tracking=trackArchiveWrites(state);
   for(const value of refs.values())tracking.register(value);
   for(const [key,value] of Object.entries(wire))if(key.startsWith('beServerPart_')&&value&&typeof value==='object'){
    tracking.register(value);if(Array.isArray(value))for(const row of value){tracking.register(row);if(Array.isArray(row)&&row.length===2&&typeof row[0]==='string')tracking.register(row[1])}
   }
   return tracking;
  },
  reusedFields(){return reusedFields},
  release(){legacy=null;tracking=null;baseline=null;refs=null;reusedFields=new Set()},
  async restore(wire,{takeOwnership=false}={}){
   if(isNativeSave(wire))return restoreNativeSave(wire,{clone:!takeOwnership});
   legacy=createSaveWireCodec();return legacy.restore(wire);
  },
  async pack(state){
   reusedFields=new Set();
   if(tracking){if(state===tracking.state)state=tracking.finish();else{tracking.finish();state=tracking.clone(state)}}
   const wire=packNativeSave(state,{reuseNode:tracking?(value,path)=>{
    if(tracking.isDirty(value,path)||refs.get(JSON.stringify(path))!==tracking.raw(value))return null;
    let descriptor=baseline[NATIVE_SAVE_MANIFEST].fields[path[0]];
    for(const key of path.slice(1)){if(descriptor?.kind!=='object')return null;descriptor=descriptor.fields[key]}
    if(!descriptor)return null;
    const collect=node=>{if(node.kind==='part')reusedFields.add(node.part);else if(node.parts)for(const key of node.parts)reusedFields.add(key);else if(node.fields)for(const child of Object.values(node.fields))collect(child)};collect(descriptor);
    return {descriptor,wire:baseline};
   }:null,reusePart:tracking?(value,path,index,name)=>{
    if(!Object.hasOwn(baseline,name))return null;
    const previous=baseline[name];
    const equal=(a,b)=>{
     a=tracking.raw(a);b=tracking.raw(b);if(tracking.isDirty(a,path))return false;
     if(Object.is(a,b))return true;
     if(Array.isArray(a)&&Array.isArray(b)&&a.length===2&&b.length===2&&typeof a[0]==='string')return a[0]===b[0]&&equal(a[1],b[1]);
     return false;
    };
    const unchanged=Array.isArray(value)&&Array.isArray(previous)?value.length===previous.length&&value.every((row,i)=>equal(row,previous[i])):equal(value,previous);
    if(!unchanged)return null;reusedFields.add(name);return {value:previous};
   }:null});
   // Ten tiny compatibility views keep the installed mobile-home projection
   // readable. All large state and replay parts use plain JSON directly.
   for(let i=0;i<(state.teams||[]).length;i++){
    const name='beShard_teams_'+i;wire[name]=gzipSync(JSON.stringify([state.teams[i]]),{level:1}).toString('base64');wire[NATIVE_SAVE_MANIFEST].compatFields.push(name);
   }
   legacy=null;return wire;
  }
 };
}
export function nativeWireDelta(previous,wire,baselineHashes=null,reusedFields=null){
 const set=Object.create(null),unset=Object.keys(previous).filter(key=>!Object.hasOwn(wire,key)),serializedSet=new Map(),serializedFields=new Map(),fieldHashes=new Map();
 for(const [key,value] of Object.entries(wire)){
  if(reusedFields?.has(key)&&baselineHashes?.has(key)){fieldHashes.set(key,baselineHashes.get(key));continue}
  const raw=JSON.stringify(value);if(raw===undefined)throw Error('Invalid native JSON field');
  serializedFields.set(key,raw);
  const hash=createHash('sha256').update(raw).digest('hex');fieldHashes.set(key,hash);
  const unchanged=baselineHashes?.get(key)===hash||(!baselineHashes&&Object.hasOwn(previous,key)&&JSON.stringify(previous[key])===raw);
  if(!unchanged){set[key]=value;serializedSet.set(key,raw)}
 }
 return {set,unset,serializedSet,serializedFields,fieldHashes};
}

// The authoritative writer and speculative worker must derive the same next
// digest from field JSON bytes. No request ID or wall-clock timestamp enters it.
export function nativeDeltaDigest(previousDigest,nextRevision,set,unset){
 const digest=createHash('sha256');digest.update('be-shard-delta-v2');digest.update(previousDigest);digest.update(String(nextRevision));
 for(const key of [...unset].sort()){if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid field');digest.update('DELETE');digest.update(key)}
 for(const key of [...set.keys()].sort()){if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid field');digest.update('SET');digest.update(key);digest.update(set.get(key))}
 return digest.digest('hex');
}
