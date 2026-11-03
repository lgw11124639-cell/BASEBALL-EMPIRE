const assert=require('node:assert/strict'),vm=require('node:vm');const context=require('./helpers/game-context.cjs')();const run=s=>vm.runInContext(s,context,{timeout:15000});
// Compare allocation algorithms under the same current fatigue policy.
run("function legacyChooseBattingNine(players,opponentHand,formScore,style='분석형',philosophy='밸런스'){\n const slots=['C','SS','2B','3B','1B','CF','LF','RF'];\n const pool=players.filter((p,i,a)=>p&&p.position!=='P'&&a.findIndex(x=>x&&String(x.id)===String(p.id))===i);\n const base=new Map(pool.map(p=>{const fatigue=Number(playerBaseball(p).fatigue)||0;return [p.id,(formScore?formScore(p):bePlayerEvaluation(p))-fatigue*.35-Math.max(0,fatigue-25)*.75-Math.max(0,fatigue-50)*1.5]}));\n const positional=new Map(pool.map(p=>[p.id,slots.map(slot=>({fit:defensiveFit(p,slot),score:battingDefensiveSelectionScore(p,slot,base.get(p.id))}))]));\n function assign(emergency){\n  const scores=new Float64Array(256);scores.fill(-Infinity);scores[0]=0;const paths=Array(256).fill(null);\n  for(const p of pool){const positions=positional.get(p.id);let available=emergency?255:0;if(!emergency)for(let i=0;i<8;i++)if(positions[i].fit>=5)available|=1<<i;\n   for(let mask=255;mask>=0;mask--){const baseScore=scores[mask];if(!Number.isFinite(baseScore))continue;const previous=paths[mask];let candidates=available&~mask;\n    while(candidates){const bit=candidates&-candidates,i=31-Math.clz32(bit);candidates^=bit;\n     const next=mask|bit,score=baseScore+positions[i].score;\n     if(score>scores[next]){scores[next]=score;paths[next]={p,slot:slots[i],previous};}\n   }}}\n  if(!Number.isFinite(scores[255]))return null;const chosen=[],assigned=new Map(),emergencies=new Map();let path=paths[255];\n  while(path){chosen.push(path.p);assigned.set(path.p.id,path.slot);if(defensiveFit(path.p,path.slot)<5)emergencies.set(path.p.id,path.slot);path=path.previous;}\n  return {chosen,assigned,emergencies};\n }\n const result=assign(false)||assign(true);\n if(!result){const partial=battingOrder(pool.slice(0,9),style,philosophy);partial.assignedPositions=new Map(partial.map(p=>[p.id,playerFieldingPositions(p).primary]));partial.emergencyPositions=new Map();return partial;}\n const dh=pool.filter(p=>!result.assigned.has(p.id)).sort((a,b)=>base.get(b.id)-base.get(a.id)||a.id-b.id)[0];if(dh){result.chosen.push(dh);result.assigned.set(dh.id,'DH')}\n const ordered=battingOrder(result.chosen,style,philosophy);ordered.assignedPositions=result.assigned;ordered.emergencyPositions=result.emergencies;return ordered;\n}");
run(`state=world(0);const seeds=rng(4096),positions=['C','SS','2B','3B','1B','CF','LF','RF','IF','OF','DH'];
const selectionView=lineup=>JSON.stringify({ids:lineup.map(p=>p.id),positions:[...lineup.assignedPositions],emergencies:[...lineup.emergencyPositions]});
for(let fixture=0;fixture<100;fixture++){
 const count=fixture%28,players=Array.from({length:count},(_,i)=>({id:i+1,name:'배치'+i,position:fixture%4===0?'C':positions[i%positions.length],teamId:0,age:25,atBats:Math.floor(seeds()*400),hits:Math.floor(seeds()*90),homeRuns:Math.floor(seeds()*20),games:60}));
 // Include insufficient rosters, missing positions, strict ties, duplicates,
 // emergency assignments and all manager philosophies.
 if(fixture%7===0&&players.length)players.push({...players[0]});
 for(const p of players){playerFieldingPositions(p);playerBaseball(p).fatigue=Math.floor(seeds()*80)}
 const style=['분석형','공격형','수비형'][fixture%3],philosophy=['밸런스','빅볼','스몰볼','세이버메트릭스'][fixture%4],score=p=>fixture%3===0?50:p.id*1.17+(p.hits||0)*.31;
 const expected=selectionView(legacyChooseBattingNine(players,'우투',score,style,philosophy)),actual=selectionView(chooseBattingNine(players,'우투',score,style,philosophy));if(actual!==expected)throw Error('Assignment or tie order changed at fixture '+fixture+' '+expected+' / '+actual);
}
`);
console.log('Batting assignment: lineup/order/positions/emergencies match legacy across 100 rosters PASS');
run(`if(beInningLookupCache!==null)throw Error('Selection cache escaped');try{chooseBattingNine(state.players.filter(p=>p.position!=='P').slice(0,10),'우투',()=>{throw Error('controlled score failure')})}catch(error){if(error.message!=='controlled score failure')throw error}if(beInningLookupCache!==null)throw Error('Failed selection leaked its cache');`);
(async()=>{
 const fs=require('node:fs'),{runOriginalEngineDay}=await import('../server/original-engine-day.mjs');
 const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('function chooseBattingNine('),end=source.indexOf('\nfunction selectNationalHitters',start);
 const legacy=run('legacyChooseBattingNine.toString()').replace('legacyChooseBattingNine','chooseBattingNine'),reference=source.slice(0,start)+legacy+source.slice(end);
 let state=JSON.parse(run('JSON.stringify(world(0))'));state.day=110;const random=Math.random;
 const reset=()=>{let seed=7327;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}};
 try{for(let day=0;day<2;day++){
  reset();const before=runOriginalEngineDay(structuredClone(state),{appSource:reference},{takeOwnership:true});
  reset();const after=runOriginalEngineDay(structuredClone(state),{appSource:source},{takeOwnership:true});
  assert.deepEqual(JSON.parse(JSON.stringify(after.state)),JSON.parse(JSON.stringify(before.state)));state=after.state;
 }}finally{Math.random=random}
 console.log('Batting assignment: complete pro/minor/amateur day state matches legacy for two days PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
