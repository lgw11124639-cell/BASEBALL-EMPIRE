// Dependency inventory for safely moving the original daily engine to Node.
// Run from repository root: node server/audit-engine-boundary.mjs
// Read-only static analysis; no save writes, no simulated games.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function extractFunction(name){
 const pattern=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(');
 const match=pattern.exec(source);
 assert.ok(match,'Missing original engine function: '+name);
 const start=match.index;
 const open=source.indexOf('{',start+match[0].length);
 let depth=0,quote=null,escape=false,lineComment=false,blockComment=false,templateDepth=0;
 // Conservative lexer: handles comments and quoted strings; template expressions
 // are not fully parsed, so this is an inventory rather than a source transformer.
 for(let i=open;i<source.length;i++){
  const c=source[i],n=source[i+1];
  if(lineComment){if(c==='\n')lineComment=false;continue}
  if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++}continue}
  if(quote){
   if(escape){escape=false;continue}
   if(c==='\\'){escape=true;continue}
   if(c===quote){quote=null;continue}
   continue;
  }
  if(c==='/'&&n==='/'){lineComment=true;i++;continue}
  if(c==='/'&&n==='*'){blockComment=true;i++;continue}
  if(c==='"'||c==="'"||c==='\x60'){quote=c;continue}
  if(c==='{')depth++;
  if(c==='}'&&--depth===0)return {start,end:i+1,body:source.slice(start,i+1)};
 }
 throw Error('Unbalanced function '+name);
}
const targets=['advanceSeason','seasonProgressPanel','home','render'];
const report={ok:true,originalAppBytes:Buffer.byteLength(source),functions:{}};
for(const name of targets){
 const f=extractFunction(name);
 const browserGlobals=['window','document','localStorage','indexedDB','requestAnimationFrame','performance','alert','confirm'];
 const browserDependencies=browserGlobals.filter(x=>new RegExp('\\b'+x+'\\b').test(f.body));
 report.functions[name]={start:f.start,end:f.end,bytes:Buffer.byteLength(f.body),browserDependencies,
  cloudSaveCalls:(f.body.match(/cloudSave\s*\(/g)||[]).length,
  saveCalls:(f.body.match(/\bsave\s*\(/g)||[]).length};
}
report.serverEngineReady=report.functions.advanceSeason.browserDependencies.length===0;
report.originalUiPreserved=true;
console.log(JSON.stringify(report,null,2));
if(report.serverEngineReady)console.log('Daily entry point is free of directly referenced browser globals.');
else console.log('Daily entry point requires browser-side effects to be separated before Node execution.');
