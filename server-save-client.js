// Persist only retry metadata, never backup/save contents. On a lost restore
// response the user can reselect the same file, or recover its receipt on reload.
export function createServerSaveClient({api,getSession,storage,fetchImpl=fetch,newId=()=>crypto.randomUUID(),timeoutMs=180000}){
 let active=null;
 const session=()=>{const s=getSession();if(!s?.token||!s?.username)throw Error('다시 로그인해 주세요.');return s};
 const key=s=>'be-server-save-request-v1:'+encodeURIComponent(api)+':'+encodeURIComponent(s.username);
 const pending=s=>{const raw=storage.getItem(key(s));return raw?JSON.parse(raw):null};
 async function call(path,s,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetchImpl(api+path,{...options,headers:{Authorization:'Bearer '+s.token,Accept:'application/json',...options.headers},cache:'no-store',signal:controller.signal});
   const data=await response.json();
   if(!response.ok){const error=Error(response.status===409?'서버 저장 상태가 변경됐습니다. 새로고침해 주세요.':'서버 저장 작업을 확인하지 못했습니다. 같은 작업으로 다시 시도해 주세요.');error.status=response.status;error.code=data.error;throw error}
   return data;
  }finally{clearTimeout(timer)}
 }
 function acknowledge(s,p,result){
  if(result.request_id!==p.requestId||result.rev!==p.expectedRev+1||result.operation!==p.type)throw Error('저장 작업의 서버 응답이 일치하지 않습니다.');
  storage.removeItem(key(s));return result;
 }
 async function recover(){
  const s=session(),p=pending(s);if(!p)return null;
  try{return acknowledge(s,p,await call('/v2/engine/save-request/'+encodeURIComponent(p.requestId),s))}
  catch(error){if(error.status===404)return null;throw error}
 }
 function perform(revision,type,input,fingerprint){
  const s=session(),id=key(s);
  if(active){if(active.key===id&&active.type===type&&active.fingerprint===fingerprint)return active.promise;return Promise.reject(Error('이전 저장 작업이 처리 중입니다.'))}
  const task=Promise.resolve().then(async()=>{
   if(!Number.isSafeInteger(revision)||revision<0||!['new-game','restore','reset'].includes(type)||typeof fingerprint!=='string')throw Error('저장 작업 정보가 올바르지 않습니다.');
   let p=pending(s);
   if(p&&(p.type!==type||p.fingerprint!==fingerprint))throw Error('이전 저장 작업의 결과를 먼저 확인하거나, 같은 백업 파일로 재시도해 주세요.');
   if(!p){p={requestId:newId(),expectedRev:revision,type,fingerprint};storage.setItem(id,JSON.stringify(p));if(storage.getItem(id)!==JSON.stringify(p))throw Error('저장 요청 정보를 보관할 수 없습니다.');}
   else{const recovered=await recover();if(recovered)return recovered;}
   const json=JSON.stringify({requestId:p.requestId,...input});
   const headers={'Content-Type':'application/json','If-Match':String(p.expectedRev)};let body=json;
   if(json.length>100000&&typeof CompressionStream==='function'){
    body=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();headers['Content-Encoding']='gzip';
   }
   try{return acknowledge(s,p,await call('/v2/engine/'+type,s,{method:'POST',headers,body}))}
   catch(error){if(error.status===409&&error.code==='revision conflict')storage.removeItem(id);throw error}
  }).finally(()=>{active=null});
  active={key:id,type,fingerprint,promise:task};return task;
 }
 return {recover,perform};
}
