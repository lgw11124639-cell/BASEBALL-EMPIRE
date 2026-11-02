// One short-lived committed world, bound to authenticated owner and DB digest.
// take() consumes it before execution. The caller JSON-clones its state to match
// persistence semantics and never lets a failed simulation modify this baseline.
export function createDecodedDayCache({ttlMs=300000,maxReuse=12,now=Date.now}={}){
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
  put({user,slot,rev,digest,state,wire,codec,fieldHashes}){
   clear();if(typeof digest!=='string'||!codec)return;
   const count=(uses.get(codec)||0)+1;uses.set(codec,count);if(count>maxReuse)return;
   entry={user,slot,rev,digest,state,wire,codec,fieldHashes,expires:now()+ttlMs};
   timer=setTimeout(clear,ttlMs);timer.unref?.();
  },
  clear
 };
}
