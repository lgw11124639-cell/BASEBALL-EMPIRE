// Reuse the browser's lossless save codecs, excluding authentication/transport.
// Each request has isolated caches, shared only between its decode and encode.
import {readFileSync} from 'node:fs';
const path=new URL('../cloud-only.js',import.meta.url);
export function createSaveWireCodec(source=readFileSync(path,'utf8')){
 const first=source.indexOf('const replayCompressionCache=new WeakMap();');
 const last=source.indexOf('const cloudPayloadHistory=[];',first);
 if(first<0||last<=first)throw Error('Canonical codec boundaries changed');
 const section=source.slice(first,last);
 if(/\b(?:fetch|localStorage|indexedDB)\b/.test(section))throw Error('Unexpected I/O in save codec');
 const diagnostics={};
 const functions=Function('window',section+'\nreturn {packCloudShards,packAmateurBuckets,packLeagueShards,packHistoryShards,packAuxiliaryFields,unpackReplayResults,unpackCloudShards,unpackLeagueShards,unpackAmateurBuckets,unpackHistoryShards,unpackAuxiliaryFields};')(diagnostics);
 return {
  metrics(){return diagnostics.beCloudGzipSnapshot?.()??null},
  async restore(save){
   let state=structuredClone(save);
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
