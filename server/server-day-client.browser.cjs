const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const root=resolve(__dirname,'..');
 const server=createServer((req,res)=>{const name=req.url.split('?')[0].slice(1);if(!['server-engine-preview.html','server-day-client.js'].includes(name)){res.writeHead(404);return res.end()};res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(readFileSync(resolve(root,name)))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  await page.addInitScript(()=>localStorage.setItem('be-cloud-session-v1',JSON.stringify({username:'test',token:'a'.repeat(64),expiresAt:Date.now()+60000})));
  let revision=1,day=79,posts=[];
  await page.route('https://baseball-empire-save.duckdns.org/**',async route=>{
   const req=route.request();let body;
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST','access-control-allow-headers':'authorization,content-type,if-match'}});
   if(req.url().endsWith('/v2/engine/status'))body={enabled:true,canAdvance:true,revision};
   else if(req.url().endsWith('/v2/view/home'))body={revision,day,year:2046,teamId:0,team:{id:0,name:'Test club',wins:1,losses:0,draws:0,fans:100},updatedAt:'test'};
   else{posts.push({body:req.postData(),revision:req.headers()['if-match']});if(posts.length===1)return route.abort('failed');revision=2;day=80;body={request_id:JSON.parse(req.postData()).requestId,rev:2}}
   return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/server-engine-preview.html');
  await page.waitForFunction(()=>!document.querySelector('#advance').disabled);
  await page.click('#advance');
  await page.waitForFunction(()=>document.querySelector('#advance').textContent.includes('재시도'));
  // Reload loses all in-memory state; request metadata must survive.
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#advance').disabled);
  assert.match(await page.locator('#advance').textContent(),/재시도/);
  await page.click('#advance');await page.waitForFunction(()=>document.querySelector('#day').textContent==='80');
  assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);
  assert.equal(await page.locator('#revision').textContent(),'2');
  assert.equal(await page.locator('#advance').textContent(),'하루 진행');
  console.log('Mobile browser: lost-response reload retry and server refresh PASS');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
