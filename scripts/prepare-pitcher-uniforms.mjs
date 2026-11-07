// Package image-generated, approved-pose wardrobe sheets. No limb posing or runtime recoloring.
// Usage: node scripts/prepare-pitcher-uniforms.mjs <JSON array of ten source PNG paths>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {FRAME_ANCHORS,RELEASE_PIXELS,kits} from '../broadcast-actors.mjs';
const files=JSON.parse(process.argv[2]);
if(files.length!==10)throw Error('Ten club source sheets required');
const dir='assets/broadcast/motion/pitcher-kits';mkdirSync(dir,{recursive:true});
const manifest={version:1,columns:6,rows:4,tile:256,nativeHand:'right',approvedHand:'left',rendering:'24 whole poses; wardrobe baked into each image; mirror whole actor for left hand',clubs:[]};
for(let id=0;id<10;id++){
 const dimensions=execFileSync('magick',['identify','-format','%wx%h',files[id]],{encoding:'utf8'});
 if(dimensions!=='1536x1024')throw Error('Unexpected sheet size '+dimensions);
 // Imagegen exports partial-alpha backdrop. Retain the opaque athlete and antialias its boundary.
 const source=execFileSync('magick',[files[id],'-channel','A','-level','75%,98%','+channel','-depth','8','rgba:-'],{maxBuffer:16*1024*1024}),rgba=Buffer.alloc(source.length);
 for(let y=0;y<1024;y++)for(let x=0;x<1536;x++){
  const mirror=Math.floor(x/256)*256+255-x%256;
  source.copy(rgba,(y*1536+x)*4,(y*1536+mirror)*4,(y*1536+mirror+1)*4);
 }
 const anchors=[],release=[],pivot=[];
 const pixel=(row,col,x,y)=>{const n=((row*256+y)*1536+col*256+x)*4;return [rgba[n],rgba[n+1],rgba[n+2],rgba[n+3]]};
 for(let row=0;row<4;row++){
  anchors[row]=[];
  for(let col=0;col<6;col++){
   const expected=FRAME_ANCHORS[row][col],seen=new Set(),components=[];
   const shoe=(x,y)=>{const [r,g,b,a]=pixel(row,col,x,y);return a>220&&Math.max(r,g,b)<145;};
   for(let y=180;y<255;y++)for(let x=40;x<230;x++){
    const key=y*256+x;if(seen.has(key)||!shoe(x,y))continue;
    const queue=[[x,y]],points=[];seen.add(key);
    for(let q=0;q<queue.length;q++){
     const [xx,yy]=queue[q];points.push([xx,yy]);
     for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=xx+dx,ny=yy+dy,k=ny*256+nx;if(nx<40||nx>=230||ny<180||ny>=255||seen.has(k)||!shoe(nx,ny))continue;seen.add(k);queue.push([nx,ny]);}
    }
    const bottom=Math.max(...points.map(p=>p[1]));
    if(points.length<16||bottom<220)continue;
    const sole=points.filter(p=>p[1]>=bottom-2).map(p=>p[0]).sort((a,b)=>a-b);
    components.push([sole[Math.floor(sole.length/2)],bottom]);
   }
   const nearest=target=>components.slice().sort((a,b)=>Math.hypot(a[0]-target[0],3*(a[1]-target[1]))-Math.hypot(b[0]-target[0],3*(b[1]-target[1])))[0]||target;
   anchors[row][col]=nearest(expected);
   if(col===3)pivot[row]=nearest([104,247]);
  }
  const target=RELEASE_PIXELS[row];let best=Infinity,point=target;
  for(let y=Math.max(0,target[1]-25);y<Math.min(255,target[1]+26);y++)for(let x=Math.max(0,target[0]-25);x<Math.min(255,target[0]+26);x++){
   const [r,g,b,a]=pixel(row,3,x,y);if(a<220||r<75||r<g*1.08||g<b*1.03)continue;
   const distance=Math.hypot(x-target[0],y-target[1]);if(distance<best){best=distance;point=[x,y];}
  }
  release[row]=point;
 }
 const file=`club-${id}.webp`,output=execFileSync('magick',['-size','1536x1024','-depth','8','rgba:-','-define','webp:lossless=true','webp:-'],{input:rgba,maxBuffer:16*1024*1024});writeFileSync(`${dir}/${file}`,output);
 manifest.clubs.push({id,file,colors:kits[id],sha256:createHash('sha256').update(output).digest('hex'),sourceSha256:createHash('sha256').update(readFileSync(files[id])).digest('hex'),anchors,releasePivot:pivot,release});
 console.log(id,file,output.length);
}
writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
