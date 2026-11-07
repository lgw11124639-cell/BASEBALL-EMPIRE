// Register complete generated poses by their shoes, inside the painted batting box.
import {uniformAtlas} from './broadcast-actors.mjs?v=20261107-allforms80';
const cache=new Map();
async function loadKit(id,motion){
 const key=id+':'+motion;if(cache.has(key))return cache.get(key);
 const pending=(async()=>{const image=new Image();image.src=await uniformAtlas(id,motion);await image.decode();const frames=[];
  for(let n=0;n<4;n++){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=384;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,n%2*384,Math.floor(n/2)*384,384,384,0,0,384,384);
   const data=c.getImageData(0,0,384,384).data;let bottom=0;
   for(let y=230;y<384;y++)for(let x=0;x<384;x++){const at=(y*384+x)*4;if(data[at+3]>160&&Math.max(data[at],data[at+1],data[at+2])<160)bottom=Math.max(bottom,y);}
   let min=384,max=0;for(let y=Math.max(230,bottom-42);y<=bottom;y++)for(let x=0;x<384;x++){const at=(y*384+x)*4;if(data[at+3]>160&&Math.max(data[at],data[at+1],data[at+2])<160){min=Math.min(min,x);max=Math.max(max,x);}}
   if(min>max||!bottom)throw Error('Batter shoes unavailable: '+key+'/'+n);frames.push({canvas,shoe:{min,max,bottom}});
  }return frames;
 })();cache.set(key,pending);for(const old of cache.keys()){if(cache.size<=6)break;if(old!==key)cache.delete(old);}pending.catch(()=>cache.delete(key));return pending;
}
export async function prepareBatterKits(ids){await Promise.all(ids.flatMap(id=>['swing','bunt'].map(motion=>loadKit(id,motion))));}
export async function createBatter(canvas,id){
 const ctx=canvas.getContext('2d',{willReadFrequently:true});canvas.width=1440;canvas.height=1040;
 let frames=await loadKit(id,'swing'),ready=frames,kit=id,motion='swing',index=0,renderScale=1,layout={min:520,max:610,feet:322,height:216,mirror:false},request=0,disposed=false;
 function draw(){if(disposed)return;const {shoe}=frames[index],mirror=layout.mirror,min=mirror?384-shoe.max:shoe.min,max=mirror?384-shoe.min:shoe.max;
  const scale=Math.min(layout.height/(384*.9),(layout.max-layout.min-8)/Math.max(1,...frames.map(f=>f.shoe.max-f.shoe.min))),x=(layout.min+layout.max)/2-(min+max)/2*scale,y=layout.feet-shoe.bottom*scale;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1440,1040);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.setTransform(2,0,0,2,0,0);ctx.save();
  if(mirror){ctx.translate(x+384*scale,y);ctx.scale(-1,1);ctx.drawImage(frames[index].canvas,0,0,384*scale,384*scale);}else ctx.drawImage(frames[index].canvas,x,y,384*scale,384*scale);
  ctx.restore();renderScale=scale;canvas.dataset.frame=String(index);canvas.dataset.footMin=String(x+min*scale);canvas.dataset.footMax=String(x+max*scale);canvas.dataset.feet=String(layout.feet);
 }
 const api={
  pose(value){const next=Math.max(0,Math.min(3,Math.floor(value)));if(next!==index){index=next;draw();}},
  layout(next){if(JSON.stringify(layout)!==JSON.stringify(next)){layout=next;draw();}},
  async setKit(next,nextMotion='swing'){if(next===kit&&nextMotion===motion)return false;kit=next;motion=nextMotion;const token=++request,[loaded,stance]=await Promise.all([loadKit(next,nextMotion),loadKit(next,'swing')]);if(token===request&&!disposed){frames=loaded;ready=stance;draw();return true;}return false;},
  strikeZone(){const scale=Math.min(layout.height/(384*.9),(layout.max-layout.min-8)/Math.max(1,...ready.map(f=>f.shoe.max-f.shoe.min))),feet=ready[0].shoe.bottom;const top=layout.feet+(96-feet)*scale,bottom=layout.feet+(264-feet)*scale,height=bottom-top;return{top,bottom,height,width:Math.max(58,Math.min(78,height*.9))};},
  inspect(){return{kit,motion,index,layout,scale:renderScale,shoe:frames[index].shoe,wholeFrame:true};},
  dispose(){disposed=true;request++;canvas.width=canvas.height=1;}
 };draw();return api;
}
