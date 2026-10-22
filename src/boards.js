// Board designs (procedural canvas art), stats and the board mesh.
import * as THREE from 'three';

export const BOARD_LEN = 1.56;
const HALF_WAIST = 0.125, HALF_END = 0.148, NOSE_LEN = 0.17;
const TEX_W = 1024, TEX_H = 256;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------- art ----------
// Canvas x runs nose -> tail, y runs across the board (heel -> toe).

function drawPolar(ctx) {
  const r = rng(7);
  const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
  g.addColorStop(0, '#081028'); g.addColorStop(1, '#1b2f63');
  ctx.fillStyle = g; ctx.fillRect(0, 0, TEX_W, TEX_H);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
    const s = r() * 2 + 0.6;
    ctx.fillRect(r() * TEX_W, r() * TEX_H, s, s);
  }
  ctx.filter = 'blur(10px)';
  const bands = [['#3cf2b0', 0.75], ['#29c6ff', 0.55], ['#a46bff', 0.35]];
  bands.forEach(([col, a], i) => {
    ctx.globalAlpha = a;
    ctx.strokeStyle = col; ctx.lineWidth = 34 - i * 8;
    ctx.beginPath();
    for (let x = -20; x <= TEX_W + 20; x += 16) {
      const y = TEX_H * 0.5 + Math.sin(x * 0.006 + i * 1.7) * 70 + Math.sin(x * 0.017 + i) * 18;
      x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  ctx.filter = 'none'; ctx.globalAlpha = 1;
}

function drawSunset(ctx) {
  const g = ctx.createLinearGradient(0, 0, TEX_W, 0);
  g.addColorStop(0, '#2a0d4a'); g.addColorStop(0.45, '#c2306b'); g.addColorStop(1, '#ff9a3c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, TEX_W, TEX_H);
  // sun with scan-line cuts
  const cx = TEX_W * 0.56, cy = TEX_H / 2, rad = 92;
  const sg = ctx.createLinearGradient(cx - rad, 0, cx + rad, 0);
  sg.addColorStop(0, '#ffe066'); sg.addColorStop(1, '#ff4f7a');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c2306b';
  for (let i = 0; i < 7; i++) ctx.fillRect(cx + 10 + i * 13, 0, 3 + i * 1.2, TEX_H);
  // grid toward the tail
  ctx.strokeStyle = 'rgba(255,90,200,0.75)'; ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const x = TEX_W * 0.72 + Math.pow(i / 12, 1.6) * TEX_W * 0.3;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TEX_H); ctx.stroke();
  }
  for (let j = -6; j <= 6; j++) {
    ctx.beginPath(); ctx.moveTo(TEX_W * 0.72, TEX_H / 2 + j * 6); ctx.lineTo(TEX_W, TEX_H / 2 + j * 40); ctx.stroke();
  }
}

function drawGlacier(ctx) {
  const r = rng(3);
  const cols = 22, rows = 6;
  const pts = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const jx = i > 0 && i < cols ? (r() - 0.5) * 30 : 0;
      const jy = j > 0 && j < rows ? (r() - 0.5) * 26 : 0;
      pts.push([i * TEX_W / cols + jx, j * TEX_H / rows + jy]);
    }
  }
  const pal = ['#e9f6ff', '#cfeaff', '#9fd2f5', '#6fb4e6', '#f7fbff', '#b9e0f7', '#4d93cf'];
  const P = (i, j) => pts[j * (cols + 1) + i];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1), d = P(i + 1, j + 1);
      for (const tri of [[a, b, c], [b, d, c]]) {
        const tone = Math.min(pal.length - 1, Math.floor(r() * pal.length * (0.6 + 0.4 * (i / cols))));
        ctx.fillStyle = pal[tone];
        ctx.beginPath(); ctx.moveTo(...tri[0]); ctx.lineTo(...tri[1]); ctx.lineTo(...tri[2]); ctx.closePath(); ctx.fill();
      }
    }
  }
  ctx.fillStyle = '#16365a';
  ctx.fillRect(0, TEX_H * 0.47, TEX_W, TEX_H * 0.06);
}

