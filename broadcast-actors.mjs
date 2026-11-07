import {kits,normalizeUniformKey} from './broadcast-uniforms.mjs?v=20261107-solid-uniform69';
export {kits};
const atlases = new Map();
export async function uniformAtlas(id, motion = "swing") {
  id = normalizeUniformKey(id);
  const key = motion + ":" + id;
  if(!atlases.has(key)) atlases.set(key,(async()=>{
    const url=(typeof id==="string"?"assets/broadcast/nations/"+id+"/"+motion+".webp":"assets/broadcast/motion/batter-"+motion+"/club-"+id+".webp")+"?v=20261107-solid-uniform69";
    const image=new Image();image.src=url;await image.decode();return url;
  })());
  return atlases.get(key);
}
// Whole rendered poses from the user's selected sheet. No mesh, joint posing or body-part cuts.
export const PITCH_SHEET = "assets/broadcast/motion/pitcher-complete.png";
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
export const PITCH_FRAME_PHASES=[0,.45,1,2,3,3.5,4];
export const PITCH_KEY_FRAMES=[0,1,2,3,4,5,6];
export function pitchFrame(phase){const p=Math.max(0,Math.min(4,Number(phase)||0));return p<.35?0:p<.85?1:p<1.7?2:p<3?3:p<3.35?4:p<3.8?5:6;}
export const PITCH_UNIFORM_MANIFEST="assets/broadcast/motion/pitcher-solid/manifest.json";
export function framePlacement(frame,row,hand="right",bat="right",spec){
 const x=hand==="left"?156:125,y=452,scale=1.2,anchor=[144,270],landing=spec?.landing?.[row]||[204,254];
 return {x:x-anchor[0]*scale,y:y-anchor[1]*scale,scale,pivot:[x,y],anchor,planted:frame<4?[x,y]:[x+(landing[0]-144)*scale,y+(landing[1]-270)*scale],mirror:hand==="left"};
}
let uniformManifestPromise, uniformManifestData;
async function uniformManifest() {
  if(!uniformManifestPromise) uniformManifestPromise = fetch(PITCH_UNIFORM_MANIFEST + "?v=20261107-solid-uniform69")
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
    const source=new Image();source.src=entry.spec.path+"?v=20261107-solid-uniform69";
    await source.decode();
    const readerCanvas=document.createElement("canvas");readerCanvas.width=source.naturalWidth;readerCanvas.height=source.naturalHeight;
    const reader=readerCanvas.getContext("2d",{willReadFrequently:true});reader.drawImage(source,0,0);
    const images=[];
    // Decode each complete pose separately: avoids cropped-atlas corruption on iOS Safari.
    for(let index=0;index<manifest.framesPerDelivery*4;index++){
      const tile=document.createElement("canvas");tile.width=tile.height=manifest.tile;
      tile.getContext("2d").putImageData(reader.getImageData(index%manifest.columns*manifest.tile,Math.floor(index/manifest.columns)*manifest.tile,manifest.tile,manifest.tile),0,0);
      const image=new Image();image.src=tile.toDataURL("image/png");images.push(image);
    }
    await Promise.all(images.map(image=>image.decode()));entry.frames=images;
    readerCanvas.width=readerCanvas.height=1;
    for(const [oldId,old]of [...pitchKits].sort((a,b)=>(a[1].lastUsed||0)-(b[1].lastUsed||0))){if(pitchKits.size<=3)break;if(oldId!==id&&old.frames)pitchKits.delete(oldId);}
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
    canvas.width = 1440;
    canvas.height = 1040;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const p = framePlacement(frame, row, hand, bat, spec);
    ctx.save();
    if (p.mirror) {
      ctx.translate(720, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      images[row * 7 + frame],
      p.x,
      p.y,
      288 * p.scale,
      288 * p.scale,
    );
    ctx.restore();
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
      const next = pitchFrame(value),
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
      const p = framePlacement(4, delivery, throwHand, bat, spec),
        point = spec?.release[delivery] || RELEASE_PIXELS[delivery],
        x = p.x + (point[0] + .5) * p.scale;
      return [throwHand === "left" ? 720 - x : x, p.y + (point[1] + .5) * p.scale];
    },
    inspect() {
      const p = framePlacement(frame, row, hand, bat, spec);
      return {
        renderer: "complete-frame-sequence",
        source: spec.path,
        frameCount:7,
        solidFramesOnly:true,
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
