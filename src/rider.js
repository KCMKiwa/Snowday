// Rider: a downloaded rigged character (KayKit, CC0) posed with two-bone IK each frame,
// or a procedural capsule body as fallback. Board-local frame: nose at -Z,
// rider faces +X (toe edge), regular stance (left foot forward).
import * as THREE from 'three';
import { makeBoard } from './boards.js';
import { damp } from './physics.js';

export const OUTFITS = [
  { id: 'signal', name: 'Signal', jacket: '#ff5a1f', pants: '#1f2738', helmet: '#f1f3f6', glove: '#151820' },
  { id: 'glacier', name: 'Glacier', jacket: '#3d9cff', pants: '#e6ebf2', helmet: '#1c2431', glove: '#e6ebf2' },
  { id: 'moss', name: 'Moss', jacket: '#5f7f3b', pants: '#c8b388', helmet: '#2b2b2b', glove: '#3a2b1d' },
  { id: 'berry', name: 'Berry', jacket: '#ff6fae', pants: '#2b2140', helmet: '#ffffff', glove: '#2b2140' },
];

const FOOT_Z = 0.26;
const BOARD_TOP = 0.02;
const STANCE = [0.31, -0.16];
const CHAR_HEAD_Y = 1.3;

// Hand target (board-local), which hand, torso lean, hip height (fraction of leg), board tweak.
const GRAB_POSES = {
  indy: { hand: 'rear', target: [0.14, 0.05, 0.1], lean: [1.2, 0.25], hip: 0.42, pitch: 0 },
  mute: { hand: 'front', target: [0.14, 0.05, -0.1], lean: [1.2, -0.25], hip: 0.42, pitch: 0 },
  melon: { hand: 'front', target: [-0.13, 0.05, -0.12], lean: [0.55, -0.7], hip: 0.4, pitch: 0 },
  stalefish: { hand: 'rear', target: [-0.13, 0.05, 0.14], lean: [0.55, 0.7], hip: 0.4, pitch: 0 },
  nose: { hand: 'front', target: [0.0, 0.1, -0.68], lean: [0.4, -1.1], hip: 0.45, pitch: 0.32 },
  tail: { hand: 'rear', target: [0.0, 0.1, 0.68], lean: [0.4, 1.1], hip: 0.45, pitch: -0.32 },
};

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

const BONES = ['hips', 'spine', 'chest', 'head', 'upperarm.l', 'lowerarm.l', 'wrist.l', 'upperarm.r', 'lowerarm.r', 'wrist.r',
  'upperleg.l', 'lowerleg.l', 'foot.l', 'toes.l', 'upperleg.r', 'lowerleg.r', 'foot.r', 'toes.r'];

