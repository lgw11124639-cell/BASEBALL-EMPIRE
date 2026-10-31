const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
// Optional browser check: uses Playwright and a local Chromium, no cloud account or saved data.
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 for(const viewport of [{width:1920,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='baseball.test')return route.abort();
   let name=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';
   if(name.includes('..'))return route.abort();
   const file=path.join(root,name);if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   let body=fs.readFileSync(file);
   if(name==='app.js'){
    let source=body.toString();source=source.slice(0,source.lastIndexOf('(async()=>')).replace(/^import .*;\s*$/m,'');
    source+=`\nstate=world(0);state.gameResults=[];window.testOpen=()=>{
     const events=Array.from({length:30},(_,i)=>({inning:1,side:'away',batter:'타자 '+i,pitcher:'투수',outcome:'안타',score:i,
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
  await page.evaluate(()=>window.testOpen());
  for(let i=0;i<16;i++)await page.evaluate(()=>document.querySelector('#be-replay-next').click());
  const dimensions=await page.evaluate(()=>{
   const log=document.querySelector('#be-replay-lines'),overlay=document.querySelector('#be-replay-overlay');
   return {logHeight:log.clientHeight,logOverflow:log.scrollHeight-log.clientHeight,logTop:log.scrollTop,
    overlayOverflow:overlay.scrollHeight-overlay.clientHeight};
  });
  console.log(viewport,dimensions);
  assert.ok(dimensions.logHeight>=200,'commentary must not collapse to one line');
  assert.ok(dimensions.logOverflow>0,'commentary can scroll through earlier entries');
  assert.ok(dimensions.logTop>=dimensions.logOverflow-2,'newest commentary follows bottom');
  assert.ok(dimensions.overlayOverflow>0,'whole replay page can scroll down');
  await page.evaluate(()=>document.querySelector('#be-replay-lines').scrollTop=0);
  await page.evaluate(()=>document.querySelector('#be-replay-next').click());
  assert.equal(await page.locator('#be-replay-lines').evaluate(el=>el.scrollTop),0,'reading earlier entries is not interrupted');
  await page.locator('#be-replay-lines').evaluate(el=>el.scrollTop=el.scrollHeight);
  await page.evaluate(()=>document.querySelector('#be-replay-next').click());
  assert.ok(await page.locator('#be-replay-lines').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop<2),'returning to bottom resumes following');
  const beforeAuto=await page.locator('#be-replay-lines').evaluate(el=>el.children.length);
  await page.locator('#be-replay-speed').selectOption('100');
  await page.locator('#be-replay-auto').click();
  await page.waitForFunction(n=>document.querySelector('#be-replay-lines').children.length>n+1,beforeAuto);
  await page.locator('#be-replay-auto').click();
  assert.ok(await page.locator('#be-replay-lines').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop<2),'automatic commentary follows latest entries');
  const controls=await page.locator('.be-replay-controls').boundingBox();
  assert.ok(controls.y+controls.height<=viewport.height+1,'playback controls stay visible');
  await page.locator('#be-replay-overlay').evaluate(el=>el.scrollTop=el.scrollHeight);
  await page.screenshot({path:'/tmp/baseball-replay-'+viewport.width+'.png'});
  await page.close();console.log('PASS replay scroll',viewport.width);
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
