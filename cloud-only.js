// Cloud-only save transport. Never persists game state to local storage.
const API='https://baseball-empire-save.duckdns.org';
const KEY='be-cloud-session-v1';
let token=null,username='',revision=null,verified=false,baseline=null;
try{const s=JSON.parse(sessionStorage.getItem(KEY)||'null');if(s?.token&&s?.username){token=s.token;username=s.username}}catch(_){}
function remember(){try{if(token)sessionStorage.setItem(KEY,JSON.stringify({token,username}));else sessionStorage.removeItem(KEY)}catch(_){}}
async function call(path,method='GET',data,rev){
 const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;
 if(data!==undefined)headers['Content-Type']='application/json';
 if(rev!==undefined)headers['If-Match']=String(rev);
 const response=await fetch(API+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
 let result={};try{result=await response.json()}catch(_){}
 if(!response.ok){if(response.status===401){token=null;username='';verified=false;remember()}const err=Error(result.error||'HTTP '+response.status);err.status=response.status;throw err}
 return result;
}
const revisionOf=x=>{const n=Number(x?.revision??x?.rev??x?.saveRevision);return Number.isSafeInteger(n)&&n>=0?n:null};
async function snapshot(){try{return await call('/v2/saves/main')}catch(e){if(e.status===404)return null;throw e}}
async function check(){if(!token)throw Error('클라우드 로그인이 필요합니다');const s=await snapshot();const rev=s?revisionOf(s):0;if(rev===null)throw Error('서버 저장 버전 확인 실패');revision=rev;verified=true;baseline=s;return s?.save||null}
export async function cloudSave(state){
 if(!state)throw Error('저장할 게임이 없습니다');
 if(!token||!verified||revision===null)throw Error('클라우드 로그인 또는 저장 상태 확인이 필요합니다');
 // Always check for changes made by another device before sending.
 const s=await snapshot(),remote=s?revisionOf(s):0;
 if(remote===null||remote!==revision){verified=false;throw Error('다른 기기에서 저장 데이터가 변경됐습니다. 진행을 중단하고 다시 로그인하여 불러오세요')}
 let result;
 try{result=await call('/v2/saves/main','PUT',state,revision)}
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
 const name=document.createElement('input'),pass=document.createElement('input');
 for(const e of [name,pass])e.style.cssText='box-sizing:border-box;width:100%;padding:12px;margin:7px 0;border:1px solid #bccddd;border-radius:9px;font-size:16px';
 name.placeholder='아이디';name.autocomplete='username';pass.placeholder='비밀번호';pass.type='password';pass.autocomplete='current-password';
 const button=document.createElement('button');button.textContent='로그인';button.style.cssText='width:100%;padding:13px;margin:10px 0;border:0;border-radius:9px;background:#2365a2;color:#fff;font-weight:700';
 const msg=document.createElement('p');msg.style.cssText='white-space:pre-wrap;line-height:1.5';
 card.append(title,intro,name,pass,button,msg);overlay.append(card);document.body.append(overlay);
 const start=async()=>{button.disabled=true;try{
  if(!token){if(!name.value.trim()||!pass.value)throw Error('아이디와 비밀번호를 입력하세요');const r=await call('/v2/auth/login','POST',{username:name.value.trim(),password:pass.value});if(!r.token)throw Error('로그인 응답 오류');token=r.token;username=name.value.trim();remember()}
  pass.value='';
  const data=await check();
  if(data&&(!Array.isArray(data.teams)||data.teams.length!==10||!Array.isArray(data.players)||data.schema!==1))throw Error('서버 저장 데이터 형식이 잘못됐습니다');
  await onReady(data);
  overlay.remove();
 }catch(e){msg.textContent='로그인 또는 불러오기 실패: '+(e.message||e);if(!token){name.hidden=false;pass.hidden=false;button.textContent='로그인'}else{button.textContent='다시 시도';name.hidden=true;pass.hidden=true}}finally{button.disabled=false}};
 button.onclick=start;pass.onkeydown=e=>{if(e.key==='Enter')start()};
 if(token){name.hidden=true;pass.hidden=true;button.textContent='다시 연결';msg.textContent='이전 로그인 세션을 확인하고 있습니다.';start()}
}
