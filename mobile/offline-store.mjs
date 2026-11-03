// Dedicated app database. Existing web/cloud saves are never opened or deleted.
export function validateWorld(value){
 if(!value||value.schema!==1||!Array.isArray(value.teams)||value.teams.length!==10||!Array.isArray(value.players)||!Number.isInteger(value.teamId)||value.teamId<0||value.teamId>9||!Number.isInteger(value.year)||!Number.isInteger(value.day)||value.day<1)throw Error('지원하지 않거나 손상된 게임 저장입니다. 원본 백업을 보관해 주세요.');
 return value;
}
function parts(world){
 const output=[];
 for(const field of Object.keys(world)){
  const value=world[field];
  if(Array.isArray(value)&&(field==='players'||field==='gameResults')){
   const size=field==='players'?64:8;
   for(let i=0;i<value.length;i+=size)output.push({id:JSON.stringify([field,i/size]),field,array:true,index:i/size,json:JSON.stringify(value.slice(i,i+size))});
   if(!value.length)output.push({id:JSON.stringify([field,0]),field,array:true,index:0,json:'[]'});
  }else{const json=JSON.stringify(value);if(json!==undefined)output.push({id:JSON.stringify([field]),field,array:false,index:0,json});}
 }
 return output;
}
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('기기 저장이 중단됐습니다.'));tx.onerror=()=>{};});}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export function createOfflineStore({indexedDB=globalThis.indexedDB,name='baseball-empire-mobile-v1'}={}){
 let dbPromise=null,revision=0,head=null,cache=new Map(),queue=Promise.resolve(),loaded=false;
 function database(){
  if(!indexedDB)throw Error('이 기기에서 로컬 저장을 사용할 수 없습니다.');
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
   const req=indexedDB.open(name,1);
   req.onupgradeneeded=()=>req.result.createObjectStore('records');
   req.onerror=()=>{dbPromise=null;reject(req.error);};
   req.onblocked=()=>{dbPromise=null;reject(Error('다른 게임 창을 닫고 다시 실행해 주세요.'));};
   req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null;loaded=false;};resolve(db);};
  });
  return dbPromise;
 }
 function exclusive(work){const next=queue.then(work);queue=next.catch(()=>{});return next;}
 async function read(){
  const db=await database(),tx=db.transaction('records','readonly'),done=transactionDone(tx),store=tx.objectStore('records');
  done.catch(()=>{}); // The request promise may reject first; still observe transaction failure.
  // Schedule all chunk reads from the head request callback in the same snapshot.
  const result=await new Promise((resolve,reject)=>{
   const req=store.get('head');req.onerror=()=>reject(req.error);
   req.onsuccess=()=>{
    const saved=req.result;if(!saved){resolve(null);return;}
    if(saved.format!=='be-mobile-local-v1'||!saved.current?.entries){reject(Error('저장 목록 형식이 올바르지 않습니다.'));return;}
    const entries=[...saved.current.entries,...(saved.previous?.entries||[])],keys=[...new Set(entries.map(e=>e.key))];
    Promise.all(keys.map(async key=>[key,await request(store.get(key))])).then(rows=>resolve({saved,rows:new Map(rows)}),reject);
   };
  });
  await done;
  if(!result){head=null;revision=0;cache=new Map();loaded=true;return {world:null,recovered:false};}
  function assemble(manifest){
   if(!manifest||!Array.isArray(manifest.entries))throw Error('저장 목록 누락');
   const world={},nextCache=new Map();
   for(const entry of manifest.entries){
    const json=result.rows.get(entry.key);if(typeof json!=='string')throw Error('저장 조각 누락: '+entry.field);
    const value=JSON.parse(json);
    if(entry.array){if(!Array.isArray(value))throw Error('잘못된 배열 저장');if(!Object.hasOwn(world,entry.field))Object.defineProperty(world,entry.field,{value:[],enumerable:true,writable:true});world[entry.field].push(...value);}
    else Object.defineProperty(world,entry.field,{value,enumerable:true,writable:true,configurable:true});
    nextCache.set(entry.id,{key:entry.key,json});
   }
   validateWorld(world);return {world,nextCache};
  }
  let restored,recovered=false;
  try{restored=assemble(result.saved.current);}catch(error){try{restored=assemble(result.saved.previous);recovered=true;}catch{throw Error('게임 저장을 읽지 못했습니다. 저장을 덮어쓰지 않았습니다. 백업 파일로 복원해 주세요.',{cause:error});}}
  head=result.saved;revision=head.revision;cache=restored.nextCache;loaded=true;
  // After recovery preserve the proven good generation as the next rollback.
  if(recovered)head={...head,current:head.previous,previous:null};
  return {world:restored.world,recovered};
 }
 return {
  load:()=>exclusive(read),
  save:world=>exclusive(async()=>{
   validateWorld(world);if(!loaded)await read();
   const started=performance.now(),stamp=new Date().toISOString(),values=parts({...world,lastSaved:stamp}),nextRevision=revision+1,entries=[],changed=[];
   for(const part of values){const prior=cache.get(part.id),key=prior?.json===part.json?prior.key:'part:'+nextRevision+':'+part.id;entries.push({...part,key,json:undefined});if(key!==prior?.key)changed.push({key,json:part.json});}
   const current={entries,stamp},nextHead={format:'be-mobile-local-v1',revision:nextRevision,current,previous:head?.current||null};
   const retained=new Set([...entries,...(nextHead.previous?.entries||[])].map(e=>e.key));
   const obsolete=(head?.previous?.entries||[]).filter(e=>!retained.has(e.key));
   const db=await database(),tx=db.transaction('records','readwrite',{durability:'strict'}),done=transactionDone(tx),store=tx.objectStore('records');
   let conflict=false;
   const check=store.get('head');check.onsuccess=()=>{
    if((check.result?.revision||0)!==revision){conflict=true;tx.abort();return;}
    for(const row of changed)store.put(row.json,row.key);
    for(const row of obsolete)store.delete(row.key);
    store.put(nextHead,'head');
   };
   try{await done;}catch(error){if(conflict)throw Error('다른 게임 창에서 저장이 변경됐습니다. 이 창을 다시 열어 최신 저장을 불러오세요.');throw Error('기기 저장 실패: '+(error?.message||error)+'. 이전 자동 저장은 유지됩니다.',{cause:error});}
   revision=nextRevision;head=nextHead;cache=new Map(values.map((part,i)=>[part.id,{key:entries[i].key,json:part.json}]));world.lastSaved=stamp;
   return {changedParts:changed.length,totalParts:entries.length,durationMs:performance.now()-started};
  }),
  close:()=>exclusive(async()=>{if(dbPromise)(await dbPromise).close();dbPromise=null;loaded=false;cache.clear();})
 };
}
