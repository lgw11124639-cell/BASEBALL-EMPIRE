import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportChunks,importChunks,encodeBase64} from './backup-transfer.mjs';
test('large Unicode backups round trip with bounded native bridge chunks',async()=>{
 const data={text:'가'.repeat(32767)+'😀'+'야구⚾'.repeat(80000)},text=JSON.stringify(data);let bytes=[],finished=false,largest=0;
 await exportChunks({writeChunk:async({data})=>{largest=Math.max(largest,data.length);bytes.push(Buffer.from(data,'base64'));},finishExport:async()=>{finished=true;}},'token',text);
 assert.ok(finished);assert.ok(largest<524288);const all=Buffer.concat(bytes);let offset=0;
 const decoded=await importChunks({readChunk:async()=>{if(offset>=all.length)return {done:true};const chunk=all.subarray(offset,offset+1001);offset+=chunk.length;return {done:false,data:encodeBase64(chunk)};}},'token');assert.deepEqual(decoded,data);
});
test('out-of-space export aborts the partial file and never reports success',async()=>{
 let cancelled=false,finished=false;await assert.rejects(exportChunks({writeChunk:async()=>{throw Error('ENOSPC');},cancel:async()=>{cancelled=true;},finishExport:async()=>{finished=true;}},'t','가'.repeat(50000)),/ENOSPC/);assert.ok(cancelled);assert.equal(finished,false);
});
test('corrupt backup or mid-stream read error rejects instead of replacing a world',async()=>{
 let cancelled=false;await assert.rejects(importChunks({readChunk:async()=>{throw Error('IO failure');},cancel:async()=>{cancelled=true;}},'t'),/IO failure/);assert.ok(cancelled);
 let i=0;await assert.rejects(importChunks({readChunk:async()=>++i===1?{data:btoa('{bad')}:{done:true},cancel:async()=>{}},'t'));
});
