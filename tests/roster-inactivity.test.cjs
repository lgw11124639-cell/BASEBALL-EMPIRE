const assert=require('node:assert/strict'),vm=require('node:vm');const c=require('./helpers/game-context.cjs')();const run=s=>vm.runInContext(s,c);
run(`state=world(0);state.year=2039;state.day=314;state.teams=state.teams.slice(0,2);state.history.seasons={};state.players=[];
function veteran(id,extra={}){return {id,name:'선수'+id,age:34,position:'SS',teamId:0,level:'2군',joinYear:2027,contractSigned:true,salary:33000000,games:0,atBats:0,profile:{contractYears:1,skills:{contact:60,power:60,eye:60,speed:60,fielding:60,arm:60}},minorSeasonHistory:{2037:{games:0},2038:{games:0},2039:{games:0}},...extra}}
const idle=veteran(1),minor=veteran(2),injured=veteran(3),young=veteran(4,{age:23}),guaranteed=veteran(5),recent=veteran(6,{teamHistory:[{year:2039,from:1,to:0,reason:'영입'}]});
minor.minorSeasonHistory[2039]={games:90,atBats:300};injured.profile.injury={days:240};guaranteed.profile.faContract={signedYear:2038,startYear:2039,endYear:2041,years:3,annualSalary:100000000,teamId:0};
state.players=[idle,minor,injured,young,guaranteed,recent];for(let y=2037;y<=2039;y++)state.history.seasons[y]={year:y,complete:true,players:state.players.map(p=>({id:p.id,name:p.name,teamId:0,games:0,atBats:0}))};
reviewInactiveRoster();`);
assert.equal(run('idle.level'),'방출');assert.equal(run('idle.releaseYear'),2039);assert.equal(run('idle.contractSigned'),false);assert.equal(run('state.releaseNotices.length'),1);
for(const name of ['minor','injured','young','guaranteed','recent'])assert.equal(run(name+'.level'),'2군',name+' protected');
run('reviewInactiveRoster()');assert.equal(run('state.releaseNotices.length'),1,'same review emits no duplicate release');
assert.ok(run('playerRetirementProbability({...idle,age:40})>playerRetirementProbability({...minor,age:40})'),'meaningful minor activity protects a veteran');
run(`state.year=2039;state.day=365;state.seasonStartDate='2039-01-01';idle.age=40;idle.careerStats={games:437,hits:475};state.history.seasons[2031]={year:2031,players:[{id:1,name:idle.name,teamId:1,games:98,atBats:342,hits:87,homeRuns:3,runsBattedIn:40}]};const notice={kind:'은퇴',year:2039,day:314,players:[1],teams:[0]};const article=newsPlayerSeasonFeature(notice);`);
assert.match(run('article'),/2031시즌 마리너스 소속 98경기/);assert.match(run('article'),/2039시즌 1군 공식 출전 기록은 없다/);assert.match(run('article'),/남기고 은퇴했다/);assert.doesNotMatch(run('article'),/기록 중이다/);
// The actual offseason path reaches the existing annual unsigned retirement review.
run(`state.offseasonContractsDone={2039:true};state.postseasons={2039:{finished:true}};awardsFinished=()=>true;
highSchoolBaseballDay=collegeBaseballDay=independentBaseballDay=financeMonth=calendarNotice=foreignRecruitmentDay=asianQuotaRecruitmentDay=activateDraftRookies=draftScoutReport=officeDraft=reviewUnsignedFaMarket=coachDevelopmentDay=()=>{};
let reviewed=0;const realReview=retireUnsignedReleasedPlayers;retireUnsignedReleasedPlayers=()=>{reviewed++;realReview()};offseasonDay();`);
assert.equal(run('reviewed'),1);
run(`idle.retired=false;idle.level='2군';idle.contractSigned=true;delete state.inactiveRosterReviewedYear;state.day=315;offseasonDay();`);
assert.equal(run('idle.level'),'방출','already-completed legacy offseason still performs the new roster review');assert.equal(run('state.day'),316,'legacy offseason review advances exactly one day');
console.log('PASS: chronic inactive release, minor/rehab/youth/guaranteed-contract protections, retirement article and actual offseason review');
