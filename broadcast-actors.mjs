export const kits = [
  ["#eee8da", "#eee8da", "#1b3763"],
  ["#087e80", "#eee9db", "#07474d"],
  ["#66a9d8", "#e9e9eb", "#183e65"],
  ["#a24d40", "#e4e3e4", "#67332d"],
  ["#eee8d5", "#eee9df", "#a85c18"],
  ["#563778", "#ece6d8", "#3b2458"],
  ["#9ca8b2", "#dce0e2", "#293b49"],
  ["#1a5947", "#e9e5d6", "#174b3e"],
  ["#ecebea", "#e2e5e7", "#17648f"],
  ["#1c2428", "#e4e6e7", "#19232b"],
];
const atlases = new Map();
export async function uniformAtlas(id) {
  id = kits[id] ? id : 0;
  if (atlases.has(id)) return atlases.get(id);
  const task = (async () => {
    const img = new Image();
    img.src = "assets/broadcast/motion/batter-swing.webp";
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height),
      d = pixels.data,
      colors = kits[id].map((hex) =>
        [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16)),
      );
    for (let n = 0; n < d.length; n += 4) {
      if (!d[n + 3]) continue;
      const r = d[n],
        g = d[n + 1],
        b = d[n + 2],
        y = Math.floor(n / 4 / canvas.width) % 384;
      let channel = -1,
        shade = 1;
      if (g > r * 1.12 && g > b * 1.12) {
        channel = 0;
        shade = g / 128;
      } else if (b > r * 1.16 && b > g * 1.08) {
        channel = 1;
        shade = b / 175;
      } else if (y < 140 && r > g * 1.5 && r > b * 1.4) {
        channel = 2;
        shade = r / 175;
      }
      if (channel >= 0)
        for (let c = 0; c < 3; c++)
          d[n + c] = Math.min(255, colors[channel][c] * shade);
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  })();
  atlases.set(id, task);
  return task;
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
export function pitchFrame(phase) {
  return phase < 0.5
    ? 0
    : phase < 1.5
      ? 1
      : phase < 3
        ? 2
        : phase < 3.45
          ? 3
          : phase < 3.9
            ? 4
            : 5;
}
export const PITCH_UNIFORM_MANIFEST = "assets/broadcast/motion/pitcher-kits/manifest.json";
export function framePlacement(frame, row, hand = "right", bat = "right", spec) {
  // The native poses are right-handed; one whole-image reflection makes a left-hander.
  // These points coincide with the rubber in each coherent diagonal camera background.
  const x = hand === "left" ? 156 : 125, y = 452, scale = 1.2;
  const anchors = spec?.anchors || FRAME_ANCHORS;
  const releasePivot = spec?.releasePivot?.[row] || [104, 247];
  const landing = anchors[row][3];
  const anchor = frame < 3 ? anchors[row][frame] : frame === 3 ? releasePivot : anchors[row][frame];
  const target = frame < 4 ? [x,y] : [x + (landing[0]-releasePivot[0])*scale, y + (landing[1]-releasePivot[1])*scale];
  return {x:target[0]-anchor[0]*scale, y:target[1]-anchor[1]*scale, scale,
    pivot:[x,y], planted:target, anchor, mirror:hand === "left"};
}
let uniformManifestPromise;
async function uniformManifest() {
  if(!uniformManifestPromise) uniformManifestPromise = fetch(PITCH_UNIFORM_MANIFEST + "?v=20261107-club-pitch67")
    .then(response=>{if(!response.ok)throw Error("Pitcher uniforms unavailable");return response.json();});
  return uniformManifestPromise;
}
const pitchKits = new Map();
async function preparedKit(id) {
  id = kits[id] ? id : 0;
  if(pitchKits.has(id))return pitchKits.get(id).promise;
  const entry={frames:null,spec:null};
  entry.promise=(async()=>{
    const manifest=await uniformManifest();
    entry.spec=manifest.clubs[id];
    const source=new Image();source.src="assets/broadcast/motion/pitcher-kits/"+entry.spec.file+"?v=20261107-club-pitch67";
    await source.decode();
    const readerCanvas=document.createElement("canvas");readerCanvas.width=1536;readerCanvas.height=1024;
    const reader=readerCanvas.getContext("2d",{willReadFrequently:true});reader.drawImage(source,0,0);
    const images=[];
    // Decode each complete pose separately: avoids cropped-atlas corruption on iOS Safari.
    for(let row=0;row<4;row++)for(let col=0;col<6;col++){
      const tile=document.createElement("canvas");tile.width=tile.height=256;
      tile.getContext("2d").putImageData(reader.getImageData(col*256,row*256,256,256),0,0);
      const image=new Image();image.src=tile.toDataURL("image/png");images.push(image);
    }
    await Promise.all(images.map(image=>image.decode()));entry.frames=images;return images;
  })();
  pitchKits.set(id,entry);
  entry.promise.catch(()=>{if(pitchKits.get(id)===entry)pitchKits.delete(id);});
  return entry.promise;
}
export async function preparePitcherKits(ids) {
  await Promise.all(ids.map(preparedKit));
}
export async function createPitcher(canvas) {
  let images = await preparedKit(0);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let width = 720,
    height = 520,
    hand = "right",
    bat = "right",
    row = 0,
    phase = 0,
    frame = 0,
    kit = 0,
    released = false,
    disposed = false;
  const draw = () => {
    if (disposed) return;
    canvas.width = 1440;
    canvas.height = 1040;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const p = framePlacement(frame, row, hand, bat, pitchKits.get(kit)?.spec);
    ctx.save();
    if (p.mirror) {
      ctx.translate(720, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      images[row * 6 + frame],
      p.x,
      p.y,
      256 * p.scale,
      256 * p.scale,
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
      id = kits[id] ? id : 0;
      if (id === kit) return;
      kit = id;
      const loaded = pitchKits.get(id)?.frames || (await preparedKit(id));
      if (kit === id && !disposed) {
        images = loaded;
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
      const p = framePlacement(3, delivery, throwHand, bat, pitchKits.get(kit)?.spec),
        point = pitchKits.get(kit)?.spec?.release[delivery] || RELEASE_PIXELS[delivery],
        x = p.x + point[0] * p.scale;
      return [throwHand === "left" ? 720 - x : x, p.y + point[1] * p.scale];
    },
    inspect() {
      const p = framePlacement(frame, row, hand, bat, pitchKits.get(kit)?.spec);
      return {
        renderer: "complete-frame-sequence",
        source: "assets/broadcast/motion/pitcher-kits/club-"+kit+".webp",
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