function drawEmber(ctx) {
  const r = rng(11);
  ctx.fillStyle = '#120a08'; ctx.fillRect(0, 0, TEX_W, TEX_H);
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 26; i++) {
      const y = r() * TEX_H;
      const len = 260 + r() * 420 - k * 60;
      const g = ctx.createLinearGradient(TEX_W, 0, TEX_W - len, 0);
      g.addColorStop(0, ['#ff3d00', '#ff7a00', '#ffd23f'][k]);
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(TEX_W, y - 26);
      ctx.quadraticCurveTo(TEX_W - len * 0.5, y - 40 * (r() - 0.5), TEX_W - len, y + (r() - 0.5) * 40);
      ctx.quadraticCurveTo(TEX_W - len * 0.5, y + 30, TEX_W, y + 26);
      ctx.fill();
    }
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,${150 + r() * 100 | 0},60,${r()})`;
    ctx.fillRect(r() * TEX_W * 0.8, r() * TEX_H, 3, 3);
  }
}

function drawKiwi(ctx) {
  const r = rng(5);
  ctx.fillStyle = '#b6e63a'; ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.fillStyle = 'rgba(40,80,10,0.12)';
  for (let x = 0; x < TEX_W; x += 36) for (let y = (x / 36) % 2 ? 0 : 18; y < TEX_H; y += 36) {
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  }
  const slice = (cx, cy, rad) => {
    ctx.fillStyle = '#7a5631'; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#58b02c'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8fd14f'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f7d8'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d1a12';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      ctx.save(); ctx.translate(cx + Math.cos(a) * rad * 0.42, cy + Math.sin(a) * rad * 0.42); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, rad * 0.07, rad * 0.035, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  };
  slice(TEX_W * 0.22, TEX_H * 0.5, 78);
  slice(TEX_W * 0.5, TEX_H * 0.32, 52);
  slice(TEX_W * 0.78, TEX_H * 0.6, 70);
  for (let i = 0; i < 6; i++) slice(r() * TEX_W, r() * TEX_H, 14 + r() * 10);
}

function drawTopo(ctx) {
  ctx.fillStyle = '#d9c9a3'; ctx.fillRect(0, 0, TEX_W, TEX_H);
  const peaks = [[260, 110, 1], [700, 160, 0.8], [520, 40, 0.6]];
  const f = (x, y) => peaks.reduce((a, [px, py, s]) => a + s * Math.exp(-((x - px) ** 2 + (y - py) ** 2) / 26000), 0) +
    Math.sin(x * 0.01) * 0.06 + Math.cos(y * 0.03 + x * 0.004) * 0.05;
  const img = ctx.getImageData(0, 0, TEX_W, TEX_H);
  const step = 0.07;
  for (let y = 0; y < TEX_H; y++) {
    for (let x = 0; x < TEX_W; x++) {
      const v = f(x, y) / step;
      const fr = v - Math.floor(v);
      const major = Math.floor(v) % 4 === 0;
      if (fr < (major ? 0.12 : 0.06)) {
        const i = (y * TEX_W + x) * 4;
        const c = major ? [176, 70, 34] : [92, 74, 52];
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2];
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const DESIGNS = [
  { id: 'polar', name: 'Polar Night', tagline: 'Allrounder für jeden Park', draw: drawPolar, accent: '#3cf2b0', stats: { speed: 3, pop: 3, spin: 3 } },
  { id: 'sunset', name: 'Sunset Drive', tagline: 'Schnell auf der Geraden', draw: drawSunset, accent: '#ff4f7a', stats: { speed: 4, pop: 3, spin: 2 } },
  { id: 'glacier', name: 'Glacier', tagline: 'Harte Kante, maximaler Speed', draw: drawGlacier, accent: '#6fb4e6', stats: { speed: 5, pop: 2, spin: 2 } },
  { id: 'ember', name: 'Ember', tagline: 'Viel Pop von der Kante', draw: drawEmber, accent: '#ff7a00', stats: { speed: 3, pop: 4, spin: 3 } },
  { id: 'kiwi', name: 'Kiwi Pop', tagline: 'Weich und verspielt', draw: drawKiwi, accent: '#b6e63a', stats: { speed: 2, pop: 4, spin: 4 } },
  { id: 'topo', name: 'Topo', tagline: 'Dreht wie ein Kreisel', draw: drawTopo, accent: '#b04622', stats: { speed: 3, pop: 2, spin: 5 } },
];

// Physics multipliers from 1..5 ratings.
export function statsToPhysics(s) {
  return {
    speed: 0.9 + (s.speed - 1) * 0.05,
    pop: 0.88 + (s.pop - 1) * 0.06,
    spin: 0.86 + (s.spin - 1) * 0.07,
  };
}

const artCache = new Map();
export function boardArt(design) {
  if (artCache.has(design.id)) return artCache.get(design.id);
  const top = document.createElement('canvas');
  top.width = TEX_W; top.height = TEX_H;
  design.draw(top.getContext('2d'));
  const base = document.createElement('canvas');
  base.width = TEX_W; base.height = TEX_H;
  const b = base.getContext('2d');
  b.drawImage(top, 0, 0);
  b.fillStyle = 'rgba(0,0,0,0.25)'; b.fillRect(0, 0, TEX_W, TEX_H);
  b.font = 'italic 150px "Anton", "Impact", sans-serif';
  b.textAlign = 'center'; b.textBaseline = 'middle';
  b.lineWidth = 10; b.strokeStyle = 'rgba(0,0,0,0.55)';
  b.strokeText('SNOWDAY', TEX_W / 2, TEX_H / 2 + 6);
  b.fillStyle = '#ffffff';
  b.fillText('SNOWDAY', TEX_W / 2, TEX_H / 2 + 6);
  const art = { top, base };
  artCache.set(design.id, art);
  return art;
}

// ---------- outline ----------

function halfWidth(z) {
  const az = Math.abs(z), eff = BOARD_LEN / 2 - NOSE_LEN;
  if (az <= eff) return HALF_WAIST + (HALF_END - HALF_WAIST) * (az / eff) ** 2;
  const t = Math.min(1, (az - eff) / NOSE_LEN);
  return HALF_END * Math.sqrt(Math.max(0, 1 - t * t * t));
}

function kick(z) {
  const az = Math.abs(z), s = BOARD_LEN / 2 - 0.26;
  return az > s ? ((az - s) / 0.26) ** 2 * 0.075 : 0;
}

function outline(n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const z = -BOARD_LEN / 2 + (i / n) * BOARD_LEN;
    pts.push([halfWidth(z), z]);
  }
  for (let i = n; i >= 0; i--) {
    const z = -BOARD_LEN / 2 + (i / n) * BOARD_LEN;
    pts.push([-halfWidth(z), z]);
  }
  return pts;
}

// Draw the board shape into a 2D canvas (used by the menu preview).
export function drawBoardPreview(canvas, design, face = 'top') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const art = boardArt(design)[face];
  const scale = (w * 0.94) / BOARD_LEN;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const pts = outline(64);
  ctx.beginPath();
  pts.forEach(([x, z], i) => {
    const px = z * scale, py = -x * scale;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#111'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  ctx.drawImage(art, -BOARD_LEN / 2 * scale, -HALF_END * scale, BOARD_LEN * scale, HALF_END * 2 * scale);
  ctx.restore();
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.beginPath();
  pts.forEach(([x, z], i) => {
    const px = z * scale, py = -x * scale;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,24,30,0.9)'; ctx.stroke();
  ctx.restore();
}

// ---------- mesh ----------
// The board is built as a real deck: a cambered core that thins toward the tips,
// spoon-shaped nose and tail, glossy topsheet, sintered base, sidewalls and steel
// edges. Board origin = middle of the base, so it sits exactly on snow or a rail.

const SEG_Z = 96, SEG_X = 10;
const CAMBER = 0.006; // 6 mm of camber between the feet
const EDGE_H = 0.0022;

// Height of the base above the contact line along the board (camber + kick).
function baseHeight(z) {
  const eff = BOARD_LEN / 2 - NOSE_LEN - 0.09;
  const az = Math.abs(z);
  const camber = az < eff ? CAMBER * Math.cos((az / eff) * Math.PI / 2) : 0;
  return camber + kick(z) * 1.25;
}
// Core thickness: ~11 mm under the feet, ~4 mm at the tips.
function thickness(z) {
  const t = Math.min(1, Math.abs(z) / (BOARD_LEN / 2));
  return 0.004 + 0.007 * (1 - t * t);
}
// Slight spoon: the tips curl up at the edges as well.
function spoon(x, z) {
  const t = Math.max(0, (Math.abs(z) - (BOARD_LEN / 2 - NOSE_LEN - 0.05)) / (NOSE_LEN + 0.05));
  return t * t * (x / HALF_END) ** 2 * 0.012;
}

function deckGeometry(face) {
  // face: 'top' | 'base'
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= SEG_Z; j++) {
    const z = -BOARD_LEN / 2 + (j / SEG_Z) * BOARD_LEN;
    const hw = Math.max(halfWidth(z), 0.0005) - (face === 'base' ? 0.0015 : 0.003);
    for (let i = 0; i <= SEG_X; i++) {
      const x = -hw + (i / SEG_X) * hw * 2;
      const y = baseHeight(z) + spoon(x, z) + (face === 'top' ? thickness(z) + EDGE_H : 0.0002);
      pos.push(x, y, z);
      uv.push((z + BOARD_LEN / 2) / BOARD_LEN, (x + HALF_END) / (HALF_END * 2));
    }
  }
  const w = SEG_X + 1;
  for (let j = 0; j < SEG_Z; j++) {
    for (let i = 0; i < SEG_X; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      if (face === 'top') idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A band around the outline between two heights: the sidewall, or the steel edge.
function rimGeometry(y0fn, y1fn, inset = 0) {
  const pts = outline(64);
  const pos = [], idx = [];
  pts.forEach(([x, z]) => {
    const xx = x - Math.sign(x) * inset;
    pos.push(xx, y0fn(xx, z), z, xx, y1fn(xx, z), z);
  });
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const texCache = new Map();
function boardTextures(design) {
  if (texCache.has(design.id)) return texCache.get(design.id);
  const art = boardArt(design);
  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const tex = { top: mk(art.top), base: mk(art.base), structure: baseStructure() };
  texCache.set(design.id, tex);
  return tex;
}

// Stone-ground base structure: fine lines along the board, as a roughness map.
let structureTex = null;
function baseStructure() {
  if (structureTex) return structureTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a7a7a'; ctx.fillRect(0, 0, 512, 64);
  const r = rng(21);
  for (let y = 0; y < 64; y++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},${0.05 + r() * 0.12})`;
    ctx.fillRect(0, y, 512, 1);
  }
  structureTex = new THREE.CanvasTexture(c);
  return structureTex;
}

