// Stores pending request metadata/command input only; never an authoritative save.
export function createServerDayClient({api,getSession,storage,fetchImpl=fetch,timeoutMs=180000,newId=()=>crypto.randomUUID(),wireFormat=null,wirePatch=false}){
 const active=new Map();
 function session(){const s=getSession();if(!s||typeof s.username!=='string'||typeof s.token!=='string'||Number(s.expiresAt)<=Date.now())throw Error('게임에서 다시 로그인해 주세요.');return s}
 const key=(s,command=false)=>'be-server-day-request-v1:'+encodeURIComponent(api)+':'+encodeURIComponent(s.username)+(command?':command':'');
 function pending(s,command=false){const value=storage.getItem(key(s,command));if(!value)return null;const p=JSON.parse(value);if(!p||!Number.isSafeInteger(p.expectedRev)||p.expectedRev<1||typeof p.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(p.requestId))throw Error('진행 요청 정보를 확인할 수 없습니다.');return p}
 async function call(path,options,s){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const started=performance.now();const response=await fetchImpl(api+path,{...options,headers:{Accept:'application/json',Authorization:'Bearer '+s.token,...options.headers},cache:'no-store',signal:controller.signal});
   const headersAt=performance.now();let data;try{data=await response.json()}catch{data=null}
   if(!response.ok){const error=Error(response.status===401?'게임에서 다시 로그인해 주세요.':response.status===409?'서버 상태가 변경됐습니다. 새로고침 후 진행 요청을 다시 확인해 주세요.':'서버 요청에 실패했습니다 (HTTP '+response.status+'). 같은 요청으로 다시 시도해 주세요.');error.status=response.status;error.code=data?.error;throw error}
   if(!data||typeof data!=='object')throw Error('서버 응답을 읽지 못했습니다. 같은 요청으로 다시 시도해 주세요.');
   const httpTiming=response.headers?.get?.('server-timing');
   if(httpTiming){const read=name=>{const match=new RegExp('(?:^|,)[ \t]*'+name+';dur=([0-9.]+)').exec(httpTiming);return Math.max(0,Number(match?.[1])||0)};data.httpTiming={serializeMs:read('be-json'),compressMs:read('be-gzip'),headersMs:headersAt-started,bodyMs:performance.now()-headersAt,jsonBytes:Math.max(0,Number(response.headers.get('x-be-json-bytes'))||0),transferBytes:Math.max(0,Number(response.headers.get('x-be-transfer-bytes'))||0)}}
   return data;
  }finally{clearTimeout(timer)}
 }
 function execute(revision,command){
   let s,id,p;
   try{
    if(command)command=JSON.parse(JSON.stringify(command));
    s=session();id=key(s,!!command);
    const commandJson=command?JSON.stringify(command):'';
    if(active.has(id)){const running=active.get(id);if(running.commandJson!==commandJson)throw Error('이전 변경 요청이 아직 처리 중입니다.');return running.promise}
    p=pending(s,!!command);
    if(p&&JSON.stringify(p.command??null)!==JSON.stringify(command??null))throw Error('이전 변경 요청과 같은 내용으로 다시 시도해 주세요.');
    if(!p){
     if(!Number.isSafeInteger(revision)||revision<1)throw Error('서버 상태를 먼저 새로고침해 주세요.');
     p={requestId:newId(),expectedRev:revision,...(command?{command}:{})};
     // Persist before transmitting; a lost response or reload reuses this ID.
     storage.setItem(id,JSON.stringify(p));
     if(storage.getItem(id)!==JSON.stringify(p))throw Error('진행 요청 정보를 보관할 수 없습니다.');
    }
   }catch(error){return Promise.reject(error)}
   const task=Promise.resolve().then(async()=>{
    const data=await call((p.command?'/v2/engine/command':'/v2/engine/advance')+(wireFormat==='server-json-v1'?'?wireFormat=server-json-v1'+(wirePatch?'&wirePatch=1':''):''),{method:'POST',headers:{'Content-Type':'application/json','If-Match':String(p.expectedRev)},body:JSON.stringify({requestId:p.requestId,...(p.command?{command:p.command}:{})})},s);
    if(data.request_id!==p.requestId||!Number.isSafeInteger(data.rev)||data.rev!==p.expectedRev+1)throw Error('서버 진행 결과를 확인할 수 없습니다. 같은 요청으로 다시 시도해 주세요.');
    storage.removeItem(id);return data;
   }).catch(error=>{
    // A definitive revision conflict means this ID was not committed. Refresh,
    // then require a new user click; never turn this into an automatic new day.
    if(error.status===409&&error.code==='revision conflict')storage.removeItem(id);
    throw error;
   }).finally(()=>active.delete(id));
   active.set(id,{promise:task,commandJson:command?JSON.stringify(command):''});return task;
 }
 return {
  hasPending(){return !!pending(session())},
  async status(){const s=session();return call('/v2/engine/status',{method:'GET'},s)},
  async home(){const s=session();return call('/v2/view/home',{method:'GET'},s)},
  advance:revision=>execute(revision),
  command:(revision,command)=>execute(revision,command),
 };
}
