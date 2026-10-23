(function(){
'use strict';
const CURRENT='0.7.9', BUILD='20261023-series79';
let available=null,checking=false;
function el(id){return document.getElementById(id)}
function draw(){if(el('be-version-widget'))return;const panel=document.createElement('aside');panel.id='be-version-widget';panel.innerHTML='<button id="be-version-toggle" type="button" aria-expanded="false">⚾ v'+CURRENT+'</button><div id="be-version-panel" hidden><strong>BASEBALL EMPIRE</strong><p>설치된 버전: v'+CURRENT+'</p><p id="be-version-message">최신 버전을 확인할 수 있습니다.</p><button id="be-check" type="button">업데이트 확인</button><button id="be-apply" type="button" hidden>업데이트 적용</button><button id="be-hide" type="button">닫기</button></div>';document.body.appendChild(panel);el('be-version-toggle').onclick=()=>{const p=el('be-version-panel');p.hidden=!p.hidden;el('be-version-toggle').setAttribute('aria-expanded',String(!p.hidden));if(!p.hidden)check()};el('be-check').onclick=check;el('be-hide').onclick=()=>{el('be-version-panel').hidden=true;el('be-version-toggle').setAttribute('aria-expanded','false')};el('be-apply').onclick=apply}
async function check(){if(checking)return;checking=true;if(el('be-version-message'))el('be-version-message').textContent='업데이트 확인 중…';try{const res=await fetch('./version.json?check='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('버전 정보를 불러올 수 없습니다');const data=await res.json();if(typeof data.version!=='string'||typeof data.build!=='string')throw Error('버전 정보 오류');available=(data.build!==BUILD||data.version!==CURRENT)?data:null;const msg=el('be-version-message'),applyButton=el('be-apply'),toggle=el('be-version-toggle');if(available){msg.textContent='새 버전 v'+data.version+' 사용 가능'+(data.notes?' · '+data.notes:'');applyButton.hidden=false;toggle.textContent='⚾ 업데이트 가능';toggle.classList.add('update-ready')}else{msg.textContent='현재 최신 버전입니다.';applyButton.hidden=true;toggle.textContent='⚾ v'+CURRENT;toggle.classList.remove('update-ready')}}catch(e){if(el('be-version-message'))el('be-version-message').textContent='연결을 확인해 주세요. '+e.message}finally{checking=false}}
async function apply(){if(!available)return;const btn=el('be-apply');btn.disabled=true;btn.textContent='새 버전 불러오는 중…';try{
const base=new URL('./index.html',location.href);base.searchParams.set('update',available.build);base.searchParams.set('t',String(Date.now()));
const response=await fetch(base.toString(),{cache:'no-store'});if(!response.ok)throw Error('새 화면을 내려받지 못했습니다');
let html=await response.text();if(!html.includes('id="app"')||!html.includes('app.js'))throw Error('새 화면 파일이 올바르지 않습니다');
const cacheKey=encodeURIComponent(available.build)+'-'+Date.now();
html=html.replace(/(\b(?:src|href)=")([^"]+\.(?:js|css))(?:\?[^"]*)?(")/g,(all,pre,path,end)=>pre+path+'?fresh='+cacheKey+end);
history.replaceState(null,'',base.toString());document.open();document.write(html);document.close();
}catch(e){btn.disabled=false;btn.textContent='업데이트 적용';if(el('be-version-message'))el('be-version-message').textContent='업데이트 실패: '+e.message+' · 인터넷 연결을 확인해 주세요.'}}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw);else draw();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});window.addEventListener('online',check);setTimeout(check,1500);
})();
