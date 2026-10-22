// Freeski gear: twin-tip park skis (sidecut, camber, rockered tip and tail, glossy topsheet
// with the chosen design, sintered base, sidewalls and steel edges), alpine bindings
// (toe piece, heel piece, brakes), ski boots (hard shell, hinged cuff, buckles, power
// strap) and poles (grip, strap, shaft, basket).
// Ski frame: origin = middle of the base under the boot centre, tip toward +X, up +Y.
import * as THREE from 'three';
import { boardArt } from './boards.js';

export const SKI_LEN = 1.74;
const MOUNT = 0.03; // centre mount, boot centre a hair behind the ski centre (x of the ski centre)
const HALF_WAIST = 0.048, HALF_TIP = 0.066, HALF_TAIL = 0.063;
const SEG_X = 120, SEG_Z = 6;
const EDGE_H = 0.0018;

// along: -1 (tail end) .. +1 (tip end), measured from the ski centre
const along = (x) => (x - MOUNT) / (SKI_LEN / 2);

function halfWidth(x) {
  const u = along(x), au = Math.abs(u);
  const end = u > 0 ? HALF_TIP : HALF_TAIL;
  // sidecut: waist under the foot, widest at the contact points (u = ±0.8), rounded ends
  if (au <= 0.8) return HALF_WAIST + (end - HALF_WAIST) * (au / 0.8) ** 2;
  const t = (au - 0.8) / 0.2;
  return end * Math.sqrt(Math.max(0, 1 - t ** 2.4));
}
// Base height above the snow: 3 mm of camber underfoot, rockered twin tips turned up.
function baseHeight(x) {
  const u = along(x), au = Math.abs(u);
  const camber = au < 0.62 ? 0.003 * Math.cos((au / 0.62) * Math.PI / 2) : 0;
  const rise = au > 0.66 ? ((au - 0.66) / 0.34) ** 2.2 * (u > 0 ? 0.072 : 0.062) : 0;
  return camber + rise;
}
// Core: ~17 mm under the binding, ~5 mm at the tips.
function thickness(x) {
  const t = Math.min(1, Math.abs(along(x)));
  return 0.005 + 0.012 * (1 - t * t);
}
export const SKI_TOP_Y = baseHeight(0) + thickness(0) + EDGE_H;

function outline(n = 80) {
  const pts = [];
  const x0 = MOUNT - SKI_LEN / 2;
  for (let i = 0; i <= n; i++) { const x = x0 + (i / n) * SKI_LEN; pts.push([x, halfWidth(x)]); }
  for (let i = n; i >= 0; i--) { const x = x0 + (i / n) * SKI_LEN; pts.push([x, -halfWidth(x)]); }
  return pts;
}

