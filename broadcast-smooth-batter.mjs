// The approved batter art is registered on the distant box in the deep camera.
import {createBatter} from './broadcast-batter.mjs?v=20261107-live86';
export function distantBatterLayout(hand='right'){
 const min=608,max=644;return{min:hand==='left'?720-max:min,max:hand==='left'?720-min:max,feet:260,height:80,mirror:hand==='left'};
}
export async function createDistantBatter(canvas){
 const actor=await createBatter(canvas,0);let hand=null;
 function setHand(next){next=next==='left'?'left':'right';if(next===hand)return;hand=next;actor.layout(distantBatterLayout(hand));actor.pose(0);}
 setHand('right');return{setHand,strikeZone:()=>actor.strikeZone(),inspect(){return{...actor.inspect(),hand,distant:true,feetOnScreen:[Number(canvas.dataset.footMin),Number(canvas.dataset.footMax),Number(canvas.dataset.feet)]};},dispose(){actor.dispose();}};
}
