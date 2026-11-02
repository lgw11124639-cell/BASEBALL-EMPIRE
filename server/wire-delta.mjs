// Top-level wire fields contain immutable encoded shards or small manifests.
// The revision check in commit() binds this delta to its exact loaded baseline.
export function buildWireDelta(previous,current){
 const set=Object.create(null),unset=[];
 for(const key of Object.keys(previous))if(!Object.hasOwn(current,key))unset.push(key);
 for(const [key,value] of Object.entries(current)){
  if(!Object.hasOwn(previous,key)){set[key]=value;continue}
  const before=previous[key];
  if(value===before)continue;
  if(value!==null&&before!==null&&typeof value==='object'&&typeof before==='object'&&JSON.stringify(value)===JSON.stringify(before))continue;
  set[key]=value;
 }
 return {set,unset};
}