function deck(face) {
  const pos = [], uv = [], idx = [];
  const x0 = MOUNT - SKI_LEN / 2;
  for (let j = 0; j <= SEG_X; j++) {
    const x = x0 + (j / SEG_X) * SKI_LEN;
    const hw = Math.max(halfWidth(x), 0.0005) - (face === 'top' ? 0.0025 : 0.0012);
    for (let i = 0; i <= SEG_Z; i++) {
      const z = -hw + (i / SEG_Z) * hw * 2;
      // the topsheet is slightly domed across, like a cap-construction ski
      const dome = face === 'top' ? (1 - (z / (hw + 1e-4)) ** 2) * 0.0025 : 0;
      pos.push(x, baseHeight(x) + (face === 'top' ? thickness(x) + EDGE_H + dome : 0.0002), z);
      // the board art is wide: use its middle band, stretched along the ski
      uv.push((x - x0) / SKI_LEN, 0.36 + ((z + HALF_TIP) / (HALF_TIP * 2)) * 0.28);
    }
  }
  const w = SEG_Z + 1;
  for (let j = 0; j < SEG_X; j++) {
    for (let i = 0; i < SEG_Z; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      if (face === 'top') idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function rim(y0fn, y1fn) {
  const pts = outline(96);
  const pos = [], idx = [];
  for (const [x, z] of pts) pos.push(x, y0fn(x), z, x, y1fn(x), z);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const texCache = new Map();
function skiTextures(design) {
  if (texCache.has(design.id)) return texCache.get(design.id);
  const art = boardArt(design);
  const mk = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const tex = { top: mk(art.top), base: mk(art.base) };
  texCache.set(design.id, tex);
  return tex;
}

const rounded = (w, h, r) => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
};
// An extruded side profile (x, y), extruded across z and centred, with soft bevels.
function profileSolid(points, width, bevel = 0.006) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return g;
}

// Toe piece, heel piece and brakes of an alpine binding, around a boot sole of length `sole`.
function binding(mats, accent, sole) {
  const b = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(sole + 0.12, 0.008, 0.056), mats.dark);
  plate.position.y = 0.004;
  b.add(plate);
  // toe: a housing with the adjustable wings that hold the sole
  const toe = new THREE.Mesh(profileSolid([[0, 0], [0.085, 0], [0.085, 0.022], [0.06, 0.05], [0.012, 0.052], [0, 0.036]], 0.07), accent);
  toe.position.set(sole / 2 - 0.006, 0.006, 0);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.088), mats.metal);
  wing.position.set(sole / 2 + 0.004, 0.034, 0);
  b.add(toe, wing);
  // heel: tall piece with the step-in pedal and the lever behind
  const heel = new THREE.Mesh(profileSolid([[0, 0], [0.11, 0], [0.11, 0.03], [0.085, 0.07], [0.02, 0.075], [-0.004, 0.05]], 0.072), mats.plastic);
  heel.position.set(-sole / 2 - 0.105, 0.006, 0);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.05), accent);
  lever.position.set(-sole / 2 - 0.09, 0.08, 0);
  lever.rotation.z = -0.35;
  const cup = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.082), mats.metal);
  cup.position.set(-sole / 2 - 0.006, 0.048, 0);
  b.add(heel, lever, cup);
  // brake arms folded up along the ski sides
  for (const z of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.006, 0.006), mats.metal);
    arm.position.set(-sole / 2 + 0.02, 0.016, z * 0.047);
    arm.rotation.z = 0.12;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.01), mats.dark);
    pad.position.set(-sole / 2 - 0.035, 0.012, z * 0.047);
    b.add(arm, pad);
  }
  return b;
}

// One ski with its binding (the boot is separate: it belongs to the rider).
export function makeSki(design) {
  const g = new THREE.Group();
  const tex = skiTextures(design);
  const top = new THREE.Mesh(deck('top'), new THREE.MeshPhysicalMaterial({ map: tex.top, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const base = new THREE.Mesh(deck('base'), new THREE.MeshStandardMaterial({ map: tex.base, roughness: 0.42 }));
  const sideY0 = (x) => baseHeight(x) + EDGE_H;
  const sideY1 = (x) => baseHeight(x) + thickness(x) + EDGE_H;
  const side = new THREE.Mesh(rim(sideY0, sideY1), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.45 }));
  const edge = new THREE.Mesh(rim((x) => baseHeight(x), sideY0), new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.22, metalness: 0.95 }));
  g.add(top, base, side, edge);
  const mats = {
    plastic: new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xa4acb6, roughness: 0.28, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.6 }),
  };
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(design.accent), roughness: 0.4 });
  const bind = binding(mats, accent, BOOT_SOLE);
  bind.position.y = SKI_TOP_Y;
  g.add(bind);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- boots ----------
export const BOOT_SOLE = 0.305;

