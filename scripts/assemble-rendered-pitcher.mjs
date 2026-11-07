// Entries: {key,source,readyBoard,readyColumns,readyRows,readyIndex}. Whole images only.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const hash=data=>createHash('sha256').update(data).digest('hex'),dir='assets/broadcast/motion/pitcher-solid';mkdirSync(dir,{recursive:true});
let prior;try{prior=JSON.parse(readFileSync(dir+'/manifest.json'))}catch{prior={clubs:[],nations:{}}}
const selected='assets/broadcast/motion/pitcher-solid/reference-pose.png',manifest={version:4,tile:288,columns:7,rows:4,framesPerDelivery:7,anchor:[144,270],landing:[204,254],keyFrames:[0,1,2,3,4,5,6],releaseFrame:4,poseReferenceSha256:hash(readFileSync(selected)),interpolation:'none; one authored whole-body frame at full opacity',clubs:prior.clubs,nations:prior.nations};
for(const entry of JSON.parse(readFileSync(process.argv[2]))){
 const {key,source,readyBoard,readyColumns,readyRows,readyIndex}=entry,token=String(key),normalized='/tmp/be-render-'+token+'-source.png',cutout='/tmp/be-render-'+token+'-cutout.png';
 execFileSync('magick',[source,'-resize','1536x1024!',normalized]);
 execFileSync(process.env.BE_FOREGROUND,['/tmp/be-u2netp.onnx',normalized,cutout]);
 const boardHash=hash(readFileSync(readyBoard)),board='/tmp/be-board-'+boardHash+'.png';if(!existsSync(board))execFileSync(process.env.BE_FOREGROUND,['/tmp/be-u2netp.onnx',readyBoard,board,String(readyColumns),String(readyRows)]);
 const [w,h]=execFileSync('magick',['identify','-format','%w %h',board],{encoding:'utf8'}).trim().split(' ').map(Number),col=readyIndex%readyColumns,row=Math.floor(readyIndex/readyColumns),x=Math.round(col*w/readyColumns),y=Math.round(row*h/readyRows),width=Math.round((col+1)*w/readyColumns)-x,height=Math.round((row+1)*h/readyRows)-y,ready='/tmp/be-render-'+token+'-ready.png';
 execFileSync('magick',[board,'-crop',`${width}x${height}+${x}+${y}`,'+repage','-trim','+repage','-resize','x240','-background','none','-gravity','south','-extent','256x256',ready]);
 const national=typeof key==='string',path=national?'assets/broadcast/nations/'+key+'/pitcher.webp':dir+'/club-'+key+'.webp';if(national)mkdirSync('assets/broadcast/nations/'+key,{recursive:true});
 const meta=JSON.parse(execFileSync(process.env.BE_RENDER_PACKER,[cutout,ready,path],{encoding:'utf8'}));
 const referenceFile=national?'assets/broadcast/nations/'+key+'/ready.webp':'assets/broadcast/uniforms/club-'+key+'.webp';
 const spec={id:key,file:path.split('/').pop(),path,release:meta.release,landing:Array.from({length:4},()=>[204,254]),authored:true,sourceSha256:hash(readFileSync(source)),readySourceSha256:hash(readFileSync(readyBoard)),poseReferenceSha256:manifest.poseReferenceSha256,referenceFile,referenceSha256:hash(readFileSync(referenceFile)),sha256:hash(readFileSync(path))};
 if(national)manifest.nations[key]=spec;else manifest.clubs[key]=spec;
 writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log('authored',key);
}
