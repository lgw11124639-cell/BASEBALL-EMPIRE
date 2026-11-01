// Run every top-level regression file with a bounded number of isolated Node workers.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const files=fs.readdirSync(__dirname).filter(f=>/\.test\.(cjs|js)$/.test(f)).sort();
const failures=[];let next=0,passed=0;
async function worker(){while(next<files.length){const file=files[next++];await new Promise(resolve=>{const child=spawn(process.execPath,[path.join(__dirname,file)],{cwd:path.join(__dirname,'..'),env:process.env});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timeout=setTimeout(()=>child.kill('SIGKILL'),300000);child.on('exit',(code,signal)=>{clearTimeout(timeout);if(code===0){passed++;console.log('PASS '+file)}else{failures.push(file);console.error('FAIL '+file+' '+(signal||code)+'\n'+output)}resolve()});});}}
Promise.all(Array.from({length:2},worker)).then(()=>{console.log(JSON.stringify({files:files.length,passed,failed:failures}));if(failures.length)process.exitCode=1;});
