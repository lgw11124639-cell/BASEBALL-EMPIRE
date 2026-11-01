// Audits the actual baseball engine's direct function calls before a Node port.
// Run from repo root: node server/audit-simulation-dependencies.mjs
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const names=['simulateLeagueDay','offseasonDay','nationalTeamTournamentDay','nationalTeamReturnDay'];
const declarations=[...source.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>({name:m[1],at:m.index}));
const known=new Set(declarations.map(x=>x.name));
function bodyFor(name){
 const start=source.indexOf('function '+name+'(');
 assert.ok(start>=0,'Missing function: '+name);
 const open=source.indexOf('{',start),next=declarations.filter(x=>x.at>start).sort((a,b)=>a.at-b.at)[0]?.at??source.length;
 // Scan to the next top-level function declaration as a conservative upper bound.
 return source.slice(open,next);
}
const report={ok:true,sourceBytes:Buffer.byteLength(source),functions:{}};
for(const name of names){
 const body=bodyFor(name);
 const called=[...new Set([...body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]))];
 const knownCalls=called.filter(x=>known.has(x)&&x!==name).sort();
 const browserGlobals=['window','document','localStorage','indexedDB','navigator','alert','confirm','requestAnimationFrame','setTimeout','performance'].filter(x=>new RegExp('\\b'+x+'\\b').test(body));
 report.functions[name]={approxBytes:Buffer.byteLength(body),knownFunctionCalls:knownCalls,browserGlobals};
}
report.directDependencyCount=[...new Set(Object.values(report.functions).flatMap(f=>f.knownFunctionCalls))].length;
report.serverReady=false;
report.liveSaveChanged=false;
console.log(JSON.stringify(report,null,2));
console.log('NOTE: Static call inventory only. Indirect dependencies and state mutations require separate review.');
