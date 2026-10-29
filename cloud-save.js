// BASEBALL EMPIRE cloud saves: opt-in, local IndexedDB remains authoritative.
const BASE='https://baseball-empire-save.duckdns.org';
let token=null,username='',revision=null;
const slot='main';
const css=`#be-cloud-open{position:fixed;right:14px;bottom:calc(94px + env(safe-area-inset-bottom));z-index:9000;border:1px solid #bad0e7;border-radius:24px;padding:10px 14px;background:#fff;color:#19456e;box-shadow:0 4px 18px #1234;font:700 13px system-ui}#be-cloud-panel{position:fixed;inset:0;z-index:100000;background:#10243a99;display:flex;align-items:center;justify-content:center;padding:18px}#be-cloud-panel[hidden]{display:none}#be-cloud-card{background:#fff;color:#173b60;border-radius:16px;max-width:420px;width:100%;padding:22px;box-sizing:border-box;font:14px system-ui}#be-cloud-card input{display:block;box-sizing:border-box;width:100%;margin:10px 0;padding:12px;border:1px solid #b6c9da;border-radius:9px}#be-cloud-card button{margin:5px 5px 5px 0;padding:10px 12px;border:1px solid #bfd0df;border-radius:9px;background:#edf5ff;color:#17436b;font-weight:700}#be-cloud-msg{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}`;
function node(tag,attrs={},text=''){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);e.textContent=text;return e}
async function request(path,method='GET',data,rev){const h={'Accept':'application/json'};if(token)h.Authorization='Bearer '+token;if(data!==undefined)h['Content-Type']='application/json';if(rev!==undefined)h['If-Match']=String(rev);const r=await fetch(BASE+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});let j={};try{j=await r.json()}catch(_){}if(!r.ok){if(r.status===401){token=null;revision=null}const e=Error(j.error||('HTTP '+r.status));e.status=r.status;throw e}return j}
function getRevision(j){return Number(j.revision??j.rev??j.saveRevision??0)}
export function installCloudSaves({getState,saveLocal,setState,render}) {
 if(document.querySelector('#be-cloud-open'))return;
 const style=node('style');style.textContent=css;document.head.append(style);
 const open=node('button',{id:'be-cloud-open',type:'button'},'☁ 클라우드 저장');document.body.append(open);
 const overlay=node('div',{id:'be-cloud-panel',role:'dialog','aria-modal':'true'});overlay.hidden=true;
 const card=node('section',{id:'be-cloud-card'}),title=node('h2',{},'클라우드 저장'),desc=node('p',{},'로컬 저장은 유지됩니다. 클라우드 저장과 불러오기는 수동으로 실행합니다.');
 const user=node('input',{type:'text',autocomplete:'username',placeholder:'아이디','aria-label':'아이디'});
 const pass=node('input',{type:'password',autocomplete:'current-password',placeholder:'비밀번호','aria-label':'비밀번호'});
 const actions=node('div'),msg=node('p',{id:'be-cloud-msg','aria-live':'polite'},'로그인이 필요합니다.');
 const close=node('button',{type:'button'},'닫기'),login=node('button',{type:'button'},'로그인'),upload=node('button',{type:'button'},'클라우드에 저장'),download=node('button',{type:'button'},'클라우드에서 불러오기'),logout=node('button',{type:'button'},'로그아웃');
 actions.append(close,login,upload,download,logout);card.append(title,desc,user,pass,actions,msg);overlay.append(card);document.body.append(overlay);
 const status=t=>{msg.textContent=t};
 const busy=async(fn)=>{for(const b of [login,upload,download,logout])b.disabled=true;try{await fn()}catch(e){status('오류: '+(e?.message||e))}finally{for(const b of [login,upload,download,logout])b.disabled=false;refresh()}};
 function refresh(){login.hidden=!!token;logout.hidden=!token;upload.hidden=!token;download.hidden=!token;user.hidden=!!token;pass.hidden=!!token;title.textContent=token?'클라우드 저장 · '+username:'클라우드 저장 · 로그인'}
 open.onclick=()=>{overlay.hidden=false;refresh()};close.onclick=()=>{overlay.hidden=true;pass.value=''};overlay.onclick=e=>{if(e.target===overlay)close.click()};
 login.onclick=()=>busy(async()=>{if(!user.value.trim()||!pass.value)throw Error('아이디와 비밀번호를 입력하세요');const result=await request('/v2/auth/login','POST',{username:user.value.trim(),password:pass.value});if(!result.token)throw Error('로그인 토큰이 없습니다');token=result.token;username=user.value.trim();pass.value='';revision=null;status('로그인 완료. 클라우드 저장은 자동으로 실행되지 않습니다.')});
 logout.onclick=()=>busy(async()=>{try{await request('/v2/auth/logout','POST')}finally{token=null;username='';revision=null;pass.value='';status('로그아웃했습니다. 로컬 게임은 유지됩니다.')}});
 upload.onclick=()=>busy(async()=>{const current=getState();if(!current)throw Error('저장할 게임이 없습니다');await saveLocal();const fresh=getState();let existing=null;try{existing=await request('/v2/saves/'+slot)}catch(e){if(e.status!==404)throw e}const rev=existing?getRevision(existing):0;if(existing&&!confirm('클라우드의 기존 저장을 현재 기기의 게임으로 교체할까요?\n다른 기기에서 진행한 내용이 사라질 수 있습니다.'))return;const result=await request('/v2/saves/'+slot,'PUT',fresh,rev);revision=getRevision(result);status('클라우드 저장 완료. '+fresh.year+' 시즌 · '+fresh.day+'일 차')});
 download.onclick=()=>busy(async()=>{const result=await request('/v2/saves/'+slot);const data=result.save;if(!data||data.schema!==1||!Array.isArray(data.teams)||data.teams.length!==10||!Array.isArray(data.players)||!Number.isInteger(data.teamId)||data.teamId<0||data.teamId>9)throw Error('클라우드 저장 형식이 올바르지 않습니다');if(!confirm('클라우드 게임('+data.year+' 시즌 · '+data.day+'일 차)을 이 기기에 불러올까요?\n기존 로컬 저장을 먼저 백업 파일로 내려받습니다.'))return;const old=getState();if(old){const blob=new Blob([JSON.stringify(old)],{type:'application/json'});const url=URL.createObjectURL(blob),a=node('a',{href:url,download:'baseball-empire-before-cloud-'+Date.now()+'.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}try{setState(data);await saveLocal()}catch(e){setState(old);throw e}revision=getRevision(result);status('클라우드 불러오기 완료. 로컬 저장도 갱신했습니다.');render()});
 refresh();
}
