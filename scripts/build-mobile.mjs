import {readFile,writeFile,mkdir,rm,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
const dayUi=await readFile(new URL('../mobile/day-ui.txt',import.meta.url),'utf8');
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'dist-mobile');
export function mobileSource(source){
 function replaceOnce(before,after){if(source.split(before).length!==2)throw Error('Mobile adaptation boundary changed: '+before.slice(0,80));source=source.replace(before,after);}
 const imports=source.match(/^import \{ cloudGate, cloudSave \} from '[^']+';/m);
 if(!imports)throw Error('Save adapter import not found');
 replaceOnce(imports[0],"import {cloudGate,cloudSave} from './mobile/offline-entry.js';\nimport {runMobileDay} from './mobile/worker-client.js';");
 replaceOnce('클라우드 로그인 대기 중','기기에 저장된 야구 세계를 불러오는 중');
 replaceOnce('클라우드 초기화 실패','기기 저장을 열지 못했습니다');
 replaceOnce('저장 데이터는 로그인한 클라우드 계정에 보관됩니다.','로그인 없이 이 기기에 자동 저장됩니다. 앱 삭제·기기 변경 전 백업 파일을 별도로 보관해 주세요.');
 replaceOnce('운영할 구단을 선택하세요.','관전할 구단을 선택하세요.');
 // Existing imported saves and simulation remain untouched; hide developer timing UI.
 replaceOnce('(window.beLastStepTiming?\'<details','(false?\'<details');
 const before="document.querySelector('#backup').onclick=()=>{try{";
 const begin=source.indexOf(before),end=source.indexOf(";document.querySelector('#restore').onchange",begin);
 if(begin<0||end<begin)throw Error('Backup UI boundary changed');
 source=source.slice(0,begin)+"document.querySelector('#backup').onclick=async()=>{try{await window.beExportOfflineBackup(state)}catch(e){alert('백업 생성 실패: '+e.message)}}"+source.slice(end);
 replaceOnce("catch(err){state=old;throw err}}}catch(err){alert('복원 실패:","catch(err){state=old;throw err}render()}}catch(err){alert('복원 실패:");
 replaceOnce("document.querySelector('#restore').onchange=async e=>{try{", "document.querySelector('#restore').onchange=async e=>{if(seasonStepBusy||autoSeasonRunning){e.target.value='';alert('자동 진행을 정지하고 현재 하루 계산이 끝난 뒤 복원해 주세요.');return}try{");
 replaceOnce("document.querySelector('#entry-new').onclick=()=>{", "document.querySelector('#entry-new').onclick=()=>{if(seasonStepBusy){alert('현재 하루 계산이 끝난 뒤 새 게임을 시작해 주세요.');return}");
 replaceOnce("else save().catch(e=>alert('저장 실패: '+e.message))", "else if(seasonStepBusy||autoSeasonRunning)alert('현재 하루 진행이 끝난 뒤 저장해 주세요.');else save().catch(e=>alert('저장 실패: '+e.message))");
 // Observe a loaded world through the existing title menu rather than auto-entering.
 replaceOnce("await cloudGate(async data=>{state=data;if(data){entryMode='game';tab='home';render()}else{entryMode='title';render()}})","await cloudGate(async data=>{state=data;entryMode='title';tab='home';render()})");
 replaceOnce("async function advanceSeason(holdGameDay=false,source='manual'){", "async function advanceSeason(holdGameDay=false,source='manual'){if(window.beOfflineMobile&&!holdGameDay)return beAdvanceMobileDay(source);");
 replaceOnce("function toggleAutoSeason(){if(autoSeasonRunning){stopAutoSeason();beRefreshAutoProgress();return}","function toggleAutoSeason(){if(autoSeasonRunning){stopAutoSeason();if(!seasonStepBusy&&!document.querySelector('#game-news-overlay, #player-overlay'))render();beRefreshAutoProgress();return}");
 const boot=source.lastIndexOf('(async()=>{try{app.innerHTML=');
 if(boot<0)throw Error('Mobile bootstrap missing');
 return source.slice(0,boot)+dayUi+'\n'+source.slice(boot);
}
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const source=mobileSource(await readFile(path.join(root,'app.js'),'utf8'));
await build({stdin:{contents:source,resolveDir:root,sourcefile:'mobile-app.js',loader:'js'},bundle:true,format:'esm',target:'chrome120',outfile:path.join(out,'app.js'),legalComments:'none'});
const original=await readFile(path.join(root,'app.js'),'utf8');
const boot=original.lastIndexOf('(async()=>{try{app.innerHTML=');
const engineSource=original.slice(0,boot).replace(/^import .*;\s*$/gm,'');
const orchestration=await readFile(path.join(root,'server/original-engine-day.mjs'),'utf8');
const marker='const result=sandbox.invoke(`',start=orchestration.indexOf(marker)+marker.length,end=orchestration.indexOf('`);',start);
if(start<marker.length||end<start)throw Error('Canonical daily engine boundary changed');
const day=orchestration.slice(start,end);
const workerPrelude="import {selectUnannouncedTests,investigationCalendar} from './kpbl-investigation-policy.js';\nconst window=globalThis;const document={querySelector(){return null},getElementById(){return null},addEventListener(){},removeEventListener(){}};\n";
const workerTail=`\nself.onmessage=({data})=>{const started=performance.now();try{state=data.world;playerConductClockCache=null;beInningLookupCache=null;tradeReviewContext=null;awardCandidatesCache=null;beZoneCache.profiles=new Map();const result=${day};self.postMessage({id:data.id,world:state,result,engineMs:performance.now()-started});}catch(error){self.postMessage({id:data.id,error:String(error?.message||error)});}};`;
await build({stdin:{contents:workerPrelude+engineSource+workerTail,resolveDir:root,sourcefile:'offline-engine-worker.js',loader:'js'},bundle:true,format:'esm',target:'chrome120',outfile:path.join(out,'engine-worker.js'),legalComments:'none'});
await copyFile(path.join(root,'ui.css'),path.join(out,'ui.css'));
await writeFile(path.join(out,'index.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#eef2f5"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>BASEBALL EMPIRE</title><link rel="stylesheet" href="ui.css"><style>body{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}.start-foot{line-height:1.7}</style></head><body><div id="app"><main class="app-loading">야구 세계를 불러오는 중…</main></div><script type="module" src="app.js"></script></body></html>`);
await writeFile(path.join(out,'build.json'),JSON.stringify({edition:'offline-mobile',version:'0.2.0',engine:JSON.parse(await readFile(path.join(root,'version.json'),'utf8')).build})+'\n');
console.log('Offline mobile assets built: dist-mobile (no login, cloud client, external game assets or updater)');
