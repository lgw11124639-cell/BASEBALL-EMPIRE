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
 // Synthetic prior seasons exercise the actual season table and chart surfaces.
 if(!fixturePath){
  const players=fixture.players.filter(p=>String(p.teamId)===String(fixture.teamId));
  for(const p of players)p.joinYear=Math.min(Number(p.joinYear)||2025,2025);
  fixture.history=fixture.history||{};fixture.history.seasons=fixture.history.seasons||{};
  for(const year of [2025,2026])fixture.history.seasons[year]={year,complete:true,teams:fixture.teams,players:players.map((p,i)=>({id:p.id,name:p.name,teamId:p.teamId,games:40,atBats:p.position==='P'?0:150,hits:45+i,homeRuns:5+i,maxVelocity:p.position==='P'?150+i%10:0,inningsPitched:p.position==='P'?100:0,earnedRuns:35,pitchingStrikeouts:90,pitchingWins:8,pitchingLosses:4}))};
 }
 if(!fixturePath){
  const p=fixture.players.find(p=>Number(p.teamId)===1&&p.position==='P'&&!p.foreignPlayer);
  fixture.international=fixture.international||{};
  fixture.international.overseasTransfers=[{id:p.id,name:p.name,position:'P',fromTeamId:p.teamId,league:'MLB',club:'Test Overseas Club',startYear:2026,contract:{years:3},player:structuredClone(p),seasons:[{year:2026,league:'MLB',club:'Test Overseas Club',games:26,era:3.12}]}];
  fixture.history.seasons[2025].players.push({id:p.id,teamId:p.teamId,games:25,pitchingWins:10,pitchingLosses:4,pitchingStrikeouts:130});
  fixture.players=fixture.players.filter(x=>x.id!==p.id);
 }
 if(!fixturePath){
  fixture.day=110;
  fixture.gameResults=[{year:fixture.year,day:fixture.day,away:0,home:1,awayRuns:4,homeRuns:7,awayInnings:[0,2,0,0,0,0,0,0,2],homeInnings:[0,0,0,3,0,0,4,0,0],awayBatters:[],homeBatters:[],awayPitchers:[{name:'원정 선발',started:true}],homePitchers:[{name:'홈 선발',started:true}]}];
  fixture.day++;
 }
 if(process.argv.includes('--replay-pressure')&&!fixturePath){
  const game=fixture.gameResults[0];fixture.gameResults=Array.from({length:80},(_,i)=>({...game,day:game.day-79+i,broadcastEvents:Array.from({length:500},(_,n)=>({inning:Math.floor(n/60)+1,side:n%2?'away':'home',text:'중계 기록 '.repeat(35)+n}))}));
 }
 if(process.argv.includes('--player-pressure')&&!fixturePath){
  const base=fixture.players[0];for(let i=fixture.players.length;i<3400;i++)fixture.players.push({...structuredClone(base),id:100000+i,name:'보존 선수 '+i,teamId:i%10,retired:true,level:'은퇴',jerseyNumber:null,profile:{...structuredClone(base.profile),historicalNotes:'선수 보존 기록 '.repeat(500)}});
 }
 const startingWorld=structuredClone(fixture);
 const {restoreServerSave}=await import('./save-wire-codec.mjs');
 const {packNativeSave}=await import('../native-save.js');
 const native=process.argv.includes('--native');
 const {gzipSync,gunzipSync}=require('node:zlib');
 const server=createServer((req,res)=>{
  const name=decodeURIComponent(req.url.split('?')[0]).slice(1);
  if(!['index.html','server-game-preview.html','app.js','native-save.js','cloud-only.js','server-day-client.js','server-save-client.js','kpbl-investigation-policy.js','ui.css','manifest.webmanifest','update.js','vendor/fflate/fflate-0.8.2.min.js'].includes(name)){res.writeHead(404);return res.end()}
  let bytes=readFileSync(resolve(root,name));
  if(name==='app.js'){
   const source=bytes.toString(),at=source.lastIndexOf('(async()=>{try{app.innerHTML=');
   const poison="window.__clientSimulationCalls=0;for(const name of ['simulateLeagueDay','offseasonDay','nationalTeamPreparationDay','world']){eval(name+' = ()=>{window.__clientSimulationCalls++;throw Error(\\\"Client simulation forbidden\\\")}')}\n";
   const measured=process.argv.includes('--player-pressure')?"const measuredRender=render;render=function(...args){const started=performance.now();try{return measuredRender(...args)}finally{(window.__playerRenderTimes||(window.__playerRenderTimes=[])).push({view:tab,ms:Math.round(performance.now()-started)})}};const measuredDetail=playerDetail;playerDetail=function(...args){const started=performance.now();try{return measuredDetail(...args)}finally{(window.__playerDetailTimes||(window.__playerDetailTimes=[])).push(Math.round(performance.now()-started))}};\n":'';
   bytes=Buffer.from(source.slice(0,at)+poison+measured+source.slice(at));
  }
  res.setHeader('Content-Type',extname(name)==='.js'?'text/javascript':extname(name)==='.css'?'text/css':'text/html');res.end(bytes);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:process.argv.includes('--desktop')?{width:1440,height:900}:{width:390,height:844},isMobile:!process.argv.includes('--desktop'),serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>localStorage.setItem('be-cloud-session-v1',JSON.stringify({token:'a'.repeat(64),username:'test',expiresAt:Date.now()+600000})));
  let revision=1,advances=0,commands=0,writes=0,lifecycle=0,snapshotReads=0;const receipts=new Map();
  await page.route('https://baseball-empire-save.duckdns.org/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE','access-control-allow-headers':'authorization,content-type,if-match'}});
   let data;
   if(req.method()==='GET'&&path==='/v2/saves/main'){snapshotReads++;data={rev:revision,save:native?packNativeSave(fixture):fixture};}
   else if(req.method()==='GET'&&path==='/v2/engine/snapshot'){snapshotReads++;const wire=packNativeSave(fixture);data={rev:revision,compressedNative:true,save:Object.fromEntries(Object.entries(wire).map(([key,value])=>[key,key.startsWith('beServerPart_')?gzipSync(JSON.stringify(value)).toString('base64'):value]))};}
   else if(path==='/v2/engine/status')data={enabled:true,compressedSnapshot:native,canAdvance:!fixture.beServerSlotEmpty,revision,serverOwned:false,preparation:{enabled:true,ready:Math.max(0,5-advances),horizon:366,working:true}};
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
    const changedPlayer=fixture.players.find(p=>String(p.id)===body.command.playerId);changedPlayer.profile=changedPlayer.profile||{};changedPlayer.profile.photoData=body.command.photo;
    revision++;data={request_id:body.requestId,rev:revision};
   }
   else if(req.method()==='POST'&&path==='/v2/engine/advance'){advances++;if(!fixturePath)fixture.gameResults.push({...fixture.gameResults[0],day:fixture.day,awayRuns:8,homeRuns:3});fixture.day++;revision++;await new Promise(r=>setTimeout(r,350));data={request_id:JSON.parse(req.postData()).requestId,rev:revision,...(advances===1?{wireDelta:{fromRevision:revision-1,toRevision:revision,set:native?packNativeSave(fixture):{day:fixture.day,gameResults:fixture.gameResults},unset:[]}}:{}),day:{timing:{engineMs:20,packMs:10,changedFields:1,totalFields:10}}};if(native&&data.wireDelta){delete data.wireDelta.set.day;data.wireDelta.patches={day:[['set',[],fixture.day]]}}}
   else{writes++;return route.fulfill({status:500,headers:{'access-control-allow-origin':'*'},body:'{}'})}
   return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  });
  async function assertAutoReading(){
  const autoStart=advances;
  await page.evaluate(()=>{window.scrollTo(0,400);document.querySelector('main.game-shell').dataset.autoHome='kept'});
  const homeReadingTop=await page.evaluate(()=>window.scrollY),homeRevision=revision;
  await page.locator('#auto-season').evaluate(button=>button.click());
  await page.waitForFunction(start=>Number(window.beServerGameCapability?.revision)>=start+1,homeRevision,{timeout:15000});
  assert.equal(await page.locator('main[data-view="home"][data-auto-home="kept"]').count(),1,'starting and completing automatic days must not redraw the home page');
  assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-homeReadingTop)<=2,'automatic start and day completion do not move home scroll');
  await page.locator('nav [data-tab="roster"]').click();
  await page.waitForSelector('main[data-view="roster"]');
  await page.evaluate(()=>{window.scrollTo(0,400);document.querySelector('main.game-shell').dataset.autoReading='kept'});
  const readingTop=await page.evaluate(()=>window.scrollY);assert.ok(readingTop>100,'fixture can scroll while browsing the roster');
  await page.waitForFunction(start=>Number(window.beServerGameCapability?.revision)>=start+2,revision,{timeout:15000});
  assert.ok(advances>=autoStart+2,'automatic requests continue after changing tabs');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'automatic progress control fits the viewport');
  assert.equal(await page.locator('main[data-view="roster"][data-auto-reading="kept"]').count(),1,'day completion must not replace the page being read');
  assert.equal(await page.locator('nav [data-tab="roster"]').getAttribute('aria-current'),'page');
  assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-readingTop)<=2,'day completion preserves the reading scroll position');
  await page.locator('#be-auto-progress').evaluate(button=>button.click());
  const settled=advances;await page.waitForTimeout(1000);assert.ok(advances<=settled+1,'stop from the roster prevents further automatic requests');
  assert.equal(await page.locator('main[data-view="roster"]').count(),1);assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-readingTop)<=2);
  }
  await page.goto('http://127.0.0.1:'+server.address().port+(process.argv.includes('--main')?'/index.html':'/server-game-preview.html'));
  await page.waitForSelector('#advance-day',{timeout:30000});
  assert.equal(await page.evaluate(()=>window.__clientSimulationCalls),0);
  assert.ok((await page.locator('#be-preparation-status').textContent()).includes('준비 완료'));
  if(!fixturePath){
   assert.equal(await page.locator('.be-cal-day.is-today.is-selected').count(),1,'calendar today matches the completed date');
   const card=page.locator('.be-calendar-match-list .be-today-match').filter({hasText:'원정 선발'}).first();
   await card.waitFor();assert.ok((await card.textContent()).includes('홈 선발'));
   assert.ok(!(await card.textContent()).includes('경기 종료'));
   assert.ok((await card.boundingBox()).height<115,'completed card stays compact');
   const centered=await card.evaluate(el=>{const box=el.getBoundingClientRect(),buttons=[...el.querySelectorAll('.be-today-actions button')].map(b=>b.getBoundingClientRect());return buttons.length===2&&Math.abs((buttons[0].left+buttons[1].right)/2-(box.left+box.right)/2)<3});
   assert.equal(centered,true,'replay and article buttons are centered in the game card');
  }

  for(const tab of ['roster','news','league','fa','national','home']){
   await page.locator('nav [data-tab="'+tab+'"]').click();
   await page.waitForSelector('main[data-view="'+tab+'"]',{timeout:30000});
  }
  await page.locator('nav [data-tab="league"]').click();
  await page.locator('[data-league-pane="history"]').click();
  await page.waitForSelector('.record-room.career-leaders');
  if(!fixturePath){
   assert.equal(await page.locator('.record-leader-hero').count(),1);
   assert.equal(await page.locator('.career-leader-tabs [data-career-metric]').count(),13);
   await page.locator('[data-career-metric="투수:pitchingWins"]').click();
   await page.waitForSelector('.record-leader-hero');
   if(process.env.BE_UI_SCREENSHOT)await page.screenshot({path:process.env.BE_UI_SCREENSHOT.replace('.png','-career.png')});
   await page.locator('.record-leader-profile').click();await page.waitForSelector('#player-overlay');await page.click('#close-player');
  }
  await page.locator('[data-history-pane="season"]').click();
  assert.equal(await page.locator('.record-stat-card').count(),4);
  if(process.env.BE_UI_SCREENSHOT)await page.screenshot({path:process.env.BE_UI_SCREENSHOT.replace('.png','-season.png')});
  const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(horizontalOverflow,false,'record layouts fit the viewport');
  await page.locator('[data-league-pane="standings"]').click();
  const assertFullViewport=async selector=>{
   const box=await page.locator(selector).boundingBox(),viewport=page.viewportSize();
   assert.ok(Math.abs(box.x)<1&&Math.abs(box.y)<1,selector+' starts at viewport origin');
   assert.ok(Math.abs(box.width-viewport.width)<1&&Math.abs(box.height-viewport.height)<1,selector+' fills viewport '+JSON.stringify({box,viewport}));
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden');
  };
  if(!fixturePath){
   await page.locator('nav [data-tab="fa"]').click();
   await page.locator('.overseas-player-card').first().click();await page.waitForSelector('#player-overlay');
   await assertFullViewport('#player-overlay .player-panel');
   assert.match(await page.locator('[data-profile-pane="overseas"]').textContent(),/3.12/);
   await page.locator('[data-profile-tab="domestic"]').click();
   assert.match(await page.locator('[data-profile-pane="domestic"]').textContent(),/130/);
   await page.locator('[data-profile-tab="transfer"]').click();
   assert.match(await page.locator('[data-profile-pane="transfer"]').textContent(),/Test Overseas Club/);
   await page.click('#close-player');
  }
  await page.locator('nav [data-tab="league"]').click();
  await page.locator('[data-league-team]').first().click();
  await assertFullViewport('#league-team-overlay .league-club-dialog');
  await page.click('#close-league-team');
  await page.locator('nav [data-tab="roster"]').click();
  await page.waitForSelector('[data-player]');
  const candidate=!fixturePath?fixture.players.find(p=>String(p.teamId)===String(fixture.teamId)&&p.position==='P'&&!p.foreignPlayer):null;
  const player=candidate?page.locator('[data-player="'+candidate.id+'"]').first():page.locator('[data-player]').first(),playerId=await player.getAttribute('data-player');
  await player.click();await page.waitForSelector('#player-overlay');
  await assertFullViewport('#player-overlay .player-panel');
  await page.locator('[data-profile-tab="career"]').click();
  assert.ok(!(await page.locator('[data-profile-pane="career"]').textContent()).includes('체력 관리'));
  assert.ok(await page.locator('.be-contract-progress').count()>0);
  assert.ok(await page.locator('.be-contract-progress').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).backgroundColor==='rgb(255, 255, 255)')));
  assert.equal(await page.locator('#player-scout-lazy [class]').count(),0,'hidden evaluation work is not built while opening a player');
  assert.equal(await page.locator('details[data-player-lazy="milestones"]').getAttribute('data-loaded'),null,'collapsed career records are deferred');
  await page.locator('[data-profile-tab="scout"]').click();
  const development=page.locator('.pitch-development-history');
  if(await development.count())assert.equal(await development.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
  await page.locator('[data-profile-tab="record"]').click();
  assert.match(await page.locator('#player-record-lazy').textContent(),/1군 시즌 기록/);
  if(!fixturePath){const cells=page.locator('.season-record-table tbody tr:not(.career-total-row) :is(td,th)');assert.ok(await cells.count()>0);assert.ok(await cells.evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor==='rgb(255, 255, 255)')),'all season table body cells are white');}
  if(process.env.BE_UI_SCREENSHOT)await page.screenshot({path:process.env.BE_UI_SCREENSHOT});
  const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=10;c.height=10;c.getContext('2d').fillRect(0,0,10,10);return c.toDataURL('image/jpeg').split(',')[1]});
  const confirmedPhoto=await page.evaluate(async({playerId,photo})=>{const next=await window.beExecuteServerGameCommand({type:'player-photo',playerId,photo:'data:image/jpeg;base64,'+photo});return next.players.find(p=>String(p.id)===playerId).profile.photoData},{playerId,photo});
  assert.match(confirmedPhoto,/^data:image\/jpeg;base64,/);
  assert.equal(commands,1);assert.ok(fixture.players.find(p=>String(p.id)===playerId).profile.photoData);
  await page.click('#close-player');await page.locator('nav [data-tab="home"]').click();
  const priorDate=await page.locator('.header-season').textContent();
  const readsBeforeDay=snapshotReads;
  await page.click('#advance-day');
  await page.waitForFunction(()=>document.querySelector('#advance-day').textContent.includes('초'));
  await page.waitForFunction(()=>window.beNewsDay!==undefined||document.querySelector('.header-season')?.textContent.includes('2027'),null,{timeout:10000});
  await page.waitForFunction(()=>!document.querySelector('#advance-day').disabled);
  assert.notEqual(await page.locator('.header-season').textContent(),priorDate);
  assert.equal(snapshotReads,readsBeforeDay,'day response avoids a full save download');
  assert.equal(await page.locator('.be-server-day-timing').count(),1);
  assert.equal(await page.evaluate(()=>window.beLastServerDayTiming.incremental),true);
  assert.equal(advances,1);assert.equal(revision,3);assert.equal(writes,0);
  if(!fixturePath){const today=page.locator('.be-calendar-match-list .be-today-match').filter({hasText:'원정 선발'}).first();await today.waitFor();assert.ok((await today.textContent()).includes('8 : 3'));assert.equal(await today.getByRole('button',{name:'경기 다시보기',exact:true}).count(),1);assert.equal(await today.getByRole('button',{name:'경기 기사',exact:true}).count(),1);assert.equal(await page.locator('.be-cal-day.is-today.is-selected').count(),1);}
  const readsBeforeFallback=snapshotReads;
  await page.click('#advance-day');
  await page.waitForFunction(()=>window.beServerGameCapability?.revision===4);
  await page.waitForFunction(()=>!document.querySelector('#advance-day').disabled);
  assert.equal(snapshotReads,readsBeforeFallback+1,'older or replayed responses safely reload the snapshot');
  assert.equal(await page.evaluate(()=>window.beLastServerDayTiming.incremental),false);
  assert.equal(advances,2);assert.equal(writes,0);
  if(process.argv.includes('--player-pressure')){await assertAutoReading();assert.deepEqual(errors,[]);console.log(JSON.stringify(await page.evaluate(()=>({stage:'synthetic-player-navigation',renders:window.__playerRenderTimes,playerDialogs:window.__playerDetailTimes}))));console.log('Mobile 3400-player navigation, player details, photo, day and automatic-reading pressure PASS');return;}
  await page.click('#back-to-title');await page.click('#be-cloud-reset');
  await page.waitForSelector('#entry-new');await page.click('#entry-new');await page.click('#start');
  await page.waitForSelector('#advance-day');await page.waitForFunction(()=>window.beServerGameCapability?.revision===6);
  assert.equal(lifecycle,2);assert.equal(fixture.day,startingWorld.day);
  const backup=structuredClone(startingWorld);backup.day=30;
  const beforeRestore=await page.locator('.header-season').textContent();
  await page.locator('#restore').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.waitForFunction(()=>window.beServerGameCapability?.revision===7);
  assert.equal(lifecycle,3);assert.equal(fixture.day,30);assert.equal(writes,0);
  await page.waitForFunction(old=>document.querySelector('.header-season').textContent!==old,beforeRestore);
  await assertAutoReading();
  assert.equal(await page.evaluate(()=>window.__clientSimulationCalls),0);
  assert.deepEqual(errors,[]);
  console.log((process.argv.includes('--desktop')?'Original desktop UI:':'Original mobile UI:')+' six tabs, player records/photo, server day, archived reset/new-game/restore routing, zero client simulation/save uploads PASS');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
