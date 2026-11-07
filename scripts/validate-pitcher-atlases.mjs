import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir='assets/broadcast/motion/pitcher-solid',m=JSON.parse(readFileSync(dir+'/manifest.json')),failures=[];
for(const spec of [...m.clubs,...Object.values(m.nations)]){
 assert.equal(spec.authored,true,`Unfinished uniform: ${spec.id}`);
 const pixels=execFileSync('magick',[spec.path,'-depth','8','rgba:-'],{maxBuffer:50*1024*1024}),width=m.columns*m.tile;
 const at=(index,x,y,c=3)=>pixels[((Math.floor(index/m.columns)*m.tile+y)*width+(index%m.columns)*m.tile+x)*4+c];
 for(let row=0;row<4;row++){
  const signatures=new Set();
  for(let f=0;f<7;f++){
   const index=row*7+f;let opaque=0,corner=0,signature=0;
   for(let y=0;y<m.tile;y++)for(let x=0;x<m.tile;x++){
    const a=at(index,x,y);if(a>180)opaque++;if(x<32&&y<32&&a>32)corner++;
    signature=(Math.imul(signature,31)+a+at(index,x,y,0))>>>0;
   }
   signatures.add(signature);
   if(opaque<1500||corner>2)failures.push({id:spec.id,row,f,opaque,corner});
   if(f===4){const [rx,ry]=spec.release[row];assert.ok(at(index,rx,ry)>80,`Release outside hand: ${spec.id}/${row}`);}
   const foot=f<4?m.anchor:spec.landing[row];let shoe=0;
   for(let y=Math.max(0,foot[1]-6);y<Math.min(m.tile,foot[1]+5);y++)for(let x=Math.max(0,foot[0]-10);x<Math.min(m.tile,foot[0]+11);x++)if(at(index,x,y)>100)shoe++;
   if(shoe<2)failures.push({id:spec.id,row,f,missingPlantedFoot:true});
  }
  if(signatures.size<6)failures.push({id:spec.id,row,distinct:signatures.size});
 }
 console.log('checked club',spec.id,'28 full-body poses');
}
assert.deepEqual(failures,[]);console.log('PASS 1064 authored solid cuts, clean transparent corners, planted feet and distinct intermediate images');
