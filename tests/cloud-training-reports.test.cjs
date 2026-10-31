const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function context(compression=true){
 const c=vm.createContext({window:{},localStorage:{getItem:()=>null,removeItem:()=>{}},performance,structuredClone,
  CompressionStream:compression?CompressionStream:undefined,DecompressionStream,TextEncoder,TextDecoder,Blob,Response,Uint8Array,btoa,atob,setTimeout,clearTimeout,console});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../cloud-only.js'),'utf8').replace(/^export /gm,''),c);return c;
}
const plain=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const c=context();
 const reports={};for(let i=0;i<3500;i++)reports['2027-'+(i%12+1)+'-'+Math.floor(i/120)+'-'+i]={year:2027,day:i%365+1,teamId:i%10,improved:i%3,declined:i%2};
 const data={schema:1,year:2035,day:8,trainingReports:reports,custom:{preserve:'기존 계약·기록 😀'},unchangedArchive:'x'.repeat(100000)};
 const original=structuredClone(data);c.data=data;
 const packed=await vm.runInContext('packAuxiliaryFields(data)',c);
 assert.deepEqual(data,original,'packing never changes live state');
 assert.equal(packed.trainingReports,undefined);assert.equal(typeof packed.bePackedAux_trainingReports,'string');
 c.packed=structuredClone(packed);
 assert.deepEqual(plain(await vm.runInContext('unpackAuxiliaryFields(packed)',c)),data,'lossless restore of all reports and unrelated fields');
 c.legacy=structuredClone(data);assert.deepEqual(plain(await vm.runInContext('unpackAuxiliaryFields(legacy)',c)),data,'old raw object saves remain readable');
 c.legacyPacked={...data,bePackedAuxiliaryGzip:{trainingReports:packed.bePackedAux_trainingReports}};delete c.legacyPacked.trainingReports;
 assert.deepEqual(plain(await vm.runInContext('unpackAuxiliaryFields(legacyPacked)',c)),data,'legacy gzip envelope remains readable');
 const first=await vm.runInContext('packAuxiliaryFields(data)',c);data.trainingReports[Object.keys(reports)[0]].improved=99;
 const second=await vm.runInContext('packAuxiliaryFields(data)',c);
 assert.notEqual(first.bePackedAux_trainingReports,second.bePackedAux_trainingReports,'same-identity mutations invalidate compression cache');
 c.before=first;c.after=second;const delta=vm.runInContext('makeCloudDelta(before,after)',c);
 assert.equal(Object.keys(delta.set).length,1);assert.equal(Object.keys(delta.set)[0],'bePackedAux_trainingReports');
 c.rawBaseline=structuredClone(data);const migration=vm.runInContext('makeCloudDelta(rawBaseline,after)',c);
 assert.ok(migration.unset.includes('trainingReports'),'migration removes raw field atomically with adding compressed field');
 c.small={...data,trainingReports:{one:{year:2035,day:8}}};
 const smallWire=await vm.runInContext('packAuxiliaryFields(small)',c);c.smallWire=smallWire;
 const downgrade=vm.runInContext('makeCloudDelta(after,smallWire)',c);
 assert.ok(downgrade.unset.includes('bePackedAux_trainingReports'),'shrinking archives remove old packed field rather than restoring stale data');
 assert.deepEqual(plain(downgrade.set.trainingReports),c.small.trainingReports);
 const noCompression=context(false);noCompression.data=data;assert.deepEqual(plain(await vm.runInContext('packAuxiliaryFields(data)',noCompression)),data,'unsupported compression falls back to raw data');
 c.broken={bePackedAux_trainingReports:'broken gzip'};
 await assert.rejects(()=>vm.runInContext('unpackAuxiliaryFields(broken)',c),'corrupt data cannot silently replace reports with an empty object');
 const beforeBytes=Buffer.byteLength(JSON.stringify(data.trainingReports)),afterBytes=Buffer.byteLength(JSON.stringify(second.bePackedAux_trainingReports));
 assert.ok(afterBytes<beforeBytes*.3,'representative report archive actually becomes smaller');
 console.log('Training report archive:',JSON.stringify({reports:Object.keys(reports).length,beforeBytes,afterBytes,reductionPercent:100*(1-afterBytes/beforeBytes)}));
 // Exercise real save packing/delta/revision logic against a controlled in-memory server.
 vm.runInContext(`token='test-session';verified=true;revision=1;`,c);
 c.snapshotData=structuredClone(data);
 const wire=await vm.runInContext('(async()=>packAuxiliaryFields(await packLeagueShards(await packAmateurBuckets(await packCloudShards(snapshotData)))))()',c);
 c.serverWire=structuredClone(wire);c.requests=[];
 vm.runInContext(`acknowledgedWireSave=structuredClone(serverWire);let serverRevision=1;let fail=true;let loseResponse=false;
 call=async(path,method='GET',body,rev)=>{
  if(method==='GET')return {revision:serverRevision,save:structuredClone(serverWire)};
  requests.push({method,rev});if(fail){const e=Error('temporary service failure');e.status=503;throw e;}
  if(rev!==serverRevision){const e=Error('conflict');e.status=409;throw e;}
  if(method==='PATCH'){for(const key of body.unset)delete serverWire[key];Object.assign(serverWire,body.set)}else serverWire=structuredClone(body);
  serverRevision++;if(loseResponse){loseResponse=false;throw Error('response lost after commit')}return {revision:serverRevision};
 };`,c);
 c.snapshotData.trainingReports['2035-1-8-0']={year:2035,day:8,teamId:0,improved:1,declined:0};
 await assert.rejects(()=>vm.runInContext('cloudSave(snapshotData)',c));
 assert.equal(vm.runInContext('revision',c),1);
 assert.deepEqual(plain(vm.runInContext('acknowledgedWireSave',c)),plain(wire),'failed upload never advances acknowledged baseline');
 vm.runInContext('fail=false',c);await vm.runInContext('cloudSave(snapshotData)',c);
 assert.equal(vm.runInContext('revision',c),2);
 assert.equal(c.requests[c.requests.length-1].method,'PATCH','unchanged archives are not retransmitted');
 c.restored=structuredClone(vm.runInContext('serverWire',c));
 const restored=await vm.runInContext('(async()=>unpackCloudShards(await unpackAuxiliaryFields(restored)))()',c);
 assert.deepEqual(plain(restored),c.snapshotData,'successful PATCH restores exact complete state');
 c.snapshotData.trainingReports['2035-1-9-0']={year:2035,day:9,teamId:0,improved:0,declined:1};
 vm.runInContext('loseResponse=true',c);await vm.runInContext('cloudSave(snapshotData)',c);
 assert.equal(vm.runInContext('revision',c),3);
 assert.equal(vm.runInContext('serverRevision',c),3,'lost response is reconciled without a second commit');
 assert.equal(c.window.beCloudSaveRecovery.status,'confirmed-committed');
 c.snapshotData.trainingReports['2035-1-10-0']={year:2035,day:10,teamId:0,improved:1,declined:0};
 vm.runInContext('incrementalSaveSupported=false;loseResponse=true',c);await vm.runInContext('cloudSave(snapshotData)',c);
 assert.equal(vm.runInContext('revision',c),4);assert.equal(vm.runInContext('serverRevision',c),4,'full PUT also reconciles a lost success response');
 assert.equal(c.requests[c.requests.length-1].method,'PUT');
 const confirmed=plain(vm.runInContext('acknowledgedWireSave',c));
 vm.runInContext('serverRevision=5',c);
 await assert.rejects(()=>vm.runInContext('cloudSave(snapshotData)',c),/conflict/);
 assert.equal(vm.runInContext('verified',c),false,'revision conflict blocks further progress');
 assert.deepEqual(plain(vm.runInContext('acknowledgedWireSave',c)),confirmed,'conflict never overwrites acknowledged state');
 assert.equal(vm.runInContext('serverRevision',c),5);
 console.log('Training reports: raw/gzip compatibility, mutation, corruption, PATCH failure/retry and lost-response recovery PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
