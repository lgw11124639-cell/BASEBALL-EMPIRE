import * as T from "./vendor/three/three.module.js";
import { GLTFLoader } from "./vendor/three/GLTFLoader.js";
import { clone } from "./vendor/three/SkeletonUtils.js";
import { PitchRig, moundHeight, RUBBER_Y } from "./broadcast-pose.mjs";
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
let template;
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
export async function createPitcher(canvas) {
  template ||= new GLTFLoader().loadAsync(
    "assets/broadcast/pitcher3d/pitcher.glb?v=20261107-rig-pitch63",
  );
  const source = await template,
    model = clone(source.scene),
    rig = new PitchRig(model),
    scene = new T.Scene(),
    camera = new T.PerspectiveCamera(2.5, 1, 0.1, 150),
    renderer = new T.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  scene.add(rig.mirror);
  scene.add(new T.HemisphereLight(0xcce6ff, 0x473520, 2.1));
  const light = new T.DirectionalLight(0xffe8ce, 2.2);
  light.position.set(-5, 8, -8);
  scene.add(light);
  model.traverse((o) => {
    if (o.isMesh) {
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => m.clone())
        : o.material.clone();
    }
  });
  const attach = (bone, mesh, position) => {
    const world = new T.Matrix4().compose(
      new T.Vector3(...position),
      new T.Quaternion(),
      mesh.scale.clone(),
    );
    bone.updateWorldMatrix(true, false);
    mesh.matrix.copy(bone.matrixWorld.clone().invert().multiply(world));
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    bone.add(mesh);
    return mesh;
  };
  const head = rig.point("head"),
    capMat = new T.MeshStandardMaterial({ color: 0x183e65, roughness: 0.75 });
  const cap = new T.Mesh(
    new T.SphereGeometry(0.104, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    capMat,
  );
  cap.scale.set(1, 1, 1.12);
  attach(rig.bones.head, cap, [head.x, head.y + 0.125, head.z]);
  const visor = new T.Mesh(new T.BoxGeometry(0.16, 0.013, 0.12), capMat);
  attach(rig.bones.head, visor, [head.x, head.y + 0.126, head.z + 0.1]);
  const glove = new T.Mesh(
    new T.SphereGeometry(0.105, 20, 14),
    new T.MeshStandardMaterial({ color: 0x9a652d, roughness: 1 }),
  );
  glove.scale.set(0.8, 1, 0.55);
  attach(rig.bones["wrist.L"], glove, rig.point("wrist.L").toArray());
  const held = new T.Mesh(
    new T.SphereGeometry(0.037, 12, 8),
    new T.MeshStandardMaterial({ color: 0xfffaf0 }),
  );
  attach(rig.bones["wrist.R"], held, rig.point("wrist.R").toArray());
  const geometry = new T.CircleGeometry(2.75, 64);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++)
    pos.setY(i, moundHeight(pos.getX(i), pos.getZ(i)));
  geometry.computeVertexNormals();
  const mound = new T.Mesh(
    geometry,
    new T.MeshStandardMaterial({ color: 0x936c50, roughness: 1 }),
  );
  scene.add(mound);
  const ground = new T.Mesh(
    new T.PlaneGeometry(30, 40),
    new T.MeshStandardMaterial({ color: 0x32775a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.005, -10);
  scene.add(ground);
  const rubber = new T.Mesh(
    new T.BoxGeometry(0.61, 0.03, 0.152),
    new T.MeshStandardMaterial({ color: 0xf2eee0, roughness: 1 }),
  );
  rubber.position.set(0, RUBBER_Y - 0.015, 0);
  scene.add(rubber);
  let width = 0,
    height = 0,
    hand = "right",
    row = 0,
    phase = 0,
    released = false,
    disposed = false,
    activeKit = 0,
    batHand = "right",
    lastKitKey = "";
  const view = () => {
    camera.position.set(
      (hand === "left" ? 1 : -1) *
        ((hand === "left" && batHand === "right") ||
        (hand === "right" && batHand === "left")
          ? 6
          : 4),
      3.5,
      -70,
    );
    camera.lookAt(0, 1.25, 18.44);
    camera.updateMatrixWorld();
  };
  const render = () => {
    if (!disposed) renderer.render(scene, camera);
  };
  const shirt = document.createElement("canvas");
  shirt.width = shirt.height = 512;
  const shirtTexture = new T.CanvasTexture(shirt);
  shirtTexture.colorSpace = T.SRGBColorSpace;
  shirtTexture.flipY = false;
  shirtTexture.wrapS = T.RepeatWrapping;
  const fabric = document.createElement("canvas");
  fabric.width = fabric.height = 64;
  const weave = fabric.getContext("2d");
  weave.fillStyle = "#888";
  weave.fillRect(0, 0, 64, 64);
  weave.strokeStyle = "#999";
  weave.lineWidth = 1;
  for (let x = 0; x < 64; x += 2) {
    weave.beginPath();
    weave.moveTo(x, 0);
    weave.lineTo(x, 64);
    weave.stroke();
  }
  const fabricTexture = new T.CanvasTexture(fabric);
  fabricTexture.wrapS = fabricTexture.wrapT = T.RepeatWrapping;
  fabricTexture.repeat.set(10, 10);
  const api = {
    setBatterHand(value) {
      batHand = value;
      view();
    },
    resize(w, h) {
      if (w === width && h === height) return;
      width = w;
      height = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      view();
      render();
    },
    setKit(id, number = "") {
      const key = String(id) + ":" + number;
      if (key === lastKitKey) return;
      lastKitKey = key;
      activeKit = kits[id] ? id : 0;
      const kit = kits[activeKit],
        ctx = shirt.getContext("2d");
      ctx.fillStyle = kit[0];
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle =
        activeKit === 1 || activeKit === 5 || activeKit === 7 || activeKit === 9
          ? "#f0ece0"
          : kit[2];
      ctx.textAlign = "center";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(
        [
          "ROYALS",
          "MARINERS",
          "WAVES",
          "TITANS",
          "PHOENIX",
          "EAGLES",
          "KNIGHTS",
          "STORM",
          "SHARKS",
          "BLAZE",
        ][activeKit],
        384,
        113,
      );
      ctx.font = "bold 47px sans-serif";
      ctx.fillText(String(number ?? ""), 384, 163);
      shirtTexture.needsUpdate = true;
      capMat.color.set(kit[2]);
      model.traverse((o) => {
        if (o.isMesh)
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            if (m.name === "Jersey") {
              m.color.set("#ffffff");
              m.map = shirtTexture;
              m.bumpMap = fabricTexture;
              m.bumpScale = 0.001;
              m.needsUpdate = true;
            }
            if (m.name === "Pants") {
              m.color.set(kit[1]);
              m.bumpMap = fabricTexture;
              m.bumpScale = 0.001;
            }
            if (m.name === "Shoes") m.color.set("#14202a");
          }
      });
      render();
    },
    pose(p, r = 0, h = "right", ballReleased = false) {
      phase = p;
      row = r;
      hand = h;
      released = ballReleased;
      shirtTexture.repeat.x = h === "left" ? -1 : 1;
      shirtTexture.offset.x = h === "left" ? 1.5 : 0;
      rig.pose(p, r, h);
      held.visible = !ballReleased;
      view();
      render();
    },
    releasePoint(r, h) {
      const previousHand = hand;
      rig.pose(3, r, h);
      hand = h;
      view();
      const point = held.getWorldPosition(new T.Vector3()).project(camera);
      hand = previousHand;
      rig.pose(phase, row, hand);
      view();
      return [(point.x + 1) * 360, (1 - point.y) * 260];
    },
    inspect() {
      const head=rig.point('head').project(camera);
      return {
        headOnScreen:[(head.x+1)*width/2,(1-head.y)*height/2],
        ...rig.inspect(),
        phase,
        row,
        rubber: [0, RUBBER_Y, 0],
        kit: activeKit,
        jersey: kits[activeKit][0],
        throwingHand: held.getWorldPosition(new T.Vector3()).toArray(),
        gloveHand: glove.getWorldPosition(new T.Vector3()).toArray(),
      };
    },
    dispose() {
      disposed = true;
      shirtTexture.dispose();
      fabricTexture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      scene.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
        }
      });
    },
  };
  api.pose(0);
  api.resize(canvas.clientWidth || 720, canvas.clientHeight || 520);
  return api;
}
