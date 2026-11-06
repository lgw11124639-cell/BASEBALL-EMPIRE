import * as T from "./vendor/three/three.module.js";
export const HOME_Z = 18.44,
  RUBBER_Y = 0.269;
export const moundHeight = (x, z) =>
  0.254 * Math.max(0, 1 - (x * x + z * z) / (2.75 * 2.75));
const V = (a) => new T.Vector3(...a),
  lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const targets = [
  {
    root: [0, -0.025, 0],
    yaw: -0.12,
    lean: 0,
    left: [0.44, 0, 0],
    right: [0, 0, 0],
    handR: [0.2, 1.55, 0.22],
    handL: [0.3, 1.55, 0.24],
  },
  {
    root: [0, -0.035, -0.02],
    yaw: -0.8,
    lean: 0.03,
    left: [-0.08, 0.7, 0.38],
    right: [0, 0, 0],
    handR: [0.25, 1.65, 0.25],
    handL: [0.28, 1.64, 0.26],
  },
  {
    root: [0, -0.3, 0.6],
    yaw: -0.12,
    lean: 0.12,
    left: [0.22, 0, 1.2],
    right: [0, 0, 0],
    handR: [-0.28, 1.7, 0.48],
    handL: [0.45, 1.4, 1.1],
  },
  {
    root: [0, -0.24, 0.9],
    yaw: 0.12,
    lean: 0.35,
    left: [0.22, 0, 1.2],
    right: [-0.08, 0.12, 0.36],
    handR: [-0.1, 1.98, 1.21],
    handL: [0.45, 1.28, 1.1],
  },
  {
    root: [0, -0.22, 1.12],
    yaw: 0.4,
    lean: 0.8,
    left: [0.22, 0, 1.2],
    right: [-0.3, 0.65, 0.62],
    handR: [0.48, 1.12, 1.55],
    handL: [0.5, 1.18, 1.2],
  },
];
export function pitchTargets(phase, row = 0) {
  const value = Math.max(0, Math.min(4, phase)),
    lo = Math.floor(value),
    hi = Math.min(4, lo + 1),
    f = value - lo,
    t = f * f * (3 - 2 * f),
    a = targets[lo],
    b = targets[hi],
    p = {};
  for (const key of ["root", "left", "right", "handR", "handL"])
    p[key] = lerp(a[key], b[key], t);
  for (const key of ["yaw", "lean"]) p[key] = a[key] + (b[key] - a[key]) * t;
  const release = [
      [-0.1, 1.98, 1.21],
      [-0.35, 1.84, 1.23],
      [-0.48, 1.3, 1.21],
      [-0.27, 0.7, 1.35],
    ][row],
    weight = value <= 2 ? 0 : value <= 3 ? value - 2 : Math.max(0, 4 - value);
  p.handR = p.handR.map(
    (v, i) => v + (release[i] - targets[3].handR[i]) * weight,
  );
  p.lean += [0, 0.08, 0.25, 0.72][row] * weight;
  return p;
}
export function solveTwoBone(hip, target, pole, a, b) {
  const delta = target.clone().sub(hip),
    distance = delta.length(),
    d = Math.max(Math.abs(a - b) + 1e-6, Math.min(a + b - 1e-6, distance)),
    direction = delta.multiplyScalar(1 / (distance || 1)),
    along = (a * a - b * b + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, a * a - along * along)),
    bend = pole.clone().sub(hip);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1);
  bend.normalize();
  return {
    knee: hip
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(bend, height),
    end: hip.clone().addScaledVector(direction, d),
    reachError: Math.abs(distance - d),
  };
}
export class PitchRig {
  constructor(model) {
    this.mirror = new T.Group();
    this.body = new T.Group();
    this.mirror.add(this.body);
    this.body.add(model);
    this.model = model;
    this.bones = {};
    this.rest = new Map();
    model.traverse((o) => {
      if (o.isBone) {
        this.bones[o.name] = o;
        this.bones[o.name.replace(/(R|L)$/, ".$1")] = o;
        this.rest.set(o, o.quaternion.clone());
      }
    });
    this.mirror.updateMatrixWorld(true);
    const pos = (name) => this.bones[name].getWorldPosition(new T.Vector3());
    this.restFoot = { R: pos("foot.R"), L: pos("foot.L") };
    this.offset = -this.restFoot.R.x;
    this.ankleY = this.restFoot.R.y;
    this.footQ = {
      R: this.bones["foot.R"].getWorldQuaternion(new T.Quaternion()),
      L: this.bones["foot.L"].getWorldQuaternion(new T.Quaternion()),
    };
    this.lengths = {};
    for (const side of ["R", "L"]) {
      this.lengths["leg" + side] = [
        pos("upperleg01." + side).distanceTo(pos("lowerleg01." + side)),
        pos("lowerleg01." + side).distanceTo(pos("foot." + side)),
      ];
      this.lengths["arm" + side] = [
        pos("upperarm01." + side).distanceTo(pos("lowerarm01." + side)),
        pos("lowerarm01." + side).distanceTo(pos("wrist." + side)),
      ];
    }
    this.hand = "right";
    this.phase = 0;
    this.row = 0;
    this.errors = {};
    this.reset();
  }
  reset() {
    this.mirror.scale.x = 1;
    for (const [bone, q] of this.rest) bone.quaternion.copy(q);
  }
  rotateWorld(bone, q) {
    const parent = bone.parent.getWorldQuaternion(new T.Quaternion()),
      current = bone.getWorldQuaternion(new T.Quaternion());
    bone.quaternion.copy(parent.invert().multiply(q.clone().multiply(current)));
    this.mirror.updateMatrixWorld(true);
  }
  orientWorld(bone, q) {
    const parent = bone.parent.getWorldQuaternion(new T.Quaternion());
    bone.quaternion.copy(parent.invert().multiply(q));
    this.mirror.updateMatrixWorld(true);
  }
  align(bone, end, target) {
    const a = bone.getWorldPosition(new T.Vector3()),
      current = end.getWorldPosition(new T.Vector3()).sub(a).normalize(),
      desired = target.clone().sub(a).normalize();
    this.rotateWorld(
      bone,
      new T.Quaternion().setFromUnitVectors(current, desired),
    );
  }
  limb(type, side, target, pole) {
    const leg = type === "leg",
      upper = this.bones[(leg ? "upperleg01." : "upperarm01.") + side],
      lower = this.bones[(leg ? "lowerleg01." : "lowerarm01.") + side],
      end = this.bones[(leg ? "foot." : "wrist.") + side],
      head = upper.getWorldPosition(new T.Vector3()),
      lengths = this.lengths[type + side],
      solution = solveTwoBone(head, target, pole, ...lengths);
    this.align(upper, lower, solution.knee);
    this.align(lower, end, solution.end);
    this.errors[type + side] = solution.reachError;
  }
  pose(phase, row = 0, hand = "right") {
    this.phase = phase;
    this.row = row;
    this.hand = hand;
    this.reset();
    const p = pitchTargets(phase, row);
    this.body.position.set(
      this.offset + p.root[0],
      RUBBER_Y + p.root[1],
      p.root[2],
    );
    this.body.rotation.set(0, p.yaw, 0);
    this.mirror.updateMatrixWorld(true);
    const axis = new T.Vector3(1, 0, 0).applyAxisAngle(
      new T.Vector3(0, 1, 0),
      p.yaw,
    );
    for (const [name, weight] of [
      ["spine05", 0.45],
      ["spine03", 0.55],
    ])
      if (this.bones[name])
        this.rotateWorld(
          this.bones[name],
          new T.Quaternion().setFromAxisAngle(axis, p.lean * weight),
        );
    if (this.bones.head)
      this.rotateWorld(
        this.bones.head,
        new T.Quaternion().setFromAxisAngle(axis, -p.lean * 0.45),
      );
    for (const side of ["R", "L"]) {
      const raw = side === "R" ? p.right : p.left,
        ankle = V(raw);
      ankle.y =
        raw[1] +
        moundHeight(ankle.x, ankle.z) +
        this.restFoot[side].y +
        (side === "R" && Math.abs(raw[0]) + Math.abs(raw[2]) < 0.001
          ? 0.015
          : 0);
      const hip = this.bones["upperleg01." + side].getWorldPosition(
          new T.Vector3(),
        ),
        pole = hip
          .clone()
          .add(
            new T.Vector3(
              side === "L"
                ? -Math.sin((Math.min(1, phase) * Math.PI) / 2) *
                  Math.max(0, 2 - phase) *
                  0.7
                : 0,
              0.1,
              1,
            ),
          );
      this.limb("leg", side, ankle, pole);
      this.orientWorld(this.bones["foot." + side], this.footQ[side].clone());
    }
    for (const side of ["R", "L"]) {
      const shoulder = this.bones["upperarm01." + side].getWorldPosition(
          new T.Vector3(),
        ),
        pole = shoulder
          .clone()
          .add(new T.Vector3(side === "R" ? -0.7 : 0.7, 0, -0.3));
      this.limb("arm", side, V(p["hand" + side]), pole);
    }
    this.mirror.scale.x = hand === "left" ? -1 : 1;
    this.mirror.updateMatrixWorld(true);
    this.model.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton.update();
    });
    return this;
  }
  point(name) {
    return this.bones[name].getWorldPosition(new T.Vector3());
  }
  inspect() {
    const side = this.hand === "left" ? -1 : 1,
      sole = (s) => {
        const p = this.point("foot." + s);
        p.y -= this.restFoot[s].y;
        return p.toArray();
      };
    return {
      hand: this.hand,
      throwingBone: "wrist.R",
      gloveBone: "wrist.L",
      mirrored: side < 0,
      rightSole: sole("R"),
      leftSole: sole("L"),
      rightKnee: this.point("lowerleg01.R").toArray(),
      leftKnee: this.point("lowerleg01.L").toArray(),
      errors: { ...this.errors },
    };
  }
}
