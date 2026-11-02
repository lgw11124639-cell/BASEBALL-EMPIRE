// Consumed native cache entries have one owner. Track archive writes in place;
// failures discard the entry and reload the authoritative DB, never roll it back.
const trackedRoots=new Set(['history','amateurCareerArchive','gameResults','clubNotices','clubTransactionArchive','trainingReports','highSchoolBaseball','collegeBaseball','independentBaseball','nationalTeamResults','minorLeague','international','careerRecords','draftResults','postseasons','retiredPlayers']);
const activeYearRoots=new Set(['highSchoolBaseball','collegeBaseball','independentBaseball','minorLeague']);
const plain=v=>v&&typeof v==='object'&&(Array.isArray(v)||Object.prototype.toString.call(v)==='[object Object]');
export function trackArchiveWrites(state){
 const records=new WeakMap(),proxies=new WeakMap(),dirty=new WeakSet(),baselineObjects=new WeakSet(),untrackedActive=new WeakSet();
 function raw(value){return proxies.get(value)||value}
 function mark(record){if(record.dirty)return;record.dirty=true;dirty.add(record.target);for(const parent of record.parents)mark(parent)}
 function wrap(value,path,parent=null){
  value=raw(value);if(!plain(value))return value;
  if(activeYearRoots.has(path[0])&&path.length===2&&Number(path[1])===Number(state.year)){if(parent)mark(parent);dirty.add(value);untrackedActive.add(value);return value}
  let record=records.get(value);
  if(!record){
   record={target:value,parents:new Set(),dirty:false};records.set(value,record);
   record.proxy=new Proxy(value,{
    get(target,key,receiver){return wrap(Reflect.get(target,key,receiver),[...path,key],record)},
    set(target,key,next){const unwrapped=raw(next);if(!Object.is(target[key],unwrapped)||!Object.hasOwn(target,key))mark(record);return Reflect.set(target,key,unwrapped)},
    deleteProperty(target,key){if(Object.hasOwn(target,key))mark(record);return Reflect.deleteProperty(target,key)},
    defineProperty(target,key,descriptor){mark(record);if('value' in descriptor)descriptor={...descriptor,value:raw(descriptor.value)};return Reflect.defineProperty(target,key,descriptor)},
    setPrototypeOf(){throw Error('Archive prototype changes are unsupported')}
   });proxies.set(record.proxy,value);
  }
  if(parent)record.parents.add(parent);return record.proxy;
 }
 // Capture descriptor-level original identities before the engine can replace a
 // root. Descendant identities are supplied by the native codec's manifest walk.
 const roots=new Map();for(const key of trackedRoots)if(plain(state[key])){roots.set(key,state[key]);state[key]=wrap(state[key],[key])}
 function isDirty(value,path){
  const valueRaw=raw(value);
  if(!trackedRoots.has(path[0]))return true;
  if(activeYearRoots.has(path[0])&&path.length>=2&&Number(path[1])===Number(state.year))return true;
  return dirty.has(valueRaw);
 }
 function clean(value,seen=new WeakSet(),force=false){
  value=raw(value);if(!plain(value)||seen.has(value))return value;
  force=force||untrackedActive.has(value);
  if(!force&&!dirty.has(value)&&(baselineObjects.has(value)||records.has(value)))return value;
  seen.add(value);
  for(const key of Object.keys(value)){
   const child=value[key],unwrapped=raw(child);if(child!==unwrapped)value[key]=unwrapped;
   if(plain(unwrapped))clean(unwrapped,seen,force);
  }
  return value;
 }
 function finish(){for(const [key,original] of roots){const value=raw(state[key]);state[key]=value;if(value!==original||dirty.has(value))clean(value)}return state}
 return {state,raw,isDirty,finish,register(value){value=raw(value);if(plain(value))baselineObjects.add(value)},clone(value){return structuredClone(clean(value,new WeakSet(),true))}};
}
