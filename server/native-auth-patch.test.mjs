import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {gzipSync,gunzipSync} from 'node:zlib';
import {packNativeSave} from '../native-save.js';
import {packServerSave,restoreServerSave} from './save-wire-codec.mjs';
const script=readFileSync(new URL('./stage-auth-advance.mjs',import.meta.url),'utf8');
const patch=script.slice(script.indexOf('// Negotiate plain server JSON'),script.indexOf('// Copy only referenced source modules'));
const original=`  const response=(res,status,obj,origin)=>{res.end(JSON.stringify(obj))};
async function get(req,shards,session,slot){const item=shards.get(session.user_id,slot);return item;}`;
const patched=vm.runInNewContext('let source='+JSON.stringify(original)+';'+patch+';source');
test('actual staged response patch negotiates HTTP gzip and respects q=0',()=>{
 const response=vm.runInNewContext(patched.replace(/^import .*\n/, '')+';response',{beHttpGzipSync:gzipSync,Buffer});
 for(const encoding of ['br, gzip','gzip;q=0','br','gzip;q=0.5']){
  let headers,body;const res={req:{headers:{'accept-encoding':encoding}},writeHead(s,h){assert.equal(s,200);headers=h},end(b){body=b}};
  const data={text:'x'.repeat(20000)};response(res,200,data,'https://example.test');
  const compressed=['br, gzip','gzip;q=0.5'].includes(encoding);
  assert.equal(headers['content-encoding'],compressed?'gzip':undefined);
  assert.deepEqual(JSON.parse(compressed?gunzipSync(body):body),data);
 }
});
test('actual staged GET patch serves native JSON to new clients and a lossless legacy view to old clients',async()=>{
 const get=vm.runInNewContext(patched.replace(/^import .*\n/, '')+';get',{URL,packServerSave,restoreServerSave});
 const world={year:2046,day:29,players:[{id:1,name:'Tester'}],teams:[],gameResults:[],custom:{retained:true}},wire=packNativeSave(world);
 const store={get(){return {rev:4,save:wire}}};
 const modern=await get({url:'/v2/saves/main?wireFormat=server-json-v1'},store,{user_id:1},'main');
 assert.equal(modern.save,wire);
 const old=await get({url:'/v2/saves/main'},store,{user_id:1},'main');
 assert.equal(old.save.beServerNativeManifest,undefined);
 assert.deepEqual(await restoreServerSave(old.save),world);
});
test('preparation gate patch is explicit, idempotent and rejects unknown auth factories',()=>{
 const part=script.slice(script.indexOf('// Background preparation is enabled'),script.indexOf('// Negotiate plain server JSON'));
 const patch=input=>vm.runInNewContext('let source='+JSON.stringify(input)+';'+part+';source');
 const before="const handleAdvance=createAdvanceDayRoute({enabled:process.env.BE_SERVER_ENGINE_ENABLED==='1'});";
 const once=patch(before);assert.ok(once.includes("precompute:process.env.BE_SERVER_PRECOMPUTE==='1'"));assert.equal(patch(once),once);assert.throws(()=>patch('unknown factory'),/Unexpected engine factory/);
});
