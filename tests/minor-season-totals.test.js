// BASEBALL EMPIRE multi-game season totals regression test.
// Run: node tests/minor-season-totals.test.js
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('function validateSeasonIntegrity(');
const end=source.indexOf('function activeRosterConsistency(',start);
assert(start>=0&&end>start);
const audit=new Function('state',source.slice(start,end)+';return validateSeasonIntegrity;');
function fixture(){
 const s={year:2027,day:30,players:[
 {id:11,teamId:0,level:'2군',position:'CF',minorStats:{seasonYear:2027,games:2,atBats:7,hits:3,doubles:0,triples:0,homeRuns:0,rbi:2,runs:2,walks:1,strikeouts:1}},
 {id:31,teamId:0,level:'2군',position:'P',minorStats:{seasonYear:2027,games:2,innings:16,earnedRuns:0,strikeouts:4}}
 ],teams:[{id:0},{id:1}],waiverClaims:[],minorLeague:{2027:{games:[]}}};
 for(let day=29;day<=30;day++)s.minorLeague[2027].games.push({
 day,away:0,home:1,awayRuns:1,homeRuns:0,
 awayInnings:[0,0,0,0,0,0,0,0,1],homeInnings:[0,0,0,0,0,0,0,0,null],
 awayHits:day===29?1:2,homeHits:0,
 awayBatters:[{playerId:11,atBats:day===29?3:4,hits:day===29?1:2,doubles:0,triples:0,homeRuns:0,rbi:1,runs:1,walks:day===29?0:1,strikeouts:day===29?0:1}],
 homeBatters:[{playerId:22,hits:0,strikeouts:2,walks:0,runs:0}],
 awayPitchers:[{playerId:31,innings:8,outs:24,hitsAllowed:0,strikeouts:2,walksAllowed:0,earnedRuns:0,startInning:1,endInning:8,win:true}],
 homePitchers:[{playerId:32,innings:9,outs:27,hitsAllowed:day===29?1:2,strikeouts:day===29?0:1,walksAllowed:day===29?0:1,earnedRuns:1,startInning:1,endInning:9,loss:true}]
 });
 return s;
}
assert.deepEqual(audit(fixture())(),[]);
const bad=fixture();bad.players[0].minorStats.hits=4;
assert(audit(bad)().some(x=>x.includes('시즌/경기 합계 불일치 11 hits')));
const badPitch=fixture();badPitch.players[1].minorStats.strikeouts=5;
assert(audit(badPitch)().some(x=>x.includes('시즌/경기 합계 불일치 31 strikeouts')));
console.log('PASS: 3 multi-game season total scenarios');
