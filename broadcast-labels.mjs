// One label layer for fielders and runners; keep full names readable while players move.
const overlap=(a,b,gap=5)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
const ns='http://www.w3.org/2000/svg';
export function updateFieldLabels(stadium){
 if(stadium.dataset.view!=='field')return;
 const svg=stadium.querySelector('.be-stadium-guides'),inverse=svg.getScreenCTM()?.inverse();if(!inverse)return;
 let layer=svg.querySelector('#be-field-labels');if(!layer){layer=document.createElementNS(ns,'g');layer.id='be-field-labels';svg.querySelector('#be-stadium-runners').after(layer);}
 const sources=[...stadium.querySelectorAll('[data-fielder] .be-player-name,#be-stadium-runners .be-player-name')],items=[];
 for(const text of sources){const node=text.closest('[data-runner-id]')||text.closest('.be-fielder-body');if(!node||node.style.opacity==='0'||!node.isConnected)continue;const matrix=node.getScreenCTM();if(!matrix)continue;
  const p=new DOMPoint(0,0).matrixTransform(matrix).matrixTransform(inverse),position=text.closest('[data-fielder]')?.dataset.fielder,runner=text.closest('[data-runner-id]');
  items.push({text:text.textContent,x:p.x,y:p.y,position,runner:!!runner,key:runner?'runner-'+runner.dataset.runnerId:'fielder-'+position});
 }
 const measure=stadium._labelMeasure||(stadium._labelMeasure=document.createElement('canvas').getContext('2d'));measure.font='700 16px system-ui';
 const occupied=[...svg.querySelectorAll('#be-runner-verdicts rect'),...stadium.querySelectorAll('.be-error-mark')].map(rect=>{const b=rect.getBoundingClientRect(),a=new DOMPoint(b.left,b.top).matrixTransform(inverse),z=new DOMPoint(b.right,b.bottom).matrixTransform(inverse);return{x:a.x,y:a.y,w:z.x-a.x,h:z.y-a.y};}),markers=items.map(p=>({x:p.x-11,y:p.y-11,w:22,h:22})),placements=[];
 for(const item of items){const w=Math.min(250,Math.ceil(measure.measureText(item.text).width)+12),h=25,candidates=[];
  const preferred=item.runner?[0,30]:item.position==='C'?[0,-28]:['SS','2B','1B'].includes(item.position)?[0,-27]:[0,26];
  const add=(dx,dy)=>candidates.push({x:Math.max(8,Math.min(712-w,item.x+dx-w/2)),y:Math.max(128,Math.min(492-h,item.y+dy-h/2)),w,h});
  add(...preferred);for(const radius of[30,50,74,100,130])for(const[dx,dy]of[[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]])add(dx*radius,dy*radius);
  const free=c=>!occupied.some(o=>overlap(c,o))&&!markers.some(m=>overlap(c,m,2));let chosen=candidates.find(free);
  if(!chosen){const grid=[];for(let y=138;y<468;y+=28)for(let x=8;x+w<713;x+=20)grid.push({x,y,w,h});grid.sort((a,b)=>Math.hypot(a.x+w/2-item.x,a.y+h/2-item.y)-Math.hypot(b.x+w/2-item.x,b.y+h/2-item.y));chosen=grid.find(free);}
  chosen=chosen||candidates[0];occupied.push(chosen);placements.push({...item,...chosen,playerX:item.x,playerY:item.y});
 }
 layer.replaceChildren();for(const p of placements){const group=document.createElementNS(ns,'g');group.dataset.label=p.key;const cx=p.x+p.w/2,cy=p.y+p.h/2;
  if(Math.hypot(cx-p.playerX,cy-p.playerY)>42){const line=document.createElementNS(ns,'path');line.setAttribute('d',`M${p.playerX} ${p.playerY}L${cx} ${cy}`);line.setAttribute('class','be-label-leader');group.append(line);}
  const rect=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x:p.x,y:p.y,width:p.w,height:p.h,rx:5}))rect.setAttribute(k,String(v));
  const text=document.createElementNS(ns,'text');text.setAttribute('x',String(cx));text.setAttribute('y',String(p.y+18));text.setAttribute('text-anchor','middle');text.textContent=p.text;if(measure.measureText(p.text).width>p.w-12){text.setAttribute('textLength',String(p.w-12));text.setAttribute('lengthAdjust','spacingAndGlyphs');}
  const title=document.createElementNS(ns,'title');title.textContent=p.text;group.append(rect,text,title);layer.append(group);
 }
 stadium.dataset.labelsReady='true';
}
