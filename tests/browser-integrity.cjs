// Integration checks use the production module with an isolated in-memory world.
// Only cloud startup is omitted; fixtures never load or write a user save.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
const boot=source.lastIndexOf('(async()=>');
assert.ok(boot>0,'production cloud startup boundary exists');
const harness=source.slice(0,boot).replace(/^import .*;\s*$/m,'')+`
window.beIntegrityTest={
 init(){
  state=world(0);for(const p of state.players)ensureProfile(p);
  state.year=2043;state.seasonStartDate='2043-01-01';state.day=70;
  state.gameResults=[{id:'browser-game-2043-69-0-1',year:2043,day:69,away:0,home:1,awayScore:2,homeScore:3,awayInnings:[0,0,0,0,0,0,0,1,1],homeInnings:[0,0,0,0,0,0,1,2],bats:[],arms:[]}];
  state.clubNotices=[];entryMode='game';tab='league';leaguePane='office';
  kpblElectOffice();kpblAssociation();
  const [bench,doping,fixing,negative]=state.players.slice(0,4);
  this.cases={
   bench:kpblOpenIntegrityCase('bench',bench.id,{id:'browser-umpire-report',reportSigned:true,participants:[{playerId:bench.id,action:'신체 충돌',deescalationVerified:true}]},'regular'),
   doping:kpblOpenIntegrityCase('doping',doping.id,{id:'browser-lab-report',sampleId:'browser-sample-positive',playerId:doping.id,sampleA:'양성',sampleB:'양성',chainVerified:true,independentLab:true,therapeuticExemption:{verified:true,playerId:doping.id,documentId:'browser-therapeutic-approval'}},'domestic'),
   fixing:kpblOpenIntegrityCase('fixing',fixing.id,{id:'browser-ledger',transactionId:'browser-verified-transaction',playerId:fixing.id,year:2043,gameDay:69,away:0,home:1,paymentVerified:true,amount:5000000,communicationVerified:true,agreement:'부정 청탁 수락'},'domestic'),
   negative:kpblOpenIntegrityCase('doping',negative.id,{id:'browser-unmatched-samples',sampleId:'browser-sample-negative',playerId:negative.id,sampleA:'양성',sampleB:'음성',chainVerified:true,independentLab:true},'domestic')
  };
  this.rehab=state.players.find(p=>p.position==='P'&&!Object.values(this.cases).some(c=>c.playerId===p.id));
  this.rehab.profile.injury={days:20,type:'어깨 염좌',occurredYear:2043,occurredDay:70};
  kpblAssociationConsultation();window.beOfficePane='discipline';render();
 },
 snapshot(){return Object.fromEntries(Object.entries(this.cases).map(([key,c])=>[key,{playerId:c.playerId,name:state.players.find(p=>p.id===c.playerId).name,stage:c.stage,status:c.status,remaining:c.remaining,decision:c.decision??null,appeal:c.appeal||null,suspended:kpblSuspended(state.players.find(p=>p.id===c.playerId),'regular'),internationalSuspended:kpblSuspended(state.players.find(p=>p.id===c.playerId),'international')}]));},
 advance(){state.day++;kpblDisciplineDay();render();return this.snapshot();},
 office(pane){tab='league';leaguePane='office';window.beOfficePane=pane;render();},
 news(){tab='news';render();},
 notice(key,stage){const c=this.cases[key];const matches=state.clubNotices.filter(n=>n.kind==='KPBL 징계'&&(n.players||[]).includes(c.playerId));const n=stage===0?matches.find(n=>n.title.includes('조사 개시')):matches.find(n=>n.kpblRecord?.step?.stage===stage);return n?{id:n.id,title:n.title,record:n.kpblRecord||null}:null;},
 open(id){openClubNotice(id);},
 returnFromInjury(){this.rehab.profile.injury.days=0;this.rehab.profile.injury.recoveredYear=2043;this.rehab.profile.injury.recoveredDay=state.day;this.rehab.medicalReturnDay=state.day;kpblAssociationConsultation();return {name:this.rehab.name,limit:kpblAssociationPitchLimit(this.rehab),status:kpblAssociation().rehabilitation.find(r=>r.playerId===this.rehab.id)?.status};}
};window.beIntegrityTest.init();`;

