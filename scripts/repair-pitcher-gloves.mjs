// Replace one COMPLETE hand-separation pose in each delivery; no glove/body-part compositing.
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex'),file='assets/broadcast/motion/pitcher-solid/manifest.json',manifest=JSON.parse(readFileSync(file)),width=2016,tile=288;
for(const board of readFileSync(process.argv[2],'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)){
 const[sw,sh]=execFileSync('magick',['identify','-format','%w %h',board.path],{encoding:'utf8'}).split(' ').map(Number),rgb=execFileSync('magick',[board.path,'-depth','8','rgb:-'],{maxBuffer:30*1024*1024}),cells=[],keys=board.uniforms.map(u=>u.split(' ')[0]);
 for(let row=0;row<2;row++){
  const top=Math.round(row*sh/2),bottom=Math.round((row+1)*sh/2),lines=[];
  for(let x=8;x<sw-8;x++){let count=0;for(let y=top+4;y<bottom-4;y++){const at=(y*sw+x)*3,r=rgb[at],g=rgb[at+1],b=rgb[at+2];if(Math.max(r,g,b)-Math.min(r,g,b)<12&&Math.max(r,g,b)<245)count++;}if(count>(bottom-top-8)*.92)lines.push(x);}
  const groups=[];for(const x of lines){const last=groups.at(-1);if(last&&x-last.at(-1)<4)last.push(x);else groups.push([x]);}const edges=[0,...groups.map(g=>Math.round(g.reduce((a,b)=>a+b)/g.length)),sw];
  if(edges.length!==board.columns+1)throw Error('Unexpected grid '+board.name+'/'+row+': '+edges.join(','));
  for(let col=0;col<board.columns;col++){const index=row*board.columns+col,path='/tmp/be-glove77-cell-'+board.name+'-'+index+'.png';execFileSync('magick',[board.path,'-crop',`${edges[col+1]-edges[col]-8}x${bottom-top-8}+${edges[col]+4}+${top+4}`,'+repage','-resize','256x512','-background','white','-gravity','center','-extent','256x512',path]);cells.push(path);}
 }
 const source='/tmp/be-glove77-'+board.name+'.png',matte='/tmp/be-glove77-'+board.name+'-matte.png';execFileSync('magick',['montage',...cells,'-tile',board.columns+'x2','-geometry','+0+0','-background','white',source]);execFileSync(process.env.BE_FOREGROUND||'/tmp/be-segment-pitcher',['/tmp/be-u2netp.onnx',source,matte,String(board.columns),'2']);
 for(let index=0;index<keys.length;index++){
  const key=keys[index],spec=/^\d+$/.test(key)?manifest.clubs[Number(key)]:manifest.nations[key],pose='/tmp/be-glove77-pose-'+key+'.png';
  execFileSync('magick',[matte,'-crop',`256x512+${index%board.columns*256}+${Math.floor(index/board.columns)*512}`,'+repage','-trim','+repage','-resize','x240','-background','none','-gravity','center','-extent','288x288',pose]);
  const src=execFileSync('magick',[pose,'-depth','8','rgba:-'],{maxBuffer:2*1024*1024});let bottom=0;
  for(let y=170;y<tile;y++)for(let x=0;x<tile;x++){const at=(y*tile+x)*4;if(src[at+3]>200&&Math.max(src[at],src[at+1],src[at+2])<140)bottom=Math.max(bottom,y);}
  let sum=0,count=0;for(let y=bottom-3;y<=bottom;y++)for(let x=0;x<tile;x++){const at=(y*tile+x)*4;if(src[at+3]>200&&Math.max(src[at],src[at+1],src[at+2])<140){sum+=x;count++;}}
  if(!count)throw Error('Missing planted foot '+key);const sx=Math.round(sum/count),dx=144-sx,dy=270-bottom,atlas=execFileSync('magick',[spec.path,'-depth','8','rgba:-'],{maxBuffer:30*1024*1024});
  for(let row=0;row<4;row++){
   for(let y=0;y<tile;y++)atlas.fill(0,((row*tile+y)*width+2*tile)*4,((row*tile+y)*width+3*tile)*4);
   for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){const tx=x+dx,ty=y+dy,at=(y*tile+x)*4;if(tx<0||ty<0||tx>=tile||ty>=tile){if(src[at+3]>80)throw Error('Body clipped '+key);continue;}src.copy(atlas,((row*tile+ty)*width+2*tile+tx)*4,at,at+4);}
  }
  const raw='/tmp/be-glove77-'+key+'.rgba';writeFileSync(raw,atlas);execFileSync('magick',['-size','2016x1152','-depth','8','rgba:'+raw,'-quality','95',spec.path]);spec.sha256=hash(readFileSync(spec.path));spec.gloveRepairSourceSha256=hash(readFileSync(board.path));spec.gloveRepairFrame=2;spec.gloveRepairCell=index;spec.gloveRepair='whole figure; left glove tucked against chest, only side edge visible; separate right ball hand';writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');console.log('Repaired whole pose',key);
 }
}
