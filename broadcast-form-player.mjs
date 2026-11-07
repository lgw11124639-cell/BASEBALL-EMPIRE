// Ten whole photographs, registered to the support shoe. No blending or limb compositing.
export const durations=[600,200,300,240,180,120,100,200,220,500];
const starts=durations.map((_,i)=>durations.slice(0,i).reduce((a,b)=>a+b,0)),total=durations.reduce((a,b)=>a+b,0);
const labels=['준비','초기 들기 · 오른쪽 비틀기','최고점 · 오른쪽 비틀기','스트라이드 · 손 분리','착지 · 코킹','릴리스','초기 팔로스루','팔로스루','감속','균형 회복'];
const cache=new Map();
function analyze(img){
 if(cache.has(img.src))return cache.get(img.src);
 const factor=img.naturalWidth>600?355/img.naturalWidth:1,w=Math.round(img.naturalWidth*factor),h=Math.round(img.naturalHeight*factor),c=document.createElement('canvas');c.width=w;c.height=h;
 const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);const data=x.getImageData(0,0,w,h).data,seen=new Uint8Array(w*h),queue=new Int32Array(w*h),shoes=[],y0=Math.floor(h*.64);
 const dark=i=>data[i*4+3]>180&&Math.max(data[i*4],data[i*4+1],data[i*4+2])<115;
 for(let y=y0;y<h;y++)for(let px=0;px<w;px++){
  const seed=y*w+px;if(seen[seed]||!dark(seed))continue;let head=0,tail=1,minX=px,maxX=px,maxY=y;queue[0]=seed;seen[seed]=1;
  while(head<tail){const at=queue[head++],ax=at%w,ay=Math.floor(at/w);minX=Math.min(minX,ax);maxX=Math.max(maxX,ax);maxY=Math.max(maxY,ay);
   for(const n of [ax?at-1:-1,ax<w-1?at+1:-1,ay>y0?at-w:-1,ay<h-1?at+w:-1])if(n>=0&&!seen[n]&&dark(n)){seen[n]=1;queue[tail++]=n;}
  }
  if(tail<24||maxX-minX<12||maxY<h*.73)continue;let sum=0,count=0;for(let i=0;i<tail;i++){const at=queue[i];if(Math.floor(at/w)>=maxY-2){sum+=at%w;count++;}}shoes.push({x:sum/count,y:maxY,area:tail});
 }
 if(!shoes.length)throw Error('발 위치를 확인할 수 없습니다: '+img.src);
 // The top-left quarter contains only the printed step number and empty studio backdrop.
 const cornerW=Math.floor(w*.23),cornerH=Math.floor(h*.27),clean=x.getImageData(0,0,w,h);
 for(let px=0;px<cornerW;px++)for(let py=0;py<cornerH;py++)for(let ch=0;ch<3;ch++){const top=data[px*4+ch],bottom=data[(cornerH*w+px)*4+ch];clean.data[(py*w+px)*4+ch]=Math.round(top+(bottom-top)*py/cornerH);}
 x.putImageData(clean,0,0);
 shoes.sort((a,b)=>a.x-b.x);const left=shoes[0],right=shoes.at(-1),lowest=shoes.reduce((a,b)=>a.y>b.y?a:b),out={img:c,source:img.src,w,h,left,right,lowest,shoes};cache.set(img.src,out);return out;
}
export class FormPlayer{
 constructor(section,name,onPlay){
  this.section=section;this.name=name;this.onPlay=onPlay;this.playing=false;this.elapsed=0;this.index=0;this.rate=1;this.last=null;this.raf=null;
  const host=document.createElement('div');host.className='motion-player';host.innerHTML=`<canvas width="720" height="800" aria-label="${name} 애니메이션"></canvas><div class="motion-tools"><p class="motion-status" role="status">동작을 불러오는 중…</p><div class="motion-actions"><button type="button" data-action="previous" disabled aria-label="이전 동작">◀ 이전</button><button type="button" data-action="play" disabled aria-pressed="false">▶ 재생</button><button type="button" data-action="next" disabled aria-label="다음 동작">다음 ▶</button></div><label class="motion-range-label">구분동작 <output>1 / 10</output><input type="range" min="0" max="9" step="1" value="0" aria-label="${name} 구분동작"></label><label class="motion-speed">속도 <select aria-label="${name} 재생 속도"><option value="1">1배</option><option value="2">2배</option><option value="3">3배</option></select></label><p class="motion-note">오른발 지지 → 왼발 착지 · 파란 손목은 공을 던지는 오른손</p></div>`;
  section.insertBefore(host,section.querySelector('.steps'));this.host=host;this.canvas=host.querySelector('canvas');this.ctx=this.canvas.getContext('2d');this.button=host.querySelector('[data-action=play]');this.range=host.querySelector('input');this.status=host.querySelector('.motion-status');this.output=host.querySelector('output');
  this.button.onclick=()=>this.playing?this.pause():this.play();host.querySelector('[data-action=previous]').onclick=()=>{this.pause();this.seek((this.index+9)%10);};host.querySelector('[data-action=next]').onclick=()=>{this.pause();this.seek((this.index+1)%10);};this.range.oninput=()=>{this.pause();this.seek(Number(this.range.value));};host.querySelector('select').onchange=e=>{this.rate=Number(e.target.value);this.last=null;};
 }
 async init(){
  const images=[...this.section.querySelectorAll('.pose img')];await Promise.all(images.map(i=>i.decode()));this.frames=images.map(analyze);images.forEach((img,i)=>{const clean=document.createElement('canvas'),frame=this.frames[i];clean.width=frame.w;clean.height=frame.h;clean.className='single';clean.setAttribute('role','img');clean.setAttribute('aria-label',img.alt);clean.getContext('2d').drawImage(frame.img,0,0);img.hidden=true;img.style.display='none';img.parentElement.append(clean);});this.releaseIndex=this.section.id==='submarine'?6:5;const plant=this.frames[this.releaseIndex-1];this.land=[450+(plant.left.x-plant.right.x)*1.5,700+(plant.left.y-plant.right.y)*1.5];this.ready=true;this.seek(0);this.host.querySelectorAll('button').forEach(b=>b.disabled=false);return this;
 }
 draw(index){
  const label=this.section.id==='submarine'?['준비','초기 들기 · 오른쪽 비틀기','최고점 · 오른쪽 비틀기','왼다리 내리기 · 중심 이동','스트라이드 · 손 분리 · 몸 낮추기','왼발 착지 · 낮은 코킹','낮은 릴리스','팔로스루','감속','균형 회복'][index]:labels[index];
  const f=this.frames[index],support=index<this.releaseIndex?(index>=1&&index<=(this.section.id==='submarine'?3:2)?f.lowest:f.right):f.left,target=index<this.releaseIndex?[450,700]:this.land,s=1.5,dx=target[0]-support.x*s,dy=target[1]-support.y*s,w=f.w*s,h=f.h*s,c=this.ctx;
  c.globalAlpha=1;c.clearRect(0,0,720,800);c.fillStyle='#dedee3';c.fillRect(0,0,720,800);
  // Extend the empty studio backdrop to the viewport edges; no moving photo rectangles.
  const xs=[{s:0,n:1,d:0,l:dx},{s:0,n:f.w,d:dx,l:w},{s:f.w-1,n:1,d:dx+w,l:720-dx-w}],ys=[{s:0,n:1,d:0,l:dy},{s:0,n:f.h,d:dy,l:h},{s:f.h-1,n:1,d:dy+h,l:800-dy-h}];
  for(const a of xs)for(const b of ys)if(a.l>0&&b.l>0)c.drawImage(f.img,a.s,b.s,a.n,b.n,a.d,b.d,a.l,b.l);
  c.fillStyle='rgba(242,245,248,.94)';c.fillRect(0,0,720,92);c.fillRect(0,740,720,60);
  c.fillStyle='#f9fafb';c.strokeStyle='#a8adb3';c.lineWidth=1;c.fillRect(412,704,76,6);c.strokeRect(412,704,76,6);
  c.fillStyle='#173345';c.font='600 26px system-ui';c.fillText(this.name,26,42);c.font='17px system-ui';c.fillStyle='#526b7c';c.fillText('우투 · 10단계 동작',26,70);c.font='600 20px system-ui';c.fillStyle='#173345';c.fillText(String(index+1).padStart(2,'0')+'  '+label,26,770);
  this.index=index;this.canvas.dataset.step=String(index+1);this.host.dataset.step=String(index+1);this.range.value=String(index);this.output.value=(index+1)+' / 10';this.status.textContent=(index+1)+'번 · '+label;this.registration={support:index<this.releaseIndex?'right':'left',point:[...target],source:[support.x,support.y],offset:[dx,dy],scale:s};
 }
 seek(index){if(!this.ready)return;this.elapsed=starts[index];this.last=null;this.draw(index);}
 tick=now=>{if(!this.playing)return;if(this.last!=null)this.elapsed=(this.elapsed+(now-this.last)*this.rate)%total;this.last=now;let i=starts.findLastIndex(t=>this.elapsed>=t);if(i!==this.index)this.draw(i);this.raf=requestAnimationFrame(this.tick);};
 play(){if(!this.ready||this.playing)return;this.onPlay(this);this.playing=true;this.last=null;this.button.textContent='❚❚ 일시정지';this.button.setAttribute('aria-pressed','true');this.raf=requestAnimationFrame(this.tick);}
 pause(){this.playing=false;if(this.raf!=null)cancelAnimationFrame(this.raf);this.raf=null;this.last=null;this.button.textContent='▶ 재생';this.button.setAttribute('aria-pressed','false');}
 inspect(){return {step:this.index+1,playing:this.playing,registration:this.registration,source:this.frames[this.index].source,wholeFrame:true,opacity:1};}
}
const players=new Map();window.beFormPlayers=players;
await Promise.all([...document.querySelectorAll('#boards>section')].map(async section=>{const player=new FormPlayer(section,section.querySelector('h2').textContent,current=>players.forEach(other=>{if(other!==current)other.pause();}));players.set(section.id,player);try{await player.init();}catch(error){player.status.textContent='동작 이미지를 불러오지 못했어요';console.error(error);}}));
const key=location.hash.slice(1),initial=players.get(key)||players.get('overhand');if(key&&players.has(key))document.getElementById(key).scrollIntoView();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)initial?.play();document.addEventListener('visibilitychange',()=>{if(document.hidden)players.forEach(p=>p.pause());});