async function noOverflow(page,label){
 const geometry=await page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth,document:document.documentElement.scrollWidth}));
 assert.ok(geometry.body<=geometry.viewport+1&&geometry.document<=geometry.viewport+1,label+' overflow: '+JSON.stringify(geometry));
 return geometry;
}
async function article(page,key,stage,typeName,{profile=false}={}){
 const notice=await page.evaluate(([key,stage])=>window.beIntegrityTest.notice(key,stage),[key,stage]);
 assert.ok(notice,key+' '+stage+' notice exists');
 assert.equal(notice.record?.type,'discipline',key+' '+stage+' has frozen discipline record');
 await page.evaluate(id=>window.beIntegrityTest.open(id),notice.id);
 await page.waitForSelector('.kpbl-article-modal');
 const title=await page.locator('#kpbl-article-headline').innerText();
 const text=await page.locator('.kpbl-news-story').innerText();
 assert.ok(text.includes(typeName),key+' retains incident type');
 assert.ok(title.includes(stage===0?'조사':stage),key+' headline reflects publication stage: '+title);
 assert.ok(!/minimumSalary|therapeuticExemption|deescalationVerified|\[object Object\]|AI가/.test(text),'article exposes no implementation data');
 if(stage===0){
  assert.ok(/조사 개시는 위반 확정을 뜻하지 않음|위반.*확정.*아니|확정 전/.test(text),'investigation is explicitly unconfirmed');
  assert.ok(!/위반 (확정|확인)|출장정지 \d+경기 확정/.test(title),'investigation headline does not convict');
 }
 if(key==='fixing'&&stage==='확정')assert.ok(/경기 결과.*별개/.test(text),'fixing article distinguishes proven solicitation from game-result manipulation');
 const geometry=await noOverflow(page,key+' '+stage+' article');
 const sheet=await page.locator('.kpbl-article-sheet').boundingBox();
 assert.equal(Math.round(sheet.x),0);assert.equal(Math.round(sheet.width),geometry.viewport);
 if(profile){
  const name=await page.evaluate(key=>window.beIntegrityTest.snapshot()[key].name,key);
  await page.locator('.kpbl-article-related summary').click();
  await page.locator('[data-kpbl-article-player]').click();
  await page.waitForSelector('#player-overlay');
  assert.equal(await page.locator('.kpbl-article-modal').count(),0,'related profile replaces article');
  assert.ok((await page.locator('#player-title').innerText()).includes(name),'related profile belongs to the correct player');
  await noOverflow(page,'related player profile');
  await page.locator('#close-player').click();
  assert.equal(await page.locator('#player-overlay').count(),0);
 }else{
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.kpbl-article-modal').count(),0,'Escape closes article');
 }
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'','article restores body scrolling');
 return {key,stage:stage===0?'조사':stage,title,relatedPlayerProfile:profile};
}

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const reports=[];
 try{
  for(const width of [1080,390,320]){
   const page=await browser.newPage({viewport:{width,height:900}}),pageErrors=[];
   page.on('pageerror',error=>pageErrors.push(error.message));
   await page.route('**/app.js?*',route=>route.fulfill({contentType:'text/javascript',body:harness}));
   await page.route('**/update.js?*',route=>route.fulfill({contentType:'text/javascript',body:''}));
   await page.goto(process.env.KPBL_BROWSER_URL||'http://127.0.0.1:8765/',{waitUntil:'networkidle'});
   await page.waitForSelector('[data-office-pane="discipline"].active');
   const initial=await page.evaluate(()=>window.beIntegrityTest.snapshot());
   for(const entry of Object.values(initial)){assert.equal(entry.status,'조사');assert.equal(entry.remaining,0);assert.equal(entry.suspended,false);}
   await noOverflow(page,'initial discipline '+width);
   const articles=[];
   for(const [key,name] of [['bench','벤치클리어링'],['doping','금지약물'],['fixing','부정 청탁']])articles.push(await article(page,key,0,name,{profile:key==='bench'}));
   const stages=[];
   for(const expectedStage of ['소명','심의','결정','재심','확정']){
    const snapshot=await page.evaluate(()=>window.beIntegrityTest.advance());
    if(expectedStage!=='확정')for(const entry of Object.values(snapshot)){assert.equal(entry.status,expectedStage);assert.equal(entry.suspended,false,'provisional case is not a suspension');}
    stages.push({stage:expectedStage,cases:snapshot});
   }
   const final=stages.at(-1).cases;
   assert.equal(final.bench.remaining,1);assert.equal(final.bench.appeal.originalPenalty,3);assert.equal(final.bench.appeal.finalPenalty,1);assert.equal(final.bench.suspended,false,'new final ruling starts with the next day');
   assert.equal(final.doping.status,'종결');assert.equal(final.doping.remaining,0);assert.equal(final.doping.appeal.originalPenalty,30);assert.equal(final.doping.appeal.finalPenalty,0);assert.equal(final.doping.suspended,false);
   assert.equal(final.fixing.status,'확정');assert.equal(final.fixing.remaining,120);assert.equal(final.fixing.internationalSuspended,false);
   assert.equal(final.negative.status,'종결');assert.equal(final.negative.remaining,0);
   const nextDay=await page.evaluate(()=>window.beIntegrityTest.advance());
   assert.equal(nextDay.bench.suspended,true);assert.equal(nextDay.fixing.suspended,true);
   assert.equal(nextDay.doping.suspended,false);assert.equal(nextDay.negative.suspended,false);
   await page.evaluate(()=>window.beIntegrityTest.office('discipline'));
   for(const summary of await page.locator('#office-panel details summary').all())await summary.click();
   const disciplineText=await page.locator('#office-panel').innerText();
   assert.ok(disciplineText.includes('선수협회'));assert.ok(disciplineText.includes('진정 행위'));assert.ok(disciplineText.includes('치료 목적'));assert.ok(disciplineText.includes('입증 부족'));
   await noOverflow(page,'final discipline '+width);
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:'/tmp/integrity-discipline-'+width+'.png'});
   articles.push(await article(page,'bench','재심','벤치클리어링'));
   articles.push(await article(page,'fixing','확정','부정 청탁'));
   articles.push(await article(page,'doping','종결','금지약물'));
   articles.push(await article(page,'negative','종결','금지약물'));
   articles.push(await article(page,'doping',0,'금지약물'));
   const recovery=await page.evaluate(()=>window.beIntegrityTest.returnFromInjury());
   assert.equal(recovery.limit,65);assert.equal(recovery.status,'복귀 확인');
   await page.evaluate(()=>window.beIntegrityTest.office('association'));
   const associationText=await page.locator('#office-panel').innerText();
   assert.ok(associationText.includes('65구'),'association shows substantive return protection');
   assert.ok(associationText.includes(recovery.name),'association tracks the actual returning player');
   assert.ok(associationText.includes('치료 목적'),'association shows accepted appeal grounds');
   assert.ok(associationText.includes('진정 행위'),'association shows sentence reduction grounds');
   await noOverflow(page,'association '+width);
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:'/tmp/integrity-association-'+width+'.png'});
   await page.evaluate(()=>window.beIntegrityTest.news());
   assert.ok((await page.locator('main').innerText()).includes('사무국'),'office articles remain available in news');
   const newsNotice=await page.evaluate(()=>window.beIntegrityTest.notice('doping','종결'));
   await page.locator('[data-club-notice="'+newsNotice.id+'"]').click();
   await page.waitForSelector('.kpbl-article-modal');
   assert.ok((await page.locator('#kpbl-article-headline').innerText()).includes('종결'));
   await page.locator('.kpbl-article-close').click();
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
   assert.equal(pageErrors.length,0,JSON.stringify(pageErrors));
   reports.push({width,isolatedFixture:true,incidentTypes:['bench','doping','fixing'],stages:['조사',...stages.map(s=>s.stage)],unconfirmedCasesExcludedFromSuspension:true,suspensionStartsNextDay:true,associationBenchPenalty:{before:3,after:1},associationMedicalExemption:{before:30,after:0},unmatchedSamplesClosed:true,fixingPenalty:120,internationalScopeIsolated:true,returnProtection:recovery,disciplineAndAssociationNoOverflow:true,newsLinkOpened:true,articles,pageErrors});
   await page.close();
  }
  const report={suite:'integrity browser integration',module:'production app.js; cloud startup replaced',viewports:reports};
  console.log(JSON.stringify(report,null,2));
  if(process.env.INTEGRITY_BROWSER_REPORT)fs.writeFileSync(process.env.INTEGRITY_BROWSER_REPORT,JSON.stringify(report,null,2)+'\n');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