// GLTFLoader strips characters like '.' from node names.
const BONE_BY_SAFE_NAME = Object.fromEntries(BONES.map((n) => [THREE.PropertyBinding.sanitizeNodeName(n), n]));

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
    this.buildBoots();
    this.buildBody();
    this.setOutfit(outfit);
    this.setBoard(design);
    this.char = null;
    this.rig = { thigh: 0.46, shin: 0.46, upper: 0.3, fore: 0.29, ankle: 0.11, torso: 0.52 };

    this.pose = {
      hip: 0.84, leanX: 0.15, leanZ: 0, side: 0, pitch: 0, headYaw: 1.2,
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
    this.mats.jacket.color.set(o.jacket);
    this.mats.pants.color.set(o.pants);
    this.mats.helmet.color.set(o.helmet);
    this.mats.glove.color.set(o.glove);
  }

  setBoard(design) {
    if (this.board) this.boardPivot.remove(this.board);
    this.board = makeBoard(design);
    this.boardPivot.add(this.board);
  }

  // Swap the procedural body for a rigged glTF character (null restores the fallback).
  setCharacter(scene) {
    if (this.char) this.body.remove(this.char.holder);
    this.char = null;
    this.proc.visible = !scene;
    this.boots.visible = !scene;
    if (!scene) {
      this.rig = { thigh: 0.46, shin: 0.46, upper: 0.3, fore: 0.29, ankle: 0.11, torso: 0.52 };
      return;
    }
    const bones = {};
    scene.traverse((o) => {
      if (o.isBone) { const n = BONE_BY_SAFE_NAME[o.name]; if (n) bones[n] = o; }
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    if (BONES.some((b) => !bones[b])) { console.warn('Unerwartetes Skelett, nutze prozeduralen Fahrer'); this.setCharacter(null); return; }

    // the same scene can be re-attached later: restore its bind pose first
    if (scene.userData.restPose) {
      for (const [n, r] of Object.entries(scene.userData.restPose)) { bones[n].quaternion.copy(r.q); bones[n].position.copy(r.p); }
    }
    scene.position.set(0, 0, 0);
    scene.rotation.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.updateMatrixWorld(true);
    // Skinned bounds are unreliable, so size the character from its skeleton (head bone height).
    const headY = bones.head.getWorldPosition(new THREE.Vector3()).y;
    const s = CHAR_HEAD_Y / headY;
    const rest = {};
    for (const [n, b] of Object.entries(bones)) rest[n] = { q: b.quaternion.clone(), p: b.position.clone() };
    scene.userData.restPose = rest;
    const footY = bones['foot.l'].getWorldPosition(new THREE.Vector3()).y;

    const holder = new THREE.Group();
    holder.rotation.y = Math.PI / 2; // model faces +Z, rider faces board +X
    holder.scale.setScalar(s);
    holder.position.y = BOARD_TOP;
    holder.add(scene);
    this.body.add(holder);

    const len = (n) => bones[n].position.length() * s;
    this.rig = {
      thigh: len('lowerleg.l'), shin: len('foot.l'),
      upper: len('lowerarm.l'), fore: len('wrist.l'),
      ankle: BOARD_TOP + footY * s,
      torso: (bones.chest.position.length() + bones.head.position.length() * 0.5) * s,
    };
    this.char = { holder, bones, rest, s };
  }

  // phys: RiderPhysics, inp: current input, quat: smoothed board orientation.
  update(dt, phys, inp, quat) {
    this.t += dt;
    this.root.position.copy(phys.pos);
    this.root.quaternion.copy(quat);

    const R = this.rig;
    const leg = R.thigh + R.shin;
    const arm = (R.upper + R.fore) / 0.59;
    const P = this.pose;
    const st = phys.state;
    const sw = phys.switch;
    let hip = 0.84, leanX = 0.18, leanZ = 0, side = 0, pitch = 0;
    let headYaw = sw ? -1.15 : 1.15;
    // hand targets: [x, height above hip, z] scaled by arm length
    let handF = [0.2, 0.1, -0.5], handR = [0.05, 0.04, 0.46];
    let grabPose = null;

    if (st === 'ground') {
      const charge = phys.charge / 0.55;
      const absorb = Math.max(0, 1 - phys.landT / 0.35) * Math.min(1, phys.impact / 8);
      const crouch = Math.min(1, 0.15 + charge * 0.55 + (inp.up ? 0.35 : 0) + absorb * 0.6 + phys.skid * 0.25);
      hip = 0.86 - crouch * 0.38;
      leanX = 0.12 + crouch * 0.45 - phys.skid * 0.2;
      side = -phys.edge * 0.25;
      const sway = Math.sin(this.t * 2.1) * 0.03;
      handF = [0.22 + phys.edge * 0.1, 0.12 + sway, -0.52];
      handR = [0.02 - phys.edge * 0.1, 0.05 - sway, 0.46];
      if (inp.up) { handF = [0.32, 0.02, -0.25]; handR = [0.25, -0.02, 0.2]; }
    } else if (st === 'air') {
      hip = 0.68; leanX = 0.3;
      handF = [0.16, 0.42, -0.58];
      handR = [-0.02, 0.36, 0.52];
      if (phys.grab) {
        grabPose = GRAB_POSES[phys.grab.name];
        hip = grabPose.hip; leanX = grabPose.lean[0]; leanZ = grabPose.lean[1]; pitch = grabPose.pitch;
        const freeT = [-0.1, 0.6, grabPose.hand === 'front' ? 0.5 : -0.5];
        if (grabPose.hand === 'front') handR = freeT; else handF = freeT;
      }
    } else if (st === 'grind') {
      hip = 0.72; leanX = 0.25;
      const b = phys.balance;
      side = b * 0.35;
      handF = [0.05, 0.3 - b * 0.25, -0.72];
      handR = [0.05, 0.3 + b * 0.25, 0.72];
      if (phys.grind && phys.grind.press === 'Nose Press') { leanZ = -0.5; pitch = 0.12; }
      if (phys.grind && phys.grind.press === 'Tail Press') { leanZ = 0.5; pitch = -0.12; }
      if (phys.grind && phys.grind.type === 'Boardslide') headYaw = 0.2;
    } else if (st === 'crash') {
      hip = 0.55; leanX = 0.9;
      const w = Math.sin(this.t * 13);
      handF = [0.2, 0.7 + w * 0.2, -0.6];
      handR = [0.2, 0.65 - w * 0.2, 0.6];
    }

    const k = st === 'air' ? 14 : 10;
    P.hip = damp(P.hip, hip, k, dt);
    P.leanX = damp(P.leanX, leanX, k, dt);
    P.leanZ = damp(P.leanZ, leanZ, k, dt);
    P.side = damp(P.side, side, k, dt);
    P.pitch = damp(P.pitch, pitch, k, dt);
    P.headYaw = damp(P.headYaw, headYaw, 6, dt);
    const f = 1 - Math.exp(-k * dt);
    P.handF.lerp(v1.set(handF[0] * arm, handF[1] * arm, handF[2] * arm), f);
    P.handR.lerp(v1.set(handR[0] * arm, handR[1] * arm, handR[2] * arm), f);

    // Board tweak for nose/tail grabs; ankles follow the board.
    this.boardPivot.rotation.x = P.pitch;
    this.boardPivot.updateMatrix();
    const bm = this.boardPivot.matrix;
    const ankleF = new THREE.Vector3(0, R.ankle, -FOOT_Z).applyMatrix4(bm);
    const ankleR = new THREE.Vector3(0, R.ankle, FOOT_Z).applyMatrix4(bm);
    const hipC = new THREE.Vector3(-0.03, R.ankle + leg * P.hip, P.side * 0.1);
    // chunky characters have big heads: bend the torso less and let the legs do the work
    const bend = this.char ? 0.5 : 1;
    const spine = new THREE.Vector3(P.leanX * bend, 1, (P.leanZ + P.side) * bend).normalize();
    const hipY = hipC.y;
    const handFT = P.handF.clone(); handFT.y += hipY;
    const handRT = P.handR.clone(); handRT.y += hipY;
    if (grabPose && st === 'air') {
      const g = new THREE.Vector3(...grabPose.target).applyMatrix4(bm);
      if (grabPose.hand === 'front') handFT.copy(g); else handRT.copy(g);
    }

    if (this.char) this.applySkinned({ hipC, spine, ankleF, ankleR, handFT, handRT });
    else this.applyProcedural({ hipC, spine, ankleF, ankleR, handFT, handRT });
  }

  applyProcedural({ hipC, spine, ankleF, ankleR, handFT, handRT }) {
    const P = this.pose, R = this.rig;
    const chest = hipC.clone().addScaledVector(spine, R.torso);
    placeLimb(this.torso, hipC.clone().addScaledVector(spine, 0.04), chest);
    this.pelvis.position.copy(hipC);
    const hipF = hipC.clone().add(new THREE.Vector3(0, -0.02, -0.11));
    const hipR = hipC.clone().add(new THREE.Vector3(0, -0.02, 0.11));
    const knee = new THREE.Vector3(), end = new THREE.Vector3();
    solveIK(hipF, ankleF, R.thigh, R.shin, new THREE.Vector3(1, 0, -0.25), knee, end);
    placeLimb(this.thighF, hipF, knee); placeLimb(this.shinF, knee, end);
    solveIK(hipR, ankleR, R.thigh, R.shin, new THREE.Vector3(1, 0, 0.15), knee, end);
    placeLimb(this.thighR, hipR, knee); placeLimb(this.shinR, knee, end);
    const across = new THREE.Vector3(0, 0, 1);
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

  applySkinned({ hipC, spine, ankleF, ankleR, handFT, handRT }) {
    const { bones: B, rest, holder } = this.char;
    const P = this.pose;
    const body = this.body;
    this.root.updateMatrixWorld(true);
    const toWorld = (v) => body.localToWorld(v.clone());
    const bq = body.getWorldQuaternion(new THREE.Quaternion());
    const dirWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(bq);

    for (const n of BONES) B[n].quaternion.copy(rest[n].q);
    // hips: place the pelvis at the target height; leg joints sit 0.114 model units above it
    const hipLocal = holder.worldToLocal(toWorld(hipC));
    hipLocal.y -= rest['upperleg.l'].p.y;
    const parent = B.hips.parent;
    parent.updateMatrixWorld(true);
    B.hips.position.copy(parent.worldToLocal(holder.localToWorld(hipLocal)));
    // lean the pelvis a little with the torso; hips local frame matches the model frame
    B.hips.quaternion.copy(rest.hips.q).multiply(q1.setFromEuler(new THREE.Euler(P.leanX * 0.3, 0, P.side * 0.3)));
    B.hips.updateMatrixWorld(true);

    // torso bends toward the spine direction, head looks down the line
    const sd = dirWorld(spine.x, spine.y, spine.z);
    aimBone(B.spine, rest.chest.p, sd, rest.spine.q);
    aimBone(B.chest, rest.head.p, sd, rest.chest.q);
    B.head.quaternion.copy(rest.head.q).multiply(q1.setFromEuler(new THREE.Euler(0.15 + P.leanX * 0.15, P.headYaw * 0.85, 0, 'YXZ')));
    B.head.updateMatrixWorld(true);

    const R = this.rig;
    const knee = new THREE.Vector3(), end = new THREE.Vector3();
    const legs = [['l', ankleF, dirWorld(1, 0, -0.25), STANCE[0]], ['r', ankleR, dirWorld(1, 0, 0.15), STANCE[1]]];
    for (const [side, ankle, pole, ang] of legs) {
      const hipJ = B['upperleg.' + side].getWorldPosition(new THREE.Vector3());
      const target = toWorld(ankle);
      solveIK(hipJ, target, R.thigh, R.shin, pole, knee, end);
      aimBone(B['upperleg.' + side], rest['lowerleg.' + side].p, v2.subVectors(knee, hipJ).clone(), rest['upperleg.' + side].q);
      aimBone(B['lowerleg.' + side], rest['foot.' + side].p, v2.subVectors(end, knee).clone(), rest['lowerleg.' + side].q);
      // toes point across the board along the binding angle, resting on the deck
      const toeLocal = ankle.clone().add(new THREE.Vector3(Math.cos(ang) * 0.2, BOARD_TOP + 0.03 - ankle.y, -Math.sin(ang) * 0.2));
      const toe = toWorld(toeLocal);
      aimBone(B['foot.' + side], rest['toes.' + side].p, v2.subVectors(toe, end).clone(), rest['foot.' + side].q);
    }

    const elbow = new THREE.Vector3();
    const arms = [['l', handFT, dirWorld(-0.3, -1, -0.6)], ['r', handRT, dirWorld(-0.3, -1, 0.6)]];
    for (const [side, hand, pole] of arms) {
      const sh = B['upperarm.' + side].getWorldPosition(new THREE.Vector3());
      solveIK(sh, toWorld(hand), R.upper, R.fore, pole, elbow, end);
      aimBone(B['upperarm.' + side], rest['lowerarm.' + side].p, v2.subVectors(elbow, sh).clone(), rest['upperarm.' + side].q);
      aimBone(B['lowerarm.' + side], rest['wrist.' + side].p, v2.subVectors(end, elbow).clone(), rest['lowerarm.' + side].q);
    }
  }
}
