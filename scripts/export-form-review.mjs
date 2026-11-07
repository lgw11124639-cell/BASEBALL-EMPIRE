// Render the actual review player to standalone motion files. No crossfades/interpolation.
import{chromium}from'playwright';import{writeFileSync,mkdtempSync,mkdirSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{execFileSync}from'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'be-form-motion-')),root='assets/broadcast/form-review',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1360,height:1100}});
try{
 await page.goto((process.env.BE_REVIEW_BASEURL||'http://127.0.0.1:4173')+'/broadcast-forms.html?motion73');
 await page.waitForFunction(()=>window.beFormPlayers?.size===4&&[...window.beFormPlayers.values()].every(p=>p.ready));await page.evaluate(()=>window.beFormPlayers.forEach(p=>p.pause()));
 const durations=await page.evaluate(async()=>(await import(new URL('broadcast-form-player.mjs?v=motion73',location.href))).durations),seconds=durations.reduce((a,b)=>a+b,0)/1000;
 for(const key of ['overhand','threequarter','sidearm','submarine']){
  const work=join(dir,key);mkdirSync(work);let list='ffconcat version 1.0\n';
  for(let i=0;i<10;i++){const data=await page.evaluate(({key,i})=>{const p=window.beFormPlayers.get(key);p.seek(i);return p.canvas.toDataURL('image/png')},{key,i}),path=join(work,i+'.png');writeFileSync(path,Buffer.from(data.split(',')[1],'base64'));list+="file '"+path+"'\nduration "+durations[i]/1000+'\n';}
  list+="file '"+join(work,'9.png')+"'\n";const concat=join(work,'frames.txt');writeFileSync(concat,list);
  execFileSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',concat,'-t',String(seconds),'-vf','scale=512:-2:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=1','-fps_mode','cfr','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',root+'/'+key+'-motion.mp4']);
  execFileSync('ffmpeg',['-y','-loglevel','error','-i',root+'/'+key+'-motion.mp4','-filter_complex','fps=15,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',root+'/'+key+'-motion.gif']);console.log('Exported',key,seconds+'s', '10 whole frames');
 }
 await page.evaluate(()=>document.body.classList.add('exporting'));
 for(const key of ['overhand','threequarter','sidearm','submarine']){const path=join(dir,key+'-board.png');await page.locator('#'+key).screenshot({path});execFileSync('magick',[path,'-quality','95',root+'/'+key+'-board.webp']);}
}finally{await browser.close();}
