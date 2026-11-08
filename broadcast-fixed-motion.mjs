// Physical meters, Y up, home plate along +Z. R/L are anatomical bone sides.
export const LANDING_FOOT=[.14,0,1.12], PIVOT_FOOT=[-.11,0,0];
const keys=[
 // phase, root, hip yaw, shoulder twist, lean, left ankle, right ankle, right wrist, left wrist
 [0,[0,-.025,0],-1.12,0,0,[.015,0,.075],PIVOT_FOOT,[-.27,1.40,.13],[-.24,1.42,.17]],
 [.35,[0,-.03,-.015],-1.22,-.04,.01,[.035,.10,.12],PIVOT_FOOT,[-.28,1.43,.12],[-.25,1.44,.16]],
 [.7,[0,-.035,-.02],-1.36,-.07,.02,[.12,.43,.23],PIVOT_FOOT,[-.27,1.47,.13],[-.24,1.48,.17]],
 [1,[0,-.035,-.025],-1.40,-.10,.02,[.12,.65,.29],PIVOT_FOOT,[-.26,1.49,.14],[-.23,1.50,.18]],
 [1.25,[0,-.06,.03],-1.35,-.12,.04,[.13,.50,.37],PIVOT_FOOT,[-.30,1.41,.09],[-.19,1.43,.30]],
 [1.5,[0,-.12,.15],-1.18,-.20,.07,[.14,.29,.61],PIVOT_FOOT,[-.38,1.12,-.08],[.02,1.42,.58]],
 [1.8,[0,-.20,.34],-.95,-.25,.10,[.14,.10,.91],PIVOT_FOOT,[-.42,1.18,-.11],[.15,1.40,.81]],
 [2,[0,-.23,.46],-.80,-.28,.12,[.14,.025,1.07],PIVOT_FOOT,[-.43,1.43,.04],[.19,1.35,.92]],
 [2.3,[0,-.21,.56],-.52,-.30,.16,LANDING_FOOT,[-.11,.035,.08],[-.38,1.63,.22],[.16,1.29,.99]],
 [2.6,[.01,-.15,.71],-.20,-.18,.23,LANDING_FOOT,[-.12,.09,.30],[-.31,1.75,.66],[.14,1.23,1.02]],
 [2.85,[.02,-.11,.82],.05,-.04,.32,LANDING_FOOT,[-.13,.16,.47],[-.22,1.79,1.12],[.13,1.19,1.06]],
 [3,[.02,-.10,.87],.18,.03,.43,LANDING_FOOT,[-.14,.24,.54],[-.17,1.73,1.43],[.12,1.16,1.11]],
 [3.18,[.02,-.08,.98],.35,.08,.69,LANDING_FOOT,[-.15,.43,.47],[.06,1.21,1.60],[.12,1.10,1.19]],
 [3.38,[.02,-.07,1.06],.46,.06,.88,LANDING_FOOT,[-.16,.61,.50],[.26,.78,1.58],[.13,1.07,1.24]],
 [3.58,[.02,-.06,1.13],.48,.03,.76,LANDING_FOOT,[-.15,.46,.86],[.29,.83,1.57],[.13,1.08,1.29]],
 [3.8,[.02,-.045,1.20],.42,0,.46,LANDING_FOOT,[-.13,.21,1.26],[.21,1.00,1.52],[.13,1.15,1.32]],
 [4,[.02,-.035,1.24],.36,0,.24,LANDING_FOOT,[-.11,0,1.47],[.12,1.12,1.47],[.13,1.25,1.34]],
];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function sample(column,phase){
 let i=0;while(i<keys.length-2&&phase>keys[i+1][0])i++;
 const a=keys[i],b=keys[i+1],duration=b[0]-a[0],t=clamp((phase-a[0])/duration,0,1);
 function one(k){const av=Array.isArray(a[column])?a[column][k]:a[column],bv=Array.isArray(b[column])?b[column][k]:b[column];
  const before=keys[Math.max(0,i-1)],after=keys[Math.min(keys.length-1,i+2)],v=(key)=>Array.isArray(key[column])?key[column][k]:key[column];
  const ma=av===bv?0:(bv-v(before))/(b[0]-before[0]),mb=av===bv?0:(v(after)-av)/(after[0]-a[0]);
  return (2*t*t*t-3*t*t+1)*av+(t*t*t-2*t*t+t)*duration*ma+(-2*t*t*t+3*t*t)*bv+(t*t*t-t*t)*duration*mb;
 }
 return Array.isArray(a[column])?a[column].map((_,k)=>one(k)):one(0);
}
export function skeletalPitchPose(phase,delivery=0){
 const p=clamp(Number(phase)||0,0,4),row=clamp(Math.trunc(delivery)||0,0,3);
 const pose={phase:p,delivery:row,root:sample(1,p),yaw:sample(2,p),twist:sample(3,p),lean:sample(4,p),left:sample(5,p),right:sample(6,p),handR:sample(7,p),handL:sample(8,p)};
 if(p<=2)pose.right=PIVOT_FOOT.slice();
 if(p>=2.3)pose.left=LANDING_FOOT.slice();
 pose.left[1]=Math.max(0,pose.left[1]);pose.right[1]=Math.max(0,pose.right[1]);
 // Distinct arm slots share one continuous body and the same planted left foot.
 const load=Math.max(0,Math.sin(clamp((p-1.15)/2.45,0,1)*Math.PI));
 if(row){const low=[0,.15,.46,1.02][row],wide=[0,-.13,-.30,-.14][row];pose.handR[1]-=low*load;pose.handR[0]+=wide*load;pose.lean+=[0,.05,.19,.68][row]*load;
  if(row===3){pose.root[1]-=.12*load;pose.handR[2]-=.20*Math.sin(clamp((p-1.15)/1.85,0,1)*Math.PI);}
 }
 // Shift balance onto the anatomical RIGHT leg while the LEFT leg is airborne.
 if(p<1.5)pose.root[0]-=.07*Math.sin(Math.PI*Math.min(1,p/1.5));
 // Stop recovery beside the landing foot, rather than walking away from rubber.
 if(p>3.38){const t=clamp((p-3.38)/.62,0,1);pose.root[2]-=.22*t;pose.right[2]-=.29*t;}
 if(row===3&&p>1.25){
  const armKeys=[[1.25,[-.30,1.41,.09]],[1.8,[-.32,1.38,-.12]],[2.15,[-.31,1.46,.10]],[2.45,[-.28,1.28,.25]],[2.7,[-.25,.68,.8]],[2.9,[-.18,.38,1.30]],[3,[-.12,.42,1.6]],[3.18,[.05,.57,1.75]],[3.38,[.25,.75,1.6]],[4,[.15,1.1,1.25]]];
  let i=0;while(i<armKeys.length-2&&p>armKeys[i+1][0])i++;
  const [a,v]=armKeys[i],[b,w]=armKeys[i+1],t=clamp((p-a)/(b-a),0,1),ease=t*t*(3-2*t);pose.handR=v.map((x,j)=>x+(w[j]-x)*ease);
  pose.inward=.12*Math.sin(Math.PI*clamp((p-1.25)/2.75,0,1));
 }
 if(row===3){
  const w=Math.sin(Math.PI*clamp((p-1.1)/2.9,0,1));
  pose.lean+=.30*w;pose.root[1]-=.08*w;
 }
 pose.pivotLocked=p<=2;pose.landingLocked=p>=2.3;
 return pose;
}
export const PITCH_DURATION_MS=2000;
export function phaseAtTime(ms){return 4*clamp(ms/PITCH_DURATION_MS,0,1);}
