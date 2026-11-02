const assert=require('node:assert/strict'),vm=require('node:vm');const context=require('./helpers/game-context.cjs')();const run=(s,timeout=10000)=>vm.runInContext(s,context,{timeout});
run("function originalRookieAwardEligible(p,year=state.year){if(p.foreignPlayer||p.overseasPro||p.foreignProExperience||p.profile?.overseasPro)return false;const joined=Number(p.joinYear||p.draftYear||p.profile?.joinYear);if(!Number.isFinite(joined)||joined<1900||joined>year||year-joined>5)return false;const career=(state.careerRecords?.[p.id]||[]).filter(x=>Number(x.year)<year);const snapshots=Object.entries(state.history?.seasons||{}).filter(([y])=>Number(y)<year).map(([y,h])=>h.players?.find(x=>String(x.id)===String(p.id))?{...h.players.find(x=>String(x.id)===String(p.id)),year:Number(y)}:null).filter(Boolean);const seasons=new Map();for(const x of snapshots)seasons.set(Number(x.year),x);for(const x of career)seasons.set(Number(x.year),x);let innings=0,pa=0;for(const x of seasons.values()){innings+=Number(x.inningsPitched)||0;pa+=Number(x.plateAppearances)||((Number(x.atBats)||0)+(Number(x.walks)||0)+(Number(x.hitByPitch)||0)+(Number(x.sacrificeFlies)||0)+(Number(x.sacrificeBunts)||0))}return p.position==='P'?innings<=30:pa<=60}");
run(`state={year:2046,players:[],history:{seasons:{}},careerRecords:{}};
for(let id=0;id<100;id++)state.players.push({id,position:id%2?'P':'C',joinYear:2045,games:30,atBats:80,hits:id,foreignPlayer:id%13===0});
for(let year=2040;year<=2047;year++)state.history.seasons[year]={players:state.players.filter(p=>p.id%3!==0).map(p=>({id:String(p.id),year:1900,inningsPitched:p.id%5,atBats:p.id%9,walks:p.id%2}))};
// First matching snapshot wins, numeric years use the season key, career records
// override snapshots, and the last career row for a year wins.
state.history.seasons[2044].players.push({id:'1',inningsPitched:999});
state.careerRecords[1]=[{year:2044,inningsPitched:999},{year:2044,inningsPitched:0},{year:2046,inningsPitched:999}];
state.careerRecords[3]=[{year:2043,plateAppearances:60}];state.careerRecords[5]=[{year:2042,inningsPitched:30}];
state.players.push({id:101,position:'P',draftYear:2046},{id:102,position:'C',profile:{joinYear:2044}},{id:103,position:'C',joinYear:2040},{id:104,position:'C',joinYear:2047},{id:105,position:'C',joinYear:'bad'});
const index=rookieSeasonHistoryIndex();for(const p of state.players){const expected=originalRookieAwardEligible(p);if(rookieAwardEligible(p)!==expected||rookieAwardEligible(p,state.year,index)!==expected)throw Error('Rookie eligibility changed for '+p.id)}
const category=['rookie','rookie',p=>p.hits||0],expected=state.players.filter(p=>originalRookieAwardEligible(p)).filter(p=>p.games>0||p.atBats>0||p.inningsPitched>0).sort((a,b)=>category[2](b)-category[2](a)||a.id-b.id).slice(0,5).map(p=>p.id);if(JSON.stringify(awardCandidates(category,state.players).map(p=>p.id))!==JSON.stringify(expected))throw Error('Rookie winners changed');`);
(async()=>{
const {trackArchiveWrites}=await import('../server/archive-write-tracker.mjs');
run(`let historyReads=0;state={year:2046,players:Array.from({length:3400},(_,id)=>({id,position:id%2?'P':'C',joinYear:2045,games:144,atBats:500,hits:id})),history:{seasons:{}},careerRecords:{}};
for(let year=2027;year<2046;year++)state.history.seasons[year]={players:Array.from({length:3400},(_,id)=>({get id(){historyReads++;return id},atBats:0,inningsPitched:0}))};`);
const tracking=trackArchiveWrites(run('state'));context.trackedState=tracking.state;context.readArchive=tracking.raw;
run(`state=trackedState;const candidates=awardCandidates(['rookie','rookie',p=>p.hits],state.players);if(candidates[0].id!==3399)throw Error('Mature rookie winner changed');if(historyReads!==19*3400)throw Error('Repeated historical scans: '+historyReads);`);
assert.equal(run('historyReads'),64600);
run(`historyReads=0;window.beEngineReadArchive=readArchive;const directCandidates=awardCandidates(['rookie','rookie',p=>p.hits],state.players);if(directCandidates[0].id!==3399||historyReads!==64600)throw Error('Read-only archive aggregation changed');`);
assert.equal(tracking.isDirty(run('state.history'),['history']),false);
console.log('Rookie awards: legacy eligibility/winner parity and 19-season/3400-player tracked one-pass history PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