// Lower shell (fixed on the binding) and the cuff (hinged at the ankle, follows the shin).
// Lower shell frame: origin under the middle of the sole, toe +X. Cuff frame: origin at the
// ankle hinge, shin along +Y.
export function makeSkiBoot(color, accentColor) {
  const shellMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb0b8c2, roughness: 0.25, metalness: 0.9 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(accentColor), roughness: 0.5, side: THREE.DoubleSide });
  const L = BOOT_SOLE / 2;
  const lower = new THREE.Group();
  // sole with toe and heel lugs
  const sole = new THREE.Mesh(new THREE.ExtrudeGeometry(rounded(BOOT_SOLE, 0.082, 0.03), { depth: 0.018, bevelEnabled: false }), dark);
  sole.rotation.x = -Math.PI / 2;
  sole.position.y = 0.0;
  lower.add(sole);
  // shell: side profile from the toe box over the instep to the heel, tapered at the toe
  const prof = [[L, 0.016], [L, 0.05], [L - 0.04, 0.078], [0.03, 0.11], [-0.02, 0.15], [-0.07, 0.165], [-L + 0.01, 0.15], [-L, 0.1], [-L + 0.005, 0.016]];
  const shellGeo = profileSolid(prof, 0.104, 0.012);
  const p = shellGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    // narrow toe box, wider at the ball of the foot
    const k = x > 0.04 ? 1 - ((x - 0.04) / (L - 0.04)) ** 2 * 0.3 : 1;
    p.setZ(i, p.getZ(i) * k);
  }
  shellGeo.computeVertexNormals();
  const shell = new THREE.Mesh(shellGeo, shellMat);
  lower.add(shell);
  // two buckles over the foot
  for (const [x, y, rz] of [[0.075, 0.09, 0.55], [0.01, 0.13, 0.35]]) {
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.03), metal);
    bk.position.set(x, y, 0.05);
    bk.rotation.set(0, 0, rz);
    lower.add(bk);
  }
  // cuff: an open tapered tube around the lower leg with a tongue in front
  const cuff = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.064, 0.17, 28, 1, true, -Math.PI * 0.42, Math.PI * 1.84), shellMat);
  tube.position.y = 0.085;
  tube.scale.set(1, 1, 0.92);
  const tongue = new THREE.Mesh(new THREE.CylinderGeometry(0.061, 0.06, 0.2, 12, 1, true, -Math.PI * 0.32, Math.PI * 0.64), dark);
  tongue.material = dark.clone(); tongue.material.side = THREE.DoubleSide;
  tongue.position.y = 0.075;
  tongue.rotation.y = Math.PI / 2;
  cuff.add(tube, tongue);
  for (const y of [0.05, 0.11]) {
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.009, 0.03), metal);
    bk.position.set(0.02, y, 0.062);
    cuff.add(bk);
  }
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.069, 0.068, 0.034, 28, 1, true), accent);
  strap.position.y = 0.158;
  cuff.add(strap);
  // hinge rivets on both sides
  for (const z of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 12), metal);
    r.rotation.x = Math.PI / 2;
    r.position.set(0, 0, z * 0.064);
    cuff.add(r);
  }
  for (const o of [lower, cuff]) o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { lower, cuff, mats: { shell: shellMat, strap: accent } };
}

// ---------- poles ----------
export const POLE_LEN = 1.2; // grip centre to tip

// Origin at the middle of the grip (inside the fist), shaft down -Y.
export function makePole(color) {
  const g = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.3, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.7 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.014, 0.15, 14), dark);
  grip.position.y = 0.01;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 8), dark);
  knob.position.y = 0.085;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.006, POLE_LEN - 0.07, 10), shaftMat);
  shaft.position.y = -(POLE_LEN - 0.07) / 2 - 0.065;
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.008, 18), dark);
  basket.position.y = -POLE_LEN + 0.08;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, 8), new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 0.9, roughness: 0.3 }));
  tip.rotation.x = Math.PI;
  tip.position.y = -POLE_LEN + 0.015;
  // wrist strap: a flat loop off the top of the grip
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 18), dark);
  strap.scale.set(1, 1.6, 0.35);
  strap.position.set(0, 0.04, 0.03);
  g.add(grip, knob, shaft, basket, tip, strap);
  g.userData.shaft = shaftMat;
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// The menu card on skis: the pair side by side, tips to the right, with the design's art.
export function drawSkiPreview(canvas, design) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const art = boardArt(design).top;
  const scale = (w * 0.94) / SKI_LEN;
  const pts = outline(96);
  const x0 = MOUNT;
  for (const dy of [-0.28, 0.28]) {
    ctx.save();
    ctx.translate(w / 2, h / 2 + dy * h);
    ctx.scale(1, 1.25);
    ctx.beginPath();
    pts.forEach(([x, z], i) => { const px = (x - x0) * scale, py = -z * scale; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#111'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    ctx.clip();
    ctx.drawImage(art, 0, art.height * 0.36, art.width, art.height * 0.28, -SKI_LEN / 2 * scale, -HALF_TIP * scale, SKI_LEN * scale, HALF_TIP * 2 * scale);
    ctx.restore();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(20,24,30,0.9)'; ctx.stroke();
    // binding
    ctx.fillStyle = '#16181d';
    ctx.fillRect(-0.2 * scale, -0.03 * scale, 0.4 * scale, 0.06 * scale);
    ctx.restore();
  }
}
