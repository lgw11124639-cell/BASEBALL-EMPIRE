// Package image-generated wardrobe matches. Source poses are never separated into body parts.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const kind=process.argv[2],files=JSON.parse(process.argv[3]);if(!['swing','bunt'].includes(kind)||files.length!==10)throw Error('Expected swing|bunt and ten source paths');
const dir='assets/broadcast/motion/batter-'+kind;mkdirSync(dir,{recursive:true});
let previous;try{previous=JSON.parse(readFileSync(dir+'/manifest.json'))}catch{previous={clubs:[]}}
const manifest={version:1,tile:384,columns:2,rows:2,motion:kind,frames:kind==='bunt'?['ready','show-bunt','contact','recover']:['ready','load','contact','follow-through'],clubs:previous.clubs};
for(let id=0;id<10;id++){
 if(!files[id])continue;
 const referenceFile=`assets/broadcast/uniforms/club-${id}.webp`,file=`club-${id}.webp`;
 const resized=`/tmp/be-batter-${kind}-${id}.png`,reference=`/tmp/be-batter-${kind}-reference.png`,matte=`/tmp/be-batter-${kind}-${id}-matte.png`;
 execFileSync('magick',[files[id],'-resize','768x768!',resized]);
 execFileSync('magick',[kind==='bunt'?process.env.BE_BUNT_MASTER:'assets/broadcast/motion/batter-swing.webp','-resize','768x768!',reference]);
 execFileSync(process.env.BE_POSE_PACKER,['matte',resized,reference,matte,'2','2']);
 if(!process.env.BE_SOURCE_ALPHA)throw Error('BE_SOURCE_ALPHA packaging guard is required');const safe=resized+'.safe.png';execFileSync(process.env.BE_SOURCE_ALPHA,[resized,matte,safe]);
 execFileSync('magick',[safe,'-quality','95',dir+'/'+file]);
 const data=readFileSync(dir+'/'+file);manifest.clubs[id]={id,file,sha256:createHash('sha256').update(data).digest('hex'),sourceSha256:createHash('sha256').update(readFileSync(files[id])).digest('hex'),referenceFile,referenceSha256:createHash('sha256').update(readFileSync(referenceFile)).digest('hex')};
 console.log(kind,id,data.length);
}
writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
