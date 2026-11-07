// Package complete authored wardrobe figures. Never recolors, mirrors or assembles limbs.
import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';
import{execFileSync}from'node:child_process';
import{createHash}from'node:crypto';
const dir='assets/broadcast/motion/pitcher-ten',tile=384,columns=10,rows=4,anchor=[144,360],landing=[248,342],hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');mkdirSync(dir,{recursive:true});
const manifestFile=dir+'/manifest.json';let m=existsSync(manifestFile)?JSON.parse(readFileSync(manifestFile)):{version:5,tile,columns,rows,framesPerDelivery:10,anchor,landing,keyFrames:Array.from({length:10},(_,i)=>i),releaseFrame:6,framePhases:[0,.35,1,1.35,1.85,2.5,3,3.25,3.65,4],body:'tall slender lean; one constant source scale per delivery',interpolation:'none; atomic complete-frame replacement',clubs:[],nations:{}};
const entries=readFileSync(process.argv[2],'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(e=>!process.env.BE_UNIFORM_KEY||String(e.key)===process.env.BE_UNIFORM_KEY);
for(const {key,path}of entries){
 if(!process.env.BE_REPACK&&(m.clubs[key]?.sourceSha256===hash(path)||m.nations[key]?.sourceSha256===hash(path)))continue;
 const work='/tmp/be-ten-'+key;mkdirSync(work,{recursive:true});const matte=work+'/foreground.png',normalized=work+'/cells.png',coarse=work+'/coarse.png';
 // Authored sheets have whitespace between figures, not exact arithmetic grid lines.
 // Find those gaps before foreground extraction so no shoe/hand is cut at a cell edge.
 const [iw,ih]=execFileSync('magick',['identify','-format','%w %h',path],{encoding:'utf8'}).split(' ').map(Number),rgb=execFileSync('magick',[path,'-depth','8','rgb:-'],{maxBuffer:40*1024*1024}),foreground=(x,y)=>{const at=(y*iw+x)*3,r=rgb[at],g=rgb[at+1],b=rgb[at+2];return Math.max(r,g,b)<155||Math.max(r,g,b)-Math.min(r,g,b)>27;};
 function gap(expected,radius,limit,count){const start=Math.max(1,Math.round(expected-radius)),end=Math.min(limit-2,Math.round(expected+radius)),values=[];let min=Infinity;for(let p=start;p<=end;p++){const n=count(p);values.push([p,n]);min=Math.min(min,n);}const groups=[];for(const[p,n]of values){if(n>min+1)continue;const last=groups.at(-1);if(last&&p===last.at(-1)+1)last.push(p);else groups.push([p]);}groups.sort((a,b)=>(b.length-a.length)||Math.abs((a[0]+a.at(-1))/2-expected)-Math.abs((b[0]+b.at(-1))/2-expected));const best=groups[0];return Math.round((best[0]+best.at(-1))/2);}
 const ye=[0];for(let row=1;row<4;row++)ye.push(gap(row*ih/4,ih/4*.23,ih,y=>{let n=0;for(let x=0;x<iw;x++)if(foreground(x,y))n++;return n;}));ye.push(ih);
 const canonical=Buffer.alloc(3200*1280*3,232),cellBounds=[];
 for(let row=0;row<4;row++){const xe=[0];for(let col=1;col<10;col++)xe.push(gap(col*iw/10,iw/10*.32,iw,x=>{let n=0;for(let y=ye[row];y<ye[row+1];y++)if(foreground(x,y))n++;return n;}));xe.push(iw);cellBounds[row]=[];for(let col=0;col<10;col++){const left=Math.max(0,xe[col]-36),right=Math.min(iw,xe[col+1]+36),top=Math.max(0,ye[row]-12),bottom=Math.min(ih,ye[row+1]+12),cw=right-left,ch=bottom-top;if(cw>320||ch>320)throw Error('Unexpected authored cell '+key+'/'+row+'/'+col);const dx=col*320+Math.floor((320-cw)/2),dy=row*320+Math.floor((320-ch)/2);for(let y=0;y<ch;y++)rgb.copy(canonical,((dy+y)*3200+dx)*3,((top+y)*iw+left)*3,((top+y)*iw+right)*3);cellBounds[row].push([left,top,cw,ch]);}}
 execFileSync('magick',['-size','3200x1280','-depth','8','rgb:-',normalized],{input:canonical,maxBuffer:40*1024*1024});
 writeFileSync(work+'/cells-meta.json',JSON.stringify(cellBounds));
 const coarseHash=work+'/coarse.sha256',inputHash=hash(normalized)+'-u2netp224-v1';
 if(!existsSync(coarse)||!existsSync(coarseHash)||readFileSync(coarseHash,'utf8')!==inputHash){execFileSync(process.env.BE_FOREGROUND||'/tmp/be-segment-ten-224',['/tmp/be-u2netp.onnx',normalized,coarse,'10','4']);writeFileSync(coarseHash,inputHash);}
 execFileSync(process.env.BE_MATTE_PYTHON||'/workspace/.be-matting-venv/bin/python',['scripts/refine-ten-pitcher-alpha.py',normalized,coarse,matte,process.env.BE_REFINEMENT_MODEL||'/tmp/be-rmbg14-quant.onnx'],{maxBuffer:4*1024*1024});
 const [w,h]=execFileSync('magick',['identify','-format','%w %h',matte],{encoding:'utf8'}).split(' ').map(Number),pixels=execFileSync('magick',[matte,'-depth','8','rgba:-'],{maxBuffer:40*1024*1024});
 const frames=[];
 for(let row=0;row<rows;row++)for(let f=0;f<columns;f++){
  const x0=Math.round(f*w/columns),x1=Math.round((f+1)*w/columns),y0=Math.round(row*h/rows),y1=Math.round((row+1)*h/rows),cw=x1-x0,ch=y1-y0,raw=Buffer.alloc(cw*ch*4);
  for(let y=0;y<ch;y++)pixels.copy(raw,y*cw*4,((y0+y)*w+x0)*4,((y0+y)*w+x1)*4);
  const at=(x,y)=>((y*cw+x)*4),dark=(x,y)=>{const p=at(x,y);return raw[p+3]>180&&Math.max(raw[p],raw[p+1],raw[p+2])<135;};
  let top=ch,bottom=0,left=cw,right=0;
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)if(raw[at(x,y)+3]>160){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
  if(bottom-top<45)throw Error('Missing complete body '+key+'/'+row+'/'+f);
  const seen=new Set(),shoes=[];
  for(let y=Math.round(ch*.64);y<ch;y++)for(let x=0;x<cw;x++){
   const id=y*cw+x;if(seen.has(id)||!dark(x,y))continue;seen.add(id);const q=[[x,y]],pts=[];
   for(let i=0;i<q.length;i++){const[a,b]=q[i];pts.push([a,b]);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=a+dx,ny=b+dy,n=ny*cw+nx;if(nx<0||nx>=cw||ny<ch*.64||ny>=ch||seen.has(n)||!dark(nx,ny))continue;seen.add(n);q.push([nx,ny]);}}
   const low=Math.max(...pts.map(p=>p[1]));if(pts.length<5||low<bottom-20)continue;const sole=pts.filter(p=>p[1]>=low-2).map(p=>p[0]).sort((a,b)=>a-b);shoes.push([sole[Math.floor(sole.length/2)],low]);
  }
  if(!shoes.length)throw Error('Missing shoe '+key+'/'+row+'/'+f);
  const low=Math.max(...shoes.map(s=>s[1])),ground=shoes.filter(s=>s[1]>=low-10).sort((a,b)=>a[0]-b[0]);
  const foot=f===5?ground[0]:f===0||f>=6?ground.at(-1):ground.slice().sort((a,b)=>b[1]-a[1])[0];
  frames.push({row,f,cw,ch,raw,top,bottom,left,right,foot,frontFoot:ground.at(-1)});
 }
 const scales=[],landingPoints=[];
 for(let row=0;row<rows;row++){
  const group=frames.filter(f=>f.row===row),ready=group[0],plant=group[5],offset=[plant.frontFoot[0]-plant.foot[0],plant.frontFoot[1]-plant.foot[1]];let scale=216/(ready.bottom-ready.top+1);
  for(const f of group){const o=f.f<6?[0,0]:offset;for(const [distance,room]of[[f.foot[0]-f.left-o[0],anchor[0]-5],[f.right-f.foot[0]+o[0],tile-6-anchor[0]],[f.foot[1]-f.top-o[1],anchor[1]-5],[f.bottom-f.foot[1]+o[1],tile-6-anchor[1]]])if(distance>0)scale=Math.min(scale,room/distance);}
  scales[row]=scale;landingPoints[row]=[Math.round(anchor[0]+offset[0]*scale),Math.round(anchor[1]+offset[1]*scale)];
 }
 const atlas=Buffer.alloc(tile*columns*tile*rows*4),release=[];
 for(const f of frames){
  const s=scales[f.row],sw=Math.round(f.cw*s),sh=Math.round(f.ch*s),scaled=execFileSync('magick',['-size',`${f.cw}x${f.ch}`,'-depth','8','rgba:-','-resize',`${sw}x${sh}!`,'-depth','8','rgba:-'],{input:f.raw,maxBuffer:8*1024*1024}),target=f.f<6?anchor:landingPoints[f.row],dx=Math.round(target[0]-f.foot[0]*sw/f.cw),dy=Math.round(target[1]-f.foot[1]*sh/f.ch);let clipped=0;
  const pose=Buffer.alloc(tile*tile*4);
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const a=(y*sw+x)*4,tx=x+dx,ty=y+dy;if(tx<0||tx>=tile||ty<0||ty>=tile){if(scaled[a+3]>160)clipped++;continue;}scaled.copy(pose,(ty*tile+tx)*4,a,a+4);}
  if(clipped>2)throw Error('Clipped body '+key+'/'+f.row+'/'+f.f+': '+clipped);
  for(let y=0;y<tile;y++)pose.copy(atlas,(((f.row*tile+y)*tile*columns)+f.f*tile)*4,y*tile*4,(y+1)*tile*4);
  if(f.f===6){const candidates=[];for(let y=6;y<tile-25;y++)for(let x=4;x<tile-3;x++){const n=(y*tile+x)*4,r=pose[n],g=pose[n+1],b=pose[n+2];if(pose[n+3]<230||r<100||r<g*1.12||g<b*1.06)continue;let inner=true;for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)if(pose[(yy*tile+xx)*4+3]<180)inner=false;if(inner)candidates.push([x,y]);}if(!candidates.length)throw Error('Missing release hand '+key+'/'+f.row);candidates.sort((a,b)=>b[0]-a[0]);release[f.row]=candidates[0];}
 }
 const national=typeof key==='string',file=national?'nation-'+key+'.webp':'club-'+key+'.webp',out=dir+'/'+file;
 writeFileSync(out,execFileSync('magick',['-size',`${tile*columns}x${tile*rows}`,'-depth','8','rgba:-','-quality','95','webp:-'],{input:atlas,maxBuffer:40*1024*1024}));
 const referenceFile=national?'assets/broadcast/nations/'+key+'/ready.webp':'assets/broadcast/uniforms/club-'+key+'.webp';
 const spec={packVersion:6,foregroundMethod:'u2netp224-rmbg1024-alpha-only',id:key,file,path:out,authored:true,tile,framesPerDelivery:10,releaseFrame:6,anchor,renderScale:1.1,renderScaleY:4/3*1.07,renderScaleYByDelivery:scales.map((s,row)=>4/3*1.07*216/(s*(frames[row*10].bottom-frames[row*10].top+1))),landing:landingPoints,release,motionScale:[1,1,1,1],sourceScales:scales,cellBounds,alphaRefinements:JSON.parse(readFileSync(matte+'.json')),sourceSha256:hash(path),referenceFile,referenceSha256:hash(referenceFile),sha256:hash(out)};
 if(national)m.nations[key]=spec;else m.clubs[key]=spec;
 mkdirSync(dir+'/specs',{recursive:true});writeFileSync(dir+'/specs/'+key+'.json',JSON.stringify(spec,null,2)+'\n');if(!process.env.BE_SPEC_ONLY)writeFileSync(manifestFile,JSON.stringify(m,null,2)+'\n');console.log('Packed',key,'40 complete poses',scales.map(n=>n.toFixed(3)).join(','));
}
