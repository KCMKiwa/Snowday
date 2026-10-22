// Rider: a photo-textured human (Microsoft Rocketbox, MIT) dressed for the snow (tinted
// shell over the original fabric, gloves, boots) with their own winter hat (hats.js), on a
// snowboard or on skis (skis.js: skis, ski boots on the feet and shins, poles in the fists).
// On the snow it is posed with two-bone IK each frame; in the menu it stands next to
// its planted board or skis and plays motion-captured idles (Rocketbox / Movebox mocap).
// Board-local frame: nose at -Z, rider faces +X (toe edge), regular stance (left foot forward).
// On skis the body is turned a quarter turn so the skier faces the ski tips.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeBoard, BOARD_TOP_Y } from './boards.js';
import { buildHat, buildGoggles, headShape, skullShape } from './hats.js';
import { makeSki, makeSkiBoot, makePole, SKI_TOP_Y, SKI_LEN, POLE_LEN } from './skis.js';
import { damp, wrapPi } from './physics.js';

export const OUTFITS = [
  { id: 'signal', name: 'Signal', jacket: '#ff5a1f', accent: '#1b1f2a', pants: '#1f2738', helmet: '#f1f3f6', glove: '#151820', lens: '#ffa630', boot: '#22252c' },
  { id: 'glacier', name: 'Glacier', jacket: '#3d9cff', accent: '#e9eef5', pants: '#e6ebf2', helmet: '#1c2431', glove: '#1c2431', lens: '#5fe3ff', boot: '#2b3140' },
  { id: 'moss', name: 'Moss', jacket: '#5f7f3b', accent: '#c8b388', pants: '#c8b388', helmet: '#2b2b2b', glove: '#3a2b1d', lens: '#ffcf3d', boot: '#3a2b1d' },
  { id: 'berry', name: 'Berry', jacket: '#ff4fa3', accent: '#2b2140', pants: '#2b2140', helmet: '#ffffff', glove: '#2b2140', lens: '#b06bff', boot: '#1d1726' },
  { id: 'volt', name: 'Volt', jacket: '#d7ff3a', accent: '#111317', pants: '#111317', helmet: '#111317', glove: '#d7ff3a', lens: '#ff3d7f', boot: '#111317' },
  { id: 'night', name: 'Night', jacket: '#1a1d26', accent: '#7b5cff', pants: '#3a3f4d', helmet: '#7b5cff', glove: '#1a1d26', lens: '#4dffd2', boot: '#101218' },
];

const FOOT_Z = 0.26;
const BOARD_TOP = BOARD_TOP_Y + 0.018; // deck plus binding baseplate
const STANCE = [0.31, -0.16];
const CHAR_HEIGHT = 1.74;

// Hand target (board-local), which hand, torso lean, hip height (fraction of leg), board tweak (pitch, roll).
const GRAB_POSES = {
  indy: { hand: 'rear', target: [0.14, 0.05, 0.1], lean: [1.2, 0.25], hip: 0.42, pitch: 0 },
  mute: { hand: 'front', target: [0.14, 0.05, -0.1], lean: [1.2, -0.25], hip: 0.42, pitch: 0 },
  melon: { hand: 'front', target: [-0.13, 0.05, -0.12], lean: [0.55, -0.7], hip: 0.4, pitch: 0 },
  stalefish: { hand: 'rear', target: [-0.13, 0.05, 0.14], lean: [0.55, 0.7], hip: 0.4, pitch: 0 },
  nose: { hand: 'front', target: [0.0, 0.1, -0.68], lean: [0.4, -1.1], hip: 0.45, pitch: 0.32 },
  tail: { hand: 'rear', target: [0.0, 0.1, 0.68], lean: [0.4, 1.1], hip: 0.45, pitch: -0.32 },
  // method: heel edge pulled up behind the back; japan: toe edge tucked in front of the front knee
  method: { hand: 'front', target: [-0.13, 0.05, -0.02], lean: [-0.1, -0.35], hip: 0.5, pitch: 0.1, roll: 0.65 },
  japan: { hand: 'front', target: [0.14, 0.05, -0.32], lean: [1.0, -0.5], hip: 0.4, pitch: 0.18, roll: -0.45 },
};
const BOARD_HALF = 0.74;

// Turn the upper body to look in direction `look` (relative to where the skis point, + = to
// the left), over the `side` shoulder when it is straight behind: part in the waist, part in
// the shoulders, the rest in the neck (a real neck turns about 80 degrees).
function lookOver(look, side) {
  if (side > 0 && look < 0) look += Math.PI * 2;
  if (side < 0 && look > 0) look -= Math.PI * 2;
  look = THREE.MathUtils.clamp(look, -2.9, 2.9);
  const waist = THREE.MathUtils.clamp(look * 0.2, -0.55, 0.55);
  const twist = THREE.MathUtils.clamp(look * 0.3, -0.85, 0.85);
  return { waist, twist, headYaw: THREE.MathUtils.clamp((look - waist - twist) / 0.8, -1.75, 1.75) };
}

