// Match authored moving-pose silhouette area to the existing standing-ready size.
import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';
const file='assets/broadcast/motion/pitcher-solid/manifest.json',manifest=JSON.parse(readFileSync(file)),tile=manifest.tile,width=tile*manifest.columns;
for(const spec of[...manifest.clubs,...Object.values(manifest.nations)]){
 const pixels=execFileSync('magick',[spec.path,'-depth','8','rgba:-'],{maxBuffer:50*1024*1024});const areas=[];
 for(let row=0;row<4;row++){const poses=[];for(let frame=0;frame<7;frame++){let area=0;for(let y=0;y<tile;y++)for(let x=0;x<tile;x++)if(pixels[(((row*tile+y)*width+frame*tile+x)*4)+3]>180)area++;poses.push(area);}areas.push(poses);}
 spec.motionScale=areas.map(a=>Math.min(1,Math.max(.65,Math.sqrt(a[0]/a[1]))));
 spec.readyArea=areas.map(a=>a[0]);spec.motionReferenceArea=areas.map(a=>a[1]);
}
manifest.motionScaleReference='standing ready silhouette area matched to initial knee lift; one constant scale per delivery for all moving poses';writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');console.log('Calibrated',manifest.clubs.length+Object.keys(manifest.nations).length,'uniforms');
