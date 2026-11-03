// Drives the debug APK's real WebView over ADB/CDP; no test-only game endpoints.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const id='com.baseballempire.game',out='test-results/android',pause=ms=>new Promise(r=>setTimeout(r,ms));
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:20000}).trim();
await mkdir(out,{recursive:true});adb('install','-r','android/app/build/outputs/apk/debug/app-debug.apk');
let socket,serial=0,pending=new Map();
async function attach(){
 adb('shell','am','start','-n',id+'/.MainActivity');
 let target;
 for(let i=0;i<60;i++){
  try{const pid=adb('shell','pidof',id);adb('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid);const rows=await(await fetch('http://127.0.0.1:9223/json/list')).json();target=rows.find(r=>r.type==='page'&&r.webSocketDebuggerUrl);if(target)break;}catch{}
  await pause(1000);
 }
 if(!target)throw Error('Android WebView debugger did not become ready');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((ok,no)=>{socket.onopen=ok;socket.onerror=no;});
 socket.onmessage=({data})=>{const response=JSON.parse(data),task=pending.get(response.id);if(task){pending.delete(response.id);clearTimeout(task.timer);if(response.error)task.reject(Error(JSON.stringify(response.error)));else task.resolve(response.result);}};
}
function command(method,params={}){return new Promise((resolve,reject)=>{const n=++serial,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout: '+method));},120000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function until(expression){for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(500);}throw Error('Android condition not reached: '+expression);}
const savedDay=`(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('baseball-empire-mobile-v1',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return new Promise((ok,no)=>{const tx=db.transaction('records'),s=tx.objectStore('records'),r=s.get('head');r.onsuccess=()=>{const entry=r.result?.current.entries.find(e=>e.field==='day');if(!entry){ok(null);return}const q=s.get(entry.key);q.onsuccess=()=>ok(JSON.parse(q.result));q.onerror=()=>no(q.error)};tx.oncomplete=()=>db.close()})})()`;
try{
 await attach();await until(`!!document.querySelector('#entry-new')`);
 assert.equal(await evaluate('window.beOfflineMobile'),true);
 await evaluate(`document.querySelector('#entry-new').click();document.querySelector('#start').click()`);
 await until(`!!document.querySelector('#advance-day')&&!document.querySelector('#advance-day').disabled`);
 const initial=await evaluate(savedDay);assert.equal(initial,1);
 await evaluate(`window.__longTasks=[];new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask'});document.querySelector('#auto-season-speed').value='0';document.querySelector('#auto-season-speed').dispatchEvent(new Event('change'));document.querySelector('#auto-season').click()`);
 const samples=[],started=Date.now();let day=1;
 for(let i=0;i<120&&day<15;i++){await pause(500);day=await evaluate(savedDay);samples.push({elapsedMs:Date.now()-started,day});}
 await evaluate(`if(document.querySelector('#auto-season').textContent.includes('정지'))document.querySelector('#auto-season').click()`);
 await until(`!document.querySelector('#advance-day').disabled`);
 const committed=await evaluate(savedDay),timing=await evaluate('window.beLastStepTiming'),longTasks=await evaluate('window.__longTasks');
 assert.ok(committed>=3,'multiple actual daily calculations completed');assert.equal(timing.worker,true);
 await writeFile(out+'/running.png',execFileSync('adb',['exec-out','screencap','-p']));
 socket.close();adb('shell','am','force-stop',id);await attach();await until(`!!document.querySelector('#entry-load')&&!document.querySelector('#entry-load').disabled`);
 assert.equal(await evaluate(savedDay),committed,'force-stop preserves exactly the committed date');
 await evaluate(`document.querySelector('#entry-load').click()`);await until(`!!document.querySelector('#advance-day')`);
 await writeFile(out+'/reopened.png',execFileSync('adb',['exec-out','screencap','-p']));
 await writeFile(out+'/report.json',JSON.stringify({platform:'Android emulator API 35',initialDay:initial,committedDay:committed,worker:true,forceStopRecovery:true,timing,longTasks,samples},null,2));
 console.log('Android WebView: worker progression, stop and force-stop recovery PASS, committed day '+committed);
}finally{socket?.close();adb('forward','--remove','tcp:9223');}
