import * as T from './vendor/three/three.module.js';
const V=a=>new T.Vector3(...a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function material(color,roughness=.8){return new T.MeshStandardMaterial({color,roughness,metalness:0});}
function mesh(geometry,mat,parent,position=[0,0,0],scale=[1,1,1]){const m=new T.Mesh(geometry,mat);m.position.fromArray(position);m.scale.fromArray(scale);parent.add(m);return m;}
function line(points,mat,parent,radius=.002){const curve=new T.CatmullRomCurve3(points.map(V));return mesh(new T.TubeGeometry(curve,Math.max(12,points.length*3),radius,6,false),mat,parent);}
function fabricTexture(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),d=x.createImageData(128,128);let seed=7;for(let i=0;i<d.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=224+(seed>>>28);d.data[i]=d.data[i+1]=d.data[i+2]=n;d.data[i+3]=255;}x.putImageData(d,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(16,16);t.colorSpace=T.SRGBColorSpace;return t;}
export function addGear(scene){
 const cap=new T.Group();scene.add(cap);const capMat=material('#3b2458'),hair=material('#241b17');
 mesh(new T.SphereGeometry(.105,32,16,0,Math.PI*2,0,Math.PI/2),capMat,cap,[0,.105,0],[1,1.05,1.12]);
 mesh(new T.SphereGeometry(1,32,12),capMat,cap,[0,.106,.116],[.097,.009,.107]);
 mesh(new T.SphereGeometry(1,24,12),hair,cap,[0,.08,-.022],[.102,.027,.082]);
 line([[-.096,.108,0],[0,.211,0],[.096,.108,0]],material('#a28aad'),cap,.0009);
 const glove=new T.Group();scene.add(glove);const leather=material('#9f652d',.88),dark=material('#573319'),seam=material('#d6af75');
 mesh(new T.SphereGeometry(1,24,20),leather,glove,[0,0,0],[.096,.122,.057]);
 mesh(new T.SphereGeometry(1,20,16),dark,glove,[0,.006,.045],[.066,.089,.018]);
 for(let i=0;i<4;i++){const x=-.060+i*.038;line([[x,-.035,-.05],[x,.04,-.054],[x*.85,.106,-.012],[x*.8,.09,.034]],leather,glove,.018);line([[x+.009,-.02,-.064],[x+.009,.043,-.061],[x*.85+.009,.105,-.025]],seam,glove,.0015);}
 mesh(new T.SphereGeometry(1,16,12),leather,glove,[-.086,-.025,.01],[.037,.074,.04]);
 line([[-.085,-.065,.018],[-.085,.015,.049],[-.053,.07,.05],[0,.105,.05],[.066,.07,.045],[.086,-.035,.026]],seam,glove,.0025);
 const strap=mesh(new T.BoxGeometry(.12,.03,.012),leather,glove,[0,-.065,-.05]);strap.rotation.z=.1;
 const ball=new T.Group();scene.add(ball);mesh(new T.SphereGeometry(.0365,20,16),material('#f7f4e8',.7),ball);const red=material('#a63136');for(const sign of [-1,1]){const pts=[];for(let i=0;i<=20;i++){const a=i/20*Math.PI*2;pts.push([sign*.021,.029*Math.sin(a),.029*Math.cos(a)]);}line(pts,red,ball,.0008);}
 return{cap,capMat,glove,ball};
}
