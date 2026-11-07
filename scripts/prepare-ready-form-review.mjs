// Package COMPLETE authored poses. The accepted knee/hip pair is reused without editing its anatomy.
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const root='assets/broadcast/form-review',accepted='/workspace/generated_images/exec-71d791c4-80cb-4c25-a7f7-2c944c467b11.png',hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');mkdirSync(root,{recursive:true});
const records=readFileSync(process.argv[2],'utf8').trim().split('\n').map(JSON.parse),metadata={acceptedPairSha256:hash(accepted),poses:{}};
for(const{key,path,kneePath,loweringPath}of records){const[w,h]=execFileSync('magick',['identify','-format','%w %h',path],{encoding:'utf8'}).split(' ').map(Number);metadata.poses[key]={sourceSha256:hash(path),frames:[]};
 for(let n=0;n<10;n++){
  const correctedLowering=n===3&&!!loweringPath,paired=(n===1||n===2),source=correctedLowering?loweringPath:paired?(kneePath||accepted):path,[sw,sh]=paired||correctedLowering?execFileSync('magick',['identify','-format','%w %h',source],{encoding:'utf8'}).split(' ').map(Number):[w,h],columns=paired&&!kneePath?2:5,rows=paired&&!kneePath?1:2,index=paired&&!kneePath?n-1:n,x=Math.round(index%columns*sw/columns)+4,y=Math.round(Math.floor(index/columns)*sh/rows)+4,endX=Math.round((index%columns+1)*sw/columns)-4,endY=Math.round((Math.floor(index/columns)+1)*sh/rows)-4,file=`${key}-step-${n+1}.webp`;
  execFileSync('magick',[source,'-crop',`${endX-x}x${endY-y}+${x}+${y}`,'+repage','-resize','355x444^','-gravity','center','-extent','355x444','-quality','95',root+'/'+file]);metadata.poses[key].frames.push({file,sha256:hash(root+'/'+file),acceptedPair:paired&&!kneePath,localLegCorrection:(paired&&!!kneePath)||correctedLowering,sourceSha256:hash(source)});
 }
}
writeFileSync(root+'/ready-reference.json',JSON.stringify(metadata,null,2)+'\n');
