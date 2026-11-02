import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {packNativeSave,restoreNativeSave,isNativeSave,NATIVE_SAVE_MANIFEST} from '../native-save.js';
import {createSaveWireCodec} from './save-wire-codec.mjs';
export function createNativeSaveCodec(){
 let legacy=null;
 return {
  mode:'server-json-v1',
  async restore(wire,{takeOwnership=false}={}){
   if(isNativeSave(wire))return restoreNativeSave(wire,{clone:!takeOwnership});
   legacy=createSaveWireCodec();return legacy.restore(wire);
  },
  async pack(state){
   const wire=packNativeSave(state);
   // Ten tiny compatibility views keep the installed mobile-home projection
   // readable. All large state and replay parts use plain JSON directly.
   for(let i=0;i<(state.teams||[]).length;i++){
    const name='beShard_teams_'+i;wire[name]=gzipSync(JSON.stringify([state.teams[i]]),{level:1}).toString('base64');wire[NATIVE_SAVE_MANIFEST].compatFields.push(name);
   }
   legacy=null;return wire;
  }
 };
}
export function nativeWireDelta(previous,wire,baselineHashes=null){
 const set=Object.create(null),unset=Object.keys(previous).filter(key=>!Object.hasOwn(wire,key)),serializedSet=new Map(),serializedFields=new Map(),fieldHashes=new Map();
 for(const [key,value] of Object.entries(wire)){
  const raw=JSON.stringify(value);if(raw===undefined)throw Error('Invalid native JSON field');
  serializedFields.set(key,raw);
  const hash=createHash('sha256').update(raw).digest('hex');fieldHashes.set(key,hash);
  const unchanged=baselineHashes?.get(key)===hash||(!baselineHashes&&Object.hasOwn(previous,key)&&JSON.stringify(previous[key])===raw);
  if(!unchanged){set[key]=value;serializedSet.set(key,raw)}
 }
 return {set,unset,serializedSet,serializedFields,fieldHashes};
}
