// BASEBALL EMPIRE release smoke gate (read-only).
// Run from repository root: node tests/release-smoke.test.js
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
for(const file of ['app.js','sw.js','update.js']){
  new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
  console.log('PASS syntax:',file);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(/app\.js\?v=[^"'\s]+/.test(html),'versioned app.js URL missing');
console.log('PASS: versioned PWA app entry');
for(const file of ['pitching-awards.test.js','minor-record-audit.test.js','minor-season-totals.test.js','inning-progression.test.js']){
  const result=spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:30000});
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  assert.equal(result.status,0,file+' failed or timed out');
}
console.log('PASS: release smoke checks (static + synthetic fixtures)');
console.log('NOTE: Browser/PWA and full multi-season simulation still require integration testing.');
