const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function context(){const c=vm.createContext({window:{},localStorage:{getItem:()=>null,removeItem:()=>{}},performance,structuredClone,CompressionStream,DecompressionStream,TextEncoder,TextDecoder,Blob,Response,Uint8Array,btoa,atob,setTimeout,console});vm.runInContext(fs.readFileSync('cloud-only.js','utf8').replace(/^export /gm,''),c);return c}
const plain=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const c=context(),archive={};for(let y=2027;y<=2035;y++)archive[y]=Array.from({length:400},(_,i)=>({id:y*10000+i,year:y,day:i%365+1,kind:'1군 등록',title:'선수단 변동 기록 '+i,body:'기존 계약과 경기 기록을 유지하면서 선수단에 등록했습니다. '.repeat(3),teams:[i%10],players:[i]}));
 const state={year:2035,clubTransactionArchive:archive,players:[{id:1,name:'선수',profile:{skills:{stuff:60}}}],highSchoolBaseball:{2034:{prospects:[{id:5,name:'과거 선수'}]},2035:{prospects:[{id:6,name:'현재 선수'}]}},amateurCareerArchive:{one:[{year:2034,games:4}]},trainingReports:{one:{year:2035}}};
 c.data=state;const before=structuredClone(state);
 const wire=await vm.runInContext('(async()=>packAuxiliaryFields(await packLeagueShards(await packAmateurBuckets(await packCloudShards(data)))))()',c);
 assert.deepEqual(state,before,'packing must not mutate game state');assert.equal(wire.clubTransactionArchive,undefined);assert.equal(wire.beShardManifest.fields.clubTransactionArchive.kind,'yearArrays');
 c.wire=structuredClone(wire);vm.runInContext('shardGzipCache.clear();auxiliaryLastCompressed.clear()',c);
 const restored=await vm.runInContext('(async()=>unpackCloudShards(await unpackLeagueShards(await unpackAmateurBuckets(await unpackAuxiliaryFields(wire)))))()',c);
 assert.deepEqual(plain(restored),state,'all years, current players and other leagues restore exactly');
 // A fresh session restores original compressed bytes to exact-content caches.
 c.restored=restored;const taskCount=vm.runInContext('shardGzipMetrics.tasks',c);
 const warm=await vm.runInContext('(async()=>packAuxiliaryFields(await packLeagueShards(await packAmateurBuckets(await packCloudShards(restored)))))()',c);
 assert.equal(vm.runInContext('shardGzipMetrics.tasks',c),taskCount,'unchanged loaded shards must not be recompressed');assert.deepEqual(plain(warm),plain(wire));
 c.previous=wire;state.clubTransactionArchive[2035].push({id:999999,year:2035,day:200,kind:'FA 계약',body:'새 계약 기록',teams:[0]});
 const next=await vm.runInContext('(async()=>packAuxiliaryFields(await packLeagueShards(await packAmateurBuckets(await packCloudShards(data)))))()',c);c.next=next;
 const delta=vm.runInContext('makeCloudDelta(previous,next)',c);assert.equal(Object.keys(delta.set).filter(k=>k.startsWith('beShard_clubTransactionArchive_')).length,1,'daily append sends only the affected chunk');assert.ok(Object.keys(delta.set).length<=2,'only archive manifest and appended chunk change');
 const originalBytes=Buffer.byteLength(JSON.stringify(state.clubTransactionArchive)),dailyBytes=Buffer.byteLength(JSON.stringify(delta));assert.ok(dailyBytes<originalBytes*.02,'daily archive PATCH is far smaller than full raw archive');
 c.nextCopy=structuredClone(next);assert.deepEqual(plain(await vm.runInContext('unpackCloudShards(nextCopy)',c)).clubTransactionArchive,state.clubTransactionArchive);
 // Edit a historical entry in place: exact JSON comparison must notice it.
 state.clubTransactionArchive[2027][4].body='정정된 과거 기록';c.previous=next;const corrected=await vm.runInContext('packCloudShards(data)',c);c.corrected=corrected;
 const correction=vm.runInContext('makeCloudDelta(previous,corrected)',c);assert.ok(Object.keys(correction.set).includes('beShard_clubTransactionArchive_2027_0'));
 const broken=structuredClone(next);delete broken.beShard_clubTransactionArchive_2027_0;c.broken=broken;await assert.rejects(()=>vm.runInContext('unpackCloudShards(broken)',c),/누락/);
 const invalid=structuredClone(next);invalid.beShardManifest.fields.clubTransactionArchive.seasons[2027].length++;c.invalid=invalid;await assert.rejects(()=>vm.runInContext('unpackCloudShards(invalid)',c),/길이/);
 // Old raw-object and old array archive formats remain readable; unusual legacy
 // object fields are retained via whole-field gzip rather than being discarded.
 c.legacy={clubTransactionArchive:{2027:[],2028:[{id:1}]}};assert.deepEqual(plain(await vm.runInContext('unpackCloudShards(legacy)',c)),c.legacy);
 c.arrayLegacy={clubTransactionArchive:[{id:1},{id:2}]};c.arrayWire=await vm.runInContext('packCloudShards(arrayLegacy)',c);assert.deepEqual(plain(await vm.runInContext('unpackCloudShards(arrayWire)',c)),c.arrayLegacy);
 c.odd={clubTransactionArchive:{notes:'보존'.repeat(15000)}};c.oddWire=await vm.runInContext('(async()=>packAuxiliaryFields(await packCloudShards(odd)))()',c);assert.deepEqual(plain(await vm.runInContext('unpackAuxiliaryFields(oddWire)',c)),c.odd);
 console.log('PASS archive years/append/edit, exact restore, cold-load cache reuse, corruption rejection and legacy fallback');console.log(JSON.stringify({originalBytes,dailyBytes,archiveRows:3601,reductionPercent:100*(1-dailyBytes/originalBytes)}));
})().catch(e=>{console.error(e);process.exitCode=1});
