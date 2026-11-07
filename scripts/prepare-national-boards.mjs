// Package authored national-team photographs. Only full-figure cropping, alpha extraction and encoding.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {NATIONAL_COLORS} from '../broadcast-uniforms.mjs';
const hash=data=>createHash('sha256').update(data).digest('hex'),codes=Object.keys(NATIONAL_COLORS),root='assets/broadcast/nations';mkdirSync(root,{recursive:true});
let manifest;try{manifest=JSON.parse(readFileSync(root+'/manifest.json'))}catch{manifest={version:1,countries:{}}}
function board(path){
 const sha=hash(readFileSync(path)),cut='/tmp/be-national-white-'+sha+'.png';
 if(!existsSync(cut)){
  const [w,h]=execFileSync('magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim().split(' ').map(Number),cw=Math.round(w/7),ch=Math.round(h/2),pad=Math.round(cw*.28),parts=[];
  for(let i=0;i<14;i++){const x=Math.round(i%7*w/7),y=Math.round(Math.floor(i/7)*h/2),left=Math.max(0,x-pad),right=Math.min(w,x+cw+pad),part='/tmp/be-spaced-'+sha+'-'+i+'.png';
   execFileSync('magick',[path,'-crop',`${right-left}x${ch}+${left}+${y}`,'+repage','-background','none','-gravity','center','-extent',`${cw+2*pad}x${ch}`,part]);parts.push(part);
  }
  const spaced='/tmp/be-spaced-'+sha+'.png';execFileSync('magick',['montage',...parts,'-background','none','-tile','7x2','-geometry',`${cw+2*pad}x${ch}+0+0`,spaced]);
  execFileSync(process.env.BE_FOREGROUND,['/tmp/be-u2netp.onnx',spaced,cut,'7','2']);
 }
 const [w,h]=execFileSync('magick',['identify','-format','%w %h',cut],{encoding:'utf8'}).trim().split(' ').map(Number);return {cut,w,h,sha};
}
function figure(b,index,out,ready=false){const c=index%7,r=Math.floor(index/7),x=Math.round(c*b.w/7),y=Math.round(r*b.h/2),w=Math.round((c+1)*b.w/7)-x,h=Math.round((r+1)*b.h/2)-y;
 // Captions live below the feet and are not part of the sprite.
 const args=[b.cut,'-crop',`${w}x${h}+${x}+${y}`,'+repage','-trim','+repage','-background','none'];
 args.push('-resize',ready?'520x800':'360x368','-gravity','south','-extent',ready?'560x840':'384x384',out);execFileSync('magick',args);
}
for(const group of JSON.parse(readFileSync(process.argv[2]))){const prepared={};for(const [name,path]of Object.entries(group.boards))prepared[name]=board(path);
 for(let local=0;local<14;local++){const code=codes[group.group*14+local],dir=root+'/'+code;mkdirSync(dir,{recursive:true});const meta=manifest.countries[code]||{code,authoredSources:{}};
  if(prepared.ready){figure(prepared.ready,local,dir+'/ready.webp',true);figure(prepared.ready,local,'/tmp/be-national-'+code+'-ready.png');meta.authoredSources.ready=prepared.ready.sha;}
  for(const kind of ['swing','bunt'])if([1,2,3].every(f=>prepared[kind+f])){
   const poses=['/tmp/be-national-'+code+'-ready.png'];if(!existsSync(poses[0]))throw Error('Ready board must be packaged first');for(let f=1;f<=3;f++){const path='/tmp/be-national-'+code+'-'+kind+f+'.png';figure(prepared[kind+f],local,path);poses.push(path);meta.authoredSources[kind+f]=prepared[kind+f].sha;}
   execFileSync('magick',['montage',...poses,'-background','none','-tile','2x2','-geometry','384x384+0+0',dir+'/'+kind+'.webp']);
  }
  meta.readySha256=hash(readFileSync(dir+'/ready.webp'));for(const kind of ['swing','bunt'])if(meta.authoredSources[kind+1]&&existsSync(dir+'/'+kind+'.webp'))meta[kind+'Sha256']=hash(readFileSync(dir+'/'+kind+'.webp'));
  manifest.countries[code]=meta;console.log('national board',code);
 }
 writeFileSync(root+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
}
