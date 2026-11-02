// Server JSON wire format. Parts contain plain JSON values, never inner gzip/Base64.
export const NATIVE_SAVE_MANIFEST='beServerNativeManifest';
const PREFIX='beServerPart_';
const roots=new Set(['players','gameResults','clubNotices','clubTransactionArchive','trainingReports','highSchoolBaseball','collegeBaseball','independentBaseball','amateurCareerArchive','nationalTeamResults','minorLeague','history','international','careerRecords','draftResults','faMarket','leagueOffice','postseasons','retiredPlayers']);
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