// ---------- bindings ----------

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

// Strap arching over the boot: a padded tube along an arc across the binding.
function strapGeometry(halfSpan, height, radius, depth) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-halfSpan, 0, 0), new THREE.Vector3(-halfSpan * 0.7, height * 0.8, 0),
    new THREE.Vector3(0, height, 0), new THREE.Vector3(halfSpan * 0.7, height * 0.8, 0), new THREE.Vector3(halfSpan, 0, 0),
  ]);
  const g = new THREE.TubeGeometry(curve, 24, radius, 8, false);
  g.scale(1, 1, depth / radius);
  return g;
}

function makeBinding(mats, accentMat, flip) {
  const b = new THREE.Group();
  // baseplate on its mounting disc
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(0.27, 0.15, 0.04), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 }), mats.plastic);
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = 0.006;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.008, 28), mats.metal);
  disc.position.y = 0.024;
  b.add(plate, disc);
  for (let k = 0; k < 4; k++) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), mats.dark);
    screw.position.set(Math.cos(k * Math.PI / 2 + 0.6) * 0.03, 0.03, Math.sin(k * Math.PI / 2 + 0.6) * 0.03);
    b.add(screw);
  }
  // heel cup: a curved band around the heel side
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 24, 1, true, Math.PI * 0.55, Math.PI * 0.9), mats.metal);
  cup.position.set(-0.07, 0.045, 0);
  cup.material = mats.metal;
  b.add(cup);
  // highback: curved shell behind the calf, leaning forward
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.07, 0.2, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), mats.plastic);
  hb.material.side = THREE.DoubleSide;
  hb.position.set(-0.09, 0.15, 0);
  hb.rotation.z = -0.22;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0835, 0.0835, 0.03, 24, 1, true, Math.PI * 0.75, Math.PI * 0.5), accentMat);
  stripe.material.side = THREE.DoubleSide;
  stripe.position.set(-0.088, 0.21, 0);
  stripe.rotation.z = -0.22;
  b.add(hb, stripe);
  // ankle strap with a ratchet, toe strap over the toe box
  const ankle = new THREE.Mesh(strapGeometry(0.075, 0.1, 0.018, 0.045), accentMat);
  ankle.rotation.y = Math.PI / 2;
  ankle.position.set(0.0, 0.035, 0);
  ankle.rotation.z = -0.35;
  const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.018), mats.dark);
  ladder.position.set(0.02, 0.12, 0.05);
  ladder.rotation.x = -0.6;
  const ratchet = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.012, 0.022), mats.metal);
  ratchet.position.set(0.03, 0.115, -0.045);
  ratchet.rotation.x = 0.6;
  const toe = new THREE.Mesh(strapGeometry(0.07, 0.075, 0.011, 0.03), mats.dark);
  toe.rotation.y = Math.PI / 2;
  toe.position.set(0.105, 0.03, 0);
  b.add(ankle, ladder, ratchet, toe);
  if (flip) b.scale.z = -1;
  return b;
}

