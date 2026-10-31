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
    source+=`\nstate=world(0);for(const p of state.players)ensureProfile(p);state.highSchoolBaseball={2027:{schools:[{id:0,name:'고교 테스트'}],prospects:Array.from({length:5},(_,i)=>({id:i,name:'고교 후보'+i,schoolId:0,age:18,position:'P'}))}};state.collegeBaseball={2027:{teams:[{id:0,name:'대학 테스트'}],players:Array.from({length:5},(_,i)=>({id:i,name:'대학 후보'+i,teamId:0,age:22,position:'CF'}))}};state.independentBaseball={2027:{teams:[{id:0,name:'독립 테스트'}],players:Array.from({length:5},(_,i)=>({id:i,name:'독립 후보'+i,teamId:0,age:23,position:'P'}))}};window.testOpen=()=>{entryMode='game';tab='league';leaguePane='prospects';render()};`;
    body=Buffer.from(source);
   }
   const ext=path.extname(name),type=ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.html'?'text/html':'application/json';
   await route.fulfill({status:200,body,contentType:type});
  });
  await page.goto('https://baseball.test/');await page.waitForFunction(()=>!!window.testOpen);
  await page.evaluate(()=>window.testOpen());
  assert.equal(await page.locator('[data-league-pane="highSchool"], [data-league-pane="college"], [data-league-pane="independent"]').count(),0);
  assert.equal(await page.locator('[data-prospect-player]').count(),10);
  await page.locator('[data-prospect-pane="amateur"]').click();
  assert.equal(await page.locator('[data-amateur-player]').count(),10);
  await page.locator('[data-amateur-player]').first().click();
  await page.waitForSelector('#player-overlay');
  assert.ok((await page.locator('#player-overlay').innerText()).includes('시즌별 기록'));
  await page.locator('#close-player').click();
  await page.locator('[data-prospect-pane="pro"]').click();
  assert.equal(await page.locator('[data-prospect-player]').count(),10);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.screenshot({path:'/tmp/baseball-prospects-'+viewport.width+'.png'});
  await page.close();console.log('PASS prospect tabs and profile',viewport.width);
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
