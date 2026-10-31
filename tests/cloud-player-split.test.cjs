const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const current=fs.readFileSync('cloud-only.js','utf8');
function context(source=current){const c=vm.createContext({window:{},localStorage:{getItem:()=>null,removeItem:()=>{}},performance,structuredClone,CompressionStream,DecompressionStream,TextEncoder,TextDecoder,Blob,Response,Uint8Array,btoa,atob,setTimeout,console});vm.runInContext(source.replace(/^export /gm,''),c);return c}
const plain=x=>JSON.parse(JSON.stringify(x));
async function pack(c,data){c.data=data;return vm.runInContext('(async()=>packAuxiliaryFields(await packLeagueShards(await packAmateurBuckets(await packCloudShards(data)))))()',c)}
async function unpack(c,wire){c.wire=structuredClone(wire);return vm.runInContext('(async()=>unpackCloudShards(await unpackLeagueShards(await unpackAmateurBuckets(await unpackAuxiliaryFields(wire)))))()',c)}
function delta(c,before,after){c.before=before;c.after=after;return vm.runInContext('makeCloudDelta(before,after)',c)}
const player=i=>({id:i,name:'선수'+i,age:22,teamId:i%10,games:12,atBats:40,hits:10,unknown:{preserve:'추가 필드 😀'},teamHistory:Array.from({length:80},(_,j)=>({year:2027+j%9,teamId:(i+j)%10,reason:'선수 '+i+'의 과거 소속과 계약 기록 '+j})),profile:{skills:{contact:50+i%20,stuff:60},injury:{days:2,status:'회복'},baseball:{fatigue:15,lastAppearance:150,arsenal:{pitches:[{name:'직구',grade:60}],control:60}},growth:Array.from({length:40},(_,j)=>({year:2027+j%9,day:j*3,kind:'성장 관찰 '+i+'-'+j}))},minorStats:{seasonYear:2035,games:12,atBats:30,hits:7}});
(async()=>{
 const c=context(),state={year:2035,day:160,players:Array.from({length:320},(_,i)=>player(i)),amateurCareerArchive:{},highSchoolBaseball:{2035:{prospects:Array.from({length:96},(_,i)=>player(1000+i)),gameLog:[]}},draftResults:{2035:Array.from({length:110},(_,i)=>({playerId:i,round:i%11+1,name:'드래프트'+i,notes:'관찰 기록'.repeat(80)}))}};
 for(let i=0;i<1200;i++)state.amateurCareerArchive['career-'+i]=Array.from({length:6},(_,n)=>({year:2030+n,league:'highSchool',games:20+n,atBats:60+n,hits:15+n,team:'학교'+i}));
 state.amateurCareerArchive.empty=[];
 state.amateurCareerArchive.unsorted=[{year:2035,games:10},{year:2030,games:2},{year:2035,games:3}];
 const before=structuredClone(state),first=await pack(c,state);assert.deepEqual(state,before);
 assert.equal(first.beShardManifest.fields.players.kind,'splitRows');assert.equal(first.beAmateurBucketManifest.version,2);
 assert.deepEqual(plain(await unpack(c,first)),state,'unknown fields, full histories and original career row order restore exactly');
 const fresh=context(),loaded=await unpack(fresh,first),tasks=vm.runInContext('shardGzipMetrics.tasks',fresh);const warm=await pack(fresh,loaded);
 assert.equal(vm.runInContext('shardGzipMetrics.tasks',fresh),tasks,'cold-load cache is exact despite joined property ordering');assert.deepEqual(plain(warm),plain(first));
 for(const p of [...state.players,...state.highSchoolBaseball[2035].prospects]){p.games++;p.innings=(p.innings||0)+1;p.atBats+=4;p.hits++;p.profile.baseball.fatigue++;p.profile.injury.days--;p.minorStats.games++;}
 for(const rows of Object.values(state.amateurCareerArchive))for(const row of rows)if(row.year===2035)row.games++;
 state.draftResults[2035][0].notes+=' 새 관찰';
 const dailyState=structuredClone(state);const second=await pack(c,state),change=delta(c,first,second),keys=Object.keys(change.set);
 assert.ok(keys.some(k=>k.startsWith('beShard_players_live_')));assert.ok(!keys.some(k=>k.startsWith('beShard_players_base_')),'daily counters must not resend biographies');
 assert.ok(!keys.some(k=>k.startsWith('beLeagueRows_')&&k.includes('_base_')),'amateur stats must not resend profiles');
 assert.ok(!keys.some(k=>/^beAmateurYear_203[0-4]_/.test(k)),'past career seasons stay unchanged');assert.ok(keys.includes('bePackedAux_draftResults'),'draft archive uses lossless gzip');
 assert.deepEqual(plain(await unpack(c,second)),state);
 state.players[0].profile.skills.contact++;state.players[0].unknown.preserve='과거 정보 정정';const third=await pack(c,state);const changed=Object.keys(delta(c,second,third).set);
 assert.deepEqual(changed.filter(k=>k.startsWith('beShard_players_')),['beShard_players_base_0'],'in-place profile and unknown field changes are not skipped');
 const missing=structuredClone(third);delete missing.beShard_players_live_0;await assert.rejects(()=>unpack(c,missing),/누락/);
 const missingCareer=structuredClone(second);const careerKey=Object.keys(missingCareer).find(k=>k.startsWith('beAmateurYear_'));delete missingCareer[careerKey];await assert.rejects(()=>unpack(c,missingCareer),/누락/);
 const odd={amateurCareerArchive:{one:{year:2035},two:[{year:'2035',games:3}]},players:[null,{id:1,profile:null},7,{id:2,profile:{baseball:[],custom:'keep'}}]};assert.deepEqual(plain(await unpack(c,await pack(c,odd))),odd,'unusual legacy data is preserved through fallback');
 c.fetch=async()=>new Response(JSON.stringify({revision:2}),{status:200,headers:{'Content-Type':'application/json'}});
 c.firstPatch={protocol:'be-top-level-delta-v1',set:{one:'x'.repeat(5000)},unset:[]};c.secondPatch={protocol:'be-top-level-delta-v1',set:{two:'y'.repeat(9000)},unset:['one']};
 await vm.runInContext("call('/v2/saves/main','PATCH',firstPatch,1)",c);await vm.runInContext("call('/v2/saves/main','PATCH',secondPatch,2)",c);
 assert.equal(c.window.beCloudPayloadAudit.find(x=>x.key==='set').bytes,JSON.stringify(c.secondPatch.set).length,'PATCH size audit updates for the current request');
 const dailyBytes=Buffer.byteLength(JSON.stringify(change));console.log('PASS player/live and league split, yearly career ordering, cache reuse, corrections, missing data and legacy fallback');console.log(JSON.stringify({dailyBytes,changedFields:keys.length}));
 // Optional comparison against a pre-change transport, using the exact same state.
 if(process.env.BASEBALL_PREVIOUS_CLOUD){const old=context(fs.readFileSync(process.env.BASEBALL_PREVIOUS_CLOUD,'utf8'));const oldFirst=await pack(old,before);assert.deepEqual(plain(await unpack(c,oldFirst)),before,'new decoder loads previous release formats');const oldSecond=await pack(old,dailyState);const oldBytes=Buffer.byteLength(JSON.stringify(delta(old,oldFirst,oldSecond)));console.log(JSON.stringify({oldDailyBytes:oldBytes,newDailyBytes:dailyBytes,reductionPercent:100*(1-dailyBytes/oldBytes)}));}
 const gameContext=require('./helpers/game-context.cjs');const originalEngine=gameContext();
 vm.runInContext("state=world(0);state.created='2027-01-01T00:00:00.000Z';state.day=100;state.gameResults=[];simulateLeagueDay()",originalEngine);
 const engineState=plain(vm.runInContext('state',originalEngine));const restoredEngineState=await unpack(c,await pack(c,engineState));assert.deepEqual(plain(restoredEngineState),engineState);
 const restoredEngine=gameContext();restoredEngine.loaded=restoredEngineState;vm.runInContext('state=loaded;simulateLeagueDay()',restoredEngine);vm.runInContext('simulateLeagueDay()',originalEngine);
 c.left=vm.runInContext('state',originalEngine);c.right=vm.runInContext('state',restoredEngine);assert.equal(vm.runInContext('canonicalCloudValue(left)===canonicalCloudValue(right)',c),true,'production day after round-trip has identical results, finances and development');
 console.log('PASS real production day before/after complete save round-trip');
})().catch(e=>{console.error(e);process.exitCode=1});
