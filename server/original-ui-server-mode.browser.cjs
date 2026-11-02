const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const root=resolve(__dirname,'..');
 let fixture;
 const fixturePath=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
 if(fixturePath)fixture=JSON.parse(readFileSync(fixturePath,'utf8'));
 else{
  const {createOriginalEngineSandbox}=await import('./original-engine-sandbox.mjs');
  const vm=createOriginalEngineSandbox(readFileSync(resolve(root,'app.js'),'utf8'),{year:2027,day:1,players:[],teams:[],gameResults:[]},{timeoutMs:120000});
  vm.context.structuredClone=structuredClone;
  fixture=vm.invoke('world(0)');
 }
 const startingWorld=structuredClone(fixture);
 const {restoreServerSave}=await import('./save-wire-codec.mjs');
 const {gunzipSync}=require('node:zlib');
 const server=createServer((req,res)=>{
  const name=decodeURIComponent(req.url.split('?')[0]).slice(1);
  if(!['index.html','server-game-preview.html','app.js','cloud-only.js','server-day-client.js','server-save-client.js','kpbl-investigation-policy.js','ui.css','manifest.webmanifest','update.js','vendor/fflate/fflate-0.8.2.min.js'].includes(name)){res.writeHead(404);return res.end()}
  let bytes=readFileSync(resolve(root,name));
  if(name==='app.js'){
   const source=bytes.toString(),at=source.lastIndexOf('(async()=>{try{app.innerHTML=');
   const poison="window.__clientSimulationCalls=0;for(const name of ['simulateLeagueDay','offseasonDay','nationalTeamPreparationDay','world']){eval(name+' = ()=>{window.__clientSimulationCalls++;throw Error(\\\"Client simulation forbidden\\\")}')}\n";
   bytes=Buffer.from(source.slice(0,at)+poison+source.slice(at));
  }
  res.setHeader('Content-Type',extname(name)==='.js'?'text/javascript':extname(name)==='.css'?'text/css':'text/html');res.end(bytes);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:process.argv.includes('--desktop')?{width:1440,height:900}:{width:390,height:844},isMobile:!process.argv.includes('--desktop'),serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>localStorage.setItem('be-cloud-session-v1',JSON.stringify({token:'a'.repeat(64),username:'test',expiresAt:Date.now()+600000})));
  let revision=1,advances=0,commands=0,writes=0,lifecycle=0;const receipts=new Map();
  await page.route('https://baseball-empire-save.duckdns.org/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE','access-control-allow-headers':'authorization,content-type,if-match'}});
   let data;
   if(req.method()==='GET'&&path==='/v2/saves/main')data={rev:revision,save:fixture};
   else if(path==='/v2/engine/status')data={enabled:true,canAdvance:!fixture.beServerSlotEmpty,revision,serverOwned:false};
   else if(req.method()==='POST'&&['/v2/engine/new-game','/v2/engine/reset','/v2/engine/restore'].includes(path)){
    lifecycle++;const bytes=req.postDataBuffer(),body=JSON.parse((req.headers()['content-encoding']==='gzip'?gunzipSync(bytes):bytes).toString());
    const operation=path.split('/').at(-1);
    if(operation==='reset')fixture={schema:1,beServerSlotEmpty:true};
    else if(operation==='new-game'){fixture=structuredClone(startingWorld);fixture.teamId=body.teamId;}
    else fixture=await restoreServerSave(body.save);
    revision++;data={request_id:body.requestId,rev:revision,operation,previousVersionArchived:true};receipts.set(body.requestId,data);
   }
   else if(req.method()==='POST'&&path==='/v2/engine/command'){
    commands++;const body=JSON.parse(req.postData());assert.equal(body.command.type,'player-photo');
    fixture.players.find(p=>String(p.id)===body.command.playerId).profile.photoData=body.command.photo;
    revision++;data={request_id:body.requestId,rev:revision};
   }
   else if(req.method()==='POST'&&path==='/v2/engine/advance'){advances++;fixture.day++;revision++;data={request_id:JSON.parse(req.postData()).requestId,rev:revision}}
   else{writes++;return route.fulfill({status:500,headers:{'access-control-allow-origin':'*'},body:'{}'})}
   return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+(process.argv.includes('--main')?'/index.html':'/server-game-preview.html'));
  await page.waitForSelector('#advance-day',{timeout:30000});
  assert.equal(await page.evaluate(()=>window.__clientSimulationCalls),0);
  for(const tab of ['roster','news','league','fa','national','home']){
   await page.locator('nav [data-tab="'+tab+'"]').click();
   await page.waitForSelector('main[data-view="'+tab+'"]',{timeout:30000});
  }
  await page.locator('nav [data-tab="roster"]').click();
  await page.waitForSelector('[data-player]');
  const player=page.locator('[data-player]').first(),playerId=await player.getAttribute('data-player');
  await player.click();await page.waitForSelector('#player-overlay');
  await page.locator('[data-profile-tab="record"]').click();
  assert.match(await page.locator('#player-record-lazy').textContent(),/1군 시즌 기록/);
  const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=10;c.height=10;c.getContext('2d').fillRect(0,0,10,10);return c.toDataURL('image/jpeg').split(',')[1]});
  const confirmedPhoto=await page.evaluate(async({playerId,photo})=>{const next=await window.beExecuteServerGameCommand({type:'player-photo',playerId,photo:'data:image/jpeg;base64,'+photo});return next.players.find(p=>String(p.id)===playerId).profile.photoData},{playerId,photo});
  assert.match(confirmedPhoto,/^data:image\/jpeg;base64,/);
  assert.equal(commands,1);assert.ok(fixture.players.find(p=>String(p.id)===playerId).profile.photoData);
  await page.click('#close-player');await page.locator('nav [data-tab="home"]').click();
  const priorDate=await page.locator('.header-season').textContent();
  await page.click('#advance-day');
  await page.waitForFunction(()=>window.beNewsDay!==undefined||document.querySelector('.header-season')?.textContent.includes('2027'),null,{timeout:10000});
  await page.waitForFunction(()=>!document.querySelector('#advance-day').disabled);
  assert.notEqual(await page.locator('.header-season').textContent(),priorDate);
  assert.equal(advances,1);assert.equal(revision,3);assert.equal(writes,0);
  await page.click('#back-to-title');await page.click('#be-cloud-reset');
  await page.waitForSelector('#entry-new');await page.click('#entry-new');await page.click('#start');
  await page.waitForSelector('#advance-day');await page.waitForFunction(()=>window.beServerGameCapability?.revision===5);
  assert.equal(lifecycle,2);assert.equal(fixture.day,startingWorld.day);
  const backup=structuredClone(startingWorld);backup.day=30;
  const beforeRestore=await page.locator('.header-season').textContent();
  await page.locator('#restore').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.waitForFunction(()=>window.beServerGameCapability?.revision===6);
  assert.equal(lifecycle,3);assert.equal(fixture.day,30);assert.equal(writes,0);
  await page.waitForFunction(old=>document.querySelector('.header-season').textContent!==old,beforeRestore);
  assert.equal(await page.evaluate(()=>window.__clientSimulationCalls),0);
  assert.deepEqual(errors,[]);
  console.log((process.argv.includes('--desktop')?'Original desktop UI:':'Original mobile UI:')+' six tabs, player records/photo, server day, archived reset/new-game/restore routing, zero client simulation/save uploads PASS');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
