import {readFileSync,readdirSync,readlinkSync} from 'node:fs';
// Inspect only explicitly named non-secret configuration; never return an env dump.
export function selectRuntimeConfig(text){
 const selected={};
 for(const entry of text.split('\0')){const i=entry.indexOf('=');const name=entry.slice(0,i);if(['PORT','DATA_DIR','BE_SERVER_ENGINE_ENABLED'].includes(name))selected[name]=entry.slice(i+1)}
 return selected;
}
export function readProcessRuntime(pid){
 if(!Number.isSafeInteger(pid)||pid<1)throw Error('Invalid API process PID');
 const root='/proc/'+pid;
 const configuration=selectRuntimeConfig(readFileSync(root+'/environ','utf8'));
 const sockets=new Set();
 for(const fd of readdirSync(root+'/fd')){
  try{const inode=/^socket:\[(\d+)\]$/.exec(readlinkSync(root+'/fd/'+fd));if(inode)sockets.add(inode[1])}catch{}
 }
 const ports=new Set();
 for(const file of ['tcp','tcp6']){
  let content;try{content=readFileSync(root+'/net/'+file,'utf8')}catch{continue}
  for(const line of content.trim().split('\n').slice(1)){
   const columns=line.trim().split(/\s+/);
   if(columns[3]==='0A'&&sockets.has(columns[9]))ports.add(parseInt(columns[1].split(':').at(-1),16));
  }
 }
 return {pid,configuration,listeningPorts:[...ports]};
}
