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
    source+=`\nstate=world(0);window.rosterTestPlayers=state.players;window.testOpen=()=>{document.querySelector('#app').innerHTML='<div id="roster-workspace">'+rosterBody()+'</div>';bindRosterSearch();};`;
    body=Buffer.from(source);
   }
   const ext=path.extname(name),type=ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.html'?'text/html':'application/json';
   await route.fulfill({status:200,body,contentType:type});
  });
  await page.goto('https://baseball.test/');await page.waitForFunction(()=>!!window.testOpen);
  await page.evaluate(()=>window.testOpen());
  for(const label of ['1군 · 투수','1군 · 타자','2군 · 투수','2군 · 타자'])assert.ok(await page.locator('#roster-results').innerText().then(t=>t.includes(label)));
  await page.locator('#roster-level').selectOption('2군');await page.locator('#roster-type').selectOption('pitchers');
  let ids=await page.locator('#roster-results [data-player]').evaluateAll(rows=>rows.map(r=>r.dataset.player));
  assert.ok(ids.length>0);
  assert.ok(await page.evaluate(ids=>window.rosterTestPlayers.filter(p=>ids.includes(String(p.id))).every(p=>p.level==='2군'&&p.position==='P'),ids));
  await page.locator('#roster-search').fill('존재하지않는선수');assert.equal(await page.locator('#roster-results [data-player]').count(),0);
  await page.locator('#roster-reset').click();assert.equal(await page.locator('#roster-level').inputValue(),'all');
  await page.locator('#roster-type').selectOption('hitters');await page.locator('#roster-position').selectOption('C');
  ids=await page.locator('#roster-results [data-player]').evaluateAll(rows=>rows.map(r=>r.dataset.player));assert.ok(ids.length>0);
  assert.ok(await page.evaluate(ids=>window.rosterTestPlayers.filter(p=>ids.includes(String(p.id))).every(p=>p.position==='C'),ids));
  await page.locator('#roster-sort').selectOption('name');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.screenshot({path:'/tmp/baseball-roster-'+viewport.width+'.png'});
  await page.close();console.log('PASS roster filters',viewport.width);
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
