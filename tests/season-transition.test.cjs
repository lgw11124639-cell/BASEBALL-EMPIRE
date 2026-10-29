// Exercise the actual beginNextSeason controller across 50 yearly transitions.
// External scouting/contract engines are stubbed; this is not a full-season simulation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const begin=source.indexOf('function beginNextSeason(){');
const end=source.indexOf('function annualSalaryNegotiations()',begin);
assert.ok(begin>=0&&end>begin,'beginNextSeason implementation found');
const player={id:1,name:'Test Player',age:20,overall:70,serviceYears:0,position:'OF',level:'1군',teamId:0,retired:false,games:100,hits:120,atBats:400,homeRuns:15,careerStats:{games:420,hits:550,homeRuns:75},nationalTeamHistory:[{year:2026,event:'아시안게임',result:'금메달'}],seasonHistory:[{year:2025,games:90,hits:95}],minorStats:{seasonYear:2026,games:20,hits:10,atBats:40}};
const state={year:2026,day:365,seasonStartDate:'2026-01-01',players:[player],teams:[{id:0,wins:80,losses:60,draws:4}],gameResults:[{id:'old'}],events:[{id:'old'}],history:{seasons:{}}};
const notices=[],snapshots=[],archived=[];
const context=vm.createContext({
 state,Math,Number,Map,Set,
 awardsFinished:()=>true,
 simulateOverseasSeason:()=>{},
 trackExportedPlayerSeasons:()=>{},
 snapshotInternationalPool:()=>{},
 saveSeasonSnapshot:()=>snapshots.push(state.year),
 resolveOverseasContractExpiry:()=>{},
 registerOverseasTransfers:()=>{},
 rng:()=>()=>0.9,
 archiveMinorStats:p=>archived.push({year:state.year,id:p.id}),
 ensureProfile:p=>p.profile||(p.profile={}),
 clubNotice:(...args)=>notices.push(args),
});
vm.runInContext(source.slice(begin,end),context);
for(let n=1;n<=50;n++){
 const previousYear=state.year;
 player.games=100;player.hits=120;player.homeRuns=15;
 state.gameResults=[{id:'season-'+previousYear}];
 assert.equal(vm.runInContext('beginNextSeason()',context),true,'transition succeeds '+n);
 assert.equal(state.year,previousYear+1,'year advances '+n);
 assert.equal(state.day,1,'day resets '+n);
 assert.equal(state.seasonStartDate,state.year+'-01-01','season start resets '+n);
 assert.equal(player.age,20+n,'age increases once '+n);
 assert.equal(player.serviceYears,n,'service increases once '+n);
 assert.equal(player.games,0,'games reset '+n);
 assert.equal(player.hits,0,'hits reset '+n);
 assert.equal(player.homeRuns,0,'home runs reset '+n);
 assert.deepEqual(player.careerStats,{games:420,hits:550,homeRuns:75},'career stats preserved '+n);
 assert.equal(player.nationalTeamHistory.length,1,'national team history preserved '+n);
 assert.equal(player.nationalTeamHistory[0].result,'금메달','national team result preserved '+n);
 assert.equal(player.seasonHistory.length,1,'historical season preserved '+n);
 assert.equal(player.seasonHistory[0].year,2025,'historical year preserved '+n);
 assert.equal(state.gameResults.length,0,'game results reset '+n);
 assert.equal(state.events.length,0,'daily events reset '+n);
 assert.equal(state.teams[0].wins,0,'team wins reset '+n);
}
assert.equal(snapshots.length,50,'one snapshot call per transition');
assert.equal(notices.length,50,'one season notice per transition');
assert.equal(archived.length,50,'minor stats archived once per transition');
console.log('50-year season transition smoke: PASS');