export function makeBoard(design) {
  const group = new THREE.Group();
  const tex = boardTextures(design);
  const top = new THREE.Mesh(deckGeometry('top'), new THREE.MeshPhysicalMaterial({ map: tex.top, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }));
  const base = new THREE.Mesh(deckGeometry('base'), new THREE.MeshStandardMaterial({ map: tex.base, roughness: 0.42, roughnessMap: tex.structure, metalness: 0 }));
  const sideY0 = (x, z) => baseHeight(z) + spoon(x, z) + EDGE_H;
  const sideY1 = (x, z) => baseHeight(z) + spoon(x, z) + thickness(z) + EDGE_H;
  const side = new THREE.Mesh(rimGeometry(sideY0, sideY1, 0.0015), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.45 }));
  const edge = new THREE.Mesh(rimGeometry((x, z) => baseHeight(z) + spoon(x, z), sideY0), new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.22, metalness: 0.95 }));
  group.add(top, base, side, edge);

  const mats = {
    plastic: new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.6 }),
  };
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(design.accent), roughness: 0.55 });
  for (const [z, ang] of [[-0.26, 0.31], [0.26, -0.16]]) {
    const b = makeBinding(mats, accent, false);
    b.position.set(0, baseHeight(z) + thickness(z) + EDGE_H, z);
    b.rotation.y = ang;
    group.add(b);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

export const BOARD_TOP_Y = CAMBER + thickness(0) + EDGE_H;
