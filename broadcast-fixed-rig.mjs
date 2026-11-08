import * as T from './vendor/three/three.module.js';
import {solveTwoBone} from './broadcast-pose.mjs';
import {skeletalPitchPose} from './broadcast-fixed-motion.mjs';
const V=a=>new T.Vector3(...a),Y=new T.Vector3(0,1,0);
export class ContinuousPitchRig {
 constructor(model){
  this.root=new T.Group();this.body=new T.Group();this.root.add(this.body);this.body.add(model);this.model=model;this.bones={};this.rest=new Map();
  model.traverse(b=>{if(b.isBone){this.bones[b.name]=b;this.bones[b.name.replace(/\.?([RL])$/,'.$1')]=b;this.rest.set(b,b.quaternion.clone());}});
  this.root.updateMatrixWorld(true);const pos=n=>this.point(n);this.restFoot={R:pos('foot.R'),L:pos('foot.L')};this.footQ={R:this.bones['foot.R'].getWorldQuaternion(new T.Quaternion()),L:this.bones['foot.L'].getWorldQuaternion(new T.Quaternion())};this.headRest=this.bones.head.getWorldQuaternion(new T.Quaternion());this.lengths={};
  for(const side of ['R','L'])for(const[type,a,b,c]of[['leg','upperleg01.','lowerleg01.','foot.'],['arm','upperarm01.','lowerarm01.','wrist.']])this.lengths[type+side]=[pos(a+side).distanceTo(pos(b+side)),pos(b+side).distanceTo(pos(c+side))];this.catcher=new T.Vector3(0,.9,18.44);this.handRest=this.bones['wrist.R'].getWorldQuaternion(new T.Quaternion());this.fingerForward=this.point('finger3-1.R').sub(this.point('wrist.R')).normalize();this.errors={};this.pose(0);
 }
 point(n){return this.bones[n].getWorldPosition(new T.Vector3());}
 rotateWorld(b,q){const parent=b.parent.getWorldQuaternion(new T.Quaternion()),current=b.getWorldQuaternion(new T.Quaternion());b.quaternion.copy(parent.invert().multiply(q.clone().multiply(current)));this.root.updateMatrixWorld(true);}
 orientWorld(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));this.root.updateMatrixWorld(true);}
 align(b,end,target){const p=b.getWorldPosition(new T.Vector3()),a=end.getWorldPosition(new T.Vector3()).sub(p).normalize(),d=target.clone().sub(p).normalize();this.rotateWorld(b,new T.Quaternion().setFromUnitVectors(a,d));}
 limb(type,side,target,pole){const leg=type==='leg',upper=this.bones[(leg?'upperleg01.':'upperarm01.')+side],lower=this.bones[(leg?'lowerleg01.':'lowerarm01.')+side],end=this.bones[(leg?'foot.':'wrist.')+side],head=upper.getWorldPosition(new T.Vector3()),solution=solveTwoBone(head,target,pole,...this.lengths[type+side]);this.align(upper,lower,solution.knee);this.align(lower,end,solution.end);this.errors[type+side]=solution.reachError;}
 pose(phase,row=0,hand='right'){
  this.phase=phase;this.row=row;this.hand=hand;this.root.scale.x=1;for(const[b,q]of this.rest)b.quaternion.copy(q);
  const p=this.targets=skeletalPitchPose(phase,row);this.body.position.fromArray(p.root);this.body.rotation.set(0,p.yaw,0);this.root.updateMatrixWorld(true);
  const leanAxis=new T.Vector3(1,0,0);for(const[name,w]of[['spine05',.35],['spine03',.35],['spine01',.30]])if(this.bones[name]){this.rotateWorld(this.bones[name],new T.Quaternion().setFromAxisAngle(Y,p.twist*w));this.rotateWorld(this.bones[name],new T.Quaternion().setFromAxisAngle(leanAxis,p.lean*w));if(p.inward)this.rotateWorld(this.bones[name],new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),p.inward*w));}
  // Absolute world-space gaze stays on the catcher as the torso rotates.
  if(this.bones.head){const gaze=this.catcher.clone().sub(this.point('head')).normalize();this.orientWorld(this.bones.head,new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),gaze).multiply(this.headRest));}
  for(const side of ['R','L']){const raw=side==='R'?p.right:p.left,target=V(raw);target.y+=this.restFoot[side].y;const hip=this.point('upperleg01.'+side),pole=hip.clone().add(new T.Vector3(side==='R'?-.10:.10,.08,1));this.limb('leg',side,target,pole);const yaw=side==='R'?(phase<2?-.65:Math.max(-.65,-.65+(phase-2)*.45)):-.15;const pitch=side==='L'?Math.min(.65,raw[1]*.9):Math.min(.75,raw[1]*1.8);const q=new T.Quaternion().setFromAxisAngle(Y,yaw).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),pitch)).multiply(this.footQ[side]);this.orientWorld(this.bones['foot.'+side],q);}
  // Anatomical reach is built into the arm trajectory; never animate scale.
  const curves=[
   [[1.2,[-.15,.02,-.15]],[1.8,[-.19,.24,-.25]],[2.2,[-.10,.40,-.23]],[2.6,[-.04,.43,.15]],[3,[.02,.23,.47]],[3.2,[.22,-.12,.43]],[3.45,[.30,-.30,.20]],[4,[.10,-.17,.27]]],
   [[1.2,[-.15,.02,-.15]],[1.8,[-.29,.14,-.23]],[2.2,[-.25,.29,-.22]],[2.6,[-.20,.30,.25]],[3,[-.10,.12,.50]],[3.2,[.18,-.18,.43]],[3.45,[.30,-.30,.20]],[4,[.10,-.17,.27]]],
   [[1.2,[-.15,.02,-.15]],[1.8,[-.39,-.04,-.21]],[2.2,[-.42,.02,-.18]],[2.6,[-.39,.00,.30]],[3,[-.15,-.05,.50]],[3.2,[.18,-.19,.42]],[3.45,[.30,-.30,.20]],[4,[.10,-.17,.27]]],
   [[1.2,[-.15,.02,-.15]],[1.8,[-.08,.28,-.32]],[2.15,[-.05,.42,-.31]],[2.45,[-.03,.38,-.34]],[2.7,[-.03,.04,-.50]],[2.9,[-.02,-.48,.13]],[3,[.00,-.47,.25]],[3.2,[.10,-.38,.32]],[3.45,[.22,-.29,.25]],[4,[.08,-.17,.27]]]
  ];
  const curve=curves[row];let k=0;while(k<curve.length-2&&phase>curve[k+1][0])k++;
  const [a,av]=curve[k],[b,bv]=curve[k+1],t=T.MathUtils.clamp((phase-a)/(b-a),0,1),ease=t*t*(3-2*t);
  const offset=V(av.map((v,i)=>v+(bv[i]-v)*ease));
  const rightShoulder=this.point('upperarm01.R'),leftShoulder=this.point('upperarm01.L');
  const forward=new T.Vector3(Math.sin(p.yaw+p.twist),0,Math.cos(p.yaw+p.twist));
  const holding=rightShoulder.clone().add(leftShoulder).multiplyScalar(.5).addScaledVector(forward,.22).add(new T.Vector3(0,-.13,0));
  const separate=T.MathUtils.smoothstep(phase,1.2,1.65);
  p.handR=holding.clone().lerp(rightShoulder.clone().add(offset),separate).toArray();
  const tuck=T.MathUtils.smoothstep(phase,2.1,2.8);
  const extended=leftShoulder.clone().add(new T.Vector3(.02,-.08,.39));
  const tucked=leftShoulder.clone().addScaledVector(forward,.19).add(new T.Vector3(0,-.17,0));
  const gloveTarget=extended.lerp(tucked,tuck);
  p.handL=holding.clone().addScaledVector(forward,.025).add(new T.Vector3(0,.012,0)).lerp(gloveTarget,separate).toArray();
  for(const side of ['R','L']){const shoulder=this.point('upperarm01.'+side),pole=shoulder.clone().add(new T.Vector3(side==='R'?-.7:.7,phase>2&&phase<3.05?.15:-.15,-.25));this.limb('arm',side,V(p['hand'+side]),pole);}
  if(phase<1.3){const direction=new T.Vector3(Math.sin(p.yaw+p.twist),0,Math.cos(p.yaw+p.twist));this.orientWorld(this.bones['wrist.R'],new T.Quaternion().setFromUnitVectors(this.fingerForward,direction).multiply(this.handRest));}
  // The bare throwing hand follows the actual mitt direction around release.
  if(phase>=2.65&&phase<=3.35){const direction=this.catcher.clone().sub(this.point('wrist.R')).normalize();const aim=new T.Quaternion().setFromUnitVectors(this.fingerForward,direction).multiply(this.handRest);const current=this.bones['wrist.R'].getWorldQuaternion(new T.Quaternion());const weight=Math.min(1,(phase-2.65)/.3);this.orientWorld(this.bones['wrist.R'],current.slerp(aim,weight));}
  for(const side of ['R','L'])for(let finger=1;finger<=5;finger++)for(let joint=1;joint<=3;joint++){const b=this.bones[`finger${finger}-${joint}.${side}`];if(b)b.rotateX(side==='L'?.75:phase<3?.50:.20);}
  this.root.scale.x=hand==='left'?-1:1;this.root.updateMatrixWorld(true);this.model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});return this;
 }
 inspect(){const sole=s=>{const p=this.point('foot.'+s);p.y-=this.restFoot[s].y;return p.toArray();};return{phase:this.phase,hand:this.hand,delivery:this.row,rightSole:sole('R'),leftSole:sole('L'),rightKnee:this.point('lowerleg01.R').toArray(),leftKnee:this.point('lowerleg01.L').toArray(),throwingBone:this.hand==='left'?'mirrored wrist.R':'wrist.R',gloveBone:this.hand==='left'?'mirrored wrist.L':'wrist.L',pivotLocked:this.targets.pivotLocked,landingLocked:this.targets.landingLocked,errors:{...this.errors}};}
}
