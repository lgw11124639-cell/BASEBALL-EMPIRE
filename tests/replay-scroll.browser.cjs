const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
// Optional browser check: uses Playwright and a local Chromium, no cloud account or saved data.
const root=path.resolve(__dirname,'..');const reports=[];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 for(const viewport of [{width:1920,height:1000},{width:1080,height:950},{width:390,height:844},{width:320,height:844}]){
  const page=await browser.newPage({viewport});await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='baseball.test')return route.abort();
   let name=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';
   if(name.includes('..'))return route.abort();
   const file=path.join(root,name);if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   let body=fs.readFileSync(file);
   if(name==='app.js'){
    let source=body.toString();source=source.slice(0,source.lastIndexOf('(async()=>')).replace(/^import .*;\s*$/m,'');
    source+=`\nstate=world(0);state.gameResults=[];
     for(let z=0;z<9;z++)for(let n=0;n<40;n++)state.gameResults.push({year:state.year,away:0,home:1,broadcastEvents:[{batterId:999001,batter:'타자 0',side:'away',outcome:n<([20,20,0,0,8,8,8,8,8][z])?'안타':'땅볼',pitchSequence:[{zoneX:16+z%3*33,zoneY:16+Math.floor(z/3)*33}]}]});
     window.testOpen=()=>{
     const events=Array.from({length:30},(_,i)=>({inning:1,side:'away',batterId:i===0?999001:999002,batter:'타자 '+i,pitcher:'투수',outcome:'안타',score:i,
      outsBefore:0,outsAfter:0,bases:[null,null,null],afterBases:[null,null,null],pitches:1,
      pitchSequence:[{number:1,type:'직구',velocity:140,zoneX:50,zoneY:50,call:'인플레이',ballsAfter:0,strikesAfter:0}]}));
     beOpenGameReplay(1,0,{day:1,away:0,home:1,awayRuns:30,homeRuns:0,awayInnings:[30],homeInnings:[0],
      awayBatters:[],homeBatters:[],awayPitchers:[],homePitchers:[],broadcastEvents:events});};`;
    body=Buffer.from(source);
   }
   const ext=path.extname(name),type=ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.html'?'text/html':'application/json';
   await route.fulfill({status:200,body,contentType:type});
  });
  await page.goto('https://baseball.test/');await page.waitForFunction(()=>!!window.testOpen);
  await page.evaluate(()=>window.testOpen());await page.locator('.be-replay-history>summary').click();const advance=async()=>{await page.locator('#be-replay-next').click();await page.clock.runFor(1300);if(await page.locator('#be-replay-auto').isEnabled())await page.locator('#be-replay-auto').click();};assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');assert.equal(await page.locator('.be-replay-team .club-logo').count(),2);assert.ok(await page.locator('.be-replay-scoreboard').evaluate(el=>{const board=el.getBoundingClientRect();return [...el.querySelectorAll('.be-replay-team,.be-replay-score,#be-replay-current-score')].every(child=>{const r=child.getBoundingClientRect();return r.top>=board.top&&r.bottom<=board.bottom&&r.left>=board.left&&r.right<=board.right})}),'score, club crests and labels stay within the scoreboard');await page.screenshot({path:'/tmp/baseball-replay-top-'+viewport.width+'.png'});
  assert.equal(await page.locator('.be-broadcast-zone-grid .be-zone-hot').count(),2);
  assert.equal(await page.locator('.be-broadcast-zone-grid .be-zone-cold').count(),2);
  await advance();
  assert.equal(await page.locator('#be-stadium-pitches circle').count(),1,'pitch marker remains visible over heat colors');
  assert.notEqual(await page.locator('.be-zone-hot').first().evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('.be-zone-cold').first().evaluate(el=>getComputedStyle(el).backgroundColor));
  for(let i=1;i<16;i++)await advance();
  assert.equal(await page.locator('.be-broadcast-zone-grid .be-zone-neutral').count(),9,'next batter without samples resets all colors');
  assert.equal(await page.locator('#be-replay-lines > .be-replay-plate-event').count(),8,'eight plate appearances have exactly eight cards');assert.equal(await page.locator('#be-replay-lines > .be-replay-plate-event[data-phase="result"]').count(),8,'result updates each existing plate card');assert.equal(await page.locator('.be-replay-pitch-rows > li').count(),8,'all eight one-pitch histories remain available');assert.equal(await page.locator('.be-replay-pitch-history[open]').count(),0,'completed pitch histories are collapsed by default');
  const dimensions=await page.evaluate(()=>{
   const log=document.querySelector('#be-replay-lines'),overlay=document.querySelector('#be-replay-overlay');
   return {logHeight:log.clientHeight,logOverflow:log.scrollHeight-log.clientHeight,logTop:log.scrollTop,
    overlayOverflow:overlay.scrollHeight-overlay.clientHeight};
  });
  console.log(viewport,dimensions);
  assert.ok(dimensions.logHeight>=200,'commentary must not collapse to one line');
  assert.ok(dimensions.logOverflow>0,'commentary can scroll through earlier entries');
  assert.equal(dimensions.logTop,0,'newest commentary follows top');
  const newest=await page.locator('#be-replay-lines > :first-child').innerText();
  assert.ok(newest.includes('타자 7'),'newest eighth plate appearance is first');
  assert.ok((await page.locator('#be-replay-lines > :last-child').innerText()).includes('타자 0'),'oldest entry is last');
  assert.ok(dimensions.overlayOverflow>0,'whole replay page can scroll down');
  const reading=await page.locator('#be-replay-lines').evaluate(el=>{el.scrollTop=el.scrollHeight/2;return {top:el.scrollTop,height:el.scrollHeight}});
  await advance();
  const after=await page.locator('#be-replay-lines').evaluate(el=>({top:el.scrollTop,height:el.scrollHeight}));
  assert.ok(Math.abs(after.top-reading.top-(after.height-reading.height))<2,'prepending preserves the older passage being read');
  await page.locator('#be-replay-lines').evaluate(el=>el.scrollTop=0);
  await advance();
  assert.equal(await page.locator('#be-replay-lines').evaluate(el=>el.scrollTop),0,'returning to top resumes following');
  const beforeAuto=await page.locator('#be-replay-lines').evaluate(el=>el.children.length);
  await page.locator('#be-replay-speed').selectOption('3');
  await page.locator('#be-replay-next').click();
  await page.clock.runFor(1800);
  if(await page.locator('#be-replay-auto').isEnabled())await page.locator('#be-replay-auto').click();
  assert.equal(await page.locator('#be-replay-lines').evaluate(el=>el.scrollTop),0,'automatic commentary follows latest entries at top');
  const controls=await page.locator('.be-replay-controls').boundingBox();
  assert.ok(controls.y+controls.height<=viewport.height+1,'playback controls stay visible');
  await page.locator('#be-replay-overlay').evaluate(el=>el.scrollTop=el.scrollHeight);
  await page.screenshot({path:'/tmp/baseball-replay-'+viewport.width+'.png'});
  await page.evaluate(()=>window.beCloseGameReplay());assert.equal(await page.evaluate(()=>window.beBroadcastStop),null,'close releases global replay closure');assert.equal(await page.locator('#be-replay-overlay').count(),0);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');reports.push({width:viewport.width,height:viewport.height,scoreboardContainsScoreAndCrests:true,commentaryHeight:dimensions.logHeight,newestFirst:true,readingPositionPreserved:true,autoPlayback:true,controlsVisible:true,pageScrollRestored:true});await page.close();console.log('PASS replay scroll and redesigned match centre',viewport.width);
 }
 if(process.env.REPLAY_BROWSER_REPORT)fs.writeFileSync(process.env.REPLAY_BROWSER_REPORT,JSON.stringify(reports,null,2)+'\n');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
