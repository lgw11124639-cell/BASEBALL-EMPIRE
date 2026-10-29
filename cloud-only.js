// Cloud-only save transport. Never persists game state to local storage.
const API='https://baseball-empire-save.duckdns.org';
const KEY='be-cloud-session-v1';
let token=null,username='',revision=null,verified=false,baseline=null;
let gzipSaveSupported=false; // Temporarily disable gzip uploads: Content-Encoding can fail CORS preflight; retain uncompressed cloud-only PUT with If-Match.
let gzipRejectedStatus=null;
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s?.token&&s?.username&&Number(s.expiresAt)>Date.now()){token=s.token;username=s.username}else localStorage.removeItem(KEY)}catch(_){try{localStorage.removeItem(KEY)}catch(_){}}
function remember(){try{if(token)localStorage.setItem(KEY,JSON.stringify({token,username,expiresAt:Date.now()+6*24*60*60*1000}));else localStorage.removeItem(KEY)}catch(_){}}
// Lossless replay-event packing inside the JSON save (no Content-Encoding header).
// The live game state is never mutated; old uncompressed saves remain readable.
const replayCompressionCache=new WeakMap();
async function packReplayResults(state){
 if(typeof CompressionStream!=='function'||typeof TextEncoder==='undefined'||!Array.isArray(state?.gameResults))return state;
 const games=state.gameResults;let changed=false;
 const packed=await Promise.all(games.map(async game=>{
  if(!Array.isArray(game?.broadcastEvents)||!game.broadcastEvents.length)return game;
  const events=game.broadcastEvents;
  const prior=replayCompressionCache.get(events);
  if(prior&&prior.count===events.length&&prior.first===events[0]&&prior.last===events[events.length-1]){
   if(!prior.encoded)return game;
   changed=true;const copy={...game};delete copy.broadcastEvents;copy.bePackedBroadcastGzip=prior.encoded;return copy;
  }
  const raw=JSON.stringify(events);
  if(raw.length<1500)return game;
  try{
   const bytes=new TextEncoder().encode(raw);
   const zipped=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
   let binary='';for(let i=0;i<zipped.length;i+=8192)binary+=String.fromCharCode(...zipped.subarray(i,i+8192));
   const encoded=btoa(binary);
   const useful=encoded.length<raw.length*.85;
   replayCompressionCache.set(events,{count:events.length,first:events[0],last:events[events.length-1],encoded:useful?encoded:null});
   if(!useful)return game;
   changed=true;const copy={...game};delete copy.broadcastEvents;copy.bePackedBroadcastGzip=encoded;return copy;
  }catch(_){return game}
 }));
 return changed?{...state,gameResults:packed}:state;
}
async function unpackReplayResults(state){
 if(!Array.isArray(state?.gameResults))return state;
 const packed=state.gameResults.filter(g=>typeof g?.bePackedBroadcastGzip==='string');
 if(!packed.length)return state;
 if(typeof DecompressionStream!=='function')throw Error('이 저장 데이터를 불러오려면 gzip 압축 해제를 지원하는 브라우저가 필요합니다');
 await Promise.all(packed.map(async game=>{
  const binary=atob(game.bePackedBroadcastGzip);const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const events=JSON.parse(await new Response(stream).text());
  if(!Array.isArray(events))throw Error('경기 다시보기 데이터 형식이 올바르지 않습니다');
  game.broadcastEvents=events;delete game.bePackedBroadcastGzip;
 }));return state;
}
// Lossless packing for large auxiliary league datasets. Only the wire snapshot changes.
const auxiliarySaveFields=['highSchoolBaseball','collegeBaseball','nationalTeamResults'];
// Reuse compressed bytes when an auxiliary dataset has not changed identity.
const auxiliaryCompressionCache=new WeakMap();
async function packAuxiliaryFields(state){
 if(typeof CompressionStream!=='function'||typeof TextEncoder==='undefined')return state;
 let packed=null,copy=null;
 for(const key of auxiliarySaveFields){
  if(state?.[key]===undefined)continue;
  const value=state[key];
  // Compare serialized content: league objects may mutate without changing identity.
  const raw=JSON.stringify(value);
  const cached=value&&typeof value==='object'?auxiliaryCompressionCache.get(value):null;
  if(cached&&cached.key===key&&cached.raw===raw){
   if(cached.encoded){if(!copy)copy={...state};if(!packed)packed={};packed[key]=cached.encoded;delete copy[key]}
   continue;
  }
  if(!raw||raw.length<20000)continue;
  try{
   const zipped=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
   let binary='';for(let i=0;i<zipped.length;i+=8192)binary+=String.fromCharCode(...zipped.subarray(i,i+8192));
   const encoded=btoa(binary);
   if(encoded.length>=raw.length*.8){if(value&&typeof value==='object')auxiliaryCompressionCache.set(value,{key,raw,encoded:null});continue}
   if(value&&typeof value==='object')auxiliaryCompressionCache.set(value,{key,raw,encoded});
   if(!copy)copy={...state};
   if(!packed)packed={};
   packed[key]=encoded;delete copy[key];
  }catch(_){}
 }
 if(!copy)return state;
 copy.bePackedAuxiliaryGzip=packed;
 return copy;
}
async function unpackAuxiliaryFields(state){
 const packed=state?.bePackedAuxiliaryGzip;
 if(!packed||typeof packed!=='object')return state;
 if(typeof DecompressionStream!=='function')throw Error('저장 데이터 압축 해제를 지원하는 브라우저가 필요합니다');
 for(const key of auxiliarySaveFields){
  if(typeof packed[key]!=='string')continue;
  const binary=atob(packed[key]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  state[key]=JSON.parse(await new Response(stream).text());
 }
 delete state.bePackedAuxiliaryGzip;
 return state;
}
async function call(path,method='GET',data,rev){
 const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;
 if(data!==undefined)headers['Content-Type']='application/json';
 if(rev!==undefined)headers['If-Match']=String(rev);
 const measure=path==='/v2/saves/main'&&method==='PUT';
 const start=measure?performance.now():0;
 const json=data===undefined?undefined:JSON.stringify(data);
 const serializedAt=measure?performance.now():0;
 let body=json;
 // Large saves are transferred compressed only when the browser supports it.
 // Retry uncompressed on unsupported-content-encoding responses; never retry conflicts.
 let compressed=false;
 if(path==='/v2/saves/main'&&method==='PUT'&&json&&json.length>100000&&gzipSaveSupported&&typeof CompressionStream==='function'){
  try{
   const stream=new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
   body=await new Response(stream).arrayBuffer();
   headers['Content-Encoding']='gzip';
   compressed=true;
  }catch(e){body=json;delete headers['Content-Encoding']}
 }
 // Refresh payload composition every 10 saves to expose growth without paying the extra serialization cost on every day.
 // This is diagnostic only; it never changes the saved state or cloud revision.
 if(measure&&data&&typeof data==='object'&&((window.beCloudPayloadAuditSaveCount=(window.beCloudPayloadAuditSaveCount||0)+1)===1||window.beCloudPayloadAuditSaveCount%10===0)){
  const auditStart=performance.now();
  const previousAudit=window.beCloudPayloadAuditSnapshot||null;
  try{const sizes=Object.entries(data).map(([key,value])=>({key,bytes:JSON.stringify(value)?.length||0})).sort((a,b)=>b.bytes-a.bytes);window.beCloudPayloadAudit=sizes.slice(0,10);
   const currentAudit=Object.fromEntries(sizes.map(item=>[item.key,item.bytes]));
   window.beCloudPayloadAuditGrowth=sizes.map(item=>({key:item.key,bytes:item.bytes,delta:previousAudit===null?null:item.bytes-(previousAudit[item.key]||0)})).sort((a,b)=>(b.delta||0)-(a.delta||0)).slice(0,10);
   window.beCloudPayloadAuditSnapshot=currentAudit;
   const results=Array.isArray(data.gameResults)?data.gameResults:[];
   const sample=results.slice(-Math.min(20,results.length));
   const sampleBytes=sample.reduce((n,g)=>n+JSON.stringify(g).length,0);
   const broadcastBytes=sample.reduce((n,g)=>n+JSON.stringify(g.broadcastEvents||[]).length,0);
   window.beCloudGameResultsAudit={games:results.length,sampleGames:sample.length,sampleBytes,broadcastBytes,broadcastShare:sampleBytes?Math.round(broadcastBytes/sampleBytes*100):0};
  }catch(_){}finally{window.beCloudPayloadAuditMs=Math.round((performance.now()-auditStart)*10)/10}
 }
 const encodedAt=measure?performance.now():0;
 let response=await fetch(API+path,{method,headers,body,cache:'no-store'});
 const firstStatus=response.status;
 const firstRequestMs=measure?performance.now()-encodedAt:0;
 let retriedUncompressed=false;
 if(compressed&&(response.status===400||response.status===415)){
  gzipSaveSupported=false;
  gzipRejectedStatus=response.status;
  retriedUncompressed=true;
  delete headers['Content-Encoding'];
  response=await fetch(API+path,{method,headers,body:json,cache:'no-store'});
 }
 const receivedAt=measure?performance.now():0;
 const serverTiming=measure?response.headers.get('Server-Timing'):null;
 const serverMs=serverTiming;
 const resourceTiming=measure?performance.getEntriesByName(API+path,'resource').slice(-1)[0]:null;
 const timingBreakdown=resourceTiming?{
  dns:Math.max(0,resourceTiming.domainLookupEnd-resourceTiming.domainLookupStart),
  connect:Math.max(0,resourceTiming.connectEnd-resourceTiming.connectStart),
  requestToResponse:Math.max(0,resourceTiming.responseStart-resourceTiming.requestStart),
  download:Math.max(0,resourceTiming.responseEnd-resourceTiming.responseStart),
  duration:resourceTiming.duration,
  detailed:resourceTiming.responseStart>0&&resourceTiming.requestStart>0
 }:null;
 let result={};try{result=await response.json()}catch(_){}
 if(measure){window.beCloudSaveTiming={serialize:serializedAt-start,compress:encodedAt-serializedAt,network:receivedAt-encodedAt,response:performance.now()-receivedAt,bytes:json?.length||0,transferred:typeof body==='string'?body.length:body?.byteLength||0,compressed:compressed&&!retriedUncompressed,compressionAttempted:compressed,retriedUncompressed,firstStatus,firstRequestMs,gzipRejectedStatus,serverMs,timingBreakdown,finalStatus:response.status};}
 if(!response.ok){if(response.status===401){token=null;username='';verified=false;remember()}const err=Error(result.error||'HTTP '+response.status);err.status=response.status;throw err}
 return result;
}
const revisionOf=x=>{const n=Number(x?.revision??x?.rev??x?.saveRevision);return Number.isSafeInteger(n)&&n>=0?n:null};
async function snapshot(){try{return await call('/v2/saves/main')}catch(e){if(e.status===404)return null;throw e}}
async function check(){if(!token)throw Error('클라우드 로그인이 필요합니다');const s=await snapshot();const rev=s?revisionOf(s):0;if(rev===null)throw Error('서버 저장 버전 확인 실패');revision=rev;verified=true;baseline=s;return s?.save?await unpackReplayResults(await unpackAuxiliaryFields(s.save)):null}
export async function cloudSave(state){
 if(!state)throw Error('저장할 게임이 없습니다');
 if(!token||!verified||revision===null)throw Error('클라우드 로그인 또는 저장 상태 확인이 필요합니다');
 // Optimistic concurrency: the server validates If-Match atomically on PUT.
 // Avoid a redundant full snapshot GET before every daily save.
 // A 409/412 still blocks progress and requires a fresh login/load.
 let result;
 try{
  const packStarted=performance.now();
  const replayPacked=await packReplayResults(state);
  const replayPackedAt=performance.now();
  const payload=await packAuxiliaryFields(replayPacked);
  const auxiliaryPackedAt=performance.now();
  result=await call('/v2/saves/main','PUT',payload,revision);
  window.beCloudPackingTiming={replay:Math.round((replayPackedAt-packStarted)*10)/10,auxiliary:Math.round((auxiliaryPackedAt-replayPackedAt)*10)/10,total:Math.round((auxiliaryPackedAt-packStarted)*10)/10};
 }
 catch(e){if(e.status===409||e.status===412)verified=false;throw e}
 const next=revisionOf(result);
 if(next===null){verified=false;throw Error('서버 저장 성공 응답의 버전이 확인되지 않았습니다. 다시 로그인하여 상태를 확인하세요')}
 revision=next;baseline={save:state,revision:next};return result;
}
export async function cloudGate(onReady){
 const overlay=document.createElement('div');overlay.id='be-cloud-gate';
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483646;background:#eaf1f9;display:flex;align-items:center;justify-content:center;padding:18px;font:15px system-ui;color:#183b60';
 const card=document.createElement('section');card.style.cssText='background:#fff;border-radius:18px;padding:26px;max-width:390px;width:100%;box-shadow:0 10px 45px #1233';
 const title=document.createElement('h2');title.textContent='⚾ BASEBALL EMPIRE';
 const intro=document.createElement('p');intro.textContent='클라우드 계정에 로그인해야 게임을 시작할 수 있습니다.';
 const name=document.createElement('input'),pass=document.createElement('input'),confirmPass=document.createElement('input');
 let signup=false;
 for(const e of [name,pass,confirmPass])e.style.cssText='box-sizing:border-box;width:100%;padding:12px;margin:7px 0;border:1px solid #bccddd;border-radius:9px;font-size:16px';
 name.placeholder='아이디';name.autocomplete='username';pass.placeholder='비밀번호';pass.type='password';pass.autocomplete='current-password';confirmPass.type='password';confirmPass.placeholder='비밀번호 확인';confirmPass.autocomplete='new-password';confirmPass.hidden=true;
 const button=document.createElement('button');button.textContent='로그인';button.style.cssText='width:100%;padding:13px;margin:10px 0;border:0;border-radius:9px;background:#2365a2;color:#fff;font-weight:700';
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='계정이 없나요? 회원가입';toggle.style.cssText='width:100%;padding:10px;border:0;background:transparent;color:#2365a2;text-decoration:underline;font-weight:700';
 const msg=document.createElement('p');msg.style.cssText='white-space:pre-wrap;line-height:1.5';
 card.append(title,intro,name,pass,confirmPass,button,toggle,msg);overlay.append(card);document.body.append(overlay);
 const setMode=mode=>{signup=mode;confirmPass.hidden=!mode;button.textContent=mode?'회원가입':'로그인';toggle.textContent=mode?'이미 계정이 있나요? 로그인':'계정이 없나요? 회원가입';pass.autocomplete=mode?'new-password':'current-password';msg.textContent='';};
 toggle.onclick=()=>setMode(!signup);
 const start=async()=>{button.disabled=true;toggle.disabled=true;try{
  if(!token){if(!name.value.trim()||!pass.value)throw Error('아이디와 비밀번호를 입력하세요');let r;
   if(signup){if(!/^[a-zA-Z0-9_]{4,24}$/.test(name.value.trim()))throw Error('아이디는 영문·숫자·밑줄 4~24자로 입력하세요');if(pass.value.length<12||pass.value.length>128)throw Error('비밀번호는 12~128자로 입력하세요');if(pass.value!==confirmPass.value)throw Error('비밀번호 확인이 일치하지 않습니다');r=await call('/v2/auth/register','POST',{username:name.value.trim(),password:pass.value});if(!r.token){r=await call('/v2/auth/login','POST',{username:name.value.trim(),password:pass.value})}}
   else r=await call('/v2/auth/login','POST',{username:name.value.trim(),password:pass.value});if(!r.token)throw Error('로그인 응답 오류');token=r.token;username=name.value.trim();remember()}
  pass.value='';confirmPass.value='';
  const data=await check();
  if(data&&(!Array.isArray(data.teams)||data.teams.length!==10||!Array.isArray(data.players)||data.schema!==1))throw Error('서버 저장 데이터 형식이 잘못됐습니다');
  await onReady(data);
  overlay.remove();
  let logout=document.getElementById('be-cloud-logout');
  if(!logout){
   logout=document.createElement('button');logout.id='be-cloud-logout';logout.type='button';logout.textContent='로그아웃';
   logout.style.cssText='position:fixed;right:14px;top:12px;z-index:2147483000;padding:9px 13px;border:1px solid #c5d5e4;border-radius:20px;background:#fff;color:#214c72;font:700 13px system-ui';
   logout.style.display=(document.body.classList.contains('be-start-screen')?'':'none');
   new MutationObserver(()=>{logout.style.display=document.body.classList.contains('be-start-screen')?'':'none'}).observe(document.body,{attributes:true,attributeFilter:['class']});
   logout.onclick=async()=>{if(!confirm('로그아웃할까요?'))return;logout.disabled=true;try{await call('/v2/auth/logout','POST')}catch(_){}token=null;username='';revision=null;verified=false;baseline=null;remember();location.reload()};
   document.body.append(logout);
  }
  let reset=document.getElementById('be-cloud-reset');
  if(!reset){
   reset=document.createElement('button');reset.id='be-cloud-reset';reset.type='button';reset.textContent='클라우드 초기화';
   reset.style.cssText='position:fixed;right:14px;top:58px;z-index:2147483000;padding:9px 13px;border:1px solid #e3b5b5;border-radius:20px;background:#fff;color:#a32626;font:700 13px system-ui';
   const syncVisibility=()=>{const show=document.body.classList.contains('be-start-screen');logout.style.display=show?'':'none';reset.style.display=show?'':'none'};
   reset.onclick=async()=>{if(!confirm('정말 클라우드 저장 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))return;if(!confirm('마지막 확인: 이 계정의 클라우드 게임 저장을 영구 삭제합니다. 계속할까요?'))return;reset.disabled=true;try{const current=await snapshot();if(!current){alert('초기화할 클라우드 저장 데이터가 없습니다.');return}const currentRev=revisionOf(current);if(currentRev===null)throw Error('저장 버전을 확인하지 못했습니다');if(!verified||revision!==currentRev)throw Error('다른 기기에서 저장 데이터가 변경됐습니다. 새로고침 후 다시 시도하세요');await call('/v2/saves/main','DELETE',undefined,currentRev);revision=0;verified=true;baseline=null;alert('클라우드 저장 데이터가 삭제되었습니다. 새 게임을 시작할 수 있습니다.');location.reload()}catch(e){alert('클라우드 초기화 실패: '+(e.message||e)+'\n서버가 저장 삭제 API를 지원하는지 확인해야 합니다.')}finally{reset.disabled=false}};
   document.body.append(reset);
   new MutationObserver(syncVisibility).observe(document.body,{attributes:true,attributeFilter:['class']});syncVisibility();
  }
 }catch(e){msg.textContent='로그인 또는 불러오기 실패: '+(e.message||e);if(!token){name.hidden=false;pass.hidden=false;button.textContent='로그인'}else{button.textContent='다시 시도';name.hidden=true;pass.hidden=true}}finally{button.disabled=false;toggle.disabled=false}};
 button.onclick=start;pass.onkeydown=e=>{if(e.key==='Enter'&&!signup)start()};confirmPass.onkeydown=e=>{if(e.key==='Enter'&&signup)start()};
 if(token){name.hidden=true;pass.hidden=true;button.textContent='다시 연결';toggle.hidden=true;msg.textContent='자동 로그인 중입니다.';start()}
}
