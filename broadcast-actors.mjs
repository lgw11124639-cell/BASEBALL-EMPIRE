import {kits,normalizeUniformKey} from './broadcast-uniforms.mjs?v=20261107-proportions81';
export {kits};
const atlases = new Map();
export async function uniformAtlas(id, motion = "swing") {
  id = normalizeUniformKey(id);
  const key = motion + ":" + id;
  if(!atlases.has(key)) atlases.set(key,(async()=>{
    const url=(typeof id==="string"?"assets/broadcast/nations/"+id+"/"+motion+".webp":"assets/broadcast/motion/batter-"+motion+"/club-"+id+".webp")+"?v=20261107-proportions81";
    const image=new Image();image.src=url;await image.decode();return url;
  })());
  return atlases.get(key);
}
// Whole rendered poses from the user's selected sheet. No mesh, joint posing or body-part cuts.
export const PITCH_SHEET = "assets/broadcast/motion/pitcher-ten/reference.webp";
export const FRAME_ANCHORS = [
  [
    [156, 247],
    [139, 247],
    [104, 244],
    [166, 233],
    [129, 238],
    [132, 238],
  ],
  [
    [156, 247],
    [141, 247],
    [104, 247],
    [173, 244],
    [129, 241],
    [132, 243],
  ],
  [
    [156, 247],
    [139, 247],
    [105, 248],
    [173, 239],
    [129, 241],
    [132, 243],
  ],
  [
    [156, 247],
    [139, 247],
    [105, 248],
    [174, 244],
    [129, 241],
    [132, 243],
  ],
];
export const RELEASE_PIXELS = [
  [184, 23],
  [195, 50],
  [216, 76],
  [217, 131],
];
export const PITCH_FRAME_PHASES=[0,.35,1,1.35,1.85,2.5,3,3.25,3.65,4];
export const PITCH_KEY_FRAMES=[0,1,2,3,4,5,6,7,8,9];
export function pitchFrame(phase){const p=Math.max(0,Math.min(4,Number(phase)||0));let frame=0;for(let i=1;i<PITCH_FRAME_PHASES.length;i++){if(p<(PITCH_FRAME_PHASES[i-1]+PITCH_FRAME_PHASES[i])/2)break;frame=i;}return frame;}
export const PITCH_UNIFORM_MANIFEST="assets/broadcast/motion/pitcher-ten/manifest.json";
export function framePlacement(frame,row,hand="right",bat="right",spec){
 // Preserve the authored body ratio; fit one whole-body scale for all ten poses.
 const x=hand==="left"?156:160,y=452,anchor=spec?.anchor||[144,360],landing=spec?.landing?.[row]||[248,342],scaleY=spec?.renderScaleByDelivery?.[row]??spec?.renderScaleYByDelivery?.[row]??spec?.renderScaleY??4/3*1.07,scale=scaleY,releaseFrame=spec?.releaseFrame??6;
 return {x:x-anchor[0]*scale,y:y-anchor[1]*scaleY,scale,scaleY,pivot:[x,y],anchor,planted:frame<releaseFrame?[x,y]:[x+(landing[0]-anchor[0])*scale,y+(landing[1]-anchor[1])*scaleY],mirror:hand==="left"};
}
let uniformManifestPromise, uniformManifestData;
async function uniformManifest() {
  if(!uniformManifestPromise) uniformManifestPromise = fetch(PITCH_UNIFORM_MANIFEST + "?v=20261107-proportions81")
    .then(response=>{if(!response.ok)throw Error("Pitcher uniforms unavailable");return response.json();}).then(data=>{uniformManifestData=data;return data;});
  return uniformManifestPromise;
}
const specFor=id=>typeof id==="string"?uniformManifestData.nations[id]:uniformManifestData.clubs[id];
const pitchKits = new Map();
async function preparedKit(id) {
  id = normalizeUniformKey(id);
  if(pitchKits.has(id)){const entry=pitchKits.get(id);entry.lastUsed=performance.now();return entry.promise;}
  const entry={frames:null,spec:null};
  entry.promise=(async()=>{
    const manifest=await uniformManifest();
    entry.spec=specFor(id);
    entry.lastUsed=performance.now();
    const source=new Image();source.src=entry.spec.path+"?v=20261107-proportions81";
    await source.decode();
    const readerCanvas=document.createElement("canvas");readerCanvas.width=source.naturalWidth;readerCanvas.height=source.naturalHeight;
    const reader=readerCanvas.getContext("2d",{willReadFrequently:true});reader.drawImage(source,0,0);
    const images=[];
    // Keep complete decoded pixel tiles: no cropped-atlas drawing or duplicate PNG decoders on iOS.
    for(let index=0;index<manifest.framesPerDelivery*4;index++){
      const tile=document.createElement("canvas");tile.width=tile.height=manifest.tile;
      tile.getContext("2d").putImageData(reader.getImageData(index%manifest.columns*manifest.tile,Math.floor(index/manifest.columns)*manifest.tile,manifest.tile,manifest.tile),0,0);
      images.push(tile);
    }
    entry.frames=images;
    readerCanvas.width=readerCanvas.height=1;
    for(const [oldId,old]of [...pitchKits].sort((a,b)=>(a[1].lastUsed||0)-(b[1].lastUsed||0))){if(pitchKits.size<=2)break;if(oldId!==id&&old.frames)pitchKits.delete(oldId);}
    return images;
  })();
  pitchKits.set(id,entry);
  entry.promise.catch(()=>{if(pitchKits.get(id)===entry)pitchKits.delete(id);});
  return entry.promise;
}
export async function preparePitcherKits(ids) {
  await Promise.all(ids.map(preparedKit));
}
export async function createPitcher(canvas, initialKit = 0) {
  initialKit=normalizeUniformKey(initialKit);
  let images = await preparedKit(initialKit), spec=(await uniformManifest(),specFor(initialKit));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const buffer=document.createElement('canvas');buffer.width=1440;buffer.height=1040;
  const paint=buffer.getContext('2d',{willReadFrequently:true});
  canvas.width=1440;canvas.height=1040;
  let width = 720,
    height = 520,
    hand = "right",
    bat = "right",
    row = 0,
    phase = 0,
    frame = 0,
    kit = initialKit,
    released = false,
    disposed = false;
  const draw = () => {
    if (disposed) return;
    paint.setTransform(1,0,0,1,0,0);
    paint.clearRect(0,0,1440,1040);
    paint.globalAlpha=1;paint.globalCompositeOperation='source-over';
    paint.setTransform(2,0,0,2,0,0);
    paint.imageSmoothingEnabled=true;paint.imageSmoothingQuality='high';
    const p = framePlacement(frame, row, hand, bat, spec);
    paint.save();
    if (p.mirror) {
      paint.translate(720, 0);
      paint.scale(-1, 1);
    }
    // Match the rubber already present in each diagonal mound photograph.
    // The right-hander sets the support foot on its first-base edge.
    const rubberX=hand==="left"?156:125,rubberY=p.pivot[1];
    paint.fillStyle='rgba(49,31,20,.28)';paint.beginPath();paint.moveTo(rubberX-49,rubberY+2);paint.lineTo(rubberX+49,rubberY+2);paint.lineTo(rubberX+47,rubberY+9);paint.lineTo(rubberX-50,rubberY+9);paint.closePath();paint.fill();
    paint.fillStyle='#eee8d8';paint.beginPath();paint.moveTo(rubberX-48,rubberY-2);paint.lineTo(rubberX+48,rubberY-2);paint.lineTo(rubberX+46,rubberY+5);paint.lineTo(rubberX-49,rubberY+5);paint.closePath();paint.fill();
    paint.drawImage(
      images[row * spec.framesPerDelivery + frame],
      p.x,
      p.y,
      spec.tile * p.scale,
      spec.tile * p.scaleY,
    );
    paint.restore();
    // Replace every output pixel, including transparent pixels, in one operation.
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.putImageData(paint.getImageData(0,0,1440,1040),0,0);
    canvas.dataset.frame = String(frame);
    canvas.dataset.delivery = String(row);
  };
  const api = {
    setBatterHand(value) {
      if (bat !== value) {
        bat = value;
        draw();
      }
    },
    resize(w, h) {
      if (width !== w || height !== h) {
        width = w;
        height = h;
        draw();
      }
    },
    async setKit(id) {
      id = normalizeUniformKey(id);
      if (id === kit) return;
      kit = id;
      const nextSpec=specFor(id);
      const loaded = pitchKits.get(id)?.frames || (await preparedKit(id));
      if (kit === id && !disposed) {
        images = loaded;
        spec = nextSpec;
        draw();
      }
    },
    pose(value, delivery = 0, throwHand = "right", ballReleased = false) {
      const next = ballReleased?pitchFrame(value):Math.min(5,pitchFrame(value)),
        changed =
          next !== frame ||
          delivery !== row ||
          throwHand !== hand ||
          released !== ballReleased;
      phase = value;
      row = delivery;
      hand = throwHand;
      released = ballReleased;
      frame = next;
      if (changed) draw();
    },
    releasePoint(delivery, throwHand) {
      // Reflect pixel centers, not edges, so a left-hander still releases from the same skin pixel.
      const p = framePlacement(spec.releaseFrame, delivery, throwHand, bat, spec),
        point = spec?.release[delivery] || RELEASE_PIXELS[delivery],
        x = p.x + (point[0] + .5) * p.scale;
      return [throwHand === "left" ? 720 - x : x, p.y + (point[1] + .5) * p.scaleY];
    },
    inspect() {
      const p = framePlacement(frame, row, hand, bat, spec);
      return {
        renderer: "complete-frame-sequence",
        source: spec.path,
        frameCount:spec.framesPerDelivery,
        solidFramesOnly:true,
        atomicFrameReplace:true,
        fixedRubber:true,
        rubberPivot:p.pivot,
        rubberCenter:[hand==="left"?564:125,p.pivot[1]],
        keyFrame:PITCH_KEY_FRAMES.indexOf(frame),
        reference: PITCH_SHEET,
        uniformBaked: true,
        phase,
        frame,
        row,
        hand,
        bat,
        kit,
        released,
        wholeFrame: true,
        registration: p,
        pivotOnScreen: [
          ((p.mirror ? 720 - p.pivot[0] : p.pivot[0]) * width) / 720,
          (p.pivot[1] * height) / 520,
        ],
      };
    },
    dispose() {
      disposed = true;
      canvas.width = canvas.height = 1;
      images = null;
    },
  };
  draw();
  return api;
}
