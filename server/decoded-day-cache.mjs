// One short-lived committed entry, bound to authenticated owner and DB digest.
// Native entries own one decoded world and may retain its private warmed VM.
// Legacy/serialized entries are cloned or parsed before use. No future day runs.
// take() consumes the entry, so failed operations cannot poison a later request.
export function createDecodedDayCache({ttlMs=300000,maxReuse=12,now=Date.now,maxRssBytes=Infinity,rss=()=>process.memoryUsage().rss}={}){
 let entry=null,timer=null;
 const uses=new WeakMap();
 function clear(){entry=null;if(timer!==null)clearTimeout(timer);timer=null}
 return {
  take(user,slot,rev,digest){
   if(!entry)return null;
   if(entry.expires<=now()){clear();return null}
   if(entry.user!==user||entry.slot!==slot)return null;
   const value=entry;clear();
   return value.rev===rev&&typeof digest==='string'&&value.digest===digest?value:null;
  },
  put({user,slot,rev,digest,state,wire,codec,fieldHashes,serializedFields,runtime}){
   clear();if(typeof digest!=='string'||!codec)return;
   if(rss()>maxRssBytes){console.info(JSON.stringify({stage:'day-cache-skipped',reason:'memory-budget'}));return}
   const count=(uses.get(codec)||0)+1;uses.set(codec,count);if(!serializedFields&&codec.mode!=='server-json-v1'&&count>maxReuse)return;
   entry={user,slot,rev,digest,state,wire,codec,fieldHashes,serializedFields,runtime,expires:now()+ttlMs};
   timer=setTimeout(clear,ttlMs);timer.unref?.();
  },
  clear
 };
}