// Skis: half the spacing of the feet, distance from the boot to the tip contact (butters),
// binding stack under the boot sole.
const SKI_SEP = 0.1, SKI_CONTACT = 0.72, BIND_H = 0.024;
const SKI_YAW = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
// Freeski grabs on the same keys. hands: which ski each hand takes ([ski 0 = left / 1 =
// right, position along it, +1 outside / -1 inside edge / 0 top]); skis: [yaw, pitch, lift]
// tweaks per ski; lift: how far the knees bring the skis up.
const SKI_GRABS = {
  indy: { hands: { r: [1, 0.1, 1] }, hip: 0.5, lift: 0.3, lean: [0.85, 0.25] }, // Safety
  mute: { hands: { l: [1, 0.16, 1] }, hip: 0.5, lift: 0.3, lean: [1.0, 0.3], skis: [[-0.14, 0.05], [0.14, 0.05]] },
  melon: { hands: { r: [1, 0.05, -1] }, hip: 0.5, lift: 0.3, lean: [0.85, -0.1] }, // Critical
  stalefish: { hands: { r: [1, -0.5, 1] }, hip: 0.52, lift: 0.26, lean: [0.2, 0.45], skis: [[0, 0.25], [0, 0.25]] }, // Blunt
  nose: { hands: { r: [1, 0.62, 0] }, hip: 0.5, lift: 0.3, lean: [1.35, 0.15], skis: [[0, 0.45], [0, 0.45]] }, // Tip grab
  tail: { hands: { r: [1, -0.62, 0] }, hip: 0.55, lift: 0.22, lean: [0.15, 0.5], skis: [[0, -0.4], [0, -0.4]] },
  method: { hands: { l: [0, 0.5, 0], r: [1, 0.5, 0] }, hip: 0.46, lift: 0.34, lean: [1.5, 0], skis: [[0, 0.4], [0, 0.4]] }, // Truckdriver
  japan: { hands: { l: [1, 0.18, -1] }, hip: 0.52, lift: 0.28, lean: [1.1, 0.35], skis: [[0, 0], [0.3, -0.45, 0.08]] },
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const Y = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();

function solveIK(a, target, l1, l2, pole, outMid, outEnd) {
  const dir = v1.subVectors(target, a);
  let d = dir.length();
  dir.divideScalar(d || 1);
  d = Math.min(Math.max(d, 0.05), l1 + l2 - 0.001);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = v2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  outMid.copy(a).addScaledVector(dir, x).addScaledVector(p, h);
  outEnd.copy(a).addScaledVector(dir, d);
}

function placeLimb(mesh, a, b) {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  const dir = v3.subVectors(b, a);
  const len = dir.length();
  if (len < 1e-5) return;
  mesh.quaternion.setFromUnitVectors(Y, dir.divideScalar(len));
}

// Rotate a bone (from its rest pose) so the direction to its child points at worldDir.
function aimBone(bone, childRest, worldDir, restQuat) {
  bone.quaternion.copy(restQuat);
  bone.parent.getWorldQuaternion(q1);
  q2.multiplyQuaternions(q1, bone.quaternion);
  const cur = v3.copy(childRest).normalize().applyQuaternion(q2);
  q3.setFromUnitVectors(cur, v1.copy(worldDir).normalize());
  q2.premultiply(q3);
  bone.quaternion.copy(q1.invert()).multiply(q2);
  bone.updateMatrixWorld(true);
}

// 3ds Max Biped rig (Rocketbox). GLTFLoader turns the spaces into underscores.
// The thighs hang off the spine, so every aim direction is derived from rest-pose world positions.
const RIG = {
  body: 'Bip01 Pelvis', spine: 'Bip01 Spine', chest: 'Bip01 Spine2', neck: 'Bip01 Neck', head: 'Bip01 Head',
  'upperarm.l': 'Bip01 L UpperArm', 'lowerarm.l': 'Bip01 L Forearm', 'wrist.l': 'Bip01 L Hand',
  'upperarm.r': 'Bip01 R UpperArm', 'lowerarm.r': 'Bip01 R Forearm', 'wrist.r': 'Bip01 R Hand',
  'upperleg.l': 'Bip01 L Thigh', 'lowerleg.l': 'Bip01 L Calf', 'foot.l': 'Bip01 L Foot', 'toes.l': 'Bip01 L Toe0',
  'upperleg.r': 'Bip01 R Thigh', 'lowerleg.r': 'Bip01 R Calf', 'foot.r': 'Bip01 R Foot', 'toes.r': 'Bip01 R Toe0',
};
const SAFE = (n) => THREE.PropertyBinding.sanitizeNodeName(n);
// head, neck and all facial bones (Bip01_LMasseter, Bip01_MJaw, ...; limb bones have an underscore after L/R)
const HEAD_BONES = /^Bip01_(Head|HeadNub|Neck|[LRM][A-Z]\w*)$/;

// Dominant joint name of every vertex.
function vertexBones(mesh) {
  const ji = mesh.geometry.attributes.skinIndex, jw = mesh.geometry.attributes.skinWeight;
  const out = new Array(ji.count);
  for (let i = 0; i < ji.count; i++) {
    let best = 0, bw = -1;
    const ws = [jw.getX(i), jw.getY(i), jw.getZ(i), jw.getW(i)];
    const js = [ji.getX(i), ji.getY(i), ji.getZ(i), ji.getW(i)];
    for (let k = 0; k < 4; k++) if (ws[k] > bw) { bw = ws[k]; best = js[k]; }
    out[i] = mesh.skeleton.bones[best]?.name ?? '';
  }
  return out;
}

// Normals averaged over vertices that share a position, so inflating the
// clothes along them does not tear faceted low-poly seams apart.
function smoothNormals(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const sum = new Map();
  const key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const a = sum.get(k) || [0, 0, 0];
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
    sum.set(k, a);
  }
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const a = sum.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    arr[i * 3] = a[0] / l; arr[i * 3 + 1] = a[1] / l; arr[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('aInflate', new THREE.BufferAttribute(arr, 3));
}

const TONE = { orig: 0, jacket: 1, pants: 2, glove: 3, boot: 4 };

// The original photo texture, re-coloured where the snow gear goes: the fabric's own
// luminance (folds, seams, stitching) times the outfit colour, normalised per garment
// (aGain) so a dark pair of jeans and a light jacket both end up at the outfit colour.
// The garment is also puffed out along smoothed normals (aInflate) into baggy outerwear.
// The shoes are hidden (aFoot, uHideFeet) when ski boots go over them.
function gearMaterial(src, hideFeet) {
  const m = src.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHideFeet = hideFeet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aInflate;\nattribute vec3 aTint;\nattribute float aMask;\nattribute float aGain;\nattribute float aFoot;\nvarying vec3 vTint;\nvarying float vMask;\nvarying float vGain;\nvarying float vFoot;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aInflate;\nvTint = aTint; vMask = aMask; vGain = aGain; vFoot = aFoot;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHideFeet;\nvarying vec3 vTint;\nvarying float vMask;\nvarying float vGain;\nvarying float vFoot;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFoot * uHideFeet > 0.5) discard;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float shade = clamp(pow(lum * vGain, 0.8), 0.25, 1.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, vTint * shade, vMask);
}`);
  };
  m.customProgramCacheKey = () => 'gear';
  return m;
}

// Linear luminance of a texture at the given UVs (for the per-garment gain).
function textureLuminance(texture) {
  const img = texture?.image;
  if (!img) return null;
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, N, N);
  const px = ctx.getImageData(0, 0, N, N).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return (u, v) => {
    const x = Math.min(N - 1, Math.max(0, Math.floor((u - Math.floor(u)) * N)));
    const y = Math.min(N - 1, Math.max(0, Math.floor((v - Math.floor(v)) * N)));
    const i = (y * N + x) * 4;
    return 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
  };
}

// Rest-pose positions after skinning, in world space. Quantized skinned meshes keep
// their scale in the bind matrices, so raw attribute values are not in metres.
function skinnedPositions(mesh) {
  const p = mesh.geometry.attributes.position;
  const out = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    mesh.applyBoneTransform(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}

// Bounding box of all vertices mainly driven by the given bones (scene at identity).
function boneBox(meshes, names) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const { bones, world } of meshes) {
    for (let i = 0; i < bones.length; i++) if (names.test(bones[i])) box.expandByPoint(v.fromArray(world, i * 3));
  }
  return box;
}

export class RiderModel {
  constructor(design, outfit) {
    this.root = new THREE.Group();
    this.boardPivot = new THREE.Group();
    this.root.add(this.boardPivot);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.mats = {
      jacket: new THREE.MeshStandardMaterial({ roughness: 0.75 }),
      pants: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      helmet: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 }),
      glove: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      boot: new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.7 }),
      lens: new THREE.MeshStandardMaterial({ color: 0xffa630, roughness: 0.12, metalness: 0.6, emissive: 0x6a2a00, emissiveIntensity: 0.6 }),
      strap: new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 }),
      face: new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 }),
    };
    this.proc = new THREE.Group();
    this.body.add(this.proc);
    this.gear = 'board';
    this.skis = null; this.poles = null; this.skiRig = null;
    // ski boot geometry around the ankle (measured per character, see fitSkiBoots)
    this.footGeo = { ankleBack: 0.07, ankleH: 0.105, toeFwd: 0.15, toeH: 0.035 };
    this.buildBoots();
    this.buildBody();
    this.setOutfit(outfit);
    this.setBoard(design);
    this.char = null;
    this.rig = { thigh: 0.46, shin: 0.46, upper: 0.3, fore: 0.29, ankle: 0.11, torso: 0.52 };

    this.pose = {
      hip: 0.84, leanX: 0.15, leanZ: 0, side: 0, pitch: 0, roll: 0, lift: 0, twist: 0, headYaw: 1.2, nod: 0, grab: 0,
      sus: 0, susV: 0, prevVy: undefined, hvF: new THREE.Vector3(), hvR: new THREE.Vector3(),
      handF: new THREE.Vector3(0.2, 0.25, -0.5), handR: new THREE.Vector3(0.05, 0.2, 0.45),
    };
    this.t = 0;
  }

  buildBoots() {
    this.boots = new THREE.Group();
    STANCE.forEach((ang, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.13), this.mats.boot);
      b.position.set(0.02, 0.075, i ? FOOT_Z : -FOOT_Z);
      b.rotation.y = ang;
      b.castShadow = true;
      this.boots.add(b);
    });
    this.boardPivot.add(this.boots);
  }

  buildBody() {
    const m = this.mats;
    const cap = (r, len, mat) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 10), mat);
      this.proc.add(mesh);
      return mesh;
    };
    this.torso = cap(0.16, 0.56, m.jacket);
    this.torso.scale.set(0.82, 1, 1.15);
    this.pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.12, 4, 10), m.pants);
    this.pelvis.rotation.x = Math.PI / 2;
    this.proc.add(this.pelvis);
    this.thighF = cap(0.078, 0.46, m.pants);
    this.thighR = cap(0.078, 0.46, m.pants);
    this.shinF = cap(0.068, 0.46, m.pants);
    this.shinR = cap(0.068, 0.46, m.pants);
    this.upperF = cap(0.062, 0.3, m.jacket);
    this.upperR = cap(0.062, 0.3, m.jacket);
    this.foreF = cap(0.054, 0.29, m.jacket);
    this.foreR = cap(0.054, 0.29, m.jacket);
    const hand = () => {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), m.glove);
      h.scale.set(1, 0.85, 1.15);
      this.proc.add(h);
      return h;
    };
    this.handFm = hand();
    this.handRm = hand();

    this.head = new THREE.Group();
    this.proc.add(this.head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), m.helmet);
    helmet.scale.set(1.05, 1, 0.98);
    helmet.position.y = 0.02;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10), m.face);
    face.position.set(0.02, -0.03, 0);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.07, 18, 1, true, -1.15, 2.3), m.lens);
    lens.position.set(0.012, 0.005, 0);
    lens.rotation.y = Math.PI / 2;
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.137, 0.137, 0.045, 18, 1, true), m.strap);
    strap.position.y = 0.005;
    this.head.add(helmet, face, strap, lens);
    this.proc.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  setOutfit(o) {
    this.outfit = o;
    const d = this.char?.dress;
    if (d) {
      const cols = [null, o.jacket, o.pants, o.glove, o.boot].map((c) => c && new THREE.Color(c));
      for (const x of d.suits) {
        const attr = x.mesh.geometry.attributes.aTint;
        for (let k = 0; k < x.tone.length; k++) {
          const c = cols[x.tone[k]];
          if (c) attr.setXYZ(k, c.r, c.g, c.b);
        }
        attr.needsUpdate = true;
      }
    }
    this.mats.jacket.color.set(o.jacket);
    this.mats.pants.color.set(o.pants);
    this.mats.helmet.color.set(o.helmet);
    this.mats.glove.color.set(o.glove);
    // ski boot shells in the outfit's second colour, power straps in the jacket colour
    const boots = this.char?.scene.userData.skiBoots;
    if (boots) for (const m of boots.mats) { m.shell.color.set(o.helmet); m.strap.color.set(o.jacket); }
    if (this.poles) for (const p of this.poles) p.userData.shaft.color.set(o.accent);
  }

  setBoard(design) {
    this.design = design;
    if (this.board) this.boardPivot.remove(this.board);
    this.board = makeBoard(design);
    this.boardPivot.add(this.board);
    if (this.skiRig) {
      for (const s of this.skis) this.skiRig.remove(s);
      this.skis = [makeSki(design), makeSki(design)];
      this.skiRig.add(...this.skis);
    }
  }

  // Snowboard or skis: swaps the equipment, the boots and the stance frame.
  setGear(gear) {
    this.gear = gear === 'ski' ? 'ski' : 'board';
    const ski = this.gear === 'ski';
    if (ski && !this.skiRig) {
      this.skiRig = new THREE.Group();
      this.skis = [makeSki(this.design), makeSki(this.design)];
      this.poles = [makePole(this.outfit.accent), makePole(this.outfit.accent)];
      this.skiRig.add(...this.skis, ...this.poles);
      this.body.add(this.skiRig);
    }
    this.boardPivot.visible = !ski;
    if (this.skiRig) this.skiRig.visible = ski;
    this.syncFeet();
    if (!this.menuMode) this.body.quaternion.copy(ski ? SKI_YAW : q1.identity());
  }

  // Shoes for the board, ski boots (hiding the shoes) on skis.
  syncFeet() {
    const ski = this.gear === 'ski';
    const ud = this.char?.scene.userData;
    if (ud?.dressed) ud.dressed.hideFeet.value = ski ? 1 : 0;
    if (ud?.skiBoots) for (const o of ud.skiBoots.parts) o.visible = ski;
    if (ud?.skiBoots) this.footGeo = ud.skiBoots.geo;
  }

  // Swap the procedural body for a rigged glTF character (null restores the fallback).
  setCharacter(scene, info = {}) {
    if (this.char) this.body.remove(this.char.holder);
    this.char = null;
    this.proc.visible = !scene;
    this.boots.visible = !scene;
    if (!scene) {
      this.rig = { thigh: 0.46, shin: 0.46, upper: 0.3, fore: 0.29, ankle: 0.11, torso: 0.52 };
      return;
    }
    const bones = {};
    const all = [];
    scene.traverse((o) => {
      if (o.isBone) all.push(o);
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    for (const [role, name] of Object.entries(RIG)) bones[role] = all.find((b) => b.name === SAFE(name) || b.name === name);
    if (Object.values(bones).some((b) => !b)) { console.warn('Unerwartetes Skelett, nutze prozeduralen Fahrer'); this.setCharacter(null); return; }

    // the same scene can be re-attached later: stop its animations, restore its bind pose first
    scene.userData.mixer?.stopAllAction();
    if (scene.userData.restPose) {
      for (const b of all) { const r = scene.userData.restPose.get(b); b.quaternion.copy(r.q); b.position.copy(r.p); }
    } else {
      scene.userData.restPose = new Map(all.map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
    }
    scene.position.set(0, 0, 0);
    scene.rotation.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.updateMatrixWorld(true);

    const W = (b) => b.getWorldPosition(new THREE.Vector3());
    // which way the model faces: from the back of the head to the nose
    const nose = scene.getObjectByName(SAFE('Bip01 MNose'));
    const fwd = (nose ? W(nose).sub(W(bones.head)) : W(bones['toes.l']).sub(W(bones['foot.l']))).setY(0).normalize();
    if (!scene.userData.dressed) this.dress(scene, info, fwd);
    const dress = scene.userData.dressed;
    const s = CHAR_HEIGHT / dress.height;

    // rest-pose directions (bone-local) from each bone to the joint it drives
    const toLocal = (b, dir) => dir.applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
    const aim = (a, b) => toLocal(bones[a], W(bones[b]).sub(W(bones[a])));
    const dirs = {
      spine: aim('spine', 'neck'), chest: aim('chest', 'head'),
      'upperarm.l': aim('upperarm.l', 'lowerarm.l'), 'lowerarm.l': aim('lowerarm.l', 'wrist.l'),
      'upperarm.r': aim('upperarm.r', 'lowerarm.r'), 'lowerarm.r': aim('lowerarm.r', 'wrist.r'),
      'upperleg.l': aim('upperleg.l', 'lowerleg.l'), 'lowerleg.l': aim('lowerleg.l', 'foot.l'),
      'upperleg.r': aim('upperleg.r', 'lowerleg.r'), 'lowerleg.r': aim('lowerleg.r', 'foot.r'),
      'foot.l': aim('foot.l', 'toes.l'), 'foot.r': aim('foot.r', 'toes.r'),
    };
    const dist = (a, b) => W(bones[a]).distanceTo(W(bones[b])) * s;
    const rest = scene.userData.restPose;

    const holder = new THREE.Group();
    holder.rotation.y = Math.atan2(fwd.z, fwd.x); // model forward -> board +X (the rider faces the toe edge)
    holder.scale.setScalar(s);
    holder.position.y = BOARD_TOP;
    holder.add(scene);
    this.body.add(holder);

    this.rig = {
      thigh: dist('upperleg.l', 'lowerleg.l'), shin: dist('lowerleg.l', 'foot.l'),
      upper: dist('upperarm.l', 'lowerarm.l'), fore: dist('lowerarm.l', 'wrist.l'),
      ankle: BOARD_TOP + Math.max(0.06, W(bones['foot.l']).y * s),
      torso: dist('spine', 'head') * 0.85,
    };
    // motion capture for the menu
    if (!scene.userData.mixer) scene.userData.mixer = new THREE.AnimationMixer(scene);
    // The mocap root (Bip01, not a skin joint) carries the actor's pelvis height: rebase each
    // clip onto this rider's own standing height so nobody floats or sinks into the snow.
    const root = scene.getObjectByName('Bip01');
    if (root && !scene.userData.rootRest) scene.userData.rootRest = { p: root.position.clone(), q: root.quaternion.clone() };
    if (!scene.userData.clips) {
      scene.userData.clips = (info.clips || []).map((clip) => {
        const c = clip.clone();
        for (const t of c.tracks) {
          if (t.name !== 'Bip01.position' || !root) continue;
          t.values = t.values.slice();
          const dy = scene.userData.rootRest.p.y - t.values[1];
          for (let k = 1; k < t.values.length; k += 3) t.values[k] += dy;
        }
        return c;
      });
    }
    const headNub = scene.getObjectByName(SAFE('Bip01 HeadNub'));
    if (headNub) dirs.headUp = toLocal(bones.head, W(headNub).sub(W(bones.head)));
    // the middle of each fist (pole grips), in the hand bone's own frame
    this.root.updateMatrixWorld(true);
    const Wl = (b) => scene.worldToLocal(W(b));
    if (!scene.userData.grip) {
      scene.userData.grip = {};
      for (const side of ['l', 'r']) {
        const hand = bones['wrist.' + side], mid = scene.getObjectByName(SAFE(`Bip01 ${side.toUpperCase()} Finger2`));
        const p = mid ? Wl(hand).lerp(Wl(mid), 0.85) : Wl(hand);
        p.y -= 0.02 / s;
        scene.userData.grip[side] = hand.worldToLocal(scene.localToWorld(p));
      }
    }
    if (!scene.userData.skiBoots) scene.userData.skiBoots = this.fitSkiBoots(scene, bones, fwd, dress);
    // Finger joints and the axis each one closes about (toward the palm, which faces down in
    // the rest pose), for fists round the pole grips.
    if (!scene.userData.fingers) {
      scene.userData.fingers = [];
      const palm = new THREE.Vector3(0, -1, 0).applyQuaternion(scene.getWorldQuaternion(new THREE.Quaternion()));
      for (const side of ['L', 'R']) {
        for (let f = 1; f <= 4; f++) {
          [`${f}`, `${f}1`, `${f}2`].forEach((seg, j, arr) => {
            const b = scene.getObjectByName(SAFE(`Bip01 ${side} Finger${seg}`));
            const child = scene.getObjectByName(SAFE(`Bip01 ${side} Finger${arr[j + 1] ?? seg + 'Nub'}`)) ?? b?.children.find((c) => c.isBone);
            if (!b || !child) return;
            const d = W(child).sub(W(b)).normalize();
            const axis = new THREE.Vector3().crossVectors(d, palm).normalize();
            if (axis.lengthSq() < 0.5) return;
            axis.applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
            scene.userData.fingers.push({ bone: b, axis, w: [1.25, 1.35, 0.95][j] });
          });
        }
      }
    }
    this.char = { holder, bones, all, rest, dirs, s, dress, scene, root, grip: scene.userData.grip, fingers: scene.userData.fingers, mixer: scene.userData.mixer, clips: scene.userData.clips, action: null };
    this.setOutfit(this.outfit);
    this.syncFeet();
    if (this.menuMode) this.playIdle(true);
  }

  // Ski boots for this body (scene still at its rest pose, at the origin): the lower shell
  // rides on the foot bone around the shoe, the cuff on the shin bone, hinged at the ankle.
  // Returns where the ankle and toes sit relative to the boot sole, for the leg IK on skis.
  fitSkiBoots(scene, bones, fwd, dress) {
    // measured in the model's own frame (it may already hang under the rider)
    this.root.updateMatrixWorld(true);
    const W = (b) => scene.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    const s = CHAR_HEIGHT / dress.height; // metres per model unit
    const up = new THREE.Vector3(0, 1, 0);
    const across = new THREE.Vector3().crossVectors(fwd, up);
    const out = { parts: [], mats: [], geo: null };
    const geos = [];
    for (const side of ['l', 'r']) {
      const foot = bones['foot.' + side], toe = bones['toes.' + side], calf = bones['lowerleg.' + side];
      const A = W(foot), Tt = W(toe), K = W(calf);
      const f = dress.feet[side];
      const boot = makeSkiBoot(this.outfit.helmet, this.outfit.jacket);
      // the ski boot sole is a little thicker than a shoe's
      const bottom = f.soleY - 0.012 / s;
      const mid = (f.heel + f.tip) / 2, aAlong = A.dot(fwd);
      boot.lower.position.copy(A).addScaledVector(fwd, mid - aAlong).setY(bottom);
      boot.lower.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, up, across));
      boot.lower.scale.setScalar(1 / s);
      scene.add(boot.lower);
      foot.attach(boot.lower);
      const shin = K.clone().sub(A).normalize();
      const cx = fwd.clone().addScaledVector(shin, -fwd.dot(shin)).normalize();
      boot.cuff.position.copy(A);
      boot.cuff.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(cx, shin, new THREE.Vector3().crossVectors(cx, shin)));
      boot.cuff.scale.setScalar(1 / s);
      scene.add(boot.cuff);
      calf.attach(boot.cuff);
      out.parts.push(boot.lower, boot.cuff);
      out.mats.push(boot.mats);
      geos.push({ ankleBack: (mid - aAlong) * s, ankleH: (A.y - bottom) * s, toeFwd: (Tt.dot(fwd) - aAlong) * s, toeH: (Tt.y - bottom) * s });
    }
    out.geo = {};
    for (const k of Object.keys(geos[0])) out.geo[k] = (geos[0][k] + geos[1][k]) / 2;
    scene.updateMatrixWorld(true);
    return out;
  }

  // One-time: put snow gear over the casual clothes. Face and hair stay as they are.
  dress(scene, info, fwd) {
    const hat = info.hat ?? { style: 'beanie', color: '#2b2f3a' };
    const parts = [];
    scene.traverse((o) => { if (o.isSkinnedMesh) parts.push({ mesh: o, bones: vertexBones(o), world: skinnedPositions(o) }); });
    const height = Math.max(...parts.map(({ world }) => { let m = -Infinity; for (let i = 1; i < world.length; i += 3) m = Math.max(m, world[i]); return m; }));
    // world size of one geometry unit, from the raw vs skinned extent of each mesh
    const scale = (mesh) => {
      const part = parts.find((q) => q.mesh === mesh);
      const raw = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).getSize(new THREE.Vector3()).length();
      const world = new THREE.Box3().setFromArray(part.world).getSize(new THREE.Vector3()).length();
      return world / (raw || 1);
    };
    const suits = [];
    const hideFeet = { value: 0 };
    // each foot's sole height and its heel and toe along the facing direction (for ski boots)
    const feet = {};
    for (const side of ['L', 'R']) {
      const f = { soleY: Infinity, heel: Infinity, tip: -Infinity };
      const re = new RegExp(`^Bip01_${side}_(Foot|Toe0)`);
      for (const { bones, world } of parts) {
        for (let k = 0; k < bones.length; k++) {
          if (!re.test(bones[k])) continue;
          const x = world[k * 3], y = world[k * 3 + 1], z = world[k * 3 + 2];
          const a = x * fwd.x + z * fwd.z;
          f.soleY = Math.min(f.soleY, y); f.heel = Math.min(f.heel, a); f.tip = Math.max(f.tip, a);
        }
      }
      feet[side.toLowerCase()] = f;
    }
    for (const part of parts) {
      const { mesh, bones } = part;
      const name = mesh.material.name || '';
      // hair cards and lashes: hidden under a helmet, kept under a beanie
      if (/opacity/.test(name)) continue;
      if (/head/.test(name)) continue;
      const n = bones.length;
      const tone = new Uint8Array(n), metres = new Float32Array(n), mask = new Float32Array(n), footA = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const b = bones[k];
        let t = TONE.jacket, m = 0.022;
        // neck skin stays; anything on the body mesh driven by the head is a hood or collar
        if (/Neck/.test(b)) { t = TONE.orig; m = 0; }
        else if (HEAD_BONES.test(b)) { t = TONE.jacket; m = 0.008; }
        else if (/Foot|Toe/.test(b)) { t = TONE.boot; m = 0.012; }
        else if (/Thigh|Calf|Pelvis/.test(b)) { t = TONE.pants; m = 0.026; }
        else if (/Hand|Finger/.test(b)) { t = TONE.glove; m = 0.012; }
        tone[k] = t; metres[k] = m; mask[k] = t === TONE.orig ? 0 : 1; footA[k] = t === TONE.boot ? 1 : 0;
      }
      // per-garment gain from the texture's average luminance under it
      const lumAt = textureLuminance(mesh.material.map);
      const uv = mesh.geometry.attributes.uv;
      const sum = new Float32Array(5), cnt = new Float32Array(5);
      if (lumAt && uv) for (let k = 0; k < n; k++) { sum[tone[k]] += lumAt(uv.getX(k), uv.getY(k)); cnt[tone[k]]++; }
      const gain = new Float32Array(n);
      for (let k = 0; k < n; k++) gain[k] = cnt[tone[k]] ? 1 / Math.max(0.03, sum[tone[k]] / cnt[tone[k]]) : 1;

      smoothNormals(mesh.geometry);
      const units = (height / CHAR_HEIGHT) / scale(mesh);
      const inf = mesh.geometry.attributes.aInflate;
      for (let k = 0; k < n; k++) inf.setXYZ(k, inf.getX(k) * metres[k] * units, inf.getY(k) * metres[k] * units, inf.getZ(k) * metres[k] * units);
      mesh.geometry.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      mesh.geometry.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
      mesh.geometry.setAttribute('aGain', new THREE.BufferAttribute(gain, 1));
      mesh.geometry.setAttribute('aFoot', new THREE.BufferAttribute(footA, 1));
      mesh.material = gearMaterial(mesh.material, hideFeet);
      suits.push({ mesh, tone });
    }

    const mats = { lens: null };
    const shadow = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

    // ---- headwear, built over this rider's own head
    const eyeBone = scene.getObjectByName(SAFE('Bip01 REye')), eyeBoneL = scene.getObjectByName(SAFE('Bip01 LEye'));
    const headBone = scene.getObjectByName(SAFE(RIG.head));
    const skull = boneBox(parts, /^Bip01_(Head|HeadNub)$/);
    const eyeR = eyeBone ? eyeBone.getWorldPosition(new THREE.Vector3()) : skull.getCenter(new THREE.Vector3()).setY(skull.max.y - 0.11);
    const eyeL = eyeBoneL ? eyeBoneL.getWorldPosition(new THREE.Vector3()) : eyeR.clone();
    const eyeY = (eyeR.y + eyeL.y) / 2;
    const yaw = Math.atan2(fwd.x, fwd.z);
    // Skull from the eyes (the models' hair is sculpted into the head mesh, so the mesh
    // alone overstates the skull): an average adult cranium, scaled by the eye spacing,
    // its front 2 cm ahead of the eyeballs (the brow), its top 12 cm above them.
    const k = THREE.MathUtils.clamp(eyeR.distanceTo(eyeL) / 0.063 || 1, 0.9, 1.12);
    const C = eyeR.clone().add(eyeL).multiplyScalar(0.5).addScaledVector(fwd, -0.074 * k).setY(eyeY + 0.012 * k);
    const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
    const toHat = (x, y, z) => { const dx = x - C.x, dz = z - C.z; return [dx * cy + dz * sy, y - C.y, -dx * sy + dz * cy]; };
    const fromHat = (x, y, z, out) => out.set(C.x + x * Math.cos(yaw) + z * Math.sin(yaw), C.y + y, C.z - x * Math.sin(yaw) + z * Math.cos(yaw));
    // the measured head surface: head mesh on the head bones (hair cards and lashes not)
    const isHeadMesh = (m) => /head/.test(m.material.name || '') && !/opacity/.test(m.material.name || '');
    const pts = [];
    for (const { mesh, bones, world } of parts) {
      if (!isHeadMesh(mesh)) continue;
      for (let q = 0; q < bones.length; q++) if (/^Bip01_(Head|HeadNub)$/.test(bones[q])) pts.push(toHat(world[q * 3], world[q * 3 + 1], world[q * 3 + 2]));
    }
    const shape = { mesh: headShape(pts).rad, skull: skullShape(0.077 * k, 0.106 * k, 0.096 * k), eyeY: eyeY - C.y };
    const built = buildHat(hat, shape);
    const g = new THREE.Group();
    g.position.copy(C);
    g.rotation.y = yaw; // built facing +Z
    g.add(built.group);
    if (hat.goggles) g.add(buildGoggles(built, new THREE.Color(hat.goggles)));
    // A hat presses the hair flat: move the head mesh (sculpted hair, scalp) that would stick
    // out through the hat to just under it, easing in over the last few cm below the hat line.
    for (const { mesh, bones, world } of parts) {
      if (!isHeadMesh(mesh)) continue;
      const pos = mesh.geometry.attributes.position;
      const p = new THREE.Vector3(), w0 = new THREE.Vector3(), w1 = new THREE.Vector3(), target = new THREE.Vector3();
      const L = new THREE.Matrix3();
      const skinToWorld = (q, v, out) => { out.copy(v); mesh.applyBoneTransform(q, out); return out.applyMatrix4(mesh.matrixWorld); };
      let moved = 0;
      for (let q = 0; q < bones.length; q++) {
        if (!/^Bip01_(Head|HeadNub)$/.test(bones[q])) continue;
        const [x, y, z] = toHat(world[q * 3], world[q * 3 + 1], world[q * 3 + 2]);
        const r = Math.hypot(x, y, z) || 1, a = Math.atan2(x, z), e = Math.asin(Math.max(-1, Math.min(1, y / r)));
        const e0 = built.rimE(a);
        if (e < e0 - 0.12) continue;
        const limit = built.fit(a, Math.max(e, e0)) - 0.002;
        if (r <= limit) continue;
        const r2 = r + (limit - r) * smooth(e0 - 0.12, e0, e);
        fromHat(x * r2 / r, y * r2 / r, z * r2 / r, target);
        // world displacement -> mesh attribute space through this vertex's skinning (linear)
        p.fromBufferAttribute(pos, q);
        skinToWorld(q, p, w0);
        const cols = [];
        for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
          skinToWorld(q, w1.copy(p).add(v1.set(ax[0], ax[1], ax[2]).multiplyScalar(0.01)), w1);
          cols.push(w1.sub(w0).divideScalar(0.01).clone());
        }
        L.set(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z).invert();
        const d = target.sub(w0).applyMatrix3(L);
        pos.setXYZ(q, p.x + d.x, p.y + d.y, p.z + d.z);
        moved++;
      }
      if (moved) { pos.needsUpdate = true; mesh.geometry.computeBoundingSphere(); }
    }
    // hair under the hat is pressed flat by it: hide the hair cards above the hat line
    for (const { mesh, bones, world } of parts) {
      if (!/opacity/.test(mesh.material.name || '')) continue;
      const hide = new Float32Array(bones.length);
      for (let k = 0; k < bones.length; k++) {
        if (!/^Bip01_(Head|HeadNub)$/.test(bones[k])) continue;
        const [x, y, z] = toHat(world[k * 3], world[k * 3 + 1], world[k * 3 + 2]);
        const a = Math.atan2(x, z), e = Math.asin(Math.max(-1, Math.min(1, y / (Math.hypot(x, y, z) || 1))));
        hide[k] = e > built.hideAbove(a) ? 1 : 0;
      }
      mesh.geometry.setAttribute('aHide', new THREE.BufferAttribute(hide, 1));
      const m = mesh.material.clone();
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHide;\nvarying float vHide;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHide = aHide;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHide;')
          .replace('#include <alphatest_fragment>', 'if (vHide > 0.5) discard;\n#include <alphatest_fragment>');
      };
      m.customProgramCacheKey = () => 'hair-under-hat';
      mesh.material = m;
    }
    scene.add(g);
    headBone.attach(shadow(g));

    scene.updateMatrixWorld(true);
    scene.userData.dressed = { suits, mats, height, feet, hideFeet, fit: { n: pts.length, k, crown: built.fit(0, Math.PI / 2), front: built.fit(0, built.rimE(0)), side: built.fit(Math.PI / 2, built.rimE(Math.PI / 2)), s: CHAR_HEIGHT / height } };
  }

  // ---------- menu: mocap idles next to the planted board ----------

  setMenuMode(on) {
    if (this.menuMode === on) return;
    this.menuMode = on;
    const c = this.char;
    if (!c) return;
    if (on) this.playIdle(true);
    else {
      c.mixer.stopAllAction(); c.action = null; this.body.quaternion.copy(this.gear === 'ski' ? SKI_YAW : q1.identity());
      const rr = c.scene.userData.rootRest;
      if (c.root && rr) { c.root.position.copy(rr.p); c.root.quaternion.copy(rr.q); }
    }
  }

  // Cross-fade to a random warm-up / idle clip; called again whenever one ends.
  playIdle(first = false) {
    const c = this.char;
    if (!c || !c.clips.length) return;
    const idles = c.clips.filter((a) => a.name.startsWith('idle'));
    let clip = first ? idles.find((a) => a.name.startsWith('idle_breathe')) : null;
    if (!clip) { const pick = idles.filter((a) => a !== c.action?.getClip()); clip = pick[Math.floor(Math.random() * pick.length)] ?? idles[0]; }
    this.playClip(clip, 0.5);
  }

  cheer() {
    const c = this.char;
    if (!c || !this.menuMode) return;
    const cheers = c.clips.filter((a) => a.name.startsWith('cheer'));
    if (cheers.length) this.playClip(cheers[Math.floor(Math.random() * cheers.length)], 0.25);
  }

  playClip(clip, fade) {
    const c = this.char;
    const next = c.mixer.clipAction(clip);
    next.reset().setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.enabled = true;
    if (c.action && c.action !== next) next.crossFadeFrom(c.action, fade, false);
    next.play();
    c.action = next;
    c.actionEnd = clip.duration - fade;
  }

  updateMenu(dt, phys, quat) {
    const c = this.char;
    this.root.position.copy(phys.pos);
    this.root.quaternion.copy(quat);
    // stand upright on the slope facing downhill, the board planted in the snow at the right hand
    q1.copy(quat).invert();
    q2.setFromAxisAngle(Y, this.menuYaw ?? Math.PI / 2 + 0.35);
    this.body.quaternion.copy(q1).multiply(q2);
    this.boardPivot.quaternion.copy(this.body.quaternion).multiply(q3.setFromEuler(new THREE.Euler(Math.PI / 2 - 0.12, 0, 0.1)));
    this.boardPivot.position.copy(v1.set(0.05, BOARD_HALF - 0.12, 0.55).applyQuaternion(this.body.quaternion));
    if (this.gear === 'ski' && this.skiRig) {
      // skis stuck upright in the snow side by side, topsheets to the camera, poles next to them
      this.skis.forEach((ski, i) => {
        ski.position.set(0.04 + i * 0.05, SKI_LEN / 2 - 0.3 - 0.03, 0.5 + i * 0.14);
        ski.quaternion.setFromEuler(new THREE.Euler(0.06 * (i ? 1 : -1), Math.PI - 0.5 - i * 0.2, Math.PI / 2 - 0.06, 'YXZ'));
      });
      this.poles.forEach((pole, i) => {
        pole.position.set(-0.12 + i * 0.06, POLE_LEN - 0.14, 0.8 + i * 0.07);
        pole.quaternion.setFromEuler(new THREE.Euler(0.05 + i * 0.05, 0, -0.06 + i * 0.04));
      });
    }
    if (!c) return;
    c.mixer.update(dt);
    if (c.action && c.action.time >= c.actionEnd) this.playIdle();
    this.plantFeet(phys.course);
  }

  // Mocap was recorded on flat ground: put both feet on the slope with two-bone IK,
  // lowering the pelvis so the downhill foot can reach, and tilt the feet to the surface.
  plantFeet(course) {
    const { bones: B, dirs } = this.char;
    this.root.updateMatrixWorld(true);
    const ankleH = this.rig.ankle - BOARD_TOP;
    const sides = ['l', 'r'].map((side) => {
      const foot = B['foot.' + side];
      const F = foot.getWorldPosition(new THREE.Vector3());
      return { side, foot, need: course.heightAt(F.x, F.z) + ankleH - F.y };
    });
    const drop = Math.min(0, ...sides.map((x) => x.need));
    if (Math.abs(drop) > 0.002) {
      const pel = B.body;
      const w = pel.getWorldPosition(new THREE.Vector3());
      w.y += drop;
      pel.position.copy(pel.parent.worldToLocal(w));
      pel.updateMatrixWorld(true);
    }
    const n = course.normalAt(this.root.position.x, this.root.position.z, new THREE.Vector3());
    const tilt = new THREE.Quaternion().setFromUnitVectors(Y, n);
    const knee = new THREE.Vector3(), end = new THREE.Vector3();
    for (const { side, foot } of sides) {
      const up = B['upperleg.' + side], low = B['lowerleg.' + side];
      const footQ = foot.getWorldQuaternion(new THREE.Quaternion());
      const hipJ = up.getWorldPosition(new THREE.Vector3());
      const kneeNow = low.getWorldPosition(new THREE.Vector3());
      const F = foot.getWorldPosition(new THREE.Vector3());
      const target = new THREE.Vector3(F.x, course.heightAt(F.x, F.z) + ankleH, F.z);
      const pole = kneeNow.clone().sub(hipJ.clone().add(F).multiplyScalar(0.5));
      solveIK(hipJ, target, this.rig.thigh, this.rig.shin, pole, knee, end);
      aimBone(up, dirs['upperleg.' + side], v2.subVectors(knee, hipJ).clone(), up.quaternion.clone());
      aimBone(low, dirs['lowerleg.' + side], v2.subVectors(end, knee).clone(), low.quaternion.clone());
      foot.parent.getWorldQuaternion(q1);
      foot.quaternion.copy(q1.invert()).multiply(q2.copy(tilt).multiply(footQ));
      foot.updateMatrixWorld(true);
    }
  }

  // phys: RiderPhysics, inp: current input, quat: smoothed board orientation.
  update(dt, phys, inp, quat) {
    this.t += dt;
    if (this.menuMode) { this.updateMenu(dt, phys, quat); return; }
    this.root.position.copy(phys.pos).add(phys.renderOffset);
    this.root.position.y -= phys.sink;
    this.root.quaternion.copy(quat);
    this.body.quaternion.copy(this.gear === 'ski' ? SKI_YAW : q1.identity());
    this.state = phys.state;
    // a hard slam bounces the whole body once off the snow
    if (phys.state === 'crash' && phys.crashPhase === 'slide' && phys.slam > 0 && phys.slideT < 0.4) {
      this.root.position.y += Math.sin((phys.slideT / 0.4) * Math.PI) * 0.14 * phys.slam;
    }
    const T = this.gear === 'ski' ? this.poseSki(dt, phys, inp) : this.poseBoard(dt, phys, inp);
    if (phys.state === 'crash') this.keepAboveSnow(T, phys.course, dt);
    else this.pose.guard = 0;
    if (this.char) this.applySkinned(T);
    else this.applyProcedural(T);
    if (this.gear === 'ski') this.placePoles(T);
  }

  // Ease the pose toward this frame's targets; shared by board and skis.
  blend(dt, tg, k) {
    const P = this.pose;
    for (const key of ['hip', 'leanX', 'leanZ', 'side', 'hipX', 'hipZ', 'fore', 'counter', 'pitch', 'roll', 'pivotX', 'lift2']) P[key] = damp(P[key] ?? 0, tg[key] ?? 0, k, dt);
    P.waist = damp(P.waist ?? 0, tg.waist ?? 0, 6, dt);
    P.twist = damp(P.twist, tg.twist, 8, dt);
    P.headYaw = damp(P.headYaw, tg.headYaw, 6, dt);
  }

  // Knees as suspension (bumps, kicker transitions compress them) and breathing.
  suspension(dt, phys, tg) {
    const P = this.pose, st = phys.state;
    const vy = phys.vel.y;
    const ay = P.prevVy === undefined ? 0 : (vy - P.prevVy) / Math.max(dt, 1e-3);
    P.prevVy = vy;
    if (st === 'ground') {
      P.susV += (-THREE.MathUtils.clamp(ay, -40, 40) * 0.0022 - P.sus * 95 - P.susV * 15) * dt;
      P.sus = THREE.MathUtils.clamp(P.sus + P.susV * dt, -0.12, 0.05);
      const calm = Math.max(0, 1 - phys.speed / 10);
      tg.leanX += Math.sin(this.t * 1.7) * 0.025 * (0.4 + calm);
      tg.hip += Math.sin(this.t * 1.7 + 1.2) * 0.008 * (0.4 + calm) + P.sus;
    } else { P.sus = damp(P.sus, 0, 8, dt); P.susV = 0; }
  }

  // Arms on springs: a touch under-damped, so they lag behind and settle with follow-through.
  springArms(dt, st, handF, handR) {
    const P = this.pose, R = this.rig;
    const arm = (R.upper + R.fore) / 0.59;
    const spring = (pos, vel, x, y, z) => {
      const kk = st === 'air' ? 220 : st === 'crash' ? 260 : 150, cc = 2 * Math.sqrt(kk) * 0.72;
      v1.set(x * arm, y * arm, z * arm).sub(pos).multiplyScalar(kk).addScaledVector(vel, -cc);
      vel.addScaledVector(v1, Math.min(dt, 1 / 30));
      pos.addScaledVector(vel, Math.min(dt, 1 / 30));
    };
    spring(P.handF, P.hvF, handF[0], handF[1], handF[2]);
    spring(P.handR, P.hvR, handR[0], handR[1], handR[2]);
  }

  // How far down a fallen body is (0 standing .. 1 lying) and which lying pose it is in.
  fallAmount(phys) {
    const f = phys.fallTilt, ph = phys.crashPhase;
    // the fall itself already accelerates (physics); getting up eases in and out
    return { e: ph === 'getup' ? smooth(0, 1, f) : f, down: ph === 'getup' || ph === 'rest' ? 'rest' : 'slide' };
  }

  poseBoard(dt, phys, inp) {
    const R = this.rig;
    const leg = R.thigh + R.shin;
    const P = this.pose;
    const st = phys.state;
    const sw = phys.switch;
    let hip = 0.84, leanX = 0.18, leanZ = 0, side = 0, pitch = phys.butterPitch, roll = 0, twist = 0, pivotX = 0;
    // hipX: hips across the board (+ toe edge), fore: weight along it (- nose), counter: upper-body counter-tilt
    let hipX = 0, fore = 0, counter = 0;
    let headYaw = sw ? -1.15 : 1.15;
    // hand targets: [x, height above hip, z] scaled by arm length
    let handF = [0.2, 0.1, -0.5], handR = [0.05, 0.04, 0.46];
    let grabPose = null;
    let poleF = v2.set(1, 0, -0.25).clone(), poleR = v2.set(1, 0, 0.15).clone();

    if (st === 'ground') {
      // Based on how riders are taught to stand and turn: even weight, ankles and knees
      // flexed with the knees over the toes, torso upright (flex from the legs, not the
      // waist), shoulders in line with the board, eyes where the board is going.
      const charge = phys.charge / 0.55;
      const absorb = Math.max(0, 1 - phys.landT / 0.35) * Math.min(1, phys.impact / 8);
      // board tilt in the board frame: + = onto the heel edge, - = onto the toe edge
      const tilt = phys.lean * 0.8 * (sw ? -1 : 1);
      const k = Math.min(1, Math.abs(tilt) / 0.7);
      const toe = tilt < 0;
      const crouch = Math.min(1, 0.18 + charge * 0.5 + (inp.up ? 0.35 : 0) + absorb * 0.6 + phys.skid * 0.2 + k * 0.3);
      hip = 0.86 - crouch * 0.34;
      leanX = 0.06 + crouch * 0.16;
      // toeside: hips go over the toe edge, knees drive into the turn, chest stays up;
      // heelside: sit back over the heel edge, chest a little forward to balance
      hipX = toe ? 0.07 * k : -0.11 * k;
      leanX += toe ? -0.03 * k : 0.14 * k;
      // angulation: the board and legs tilt, the upper body stays closer to upright
      counter = tilt * 0.5;
      // weight goes to the front foot to start a turn, then centres
      const dEdge = Math.abs(phys.edge - (P.prevEdge ?? phys.edge)) / Math.max(dt, 1e-3);
      P.prevEdge = phys.edge;
      P.init = damp(P.init ?? 0, Math.min(1, dEdge * 0.35), 3, dt);
      fore = -0.06 * P.init + (charge > 0.05 ? 0.07 * charge : 0); // loading a pop: onto the back foot
      // look where the board is going
      const r = wrapPi(phys.travelHeading() - phys.heading);
      headYaw = THREE.MathUtils.clamp(wrapPi(Math.PI / 2 + r), -1.6, 1.6) * 0.9;
      twist = -phys.windup * 0.85 + (sw ? -0.12 : 0.12);
      const sway = Math.sin(this.t * 2.1) * 0.025;
      // arms relaxed, a little out in front for balance
      handF = [0.2, 0.06 + sway, -0.46];
      handR = [0.08, 0.02 - sway, 0.42];
      if (k > 0.25) {
        if (toe) {
          // deep toeside carve: the leading hand reaches toward the snow
          const reach = Math.max(0, (k - 0.6) / 0.4);
          handF = [0.32 + reach * 0.15, 0.04 - reach * 0.38, -0.42 + reach * 0.12];
          handR = [0.22, 0.06, 0.38];
        } else {
          handF = [0.36, 0.16, -0.4];
          handR = [0.3, 0.12, 0.34];
        }
      }
      if (inp.up) { handF = [0.32, -0.02, -0.22]; handR = [0.28, -0.04, 0.18]; leanX += 0.18; }
      // stomp the landing: arms out front for balance while the legs soak it up
      if (absorb > 0.05) { handF = [0.42, 0.2 + absorb * 0.1, -0.55]; handR = [0.3, 0.16, 0.5]; }
      // a sketchy landing: a short fight for balance, arms thrown out, body wobbling
      if (phys.lastLand === 'sketchy' && phys.landT < 0.7) {
        const w = 1 - phys.landT / 0.7;
        handF = [0.15, 0.12 + 0.45 * w, -0.72]; handR = [0.05, 0.1 + 0.5 * w, 0.76];
        counter += Math.sin(this.t * 13) * 0.22 * w;
        hip -= 0.08 * w;
      }
      // loading the pop: shoulders wind against the coming spin, or throw for a flip
      if (charge > 0.1 && phys.windup) headYaw += phys.windup * 0.4;
      if (Math.abs(phys.flipLoad) > 0.1) { leanX += -phys.flipLoad * 0.25; handF = [0.25, 0.35, -0.3]; handR = [0.2, 0.32, 0.3]; }
      P.nod = damp(P.nod, 0, 6, dt);
      if (phys.butter) {
        // weight over the pressed end, arms out for balance
        const nose = phys.butter.kind === 'nose';
        leanZ = nose ? -0.75 : 0.75;
        hip = 0.7;
        handF = [0.25, 0.32, -0.75]; handR = [0.15, 0.3, 0.75];
        headYaw = nose ? (sw ? -0.7 : 1.5) : (sw ? -1.5 : 0.7);
      }
    } else if (st === 'air') {
      // Spins start in the head and shoulders, the knees tuck to spin, the head comes
      // round late to spot the landing, then the legs reach for the snow with arms out.
      const at = phys.airTime;
      const spin = phys.spinVel, spinning = Math.abs(spin) > 1.6;
      const inverting = Math.abs(phys.flipVel) > 1.5 || Math.abs(phys.rollVel) > 1.5 || Math.abs(wrapPi(phys.flip)) > 0.6 || Math.abs(wrapPi(phys.roll)) > 0.6;
      const gy = phys.course.heightAt(phys.pos.x, phys.pos.z);
      const above = phys.pos.y - gy, falling = phys.vel.y < 0;
      // travel direction seen from the board, and how far the board is from a clean landing
      const r = wrapPi(phys.travelHeading() - phys.heading);
      const toClean = Math.abs(wrapPi(phys.heading - phys.travelHeading() - Math.round((phys.heading - phys.travelHeading()) / Math.PI) * Math.PI));
      const pop = smooth(0, 0.22, at);
      hip = 0.8 - pop * 0.16; leanX = 0.28;
      // ollie: the tail springs, the nose comes up first, then the board levels as the knees come up
      const ollie = phys.takeoffKind === 'lip' || phys.takeoffKind === 'ollie' || phys.takeoffKind === 'nollie';
      pitch = ollie ? (phys.takeoffKind === 'nollie' ? -1 : 1) * 0.22 * Math.max(0, 1 - at / 0.3) * smooth(0, 0.06, at) : 0;
      handF = [0.28, 0.32, -0.62]; handR = [0.12, 0.3, 0.56];
      headYaw = sw ? -1.2 : 1.2;
      // holding a rotation the body is compact; let go, it opens up (arms out, legs long)
      // and that is what slows the rotation down
      const winding = Math.abs(phys.spinIn) > 0.25 || Math.abs(phys.flipIn) > 0.25 || Math.abs(phys.rollIn) > 0.25;
      if (spinning) {
        // tuck and pull the arms in: a compact body spins; shoulders and head lead,
        // more so the faster the spin
        const s = Math.min(1, Math.abs(spin) / 5);
        hip = 0.62 - s * 0.06; leanX = 0.38;
        handF = [0.3, 0.26, -0.24]; handR = [0.3, 0.22, 0.2];
        twist = Math.sign(spin) * (0.35 + 0.25 * s);
        headYaw += Math.sign(spin) * (0.4 + 0.25 * s);
        if (!winding) { hip = 0.72; handF = [0.3, 0.42, -0.68]; handR = [0.12, 0.4, 0.62]; twist *= 0.5; }
      }
      if (inverting) {
        // a backflip leads with the head and shoulders going back, a front flip with the chest
        hip = winding ? 0.46 : 0.6; leanX = phys.flipVel < -0.5 ? 1.0 : phys.flipVel > 0.5 ? 0.45 : 0.75;
        leanZ = THREE.MathUtils.clamp(phys.rollVel * 0.08, -0.4, 0.4);
        handF = winding ? [0.34, 0.1, -0.18] : [0.3, 0.38, -0.6]; handR = winding ? [0.34, 0.06, 0.14] : [0.15, 0.36, 0.56];
        headYaw = sw ? -0.6 : 0.6;
      }
      // late in the spin: spot the landing and check the rotation
      const spotting = falling && toClean < 1.1 && above < 4;
      if (spotting) {
        headYaw = THREE.MathUtils.clamp(wrapPi(Math.PI / 2 + r), -1.6, 1.6);
        twist = -Math.sign(spin) * 0.15 * (1 - toClean);
      }
      // reach for the landing: legs extend, arms go out wide and forward
      const reach = falling ? smooth(2.2, 0.5, above) : 0;
      if (!inverting) {
        hip = THREE.MathUtils.lerp(hip, 0.8, reach);
        leanX = THREE.MathUtils.lerp(leanX, 0.32, reach);
        handF = handF.map((x, i) => THREE.MathUtils.lerp(x, [0.42, 0.42, -0.72][i], reach));
        handR = handR.map((x, i) => THREE.MathUtils.lerp(x, [0.18, 0.38, 0.68][i], reach));
      }
      P.nod = damp(P.nod, spotting || reach > 0.3 ? 0.25 : 0, 6, dt);
      if (phys.grab) {
        grabPose = GRAB_POSES[phys.grab.name];
        // the knees come up to meet the hand; holding it longer tweaks the board further
        const tweak = smooth(0.35, 1.2, phys.grab.time);
        hip = grabPose.hip - tweak * 0.04; leanX = grabPose.lean[0]; leanZ = grabPose.lean[1] * (1 + tweak * 0.35);
        pitch = grabPose.pitch * (1 + tweak * 0.6); roll = (grabPose.roll || 0) * (1 + tweak * 0.5);
        const freeT = [-0.15 - tweak * 0.1, 0.62 + tweak * 0.12, grabPose.hand === 'front' ? 0.55 : -0.55];
        if (grabPose.hand === 'front') handR = freeT; else handF = freeT;
      }
      P.grab = damp(P.grab, phys.grab ? 1 : 0, phys.grab ? 16 : 10, dt);
    } else if (st === 'grind') {
      const g = phys.grind, b = phys.balance;
      // lock-on: soak up the hit, then a low, centred stance with the arms out for balance
      const lock = g ? Math.max(0, 1 - g.time / 0.25) : 0;
      hip = 0.7 - lock * 0.14; leanX = 0.22 + lock * 0.2;
      // balance is corrected across the rail (toe/heel), weight slightly forward
      hipX = -b * 0.07; counter = -b * 0.35; fore = -0.03;
      handF = [0.12, 0.32 - b * 0.3, -0.78];
      handR = [0.12, 0.32 + b * 0.3, 0.78];
      // look where the rail goes: for a slide the shoulders turn down the rail
      const r = g ? wrapPi(phys.travelHeading() - phys.heading) : 0;
      headYaw = THREE.MathUtils.clamp(wrapPi(Math.PI / 2 + r), -1.6, 1.6);
      if (g && g.type !== '50-50') {
        twist = THREE.MathUtils.clamp(wrapPi(r - Math.round(r / Math.PI) * Math.PI) * 0.6, -0.8, 0.8);
        handF = [0.3, 0.3 - b * 0.3, -0.6]; handR = [-0.05, 0.3 + b * 0.3, 0.62];
      }
      if (g && g.press === 'Nose Press') { leanZ = -0.65; hip = 0.66; }
      if (g && g.press === 'Tail Press') { leanZ = 0.65; hip = 0.66; }
    } else if (st === 'crash') {
      // Lying in the snow, never through it. Heelside: sat down behind the heels with the
      // knees up, back on the snow, hands out behind. Toeside: the board rolls onto its toe
      // edge, the rider is on the knees and hands. Both are blended from the standing
      // stance by how far down the body is, and back up again for the getup.
      const { e, down } = this.fallAmount(phys);
      const heel = phys.fallSide > 0, rest = down === 'rest';
      const D = heel
        ? rest
          ? { hip: 0.0, hipX: -0.4, leanX: -1.5, handF: [-0.55, -0.06, -0.3], handR: [-0.55, -0.06, 0.3], nod: 0.4, yaw: 0.6 }
          : { hip: 0.0, hipX: -0.43, leanX: -3.0, handF: [-0.62, -0.05, -0.5], handR: [-0.62, -0.05, 0.5], nod: 0.55, yaw: 0.5 }
        : rest
          ? { hip: 0.38, hipX: 0.47, leanX: 1.0, handF: [0.62, 0.0, -0.17], handR: [0.62, 0.0, 0.17], nod: -0.1, yaw: 0.2, roll: -1.15 }
          : { hip: 0.35, hipX: 0.5, leanX: 2.4, handF: [1.02, -0.36, -0.26], handR: [1.02, -0.36, 0.26], nod: -0.35, yaw: 0.1, roll: -1.15 };
      const L = (a, b) => a + (b - a) * e;
      hip = L(0.84, D.hip); hipX = L(0, D.hipX); leanX = L(0.18, D.leanX);
      handF = handF.map((x, i) => L([0.2, 0.06, -0.46][i], D.handF[i]));
      handR = handR.map((x, i) => L([0.08, 0.02, 0.42][i], D.handR[i]));
      headYaw = L(1.15, D.yaw);
      pitch = 0;
      // the board tips onto its toe edge, pivoting on that edge
      roll = (D.roll ?? 0) * e; pivotX = D.roll ? 0.13 : 0;
      P.nod = damp(P.nod, D.nod * e, 8, dt);
      // knees: up for a heelside sit, forward and down onto the snow toeside
      const kneeDown = heel ? v2.set(0.5, 1, 0) : v2.set(1, -0.9, 0);
      poleF.lerp(kneeDown, e).normalize(); poleR.lerp(kneeDown, e).normalize();
    }

    const tg = { hip, leanX, leanZ, side, hipX, fore, counter, pitch, roll, twist, headYaw, pivotX };
    this.suspension(dt, phys, tg);
    this.blend(dt, tg, st === 'air' ? 14 : st === 'crash' ? 18 : 10);
    // a pressed end stays on the snow: lift the board centre accordingly
    P.lift = damp(P.lift, st === 'air' || st === 'crash' ? 0 : Math.abs(Math.sin(P.pitch)) * BOARD_HALF, 14, dt);
    this.springArms(dt, st, handF, handR);

    // Board tweak for grabs and presses; ankles follow the board. A crash rolls the board
    // about its toe edge (pivotX) so that edge stays on the snow.
    this.boardPivot.rotation.set(P.pitch, 0, P.roll);
    this.boardPivot.position.set(P.pivotX * (1 - Math.cos(P.roll)), P.lift - P.pivotX * Math.sin(P.roll), 0);
    this.boardPivot.updateMatrix();
    const bm = this.boardPivot.matrix;
    const ankleF = new THREE.Vector3(0, R.ankle, -FOOT_Z).applyMatrix4(bm);
    const ankleR = new THREE.Vector3(0, R.ankle, FOOT_Z).applyMatrix4(bm);
    const hipC = new THREE.Vector3(-0.03 + P.hipX, R.ankle + leg * P.hip + P.lift * 0.6, P.side * 0.1 + P.fore);
    const bend = this.char ? 0.8 : 1;
    // counter > 0: the board tilts toward the heel, so the chest leans back toward the toes
    const spine = new THREE.Vector3((P.leanX + P.counter) * bend, 1, (P.leanZ + P.side) * bend).normalize();
    const hipY = hipC.y;
    const handFT = P.handF.clone(); handFT.y += hipY;
    const handRT = P.handR.clone(); handRT.y += hipY;
    if (grabPose && st === 'air') {
      // the hand travels to the board over a few frames instead of snapping onto it
      const g = new THREE.Vector3(...grabPose.target).applyMatrix4(bm);
      if (grabPose.hand === 'front') handFT.lerp(g, P.grab); else handRT.lerp(g, P.grab);
    }
    if (st !== 'air') P.grab = 0;
    // toes point along each binding, down to the deck
    const toeAt = (z, ang) => new THREE.Vector3(Math.cos(ang) * 0.2, BOARD_TOP + 0.02, z - Math.sin(ang) * 0.2).applyMatrix4(bm);
    return {
      hipC, spine,
      legs: [
        { side: 'l', ankle: ankleF, pole: poleF, toe: toeAt(-FOOT_Z, STANCE[0]) },
        { side: 'r', ankle: ankleR, pole: poleR, toe: toeAt(FOOT_Z, STANCE[1]) },
      ],
      arms: [{ side: 'l', hand: handFT, pole: new THREE.Vector3(-0.3, -1, -0.6) }, { side: 'r', hand: handRT, pole: new THREE.Vector3(-0.3, -1, 0.6) }],
    };
  }

  // ---------- skis ----------
  // Body frame on skis: the skier faces +X (the ski tips), left is -Z, right +Z (the body
  // group is turned a quarter turn against the board frame, whose nose is at -Z).
  // Stance from ski instruction: feet hip-width apart, shins pressed into the boot tongues,
  // hips over the feet, hands forward and wide with the poles angled back; turns are
  // inclination plus angulation (hips into the turn, upper body over the outside ski,
  // facing down the fall line), short turns start with a pole plant, a tuck folds the body
  // over the knees with the poles under the arms, on the flats the skier double-poles.
  poseSki(dt, phys, inp) {
    const R = this.rig, P = this.pose, st = phys.state, sw = phys.switch;
    const leg = R.thigh + R.shin;
    let hip = 0.82, leanX = 0.34, leanZ = 0, hipX = -0.1, hipZ = 0, twist = 0, waist = 0, pitch = 0, lift2 = 0;
    let headYaw = 0, sep = SKI_SEP;
    let handF = [0.3, 0.06, -0.3], handR = [0.3, 0.06, 0.3];
    let poleL = [-0.5, -1, -0.28], poleR = [-0.5, -1, 0.28];
    const skiT = [{ yaw: 0, pitch: 0, dy: 0, dx: 0 }, { yaw: 0, pitch: 0, dy: 0, dx: 0 }];
    let grab = null;
    let kneeL = v2.set(1, 0, -0.12).clone(), kneeR = v2.set(1, 0, 0.12).clone();
    const rel = wrapPi(phys.travelHeading() - phys.heading - (sw ? Math.PI : 0));
    // root roll of the skis on edge (same as physics.orientation), for the edge heights
    const phi = st === 'ground' ? phys.lean * 0.8 * (sw ? -1 : 1) : 0;
    P.phi = damp(P.phi ?? 0, phi, 22, dt);

    if (st === 'ground') {
      const charge = phys.charge / 0.55;
      const absorb = Math.max(0, 1 - phys.landT / 0.35) * Math.min(1, phys.impact / 8);
      const k = Math.min(1, Math.abs(phi) / 0.7);
      const sp = phys.speed;
      const crouch = Math.min(1, 0.2 + charge * 0.5 + absorb * 0.6 + phys.skid * 0.25 + k * 0.25);
      hip = 0.84 - crouch * 0.3;
      hipX = -0.08 - crouch * 0.1;
      leanX = 0.3 + crouch * 0.25;
      // angulation: hips into the turn, upper body tilts back over the outside ski
      const inside = -Math.sign(phi);
      hipZ = inside * 0.06 * k;
      leanZ = -inside * 0.5 * k;
      // the chest faces where the skier is going (down the fall line in a skid or hockey stop)
      twist = THREE.MathUtils.clamp(rel, -0.9, 0.9) * 0.7;
      headYaw = THREE.MathUtils.clamp(rel, -1.2, 1.2) * 0.4;
      const sway = Math.sin(this.t * 2.1) * 0.02;
      handF = [0.32, 0.08 + sway, -0.3]; handR = [0.32, 0.08 - sway, 0.3];
      if (sw) {
        // Riding switch (backwards): the skier looks over one shoulder down the hill, the
        // turn spread through the waist, the shoulders and the neck; the shoulder is kept
        // until the line clearly heads the other way. Arms go wide for balance and the poles
        // trail out to the sides toward the ski tips, clear of the body.
        const back = wrapPi(phys.travelHeading() - phys.heading); // about ±pi: where the skier is going
        const clear = Math.abs(back) < Math.PI - 0.45;
        // straight backwards it could be either shoulder: after a spin the head that led it keeps looking
        if (!P.switchLook) P.switchLook = clear ? Math.sign(back) : P.lastSpinDir || 1;
        else if (clear && Math.sign(back) !== P.switchLook) P.switchLook = Math.sign(back);
        ({ waist, twist, headYaw } = lookOver(back, P.switchLook));
        // hands and poles turn with the upper body
        const yaw = waist + twist, c = Math.cos(yaw), sn = Math.sin(yaw);
        const turn = ([x, y, z]) => [x * c + z * sn, y, -x * sn + z * c];
        handF = turn([0.22, 0.1 + sway, -0.44]); handR = turn([0.22, 0.1 - sway, 0.44]);
        const outL = turn([0, 0, -1]), outR = turn([0, 0, 1]);
        poleL = [outL[0] * 0.55 + 0.45, -1, outL[2] * 0.55];
        poleR = [outR[0] * 0.55 + 0.45, -1, outR[2] * 0.55];
        // a little lower and more centred over the feet than riding forward
        hip -= 0.03; leanX = 0.22 + crouch * 0.15; hipX = -0.04;
        P.plant = null;
      } else {
        P.switchLook = 0;
      }
      // pole plant: the inside pole touches the snow ahead as a new turn starts
      const es = Math.sign(phys.edge);
      if (es && es !== P.edgeSign && Math.abs(phys.edge) > 0.2 && sp > 4 && !sw) P.plant = { side: es > 0 ? 0 : 1, t: 0 };
      if (Math.abs(phys.edge) > 0.2) P.edgeSign = es;
      if (P.plant) {
        P.plant.t += dt;
        const u = P.plant.t / 0.5, b = Math.sin(Math.min(1, u) * Math.PI);
        const z = P.plant.side ? 1 : -1;
        const h = [0.46, -0.03, z * 0.3], pd = [0.32, -1, z * 0.22];
        if (P.plant.side) { handR = handR.map((x, i) => x + (h[i] - x) * b); poleR = poleR.map((x, i) => x + (pd[i] - x) * b); } else { handF = handF.map((x, i) => x + (h[i] - x) * b); poleL = poleL.map((x, i) => x + (pd[i] - x) * b); }
        if (u >= 1) P.plant = null;
      }
      if (sw) {
        // (no tuck or double-poling backwards)
      } else if (inp.up && sp >= 7.5) {
        // tuck: chest down on the thighs, fists in front of the face, poles under the arms
        hip = 0.5; hipX = -0.2; leanX = 1.55;
        handF = [0.48, 0.3, -0.12]; handR = [0.48, 0.3, 0.12];
        poleL = [-1, 0.22, -0.1]; poleR = [-1, 0.22, 0.1];
        headYaw = 0;
      } else if (inp.up && !phys.finished) {
        // double-poling: reach, plant, push past the hips, swing back through
        const w = 0.5 - 0.5 * Math.cos(this.t * 1.15 * Math.PI * 2);
        hip = 0.8 - 0.1 * w; leanX = 0.35 + 0.55 * w;
        handF = [0.5 - 0.72 * w, 0.42 - 0.54 * w, -0.28]; handR = [0.5 - 0.72 * w, 0.42 - 0.54 * w, 0.28];
        poleL = [0.25 - 1.1 * w, -1 + 0.4 * w, -0.18]; poleR = [0.25 - 1.1 * w, -1 + 0.4 * w, 0.18];
      }
      if (inp.down || phys.brake > 0.3) {
        // hockey stop: skis across, low, upper body facing down the hill
        hip = Math.min(hip, 0.66); leanX = 0.2;
        if (!sw) { handF = [0.36, 0.14, -0.36]; handR = [0.36, 0.14, 0.36]; }
      }
      if (absorb > 0.05 && !sw) { handF = [0.42, 0.2 + absorb * 0.1, -0.4]; handR = [0.42, 0.2 + absorb * 0.1, 0.4]; }
      if (phys.lastLand === 'sketchy' && phys.landT < 0.7) {
        const w = 1 - phys.landT / 0.7;
        if (!sw) { handF = [0.1, 0.12 + 0.45 * w, -0.66]; handR = [0.1, 0.1 + 0.5 * w, 0.66]; }
        leanZ += Math.sin(this.t * 13) * 0.22 * w;
        hip -= 0.08 * w;
      }
      // loading the pop: wind the shoulders against the coming spin, or set up a flip
      if (charge > 0.1) { twist -= phys.windup * 0.7; headYaw -= phys.windup * 0.3; }
      if (Math.abs(phys.flipLoad) > 0.1) { leanX += -phys.flipLoad * 0.25; handF = [0.3, 0.38, -0.3]; handR = [0.3, 0.38, 0.3]; }
      P.nod = damp(P.nod, inp.up && sp >= 7.5 ? -0.45 : 0, 6, dt);
      // butters: weight onto the tips (tails come up) or back onto the tails
      pitch = phys.butterPitch;
      if (phys.butter) {
        const nose = phys.butter.kind === 'nose';
        leanX = nose ? 1.0 : -0.35; hip = 0.72;
        handF = [0.2, 0.32, -0.6]; handR = [0.2, 0.3, 0.6];
      }
    } else if (st === 'air') {
      const at = phys.airTime;
      const spin = phys.spinVel, spinning = Math.abs(spin) > 1.6;
      if (Math.abs(phys.spinAccum) > 1) P.lastSpinDir = Math.sign(phys.spinAccum);
      P.switchLook = 0;
      const inverting = Math.abs(phys.flipVel) > 1.5 || Math.abs(phys.rollVel) > 1.5 || Math.abs(wrapPi(phys.flip)) > 0.6 || Math.abs(wrapPi(phys.roll)) > 0.6;
      const gy = phys.course.heightAt(phys.pos.x, phys.pos.z);
      const above = phys.pos.y - gy, falling = phys.vel.y < 0;
      const toClean = Math.abs(wrapPi(phys.heading - phys.travelHeading() - Math.round((phys.heading - phys.travelHeading()) / Math.PI) * Math.PI));
      const pop = smooth(0, 0.22, at);
      // pop: the knees come up a little, skis level and together, arms forward
      hip = 0.78 - pop * 0.12; leanX = 0.32; lift2 = pop * 0.1; sep = 0.085;
      handF = [0.3, 0.2, -0.4]; handR = [0.3, 0.2, 0.4];
      poleL = [-0.8, -0.65, -0.3]; poleR = [-0.8, -0.65, 0.3];
      const winding = Math.abs(phys.spinIn) > 0.25 || Math.abs(phys.flipIn) > 0.25 || Math.abs(phys.rollIn) > 0.25;
      if (spinning) {
        // compact: knees up, fists in, shoulders and head lead the spin
        const s = Math.min(1, Math.abs(spin) / 5);
        hip = 0.62; lift2 = 0.16; leanX = 0.42;
        handF = [0.32, 0.22, -0.18]; handR = [0.32, 0.22, 0.18];
        twist = Math.sign(spin) * (0.35 + 0.2 * s);
        headYaw = Math.sign(spin) * (0.45 + 0.25 * s);
        poleL = [-0.9, -0.4, -0.15]; poleR = [-0.9, -0.4, 0.15];
        // let go: arms out wide and legs long, the body opens and the spin slows
        if (!winding) { hip = 0.72; lift2 = 0.08; handF = [0.25, 0.3, -0.62]; handR = [0.25, 0.3, 0.62]; poleL = [-0.6, -0.7, -0.5]; poleR = [-0.6, -0.7, 0.5]; twist *= 0.5; }
      }
      if (inverting) {
        // backflip: head and shoulders go back first; front flip: chest dives forward
        hip = winding ? 0.5 : 0.62; lift2 = winding ? 0.26 : 0.14;
        leanX = phys.flipVel < -0.5 ? 1.1 : phys.flipVel > 0.5 ? 0.45 : 0.8;
        leanZ = THREE.MathUtils.clamp(phys.rollVel * 0.08, -0.4, 0.4);
        handF = winding ? [0.36, 0.1, -0.2] : [0.25, 0.3, -0.6]; handR = winding ? [0.36, 0.1, 0.2] : [0.25, 0.3, 0.6];
      }
      const spotting = falling && toClean < 1.1 && above < 4;
      if (spotting) {
        // spot the landing: coming round to land switch, look back over the leading shoulder
        const back = wrapPi(phys.travelHeading() - phys.heading);
        if (Math.abs(back) > Math.PI / 2) ({ waist, twist, headYaw } = lookOver(back, P.lastSpinDir || Math.sign(back) || 1));
        else { headYaw = THREE.MathUtils.clamp(back, -1.3, 1.3); twist = -Math.sign(spin) * 0.12 * (1 - toClean); }
      }
      const reach = falling ? smooth(2.2, 0.5, above) : 0;
      if (!inverting) {
        hip = THREE.MathUtils.lerp(hip, 0.8, reach); lift2 = THREE.MathUtils.lerp(lift2, 0, reach);
        leanX = THREE.MathUtils.lerp(leanX, 0.34, reach);
        handF = handF.map((x, i) => THREE.MathUtils.lerp(x, [0.42, 0.22, -0.45][i], reach));
        handR = handR.map((x, i) => THREE.MathUtils.lerp(x, [0.42, 0.22, 0.45][i], reach));
      }
      P.nod = damp(P.nod, spotting || reach > 0.3 ? 0.25 : 0, 6, dt);
      if (phys.grab) {
        grab = SKI_GRABS[phys.grab.name];
        const tweak = smooth(0.35, 1.2, phys.grab.time);
        hip = grab.hip - tweak * 0.04; lift2 = grab.lift + tweak * 0.04; leanX = grab.lean[0]; leanZ = grab.lean[1] * (1 + tweak * 0.3);
        for (let i = 0; i < 2; i++) {
          const s = grab.skis?.[i];
          if (s) { skiT[i].yaw = s[0] * (1 + tweak * 0.5); skiT[i].pitch = s[1] * (1 + tweak * 0.5); skiT[i].dy = s[2] ?? 0; }
        }
        // the free hand goes up and out for style
        if (!grab.hands.l) handF = [-0.1, 0.55 + tweak * 0.1, -0.5];
        if (!grab.hands.r) handR = [-0.1, 0.55 + tweak * 0.1, 0.5];
      }
      P.grab = damp(P.grab, phys.grab ? 1 : 0, phys.grab ? 16 : 10, dt);
    } else if (st === 'grind') {
      const g = phys.grind, b = phys.balance;
      const lock = g ? Math.max(0, 1 - g.time / 0.25) : 0;
      hip = 0.68 - lock * 0.14; leanX = 0.3 + lock * 0.15;
      const slide = g && g.type !== '50-50';
      // 50-50: both skis on top of the rail, close together, balance across it (z);
      // slide: skis across the rail, balance along the skis (x)
      if (slide) { leanX -= b * 0.35; hipX = -0.1 + b * 0.06; } else { leanZ = -b * 0.35; hipZ = b * 0.06; sep = 0.05; }
      handF = [0.15, 0.3 - b * 0.25, -0.62]; handR = [0.15, 0.3 + b * 0.25, 0.62];
      poleL = [-0.4, -1, -0.5]; poleR = [-0.4, -1, 0.5];
      twist = THREE.MathUtils.clamp(rel, -0.9, 0.9) * 0.6;
      headYaw = THREE.MathUtils.clamp(rel, -1.5, 1.5) * 0.6;
      if (g && g.press === 'Nose Press') { pitch = -0.2; leanX += 0.5; }
      if (g && g.press === 'Tail Press') { pitch = 0.2; leanX -= 0.4; }
    } else if (st === 'crash') {
      // A ski fall goes onto the hip on one side, skis still on and flat on the snow,
      // knees bent; lying a moment, then pushing back up with the hands.
      const { e, down } = this.fallAmount(phys);
      const zs = phys.fallSide > 0 ? -1 : 1, rest = down === 'rest';
      const D = rest
        ? { hip: 0.06, hipX: -0.16, hipZ: zs * 0.4, leanX: 0.3, leanZ: zs * 1.1, handF: [0.0, -0.05, zs * 0.62], handR: [0.32, 0.0, zs * 0.3], nod: 0.15 }
        : { hip: 0.02, hipX: -0.18, hipZ: zs * 0.44, leanX: 0.25, leanZ: zs * 2.4, handF: [0.05, -0.06, zs * 0.86], handR: [0.38, -0.06, zs * 0.4], nod: 0.25 };
      // the lower hand is the one on the fall side
      if (zs > 0) [D.handF, D.handR] = [D.handR, D.handF];
      const L = (a, b) => a + (b - a) * e;
      hip = L(0.82, D.hip); hipX = L(-0.1, D.hipX); hipZ = L(0, D.hipZ); leanX = L(0.34, D.leanX); leanZ = L(0, D.leanZ);
      handF = [0, 1, 2].map((i) => L([0.3, 0.06, -0.3][i], D.handF[i]));
      handR = [0, 1, 2].map((i) => L([0.3, 0.06, 0.3][i], D.handR[i]));
      poleL = [0.5, -0.35, -0.6]; poleR = [0.5, -0.35, 0.6];
      P.nod = damp(P.nod, D.nod * e, 8, dt);
      const kneeUp = v3.set(0.75, 0.65, -zs * 0.2);
      kneeL.lerp(kneeUp, e).normalize(); kneeR.lerp(kneeUp, e).normalize();
    }

    const tg = { hip, leanX, leanZ, hipX, hipZ, twist, waist, headYaw, pitch, lift2 };
    this.suspension(dt, phys, tg);
    this.blend(dt, tg, st === 'air' ? 14 : st === 'crash' ? 18 : 10);
    P.lift = damp(P.lift, st === 'air' || st === 'crash' ? 0 : Math.abs(Math.sin(P.pitch)) * SKI_CONTACT, 14, dt);
    P.sep = damp(P.sep ?? SKI_SEP, sep, 8, dt);
    P.poleL = (P.poleL ?? new THREE.Vector3(...poleL)).lerp(v1.set(...poleL), 1 - Math.exp(-10 * dt));
    P.poleR = (P.poleR ?? new THREE.Vector3(...poleR)).lerp(v1.set(...poleR), 1 - Math.exp(-10 * dt));
    P.skiT = P.skiT ?? [{ yaw: 0, pitch: 0, dy: 0 }, { yaw: 0, pitch: 0, dy: 0 }];
    for (let i = 0; i < 2; i++) for (const key of ['yaw', 'pitch', 'dy']) P.skiT[i][key] = damp(P.skiT[i][key], skiT[i][key], 12, dt);
    this.springArms(dt, st, handF, handR);

    // Each ski: under its foot, raised when the knees come up, on edge with the inside ski
    // higher (both stay on the snow), pitched for butters and presses, tweaked for grabs.
    const F = this.footGeo;
    const legs = [];
    const tanPhi = Math.tan(P.phi);
    for (let i = 0; i < 2; i++) {
      const z = (i ? 1 : -1) * P.sep;
      const s = this.skis[i];
      const t = P.skiT[i];
      s.position.set(0, P.lift + P.lift2 + t.dy - z * tanPhi, z);
      s.quaternion.setFromEuler(new THREE.Euler(0, t.yaw, P.pitch + t.pitch, 'YZX'));
      s.updateMatrix();
      const ankle = new THREE.Vector3(-F.ankleBack, SKI_TOP_Y + BIND_H + F.ankleH, 0).applyMatrix4(s.matrix);
      const toe = new THREE.Vector3(-F.ankleBack + F.toeFwd, SKI_TOP_Y + BIND_H + F.toeH, 0).applyMatrix4(s.matrix);
      legs.push({ side: i ? 'r' : 'l', ankle, toe, pole: i ? kneeR : kneeL });
    }
    const hipC = new THREE.Vector3(P.hipX, F.ankleH + SKI_TOP_Y + BIND_H + leg * P.hip + P.lift * 0.6 + P.lift2 * 0.5, P.hipZ);
    const bend = this.char ? 0.8 : 1;
    const spine = new THREE.Vector3(P.leanX * bend, 1, P.leanZ * bend).normalize();
    const hipY = hipC.y;
    const handFT = P.handF.clone(); handFT.y += hipY;
    const handRT = P.handR.clone(); handRT.y += hipY;
    if (grab && st === 'air') {
      // each grabbing hand travels onto its ski: [ski, along the ski, outside (+) / inside (-) edge]
      for (const [h, target] of [['l', handFT], ['r', handRT]]) {
        const spec = grab.hands[h];
        if (!spec) continue;
        const [si, x, edge] = spec;
        const zEdge = (si ? 1 : -1) * edge * 0.055;
        const p = new THREE.Vector3(x, SKI_TOP_Y + 0.02, zEdge).applyMatrix4(this.skis[si].matrix);
        target.lerp(p, P.grab);
      }
    }
    if (st !== 'air') P.grab = 0;
    return {
      hipC, spine, legs,
      arms: [{ side: 'l', hand: handFT, pole: new THREE.Vector3(-0.3, -1, -0.6) }, { side: 'r', hand: handRT, pole: new THREE.Vector3(-0.3, -1, 0.6) }],
    };
  }

  // A fallen body lies ON the snow: hips, chest and head are kept above the surface under
  // them (the board frame follows the slope, but kickers and rollers curve away from it).
  keepAboveSnow(T, course, dt) {
    const P = this.pose, R = this.rig;
    this.root.updateMatrixWorld(true);
    const pts = [
      [T.hipC, 0.07],
      [T.hipC.clone().addScaledVector(T.spine, R.torso * 0.6), 0.1],
      [T.hipC.clone().addScaledVector(T.spine, R.torso + 0.2), 0.1],
    ];
    let need = 0;
    for (const [p, clear] of pts) {
      const w = this.body.localToWorld(p.clone());
      need = Math.max(need, course.heightAt(w.x, w.z) + clear - w.y);
    }
    P.guard = need > (P.guard ?? 0) ? need : damp(P.guard ?? 0, need, 6, dt);
    if (P.guard > 0) {
      T.hipC.y += P.guard;
      for (const a of T.arms) a.hand.y += P.guard;
    }
  }

  // Poles: in the fists, pointing where the pose wants their tips.
  placePoles(T) {
    if (!this.poles) return;
    const P = this.pose;
    for (let i = 0; i < 2; i++) {
      const pole = this.poles[i];
      const grip = this.gripPoint(i ? 'r' : 'l', T.arms[i].hand);
      pole.position.copy(grip);
      const dir = v1.copy(i ? P.poleR : P.poleL).normalize();
      pole.quaternion.setFromUnitVectors(v2.set(0, -1, 0), dir);
    }
  }

  // Middle of the fist in body coordinates (the IK target when there is no skinned model).
  gripPoint(side, fallback) {
    const c = this.char;
    if (!c?.grip) return fallback.clone();
    return this.body.worldToLocal(c.bones['wrist.' + side].localToWorld(c.grip[side].clone()));
  }

  applyProcedural({ hipC, spine, legs, arms }) {
    const P = this.pose, R = this.rig;
    const ankleF = legs[0].ankle, ankleR = legs[1].ankle, handFT = arms[0].hand, handRT = arms[1].hand;
    const chest = hipC.clone().addScaledVector(spine, R.torso);
    placeLimb(this.torso, hipC.clone().addScaledVector(spine, 0.04), chest);
    this.pelvis.position.copy(hipC);
    const hipF = hipC.clone().add(new THREE.Vector3(0, -0.02, -0.11));
    const hipR = hipC.clone().add(new THREE.Vector3(0, -0.02, 0.11));
    const knee = new THREE.Vector3(), end = new THREE.Vector3();
    solveIK(hipF, ankleF, R.thigh, R.shin, legs[0].pole, knee, end);
    placeLimb(this.thighF, hipF, knee); placeLimb(this.shinF, knee, end);
    solveIK(hipR, ankleR, R.thigh, R.shin, legs[1].pole, knee, end);
    placeLimb(this.thighR, hipR, knee); placeLimb(this.shinR, knee, end);
    const across = new THREE.Vector3(Math.sin(P.twist), 0, Math.cos(P.twist));
    const shF = chest.clone().addScaledVector(spine, -0.06).addScaledVector(across, -0.2);
    const shR = chest.clone().addScaledVector(spine, -0.06).addScaledVector(across, 0.2);
    const elbow = new THREE.Vector3();
    solveIK(shF, handFT, R.upper, R.fore, new THREE.Vector3(-0.3, -1, -0.6), elbow, end);
    placeLimb(this.upperF, shF, elbow); placeLimb(this.foreF, elbow, end);
    this.handFm.position.copy(end);
    solveIK(shR, handRT, R.upper, R.fore, new THREE.Vector3(-0.3, -1, 0.6), elbow, end);
    placeLimb(this.upperR, shR, elbow); placeLimb(this.foreR, elbow, end);
    this.handRm.position.copy(end);
    this.head.position.copy(chest).addScaledVector(spine, 0.2);
    this.head.rotation.set(0, P.headYaw, -0.1 - P.leanX * 0.25);
  }

  applySkinned({ hipC, spine, legs, arms }) {
    const { bones: B, all, rest, dirs } = this.char;
    const P = this.pose;
    const body = this.body;
    for (const b of all) { const r = rest.get(b); b.quaternion.copy(r.q); b.position.copy(r.p); }
    this.root.updateMatrixWorld(true);
    const toWorld = (v) => body.localToWorld(v.clone());
    const bq = body.getWorldQuaternion(new THREE.Quaternion());
    const dirWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(bq);
    const setWorldPos = (bone, w) => { bone.position.copy(bone.parent.worldToLocal(w.clone())); bone.updateMatrixWorld(true); };

    // pelvis: move the body bone so the hip joints sit at hipC
    const hipMid = B['upperleg.l'].getWorldPosition(new THREE.Vector3()).add(B['upperleg.r'].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    const delta = toWorld(hipC).sub(hipMid);
    setWorldPos(B.body, B.body.getWorldPosition(new THREE.Vector3()).add(delta));

    // torso bends toward the spine direction; the chest counter-rotates for wind-ups
    const sd = dirWorld(spine.x, spine.y, spine.z);
    aimBone(B.spine, dirs.spine, sd, rest.get(B.spine).q);
    // part of a big turn of the upper body (looking back when riding switch) is in the waist
    if (P.waist) {
      B.spine.quaternion.multiply(q1.setFromAxisAngle(v1.copy(dirs.spine).normalize(), P.waist));
      B.spine.updateMatrixWorld(true);
    }
    aimBone(B.chest, dirs.chest, sd, rest.get(B.chest).q);
    B.chest.quaternion.multiply(q1.setFromAxisAngle(v1.copy(dirs.chest).normalize(), P.twist));
    B.chest.updateMatrixWorld(true);
    // head: turn about the body's up axis (look along the board / spot the landing), nod a little
    B.head.updateMatrixWorld(true);
    B.head.getWorldQuaternion(q2);
    q3.setFromAxisAngle(sd, P.headYaw * 0.8).multiply(q1.setFromAxisAngle(dirWorld(0, 0, 1), -(0.12 + THREE.MathUtils.clamp(P.leanX, -0.5, 1.2) * 0.12 + P.nod)));
    q2.premultiply(q3);
    B.head.parent.getWorldQuaternion(q1);
    B.head.quaternion.copy(q1.invert()).multiply(q2);
    B.head.updateMatrixWorld(true);
    // riders keep their eyes level: the head takes out half of the body's roll
    if (dirs.headUp && this.state !== 'air' && this.state !== 'crash') {
      B.head.getWorldQuaternion(q2);
      const hu = v3.copy(dirs.headUp).normalize().applyQuaternion(q2);
      if (hu.y > 0.3) {
        const level = v2.copy(hu).lerp(Y, 0.5).normalize();
        q3.setFromUnitVectors(hu, level);
        q2.premultiply(q3);
        B.head.parent.getWorldQuaternion(q1);
        B.head.quaternion.copy(q1.invert()).multiply(q2);
        B.head.updateMatrixWorld(true);
      }
    }

    const R = this.rig;
    const knee = new THREE.Vector3(), end = new THREE.Vector3();
    for (const { side, ankle, pole, toe } of legs) {
      const up = B['upperleg.' + side], low = B['lowerleg.' + side], foot = B['foot.' + side];
      const hipJ = up.getWorldPosition(new THREE.Vector3());
      solveIK(hipJ, toWorld(ankle), R.thigh, R.shin, dirWorld(pole.x, pole.y, pole.z), knee, end);
      aimBone(up, dirs['upperleg.' + side], v2.subVectors(knee, hipJ).clone(), rest.get(up).q);
      aimBone(low, dirs['lowerleg.' + side], v2.subVectors(end, knee).clone(), rest.get(low).q);
      // feet are not parented to the shins in this rig: place them, then point the toes along the binding
      setWorldPos(foot, end);
      aimBone(foot, dirs['foot.' + side], v2.subVectors(toWorld(toe), end).clone(), rest.get(foot).q);
    }

    const elbow = new THREE.Vector3();
    for (const { side, hand, pole } of arms) {
      const up = B['upperarm.' + side], low = B['lowerarm.' + side];
      const sh = up.getWorldPosition(new THREE.Vector3());
      solveIK(sh, toWorld(hand), R.upper, R.fore, dirWorld(pole.x, pole.y, pole.z), elbow, end);
      aimBone(up, dirs['upperarm.' + side], v2.subVectors(elbow, sh).clone(), rest.get(up).q);
      aimBone(low, dirs['lowerarm.' + side], v2.subVectors(end, elbow).clone(), rest.get(low).q);
    }
    // gloved hands: fists round the pole grips on skis, loosely curled on a board
    const curl = this.gear === 'ski' ? 1 : 0.35;
    for (const f of this.char.fingers ?? []) f.bone.quaternion.multiply(q1.setFromAxisAngle(f.axis, f.w * curl));
  }
}
