const assert=require('node:assert/strict'),vm=require('node:vm');
const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);const initialForeign=state.players.filter(p=>p.foreignPlayer);`);
assert.equal(run('new Set(initialForeign.map(p=>foreignNameKey(p.name))).size'),30);
for(const country of ['JP','TW','AU',null]){
 c.nameCountry=country;
 run(`const testUsed=foreignNameRegistry();const testNames=[];for(let i=0;i<400;i++)testNames.push(uniqueForeignName(()=>0,nameCountry,testUsed));globalThis.nameTestResult=testNames;` .replace('const testUsed','var testUsed').replace('const testNames','var testNames'));
 assert.equal(new Set(run('nameTestResult')).size,400,'constant RNG still yields unique '+country+' names');
}
run(`const exhaustedNames=new Set();for(const first of FOREIGN_COUNTRY_NAMES.TW[0])for(const last of FOREIGN_COUNTRY_NAMES.TW[1])exhaustedNames.add(foreignNameKey(first+' '+last));const fallbackName=uniqueForeignName(()=>0,'TW',exhaustedNames);`);
assert.ok(run('fallbackName.split(" ").length')>=3,'exhaustion does not recycle a historical name');
run(`state.retiredPlayers=[{name:'Alex Retired'}];state.history.seasons={2038:{players:[{name:'Alex Martinez'}]}};state.foreignRecruitment={'2039:0':{candidates:[{name:'Alex Rodriguez'}]}};`);
assert.equal(run("foreignNameRegistry().has('alex martinez')&&foreignNameRegistry().has('alex rodriguez')&&foreignNameRegistry().has('alex retired')"),true);
assert.equal(run("foreignNameRegistry(false).has('alex rodriguez')"),false,'unsigned candidate is not its own historical collision');
// Real Asian-quota recruitment across 30 seasons must not reuse old identities.
run(`state=world(0);awardsFinished=()=>true;
for(let year=2027;year<2057;year++){
 state.year=year;state.seasonStartDate=year+'-01-01';state.day=Math.round((new Date(year+'-12-06T12:00:00')-new Date(year+'-01-01T12:00:00'))/86400000)+1;state.postseasons={[year]:{finished:true}};for(const t of state.teams)t.budget=100000000000;asianQuotaRecruitmentDay();
}
`);
assert.equal(run('state.players.filter(p=>p.asianQuota).length'),300);
assert.equal(run('new Set(state.players.filter(p=>p.foreignPlayer).map(p=>foreignNameKey(p.name))).size'),330,'active, released and old Asian players stay distinct');
// Already saved scouting pools may contain duplicate names: validate at signing.
run(`state=world(0);state.teams=state.teams.slice(0,1);state.year=2039;state.seasonStartDate='2039-01-01';state.day=339;state.postseasons={2039:{finished:true}};state.teams[0].budget=100000000000;
const reservedForeignName=state.players.find(p=>p.foreignPlayer).name;state.foreignRecruitment={'2039:0':{phase:'scouted',candidates:['P','P','1B'].map(position=>({name:reservedForeignName,position,age:27,potential:75,asking:500000000,scoutEstimate:60}))}};
rng=()=>()=>.5;foreignRecruitmentDay();`);
assert.equal(run("new Set(foreignRoster(0).filter(p=>!p.asianQuota).map(p=>p.name)).size"),3);
assert.equal(run("foreignRoster(0).some(p=>p.name===reservedForeignName)"),false,'new signees cannot reuse an old player name');
// Production cross-club re-signing, followed by real box-score aggregation.
run(`state=world(0);state.year=2039;state.seasonStartDate='2039-01-01';state.day=152;state.teams=state.teams.slice(0,2);for(const t of state.teams)t.budget=100000000000;
state.players=[{id:8001,name:'Carlos Historical',teamId:1,foreignPlayer:true,position:'P',level:'방출',age:29,joinYear:2037,salary:500000000,games:4,inningsPitched:20,earnedRuns:4,profile:{skills:{stuff:70,control:70,stamina:70}}},...Array.from({length:3},(_,i)=>({id:8010+i,name:'Current '+i,teamId:0,foreignPlayer:true,position:i===2?'1B':'P',level:'1군',age:27,salary:500000000,joinYear:2039,inningsPitched:40,earnedRuns:i===0?40:8,profile:{skills:{stuff:i===0?20:80,control:i===0?20:80,stamina:i===0?20:80,contact:80,power:80,fielding:80}}}))];
state.careerRecords={8001:[{year:2037,teamId:1,games:15,inningsPitched:90,earnedRuns:30},{year:2038,teamId:1,games:20,inningsPitched:120,earnedRuns:40}]};
state.gameResults=[{year:2039,day:140,home:1,away:0,homePitchers:[{id:8001,name:'Carlos Historical',innings:6,outs:18,earnedRuns:2}],awayPitchers:[{id:8010,name:'Current 0',innings:40,outs:120,earnedRuns:40}]}];
const originalForeignPlayer=state.players[0],originalForeignProfile=originalForeignPlayer.profile,foreignCareerBefore=JSON.stringify(state.careerRecords[8001]);
rng=()=>()=>0;foreignMidseasonDay();`);
assert.equal(run('originalForeignPlayer.teamId'),0,'released foreigner can move to another club');
assert.equal(run('state.players.find(p=>p.id===8001)===originalForeignPlayer'),true,'same player object and ID');
assert.equal(run('originalForeignPlayer.profile===originalForeignProfile'),true);
assert.equal(run('JSON.stringify(state.careerRecords[8001])'),run('foreignCareerBefore'));
assert.equal(run('originalForeignPlayer.teamHistory.at(-1).from'),1);
assert.equal(run('originalForeignPlayer.teamHistory.at(-1).to'),0);
run(`state.gameResults.push({year:2039,day:152,away:0,home:1,awayPitchers:[{id:8001,name:'Carlos Historical',innings:5,outs:15,earnedRuns:1}],homePitchers:[]});`);
assert.equal(run('currentSeasonBoxStats(originalForeignPlayer).inningsPitched'),11,'same-season innings from both clubs add up');
assert.equal(run('currentSeasonBoxStats(originalForeignPlayer).earnedRuns'),3);
assert.deepEqual(Array.from(run('careerSeasonRows(originalForeignPlayer).map(r=>r.inningsPitched)')),[11,120,90]);
const career=run('careerTable(originalForeignPlayer)');
assert.ok(career.includes('로열스')&&career.includes('마리너스'),'both clubs appear in career display');
assert.equal(run('state.players.filter(p=>p.id===8001).length'),1,'re-signing never creates a duplicate identity');
console.log('PASS unique foreign/Asian names, exhausted pools, reservations and real cross-club career preservation');
