import * as T from './vendor/three/three.module.js';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';
import {ContinuousPitchRig} from './broadcast-fixed-rig.mjs';
import {addGear} from './broadcast-fixed-gear.mjs';
import {kits} from './broadcast-uniforms.mjs';
const $=id=>document.getElementById(id),status=$('status');
try {
const model=(await new GLTFLoader().loadAsync('assets/broadcast/pitcher-fixed/pitcher.glb')).scene;
const rig=new ContinuousPitchRig(model),scene=new T.Scene();scene.add(rig.root);
scene.add(new T.HemisphereLight(0xf2f5ff,0x666458,2));for(const [x,y,z,intensity] of [[-3,5,4,2.3],[3,3,-4,.9]]){const l=new T.DirectionalLight(0xfff8ef,intensity);l.position.set(x,y,z);scene.add(l)}
const gear=addGear(scene);
const camera=new T.PerspectiveCamera(30.39573,720/520,.05,100);
function cameraFor(hand){const sign=hand==='left'?-1:1;camera.position.set(4.374500804*sign,1.690242036,-6.235347234);const yaw=-.1549653225*sign,pitch=.1459206422;camera.lookAt(camera.position.clone().add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch))));camera.updateProjectionMatrix();camera.projectionMatrix.elements[8]=2*249.999999999/720*sign;camera.projectionMatrix.elements[9]=-2*199.999999999/520;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();document.querySelector('.stage').classList.toggle('left',hand==='left');}

const canvas=document.querySelector('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(1440,1040,false);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
const rubber=new T.Mesh(new T.BoxGeometry(.61,.017,.15),new T.MeshStandardMaterial({color:0xf3eedf,roughness:.9}));rubber.position.set(.16,-.005,.015);scene.add(rubber);
const shadow=new T.Mesh(new T.CircleGeometry(.65,64),new T.MeshBasicMaterial({color:0x667066,transparent:true,opacity:.12,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.016;shadow.scale.set(1,.6,1);scene.add(shadow);
const uniforms=new Map();model.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(['Jersey','Pants','CapFabric','Collar','Piping'].includes(m.name)&&!uniforms.has(m)){const color={value:new T.Color(1,1,1)};m.onBeforeCompile=shader=>{shader.uniforms.kitColor=color;shader.fragmentShader='uniform vec3 kitColor;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\n${m.name==='Jersey'||m.name==='Pants'?'float lum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=kitColor*clamp(lum/'+(m.name==='Jersey'?'.12':'.65')+',.45,1.7);':'diffuseColor.rgb=kitColor;'}`)};m.customProgramCacheKey=()=>m.name+'-kit-v1';uniforms.set(m,{color,name:m.name});}}});
const keys=[...Array(10).keys(),...Object.keys(kits).filter(k=>!/^\d+$/.test(k))];for(const key of keys){const o=new Option(typeof key==='number'?['로열스','돌핀스','블루윙스','레드폭스','골든베어스','이글스','실버나이츠','그린스','웨일스','블랙스'][key]:key,key);$('kit').add(o)}$('kit').value='5';
function setKit(key){const colors=kits[key];for(const {color,name}of uniforms.values())color.value.set(colors[name==='Pants'?1:name==='Jersey'?0:2]);gear.capMat.color.set(colors[2]);}
let frame=0,row=0,hand='right',playing=false,started=0,startFrame=0;const releaseCache=new Map();
function accessories(){const mirror=hand==='left'?-1:1;const head=rig.point('head'),hq=rig.bones.head.getWorldQuaternion(new T.Quaternion()).multiply(rig.headRest.clone().invert());gear.cap.visible=false;
const wrist=rig.point('wrist.L'),chest=rig.point('spine01'),direction=chest.sub(wrist).normalize();gear.glove.position.copy(wrist).addScaledVector(direction,-.025);gear.glove.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction);gear.glove.scale.x=mirror;
const r=rig.point('wrist.R'),f=rig.point('finger3-1.R').sub(r).normalize();gear.ball.position.copy(r).addScaledVector(f,.055);gear.ball.visible=true;
if(rig.phase>=3){const key=rig.row+':'+hand;let release=releaseCache.get(key);if(!release){const saved=rig.phase;rig.pose(3,rig.row,hand);const wrist=rig.point('wrist.R'),finger=rig.point('finger3-1.R').sub(wrist).normalize();release=wrist.addScaledVector(finger,.055);releaseCache.set(key,release.clone());rig.pose(saved,rig.row,hand);}const t=T.MathUtils.clamp((rig.phase-3)/.85,0,1),target=new T.Vector3(0,.9,18.44);gear.ball.position.copy(release).lerp(target,t);gear.ball.position.y+=.18*4*t*(1-t);gear.ball.visible=t<1;}
rubber.scale.x=mirror;
}
function draw(p=frame/119*4,form=row){cameraFor(hand);rig.pose(p,form,hand);accessories();renderer.clear();renderer.render(scene,camera);$('frame').value=frame;$('counter').textContent=`${frame+1} / 120`;canvas.dataset.frame=frame;canvas.dataset.delivery=form;window.currentFrame=frame;}
function stop(){playing=false;$('play').textContent='▶ 재생'}
function tick(now){if(!playing)return;const elapsed=Math.floor((now-started)*.06);frame=Math.min(119,startFrame+elapsed);draw();if(frame===119)stop();else requestAnimationFrame(tick)}
$('play').onclick=()=>{if(playing){stop();return}if(frame===119)frame=0;startFrame=frame;started=performance.now();playing=true;$('play').textContent='Ⅱ 일시정지';requestAnimationFrame(tick)};
$('frame').oninput=e=>{stop();frame=+e.target.value;draw()};$('prev').onclick=()=>{stop();frame=Math.max(0,frame-1);draw()};$('next').onclick=()=>{stop();frame=Math.min(119,frame+1);draw()};$('form').onchange=e=>{stop();row=+e.target.value;draw()};$('hand').onchange=e=>{hand=e.target.value;draw()};$('kit').onchange=e=>{setKit(e.target.value);draw()};
setKit(5);draw();status.textContent='120개 자세 · 60fps 시간 기준 · 오른발 지지 / 왼무릎 상승';window.prototype={rig,draw,scene,renderer,camera,T,setKit,gear,inspect:()=>({frame,row,hand,kit:$('kit').value,frameCount:120,durationMs:2000,playing})};window.ready=true;
} catch(e){status.textContent=e.message;status.classList.add('error');throw e}
