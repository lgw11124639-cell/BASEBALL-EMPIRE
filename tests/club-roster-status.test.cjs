const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')(),run=s=>vm.runInContext(s,c);
run(`state=world(0);state.year=2040;state.day=150;state.players=[];state.careerRecords={};state.history.seasons={2039:{year:2039,complete:true,players:[]}};
let rosterTestId=1;for(const team of state.teams){
 for(let i=0;i<40;i++)state.players.push({id:rosterTestId++,teamId:team.id,name:'국내 '+team.id+'-'+i,age:25,position:i<14?'P':i===14?'C':i===15?'SS':'1B',level:i<30?'1군':'2군',profile:{skills:{contact:55,stuff:55,fielding:55}}});
 for(let i=0;i<6;i++)state.players.push({id:rosterTestId++,teamId:team.id,name:'Foreign '+team.id+'-'+i,age:28,foreignPlayer:true,foreignContractYear:2040,foreignSignedYear:i<3?2039:2040,position:i%3===2?'1B':'P',level:'1군',contractSigned:true});
 for(let i=0;i<3;i++)state.players.push({id:rosterTestId++,teamId:team.id,name:'Asian '+team.id+'-'+i,age:27,foreignPlayer:true,asianQuota:true,foreignContractYear:2040,foreignSignedYear:2039+i,position:'P',level:'1군'});
 const expired={id:rosterTestId++,teamId:team.id,name:'Expired '+team.id,foreignPlayer:true,foreignContractYear:2039,position:'P',level:'1군',games:30};state.players.push(expired);state.careerRecords[expired.id]=[{year:2039,teamId:team.id,inningsPitched:150,games:30}];
 state.players.push({id:rosterTestId++,teamId:team.id,name:'Retired '+team.id,retired:true,position:'C',level:'1군'},{id:rosterTestId++,teamId:team.id,name:'Pending '+team.id,draftPending:true,joinYear:2041,position:'P',level:'1군'},{id:rosterTestId++,teamId:team.id,name:'Unsigned '+team.id,contractSigned:false,position:'1B',level:'2군'});
 for(let i=0;i<150;i++)state.players.push({id:rosterTestId++,teamId:team.id,name:'Former '+team.id+'-'+i,foreignPlayer:true,position:'P',level:i%2?'방출':'계약종료'});
}
const rosterAllIds=state.players.map(p=>p.id).join(','),rosterCareerBefore=JSON.stringify(state.careerRecords),rosterHistoryBefore=JSON.stringify(state.history);repairClubRosterState();`);
for(let id=0;id<10;id++){
 c.rosterTeam=id;
 assert.equal(run('foreignRoster(rosterTeam).filter(p=>!p.asianQuota).length'),3);
 assert.equal(run('foreignRoster(rosterTeam).filter(p=>p.asianQuota).length'),1);
 assert.ok(run("clubRosterGroups(rosterTeam).active.filter(p=>p.level==='1군').length")<=28);
 assert.equal(run('clubRosterGroups(rosterTeam).pending.length'),1);
 assert.ok(run('clubRosterGroups(rosterTeam).active.length')<50,'old foreign histories do not inflate active squad');
 assert.ok(run("foreignRoster(String(rosterTeam)).every(p=>p.foreignContractYear===2040)"));
}
assert.equal(run('state.players.map(p=>p.id).join(\',\')'),run('rosterAllIds'),'cleanup preserves every player identity');assert.equal(run('JSON.stringify(state.careerRecords)'),run('rosterCareerBefore'));assert.equal(run('JSON.stringify(state.history)'),run('rosterHistoryBefore'));
assert.equal(run('repairClubRosterState().length'),0,'repair is idempotent');
assert.equal(run("state.players.find(p=>p.name==='Expired 0').level"),'계약종료');assert.equal(run("state.players.find(p=>p.name==='Retired 0').level"),'은퇴');assert.equal(run("state.players.find(p=>p.name==='Unsigned 0').level"),'계약종료');
assert.ok(run("foreignRoster(0).filter(p=>!p.asianQuota).every(p=>p.foreignSignedYear===2040)"),'valid recent contracts survive quota repair');
console.log('PASS ten-club active/archive separation, foreign 3+1, expiry, retirement, unsigned, pending and 28-man limits with all IDs/careers preserved');
