const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const source=fs.readFileSync('app.js','utf8'),harness=source.slice(0,source.lastIndexOf('(async()=>')).replace(/^import .*;\s*$/m,'')+`
state=world(0);state.gameResults=[];
const pitch=call=>({call,type:'직구',velocity:145,zoneX:50,zoneY:50}),event=(inning,side,id,calls,before,after,outcome,bases=[],afterBases=[])=>({inning,side,batterId:id,batter:'타자'+id,pitcher:'투수',score:0,outsBefore:before,outsAfter:after,outcome,bases,afterBases,pitches:calls.length,pitchSequence:calls.map((c,i)=>({...pitch(c),number:i+1}))});
const game={day:1,away:0,home:1,awayRuns:0,homeRuns:0,awayInnings:[0,0],homeInnings:[0],awayBatters:[],homeBatters:[],awayPitchers:[],homePitchers:[],broadcastEvents:[
 event(1,'away',101,['볼','루킹 스트라이크','헛스윙','파울','파울','볼','볼','볼넷'],0,0,'볼넷',[],[101,null,null]),
 event(1,'away',102,['루킹 스트라이크','헛스윙','헛스윙 삼진'],0,1,'삼진',[101,null,null],[101,null,null]),
 event(1,'away',103,['사구'],1,1,'사구',[101,null,null],[103,101,null]),
 event(1,'away',104,['인플레이'],1,3,'병살타',[103,101,null],[]),
 event(1,'home',201,['볼','볼','볼','볼넷'],0,0,'볼넷',[],[201,null,null]),
 event(1,'home',202,['인플레이'],0,1,'뜬공 아웃',[201,null,null],[201,null,null]),
 event(1,'home',203,['인플레이'],1,2,'뜬공 아웃',[201,null,null],[201,null,null]),
 {...event(1,'home',201,[],2,3,'도루 실패',[201,null,null],[]),eventType:'baserunning',runner:'주자201',runnerId:201,fromBase:1,toBase:2},
 event(2,'away',105,['인플레이'],0,0,'안타',[],[105,null,null]),
 {...event(2,'away',105,[],0,0,'도루 성공',[105,null,null],[null,105,null]),eventType:'baserunning',runner:'주자105',runnerId:105,fromBase:1,toBase:2}
]};window.fixture={open(){beOpenGameReplay(1,0,game)},snapshot(){return JSON.stringify(game)}};`;
(async()=>{
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(name==='app.js'){res.setHeader('Content-Type','text/javascript');return res.end(harness)}if(name==='update.js')return res.end('');const file=path.resolve(name);if(!file.startsWith(process.cwd()+path.sep)){res.writeHead(404);return res.end()}try{res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html':'application/json');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1080,390,320]){
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>!!window.fixture);const original=await page.evaluate(()=>fixture.snapshot());await page.evaluate(()=>fixture.open());
  const advance=()=>page.evaluate(()=>document.querySelector('#be-replay-next').click());
  const check=async(b,s,o)=>{const actual=await page.locator('#be-count-lamps').evaluate(el=>({label:el.getAttribute('aria-label'),groups:[...el.children].map(group=>[...group.querySelectorAll('i')].map(dot=>({on:dot.classList.contains('on'),bg:getComputedStyle(dot).backgroundColor})))}));assert.equal(actual.label,b+'볼 '+s+'스트라이크 '+o+'아웃');assert.deepEqual(actual.groups.map(g=>g.filter(x=>x.on).length),[Math.min(3,b),Math.min(2,s),Math.min(2,o)]);for(const g of actual.groups){const lit=g.find(x=>x.on),off=g.find(x=>!x.on);if(lit&&off)assert.notEqual(lit.bg,off.bg,'a lit lamp visibly changes color');}assert.match(await page.locator('#be-replay-count').innerText(),new RegExp(o+'아웃'));};
  for(const [b,s] of [[1,0],[1,1],[1,2],[1,2],[1,2],[2,2],[3,2],[4,2]]){await advance();await check(b,s,0)}
  await advance();await check(0,0,0);assert.equal(await page.locator('#be-base-1.on').count(),1,'walk puts a runner on first');
  for(const s of [1,2,3]){await advance();await check(0,s,0)}await advance();await check(0,0,1);
  await advance();await check(0,0,1);await advance();await check(0,0,1);assert.equal(await page.locator('.be-diamond-base.on').count(),2,'HBP advances actual forced bases');
  await advance();await check(0,0,1);await advance();await check(0,0,3);assert.match(await page.locator('#be-replay-lines > :first-child').innerText(),/병살타/);await page.screenshot({path:'/tmp/baseball-broadcast-third-out-'+width+'.png'});
  await advance();await check(1,0,0);assert.match(await page.locator('#be-replay-inning').innerText(),/1회 말/);assert.equal(await page.locator('.be-diamond-base.on').count(),0,'new half clears bases');assert.match(await page.locator('#be-replay-lines').innerText(),/공수교대/);
  for(const b of [2,3,4]){await advance();await check(b,0,0)}await advance();await check(0,0,0);
  for(const outs of [1,2]){await advance();await advance();await check(0,0,outs)}
  await advance();await check(0,0,3);assert.match(await page.locator('#be-replay-lines > :first-child').innerText(),/주자201.*도루 실패/);assert.doesNotMatch(await page.locator('#be-replay-lines > :first-child').innerText(),/타석 결과/);
  await advance();await check(0,0,0);await advance();await check(0,0,0);await advance();await check(0,0,0);assert.equal(await page.locator('#be-base-2.on').count(),1,'successful steal moves diamond to second');assert.match(await page.locator('#be-replay-lines > :first-child').innerText(),/도루 성공/);assert.equal(await page.locator('#be-replay-next').isDisabled(),true);assert.equal(await page.evaluate(()=>fixture.snapshot()),original,'viewing replay preserves all saved records');assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/baseball-broadcast-counts-'+width+'.png'});await page.close();console.log('PASS visible B/S/O lamps, legacy counts, foul/walk/K/HBP/DP, third-out and half reset, SB/CS '+width);
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
