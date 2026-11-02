// Full prepared HTTP path against a disposable backup. The original DB is
// read-only and cannot receive a game result or request receipt from this test.
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,rmSync,chmodSync,statSync,statfsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createPrecomputeController} from './precompute-controller.mjs';
import {createAdvanceDayRoute} from './advance-day-route.mjs';
const args=process.argv.slice(2),at=args.indexOf('--database');if(at<0||!args[at+1])throw Error('Pass --database /absolute/path/saves.sqlite');
const database=resolve(args[at+1]),disk=statfsSync(dirname(database));let estimate=statSync(database).size;try{estimate+=statSync(database+'-wal').size}catch{}if(disk.bavail*disk.bsize<estimate+1024**3)throw Error('Not enough free disk space for a safe temporary backup');
const original=new DatabaseSync(database,{readOnly:true}),directory=mkdtempSync(join(dirname(database),'prepared-benchmark-'));chmodSync(directory,0o700);
let db,controller,server;
try{
 const meta=original.prepare("SELECT * FROM be_save_shard_meta WHERE slot='main' ORDER BY compressed_bytes DESC LIMIT 1").get();if(!meta)throw Error('No save');
 const copy=join(directory,'saves.sqlite');await backup(original,copy);chmodSync(copy,0o600);db=new DatabaseSync(copy);
 controller=createPrecomputeController({database:resolve(args[at+1]),cachePath:join(directory,'cache','queue.sqlite'),horizon:3,metadata:(user,slot)=>original.prepare('SELECT * FROM be_save_shard_meta WHERE user_id=? AND slot=?').get(user,slot)});
 const begin=performance.now(),ready=await controller.wait(meta.user_id,'main',meta.rev,meta.digest,{timeoutMs:180000});if(!ready)throw Error('Background preparation did not finish');
 console.log(JSON.stringify({stage:'background-day-ready',productionWrites:false,prepareMs:Math.round(performance.now()-begin),backgroundEngineMs:ready.result.timing.engineMs,preparedBytes:controller.status(meta.user_id,'main',meta.rev).bytes,processedDate:ready.result.from?.date}));
 const frozenController={get:(...values)=>controller.get(...values),getFast:(...values)=>controller.getFast(...values),wait:(...values)=>controller.wait(...values),ensure(){},committed(){},invalidate:(...values)=>controller.invalidate(...values),status:(...values)=>controller.status(...values)};
 const token=randomBytes(32).toString('hex');
 const response=(res,status,obj)=>{const body=JSON.stringify(obj);res.writeHead(status,{'content-type':'application/json','content-encoding':'gzip'});res.end(gzipSync(body,{level:1}))};
 const route=createAdvanceDayRoute({db,shards:{put(){throw Error('Full save put not expected')},patch(){throw Error('Legacy patch not expected')}},restoreSave(){throw Error('Foreground restore not expected')},encodeSave(){throw Error('Foreground packing not expected')},body:async req=>{let body='';for await(const b of req)body+=b;return JSON.parse(body)},response,enabled:true,precomputeController:frozenController});
 server=createServer(async(req,res)=>{if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end();return}if(!await route(req,res,null,{user_id:meta.user_id})){res.writeHead(404);res.end()}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const requestId=randomUUID(),url='http://127.0.0.1:'+server.address().port+'/v2/engine/advance?wireFormat=server-json-v1&wirePatch=1';
 const started=performance.now(),reply=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','if-match':String(meta.rev)},body:JSON.stringify({requestId})}),result=await reply.json(),elapsed=performance.now()-started;
 if(reply.status!==200||result.day?.timing?.precomputed!==true||result.rev!==meta.rev+1||result.digest!==ready.nextDigest)throw Error('Prepared HTTP commit did not match its source digest');
 const after=original.prepare("SELECT rev,digest FROM be_save_shard_meta WHERE user_id=? AND slot='main'").get(meta.user_id);if(after.rev!==meta.rev||after.digest!==meta.digest)throw Error('Production save changed concurrently');
 console.log(JSON.stringify({stage:'prepared-advance-benchmark',productionWrites:false,temporaryRevisionAdvanced:true,productionDayUnchanged:true,httpResponseMs:Math.round(elapsed),responseJsonBytes:Buffer.byteLength(JSON.stringify(result)),compactFields:Object.keys(result.wireDelta?.patches||{}).length,timing:result.day.timing,peakRssMiB:Math.round(process.resourceUsage().maxRSS/1024)}));
 console.log(JSON.stringify({success:true,productionWrites:false,productionDayUnchanged:true}));
}finally{
 if(server)await new Promise(ok=>server.close(ok));if(controller)await controller.close();if(db)db.close();original.close();rmSync(directory,{recursive:true,force:true});
}
