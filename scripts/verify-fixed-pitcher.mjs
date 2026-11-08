import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.FIXED_PITCHER_URL||'http://127.0.0.1:4196/broadcast-fixed.html';
const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1000,height:1250}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>window.ready);
 const result=await page.evaluate(()=>{
  const p=window.prototype,{rig,T}=p,rest={},forms=[];let maxLengthDrift=0,maxPivotError=0,maxLandingError=0,maxArmReachError=0,maxGazeError=0,maxThrowDirectionError=0;
  p.renderer.setSize(360,260,false);const gl=p.renderer.getContext(),pixels=new Uint8Array(360*260*4);
  function hash(){gl.readPixels(0,0,360,260,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let h=2166136261;for(const x of pixels){h^=x;h=Math.imul(h,16777619)}return h>>>0}
  for(let row=0;row<4;row++){
   const frameHashes=new Set,poseHashes=new Set;
   for(let i=0;i<120;i++){
    const phase=i/119*4;p.draw(phase,row);frameHashes.add(hash());poseHashes.add(JSON.stringify([...rig.rest.keys()].flatMap(b=>b.quaternion.toArray().map(x=>+x.toFixed(7)))));
    for(const side of ['R','L'])for(const [name,a,b]of [['thigh','upperleg01.','lowerleg01.'],['shin','lowerleg01.','foot.'],['upperarm','upperarm01.','lowerarm01.'],['forearm','lowerarm01.','wrist.']]){
     const key=name+side,d=rig.point(a+side).distanceTo(rig.point(b+side));rest[key]??=d;maxLengthDrift=Math.max(maxLengthDrift,Math.abs(d-rest[key]));
    }
    const info=rig.inspect();maxArmReachError=Math.max(maxArmReachError,info.errors.armR,info.errors.armL);
    if(info.pivotLocked)maxPivotError=Math.max(maxPivotError,Math.hypot(info.rightSole[0]+.11,info.rightSole[1],info.rightSole[2]));
    if(info.landingLocked)maxLandingError=Math.max(maxLandingError,Math.hypot(info.leftSole[0]-.14,info.leftSole[1],info.leftSole[2]-1.12));
    const actual=new T.Vector3(0,0,1).applyQuaternion(rig.bones.head.getWorldQuaternion(new T.Quaternion()).multiply(rig.headRest.clone().invert()));
    const target=rig.catcher.clone().sub(rig.point('head')).normalize();maxGazeError=Math.max(maxGazeError,actual.distanceTo(target));
    if(phase>=2.95&&phase<=3.05){const f=rig.point('finger3-1.R').sub(rig.point('wrist.R')).normalize(),t=rig.catcher.clone().sub(rig.point('wrist.R')).normalize();maxThrowDirectionError=Math.max(maxThrowDirectionError,f.distanceTo(t));}
    for(const b of rig.rest.keys())if(b.scale.distanceTo(new T.Vector3(1,1,1))>1e-5)throw Error('Animated bone scale: '+b.name);
   }
   forms.push({row,uniquePoses:poseHashes.size,uniqueRenderedFrames:frameHashes.size});
  }
  const uniforms=[];for(const option of document.querySelector('#kit').options){p.setKit(option.value);p.draw(1,0);uniforms.push({key:option.value,renderHash:hash()})}
  rig.pose(0,0);const ready=rig.inspect();rig.pose(1,0);const lift=rig.inspect();rig.pose(4,0);const end=rig.inspect();
  p.renderer.setSize(1440,1040,false);
  return{forms,uniformCount:uniforms.length,uniforms,maxLengthDrift,maxPivotError,maxLandingError,maxArmReachError,maxGazeError,maxThrowDirectionError,limbLengths:rest,ready,lift,end};
 });
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(result.uniformCount,38);
 for(const form of result.forms){assert.equal(form.uniquePoses,120);assert.equal(form.uniqueRenderedFrames,120)}
 assert.ok(result.maxLengthDrift<1e-5);assert.ok(result.maxPivotError<.005);assert.ok(result.maxLandingError<.005);assert.ok(result.maxArmReachError<.005);assert.ok(result.maxGazeError<1e-5);assert.ok(result.maxThrowDirectionError<1e-4);
 assert.ok(result.ready.leftSole[2]>result.ready.rightSole[2]);assert.ok(Math.abs(result.ready.leftSole[0]-result.ready.rightSole[0])<.2);
 assert.ok(result.lift.leftSole[1]>.5);assert.ok(Math.abs(result.lift.rightSole[1])<.005);assert.ok(result.end.rightSole[2]>1&&result.end.rightSole[2]<1.3);
 await page.selectOption('#kit','5');
 for(let row=0;row<4;row++){await page.selectOption('#form',String(row));await page.locator('#frame').fill('64');await page.screenshot({path:`/workspace/pitcher-fixed-model/verified-form-${row}.png`})}
 await page.setViewportSize({width:390,height:844});await page.locator('#frame').fill('0');await page.screenshot({path:'/workspace/pitcher-fixed-model/mobile-preview.png'});
 await page.selectOption('#hand','left');await page.locator('#frame').fill('30');assert.equal(await page.evaluate(()=>window.prototype.inspect().hand),'left');
 await page.locator('#play').click();await page.waitForFunction(()=>window.prototype.inspect().frame===119,{timeout:15000});assert.equal(await page.evaluate(()=>window.prototype.inspect().playing),false);
 result.browserErrors=errors;result.timeBaseHz=60;result.durationMs=2000;result.scope='Separate 3D review; current game actor unchanged';
 const output=new URL('../assets/broadcast/pitcher-fixed/verification.json',import.meta.url);await mkdir(new URL('.',output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({forms:result.forms,uniformCount:result.uniformCount,maxArmReachError:result.maxArmReachError,maxGazeError:result.maxGazeError,maxThrowDirectionError:result.maxThrowDirectionError,errors}));
} finally {await browser.close()}
