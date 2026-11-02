// Run after stage-advance-day.mjs. Source reads only; no live edits or DB access.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const api=resolve(process.argv[2]||'/opt/baseball-empire-api');
const stage=resolve(repo,'server.local-backup/advance-api');
if(!readFileSync(resolve(stage,'shard-store.mjs'),'utf8').includes('SAVEPOINT be_shard_write'))throw Error('Run stage-advance-day.mjs first');
let source=readFileSync(resolve(api,'auth.mjs'),'utf8');
const productionSourceHashes={'auth.mjs':hash(source),'shard-store.mjs':hash(readFileSync(resolve(api,'shard-store.mjs')))};
const alreadyIntegrated=source.includes('createAdvanceDayRoute');
const init='return async(req,res,origin)=>{';
const gate="if(!session){response(res,401,{error:'unauthorized'},origin);return true;}";
for(const anchor of [init,gate])if(source.split(anchor).length!==2)throw Error('Authentication structure changed; refusing patch');
if(!alreadyIntegrated){
source="import {createAdvanceDayRoute} from './server/advance-day-route.mjs';\nimport {restoreServerSave,packServerSave} from './server/save-wire-codec.mjs';\n"+source;
source=source.replace(init,`const handleAdvance=createAdvanceDayRoute({db,shards,restoreSave:restoreServerSave,encodeSave:packServerSave,body,response,enabled:process.env.BE_SERVER_ENGINE_ENABLED==='1'});
  const serverOwner=db.prepare('SELECT 1 FROM be_day_requests WHERE user_id=? AND slot=? LIMIT 1');
  ${init}`);
source=source.replace(gate,gate+`
    if(await handleAdvance(req,res,origin,session))return true;
    const engineSlot=/^\\/v2\\/saves\\/([^/]+)$/.exec(path)?.[1];
    if(engineSlot&&['PUT','PATCH','DELETE'].includes(req.method)&&serverOwner.get(session.user_id,engineSlot)){
      response(res,409,{error:'server-owned save; reload server state'},origin);return true;
    }`);
}
if(!source.includes("enabled:process.env.BE_SERVER_ENGINE_ENABLED==='1'")||!source.includes('server-owned save; reload server state'))throw Error('Existing auth integration is not the verified disabled/guarded implementation');
source=source.replace('SELECT 1 FROM be_day_requests WHERE user_id=? AND slot=? LIMIT 1','SELECT 1 FROM (SELECT user_id,slot FROM be_day_requests UNION ALL SELECT user_id,slot FROM be_lifecycle_requests) WHERE user_id=? AND slot=? LIMIT 1');
source=source.replace("&&serverOwner.get(session.user_id,engineSlot)","&&(process.env.BE_SERVER_ENGINE_ENABLED==='1'||serverOwner.get(session.user_id,engineSlot))");
// Background preparation is enabled only by the verified running upgrade.
if(!source.includes("precompute:process.env.BE_SERVER_PRECOMPUTE==='1'")){
 const anchor="enabled:process.env.BE_SERVER_ENGINE_ENABLED==='1'});";
 if(source.split(anchor).length!==2)throw Error('Unexpected engine factory; cannot add preparation gate');
 source=source.replace(anchor,"enabled:process.env.BE_SERVER_ENGINE_ENABLED==='1',precompute:process.env.BE_SERVER_PRECOMPUTE==='1'});");
}
// Negotiate plain server JSON while preserving older open clients on read.
if(!source.includes('native server JSON negotiation')){
 const getAnchor='const item=shards.get(session.user_id,slot);';
 if(source.split(getAnchor).length!==2)throw Error('Unexpected save GET implementation');
 source=source.replace(getAnchor,`let item=shards.get(session.user_id,slot);
      // native server JSON negotiation: old clients receive a lossless legacy view.
      if(item?.save?.beServerNativeManifest&&new URL(req.url,'http://localhost').searchParams.get('wireFormat')!=='server-json-v1')item={...item,save:await packServerSave(await restoreServerSave(item.save))};`);
}
if(!source.includes('beHttpGzipResponse')){
 source="import {gzipSync as beHttpGzipSync} from 'node:zlib';\n"+source;
 const begin=source.indexOf('  const response=(res,status,obj,origin)=>{'),end=source.indexOf('\n',begin);
 if(begin<0||end<begin||!source.slice(begin,end).includes('res.end(JSON.stringify(obj))'))throw Error('Unexpected response helper');
 source=source.slice(0,begin)+`  const response=(res,status,obj,origin)=>{
    const json=JSON.stringify(obj);
    const accepted=String(res.req?.headers?.['accept-encoding']||'').split(',').some(value=>{const m=/^\\s*gzip(?:\\s*;\\s*q=([0-9.]+))?\\s*$/i.exec(value);return m&&Number(m[1]??1)>0});
    const beHttpGzipResponse=json.length>=16384&&accepted;
    res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(beHttpGzipResponse?{'content-encoding':'gzip'}:{}),vary:origin?'Origin, Accept-Encoding':'Accept-Encoding',...(origin?{'access-control-allow-origin':origin}:{})});
    res.end(beHttpGzipResponse?beHttpGzipSync(Buffer.from(json),{level:1}):json);
  };`+source.slice(end);
}
// Upgrade our existing gzip helper idempotently; expose the response work that
// happens after the durable day receipt, without changing the receipt itself.
if(!source.includes('beHttpResponseTiming')){
 const begin=source.indexOf('  const response=(res,status,obj,origin)=>{'),end=source.indexOf('\n  };',begin);
 if(begin<0||end<0)throw Error('Unexpected gzip response helper; cannot add timing');
 let helper=source.slice(begin,end);
 const raw='const json=JSON.stringify(obj);',finish='res.end(beHttpGzipResponse?beHttpGzipSync(Buffer.from(json),{level:1}):json);';
 if(helper.split(raw).length!==2||helper.split(finish).length!==2)throw Error('Unknown JSON response implementation');
 helper=helper.replace(raw,'const beHttpResponseTiming=performance.now();const json=JSON.stringify(obj);const jsonMs=performance.now()-beHttpResponseTiming;');
 helper=helper.replace('res.writeHead(status,{',`const zipStart=performance.now(),encoded=beHttpGzipResponse?beHttpGzipSync(Buffer.from(json),{level:1}):json,zipMs=performance.now()-zipStart;
    res.writeHead(status,{'server-timing':'be-json;dur='+jsonMs.toFixed(2)+', be-gzip;dur='+zipMs.toFixed(2),'x-be-json-bytes':Buffer.byteLength(json),'x-be-transfer-bytes':Buffer.byteLength(encoded),'access-control-expose-headers':'Server-Timing, X-BE-JSON-Bytes, X-BE-Transfer-Bytes',`);
 helper=helper.replace(finish,'res.end(encoded);');source=source.slice(0,begin)+helper+source.slice(end);
}
// Copy only referenced source modules, recursively, leaving the verified store intact.
const copied=new Set(['shard-store.mjs']);
function dependencies(text,base=api){
 for(const match of text.matchAll(/from\s*['"](\.\/[^'"]+)['"]/g)){
  const full=resolve(base,match[1]);
  const name=relative(api,full);
  if(name.startsWith('server/')||copied.has(name))continue;
  if(relative(api,full).startsWith('..'))throw Error('Dependency outside API directory');
  copied.add(name);const content=readFileSync(full,'utf8');productionSourceHashes[name]=hash(content);
  const target=resolve(stage,name);mkdirSync(dirname(target),{recursive:true,mode:0o700});
  writeFileSync(target,content,{mode:0o600});dependencies(content,dirname(full));
 }
}
dependencies(source);
const target=resolve(stage,'auth.mjs');writeFileSync(target,source,{mode:0o600});
const result=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr);
const check=spawnSync(process.execPath,['--experimental-sqlite',resolve(repo,'server/verify-staged-auth.mjs'),target],{encoding:'utf8'});
if(check.stdout)process.stdout.write(check.stdout);
if(check.status!==0)throw Error(check.stderr||'Staged auth checks failed');
writeFileSync(resolve(stage,'deployment-inputs.json'),JSON.stringify({productionSourceHashes}),{mode:0o600});
console.log(JSON.stringify({success:true,stagedAuth:target,engineEnabledByDefault:false,productionChanged:false,productionDatabaseOpened:false,apiRestarted:false}));
