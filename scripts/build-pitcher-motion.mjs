// RIFE v4.6 asset build. CPU tools are used offline; no model or native code ships to browsers.
// BE_RIFE_BIN=/path/rife-ncnn-vulkan BE_RIFE_MODEL=/path/rife-v4.6 BE_POSE_PACKER=/path/compiled-packer node scripts/build-pitcher-motion.mjs 0 1 ...
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),root='assets/broadcast/motion',dir=root+'/pitcher-motion';await mkdir(dir,{recursive:true});
const source=JSON.parse(await readFile(root+'/pitcher-kits/manifest.json','utf8'));
let previous;try{previous=JSON.parse(await readFile(dir+'/manifest.json','utf8'))}catch{previous={clubs:[]}}
const phases=Array.from({length:31},(_,i)=>i<=18?i/6:3+(i-18)/12);
const manifest={version:2,tile:288,columns:8,rows:16,framesPerDelivery:31,deliveries:4,keyFrames:[0,6,12,18,24,30],phases,anchor:[144,270],interpolation:'RIFE v4.6; registered whole-body poses; original keys retained; black/white alpha reconstruction',clubs:previous.clubs};
const ids=process.argv.slice(2).map(Number);if(!ids.length)ids.push(...Array.from({length:10},(_,i)=>i));
for(const id of ids){
 const spec=source.clubs[id],work='/tmp/be-motion-'+id;await mkdir(work,{recursive:true});
 await writeFile(work+'/anchors.tsv',spec.anchors.map((row,i)=>[...row.flat(),...spec.releasePivot[i]].join(' ')).join('\n'));
 await exec(process.env.BE_POSE_PACKER,['keys',root+'/pitcher-kits/'+spec.file,work+'/anchors.tsv',work]);
 const jobs=Array.from({length:8},(_,i)=>({row:Math.floor(i/2),bg:i%2?'white':'black'}));
 await Promise.all(Array.from({length:2},async()=>{while(jobs.length){const {row,bg}=jobs.shift(),base=`${work}/row${row}-${bg}`;await exec(process.env.BE_RIFE_BIN,['-i',base+'/in','-o',base+'/out','-n','36','-m',process.env.BE_RIFE_MODEL,'-g','-1','-j','1:1:1'],{maxBuffer:1024*1024});}}));
 const file=`club-${id}.webp`;await exec(process.env.BE_POSE_PACKER,['pack',work,dir+'/'+file]);
 const data=await readFile(dir+'/'+file);
 manifest.clubs[id]={id,file,sha256:createHash('sha256').update(data).digest('hex'),sourceSha256:spec.sha256,referenceFile:spec.referenceFile,referenceSha256:spec.referenceSha256,release:spec.release.map((p,row)=>[p[0]+144-spec.releasePivot[row][0],p[1]+270-spec.releasePivot[row][1]]),landing:spec.anchors.map((row,i)=>[144+row[3][0]-spec.releasePivot[i][0],270+row[3][1]-spec.releasePivot[i][1]])};
 await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(id,'31 x 4 frames',data.length);
}
