// Reuse the browser's lossless save codecs, excluding authentication/transport.
// Each request has isolated caches, shared only between its decode and encode.
import {readFileSync} from 'node:fs';
import {isNativeSave,restoreNativeSave} from '../native-save.js';
import {gzipSync,gunzipSync} from 'node:zlib';
const path=new URL('../cloud-only.js',import.meta.url);
export function createSaveWireCodec(source=readFileSync(path,'utf8'),{nativeGzip=true}={}){
 const first=source.indexOf('const replayCompressionCache=new WeakMap();');
 const last=source.indexOf('const cloudPayloadHistory=[];',first);
 if(first<0||last<=first)throw Error('Canonical codec boundaries changed');
 const changesStart=source.indexOf('async function restoreServerWireChanges(wire,previous,decoded,delta){');
 const changesEnd=source.indexOf('async function check(){',changesStart);
 if(changesStart<0||changesEnd<=changesStart)throw Error('Canonical incremental decoder boundaries changed');
 const section=source.slice(first,last)+'\n'+source.slice(changesStart,changesEnd);
 if(/\b(?:fetch|localStorage|indexedDB)\b/.test(section))throw Error('Unexpected I/O in save codec');
 const diagnostics=nativeGzip?{fflate:{gzipSync:bytes=>gzipSync(bytes,{level:1})},beDecodeSaveGzip(encoded){
  if(typeof encoded!=='string'||encoded.length%4===1||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw Error('Invalid base64 gzip data');
  return gunzipSync(Buffer.from(encoded,'base64')).toString('utf8');
 }}:{};
 const functions=Function('window','isNativeSave','restoreNativeSave',section+'\nreturn {packCloudShards,packAmateurBuckets,packLeagueShards,packHistoryShards,packAuxiliaryFields,unpackReplayResults,unpackCloudShards,unpackLeagueShards,unpackAmateurBuckets,unpackHistoryShards,unpackAuxiliaryFields,restoreServerWireChanges};')(diagnostics,isNativeSave,restoreNativeSave);
 return {
  restoreChanges: functions.restoreServerWireChanges,
  metrics(){return diagnostics.beCloudGzipSnapshot?.()??null},
  async restore(save){
   if(isNativeSave(save))return restoreNativeSave(save,{clone:true});
   // Encoded strings are immutable. Clone raw object fields without copying
   // every large base64 string before immediately decoding and deleting it.
   let state=Object.fromEntries(Object.entries(save).map(([key,value])=>[key,value&&typeof value==='object'?structuredClone(value):value]));
   for(const name of ['unpackAuxiliaryFields','unpackHistoryShards','unpackAmateurBuckets','unpackLeagueShards','unpackCloudShards','unpackReplayResults'])state=await functions[name](state);
   return state;
  },
  async pack(state){
   const base=state,combined={...base};
   const parts=await Promise.all(['packCloudShards','packAmateurBuckets','packLeagueShards','packHistoryShards'].map(name=>functions[name](base)));
   for(const part of parts){
    for(const key of Object.keys(base))if(!Object.hasOwn(part,key))delete combined[key];
    for(const [key,value] of Object.entries(part))if(!Object.hasOwn(base,key)||value!==base[key])combined[key]=value;
   }
   return functions.packAuxiliaryFields(combined);
  }
 };
}
export async function restoreServerSave(save){return createSaveWireCodec().restore(save)}
export async function packServerSave(state){return createSaveWireCodec().pack(state)}
