const assert=require('node:assert/strict'),vm=require('node:vm');
const c=require('./helpers/game-context.cjs')();
const result=vm.runInContext(`(()=>{
 state=world(0);const before=structuredClone(state.players);for(const p of state.players)ensureProfile(p);const saved=structuredClone(state.players);for(const p of state.players)ensureProfile(p);if(JSON.stringify(saved)!==JSON.stringify(state.players))throw Error('existing pro profile changed');
 const thresholds={};for(const pitcher of [true,false]){const values=state.players.filter(p=>p.level==='1군'&&(p.position==='P')===pitcher).map(bePlayerEvaluation).sort((a,b)=>a-b);thresholds[pitcher?'P':'H']=values[Math.floor(values.length/2)]}
 const population={};for(const age of [18,22]){const rows=[];for(let i=0;i<5000;i++){const p={id:900000+i,name:'신인'+i,age,position:i%2?'CF':'P',potential:55+i%40,...(age===18?{schoolId:i%32}:{collegeYears:4}),careerOrigin:age===18?'highSchool':'college'};const score=bePlayerEvaluation(p),first=JSON.stringify(p.profile);ensureProfile(p);if(first!==JSON.stringify(p.profile))throw Error('repeated readiness discount');rows.push({score,ready:score>=thresholds[p.position==='P'?'P':'H']})}population[age]={n:rows.length,mean:rows.reduce((n,x)=>n+x.score,0)/rows.length,ready:rows.filter(x=>x.ready).length}}
 // Already signed rookies retain their exact skills, arsenal, contracts and records.
 const existing={id:700000,teamId:0,level:'2군',draftYear:2027,joinYear:2027,age:19,position:'P',profile:{skills:{stuff:80,control:77,stamina:70},development:{talentTier:'ordinary'},baseball:{arsenal:{velocity:148,control:77,stamina:70,pitches:[{name:'직구',grade:80,command:77}]}}}};
 const savedExisting=JSON.stringify(existing);ensureProfile(existing);if(JSON.stringify(existing)!==savedExisting)throw Error('signed rookie was retroactively weakened');
 const veteran={id:700001,level:'1군',foreignPlayer:true,age:24,position:'P'};ensureProfile(veteran);if(veteran.profile.development.model)throw Error('foreign professional marked as amateur');
 const legacyAmateur={id:710000,name:'기존 고교 투수',schoolId:1,age:18,position:'P',potential:65,games:12,inningsPitched:30,profile:{skills:{stuff:66,control:66,stamina:66},development:{talentTier:'ordinary'},baseball:{arsenal:{velocity:140,control:66,stamina:66,pitches:[{name:'직구',grade:72,command:63}]}}}};
 ensureProfile(legacyAmateur);const la=legacyAmateur.profile;if(la.baseball.arsenal.control!==la.skills.control||la.baseball.arsenal.pitches[0].grade!==72+la.skills.stuff-66||la.baseball.arsenal.pitches[0].command!==63+la.skills.control-66||legacyAmateur.inningsPitched!==30)throw Error('amateur arsenal/record migration mismatch');
 const amateurs=Array.from({length:600},(_,i)=>({id:880000+i,schoolId:i%32,name:'지명후보'+i,age:18,position:i%2?'CF':'P',potential:55+i%40,careerOrigin:'highSchool',draftEligible:true,games:24,atBats:80,hits:15+i%18,homeRuns:i%4,inningsPitched:30,earnedRuns:5+i%15,pitchingStrikeouts:15+i%30,scoutVariance:0}));
 state.day=258;state.seasonStartDate='2027-01-01';state.highSchoolBaseball={2027:{prospects:amateurs,schools:[]}};officeDraft();
 const rookies=state.players.filter(p=>p.draftYear===2028);if(rookies.length!==110)throw Error('expected full 10-club 11-round draft, got '+rookies.length);
 for(const p of rookies){const source=amateurs.find(a=>a.id===p.amateurSource.playerId);if(JSON.stringify(p.profile.skills)!==JSON.stringify(source.profile.skills))throw Error('entry re-rolled source skills');if(p.profile.development.model!=='prospect-v1')throw Error('draft lost trajectory');if(p.profile===source.profile)throw Error('draft aliases amateur profile')}
 const context={skill:65,managerDevelopment:65,training:1,facilityBoost:1,projectBoost:1,exposure:1,injury:1,minor:true};const young=rookies[0];const healthy=prospectDevelopmentChance(young,context);const injured=prospectDevelopmentChance(young,{...context,injury:.25});if(!(healthy>injured&&healthy>0))throw Error('injury does not reduce development');
 const grown=structuredClone(young);grown.age=28;if(!(prospectDevelopmentChance(grown,context)<healthy))throw Error('age does not slow development');
 const capped=structuredClone(young);for(const k of prospectSkillKeys(capped))capped.profile.skills[k]=capped.profile.development.ceilings[k];const cappedSkills=JSON.stringify(capped.profile.skills);if(beDevelopPlayerSkills(capped,1,()=>.5)!==null||JSON.stringify(capped.profile.skills)!==cappedSkills)throw Error('ceiling exceeded');
 // Run the production professional daily training, without games/financial changes.
 state.players=rookies;const initial=rookies.map(bePlayerEvaluation);for(const p of rookies){p.level='2군';p.draftPending=false;p.games=0;p.minorStats={seasonYear:2028,games:90}}
 const progress=[];for(let season=0;season<5;season++){state.year=2028+season;state.seasonStartDate=state.year+'-01-01';for(let d=1;d<=365;d++){state.day=d;coachDevelopmentDay(d<79||d>300)}progress.push(rookies.reduce((n,p)=>n+bePlayerEvaluation(p),0)/rookies.length);for(const p of rookies)p.age++}
 for(const p of rookies)for(const k of prospectSkillKeys(p))if(p.profile.skills[k]>p.profile.development.ceilings[k])throw Error('training crossed ceiling');
 // Returning college prospects develop once per new season; same-year reads are inert.
 const college={id:990001,name:'대학육성',age:20,position:'CF',collegeYears:2,potential:90};ensureProfile(college);const collegeStart=bePlayerEvaluation(college);progressAmateurDevelopment(college,state.year+1);const after=JSON.stringify(college.profile);progressAmateurDevelopment(college,state.year+1);if(after!==JSON.stringify(college.profile))throw Error('duplicate college camp');
 return {thresholds,population,drafted:rookies.length,initialMean:initial.reduce((a,b)=>a+b,0)/initial.length,annualMean:progress,gains:rookies.map((p,i)=>bePlayerEvaluation(p)-initial[i]),collegeGain:bePlayerEvaluation(college)-collegeStart};
})()`,c);
assert.ok(result.population[18].ready>0,'rare immediate contributors remain possible');
assert.ok(result.population[18].ready/result.population[18].n<.1,'high school candidates generally need development');
assert.ok(result.population[22].mean>result.population[18].mean+4,'college readiness exceeds school readiness');
assert.ok(result.annualMean[4]>result.initialMean+3,'meaningful multi-year professional growth');
assert.ok(Math.max(...result.gains)-Math.min(...result.gains)>4,'players develop at different rates');
assert.ok(result.collegeGain>0,'college returners develop between seasons');
const gains=[...result.gains].sort((a,b)=>a-b);delete result.gains;result.fiveYearGain={min:gains[0],median:gains[Math.floor(gains.length/2)],max:gains.at(-1)};
console.log('PASS prospect readiness, 110-pick draft inheritance, saved pros, ceilings, injury/age and five-year training');console.log(JSON.stringify(result,null,2));
