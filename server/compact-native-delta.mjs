import {gunzipSync} from 'node:zlib';
import {diffNativeValue} from '../native-save.js';
const unsafe=key=>['__proto__','constructor','prototype'].includes(String(key));
// Read old values from immutable committed shard bytes, never the engine's
// in-place world. A matching revision is checked by the store before calling.
export function compactNativeDelta(delta,readField,normalizedNext=null){
 const set=Object.create(null),patches=Object.create(null);let fullBytes=0,compactBytes=0,visitedBytes=0;
 for(const [key,raw] of delta.serializedSet){
  const bytes=Buffer.byteLength(raw);fullBytes+=bytes;
  const fallback=()=>{set[key]=delta.set[key];compactBytes+=bytes};
  // Bound work on dense/very large fields and leave tiny scalar fields alone.
  if(!key.startsWith('beServerPart_')||bytes<2048||bytes>1048576||visitedBytes+bytes>16777216){fallback();continue}
  const old=readField(key);if(!old){fallback();continue}visitedBytes+=bytes;
  try{
  const decoded=gunzipSync(old,{maxOutputLength:Math.min(2097152,16777216-visitedBytes)});visitedBytes+=decoded.length;
  const before=JSON.parse(decoded.toString('utf8')),after=normalizedNext&&Object.hasOwn(normalizedNext,key)?normalizedNext[key]:JSON.parse(raw),ops=diffNativeValue(before,after,{json:true});
  if(ops.length>4096||ops.some(([,path])=>path.length>64||path.some(unsafe))){fallback();continue}
  const patchBytes=Buffer.byteLength(JSON.stringify(ops));
  if(patchBytes<bytes*.70){patches[key]=ops;compactBytes+=patchBytes}else fallback();
  }catch{visitedBytes=16777216;fallback()}
 }
 return {set,patches,unset:delta.unset,metrics:{fullBytes,compactBytes,patchFields:Object.keys(patches).length}};
}
