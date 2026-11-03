// Drives the debug APK's real WebView over ADB/CDP; no test-only game endpoints.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const id='com.baseballempire.game',out='test-results/android',pause=ms=>new Promise(r=>setTimeout(r,ms));
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:20000}).trim();
await mkdir(out,{recursive:true});adb('install','-r','test-baseline.apk');
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
 socket.onmessage=({data})=>{const response=JSON.parse(data);if(response.method==='Page.javascriptDialogOpening'){console.log('Android dialog:',response.params?.message);command('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}const task=pending.get(response.id);if(task){pending.delete(response.id);clearTimeout(task.timer);if(response.error)task.reject(Error(JSON.stringify(response.error)));else task.resolve(response.result);}};
 await command('Page.enable');
}
function command(method,params={}){return new Promise((resolve,reject)=>{const n=++serial,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout: '+method));},120000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function until(expression){for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(500);}throw Error('Android condition not reached: '+expression);}
function dumpUI(){try{adb('shell','rm','-f','/sdcard/be-window.xml');adb('shell','uiautomator','dump','/sdcard/be-window.xml');return adb('shell','cat','/sdcard/be-window.xml');}catch{return '';}}
async function tapNative(pattern,required=true){
 for(let attempt=0;attempt<12;attempt++){
  const xml=dumpUI();
  for(const node of xml.match(/<node\b[^>]*>/g)||[]){
   if(!node.includes('enabled="true"'))continue;
   const text=(node.match(/text="([^"]*)"/)||[])[1]||'',description=(node.match(/content-desc="([^"]*)"/)||[])[1]||'';
   if(!pattern.test(text)&&!pattern.test(description))continue;
   const bounds=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);if(!bounds)continue;
   adb('shell','input','tap',String(Math.round((+bounds[1]+ +bounds[3])/2)),String(Math.round((+bounds[2]+ +bounds[4])/2)));return true;
  }
  if(!required)return false;await pause(500);
 }
 throw Error('Native picker control not found: '+pattern);
}
const savedDay=`(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('baseball-empire-mobile-v1',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return new Promise((ok,no)=>{const tx=db.transaction('records'),s=tx.objectStore('records'),r=s.get('head');r.onsuccess=()=>{const entry=r.result?.current.entries.find(e=>e.field==='day');if(!entry){ok(null);return}const q=s.get(entry.key);q.onsuccess=()=>ok(JSON.parse(q.result));q.onerror=()=>no(q.error)};tx.oncomplete=()=>db.close()})})()`;
try{
 await attach();await until(`!!document.querySelector('#entry-new')`);
 assert.equal(await evaluate('window.beOfflineMobile'),true);assert.equal(await evaluate('window.beOfflineNative'),true,'native plugin bridge is available');
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
 // Actual ACTION_CREATE_DOCUMENT export, then ACTION_OPEN_DOCUMENT restore.
 const filename='baseball-empire-backup-2027-'+committed+'.json';
 await evaluate(`document.querySelector('#backup').click()`);
 await pause(1000);
 await tapNative(/^save$/i);
 await until(`!document.querySelector('#backup').disabled`);
 adb('pull','/sdcard/Download/'+filename,out+'/exported-backup.json');
 const exported=JSON.parse(await (await import('node:fs/promises')).readFile(out+'/exported-backup.json','utf8'));
 assert.equal(exported.day,committed);assert.equal(exported.teams.length,10);assert.ok(exported.players.length>=700);
 await evaluate(`document.querySelector('#advance-day').click()`);await until(`!document.querySelector('#advance-day').disabled`);assert.equal(await evaluate(savedDay),committed+1);
 await evaluate(`document.querySelector('#restore-backup').click()`);await pause(1000);
 if(!await tapNative(new RegExp(filename.replaceAll('.','\\.')),false)){
  await tapNative(/show roots|show navigation drawer/i);await tapNative(/^downloads$/i);await tapNative(new RegExp(filename.replaceAll('.','\\.')));
 }
 for(let i=0;i<60&&(await evaluate(savedDay))!==committed;i++)await pause(500);
 assert.equal(await evaluate(savedDay),committed,'native backup restore returns the exact exported date');
 const storage=await evaluate('window.beOfflineStorageInfo()');assert.ok(storage.appBytes>0);assert.ok(storage.availableBytes>0);
 await writeFile(out+'/running.png',execFileSync('adb',['exec-out','screencap','-p']));
 socket.close();adb('shell','am','force-stop',id);adb('install','-r','android/app/build/outputs/apk/debug/app-debug.apk');await attach();await until(`!!document.querySelector('#entry-load')&&!document.querySelector('#entry-load').disabled`);
 assert.equal(await evaluate(savedDay),committed,'force-stop preserves exactly the committed date');
 await evaluate(`document.querySelector('#entry-load').click()`);await until(`!!document.querySelector('#advance-day')`);
 await writeFile(out+'/reopened.png',execFileSync('adb',['exec-out','screencap','-p']));
 // The legacy-signature updater uses this same run-as archive transfer. Check
 // it against a fresh install with a newly allocated app data directory.
 socket.close();adb('shell','am','force-stop',id);
 const archivePath=out+'/migration-data.tar';
 await writeFile(archivePath,execFileSync('adb',['exec-out','run-as',id,'tar','-cf','-','app_webview'],{maxBuffer:512*1024*1024}));
 adb('uninstall',id);adb('install','android/app/build/outputs/apk/debug/app-debug.apk');
 adb('push',archivePath,'/data/local/tmp/be-migration-data.tar');
 adb('shell','run-as',id,'tar','-xf','/data/local/tmp/be-migration-data.tar');
 await attach();await until(`!!document.querySelector('#entry-load')&&!document.querySelector('#entry-load').disabled`);
 assert.equal(await evaluate(savedDay),committed,'legacy archive migration restores the committed world');
 await (await import('node:fs/promises')).unlink(archivePath);adb('shell','rm','/data/local/tmp/be-migration-data.tar');
 await writeFile(out+'/report.json',JSON.stringify({platform:'Android emulator API 35',initialDay:initial,committedDay:committed,worker:true,forceStopRecovery:true,updateInPlace:true,legacyArchiveMigration:true,nativeBackupExport:true,nativeBackupRestore:true,storage,timing,longTasks,samples},null,2));
 console.log('Android WebView: worker progression, stop and force-stop recovery PASS, committed day '+committed);
}catch(error){
 try{await writeFile(out+'/failure.xml',dumpUI());await writeFile(out+'/failure.png',execFileSync('adb',['exec-out','screencap','-p']));console.log('Android UI at failure:',dumpUI().slice(0,6000));await writeFile(out+'/logcat.txt',adb('logcat','-d','-t','500'));}catch{}
 throw error;
}finally{socket?.close();adb('forward','--remove','tcp:9223');}
