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
  b.font = '900 118px "Bungee", "Impact", sans-serif';
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

function capGeometry(y, flip) {
  const pts = outline();
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(z, x)));
  const g = new THREE.ShapeGeometry(shape, 6);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const sz = p.getX(i), sx = p.getY(i);
    p.setXYZ(i, sx, y + kick(sz), sz);
    uv.setXY(i, (sz + BOARD_LEN / 2) / BOARD_LEN, (sx + HALF_END) / (HALF_END * 2));
  }
  if (flip) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
  }
  g.computeVertexNormals();
  return g;
}

function edgeGeometry(t) {
  const pts = outline();
  const pos = [], idx = [];
  pts.forEach(([x, z]) => {
    const k = kick(z);
    pos.push(x, t + k, z, x, -t + k, z);
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
  const tex = { top: mk(art.top), base: mk(art.base) };
  texCache.set(design.id, tex);
  return tex;
}

export function makeBoard(design) {
  const group = new THREE.Group();
  const T = 0.008;
  const tex = boardTextures(design);
  const top = new THREE.Mesh(capGeometry(T + 0.0005, false), new THREE.MeshStandardMaterial({ map: tex.top, roughness: 0.35, metalness: 0.05 }));
  const base = new THREE.Mesh(capGeometry(-T - 0.0005, true), new THREE.MeshStandardMaterial({ map: tex.base, roughness: 0.25, metalness: 0.05 }));
  const edge = new THREE.Mesh(edgeGeometry(T), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.8 }));
  group.add(top, base, edge);

  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(design.accent), roughness: 0.45 });
  for (const [z, ang] of [[-0.26, 0.31], [0.26, -0.16]]) {
    const b = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.018, 0.13), dark);
    plate.position.y = T + 0.01;
    const high = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.17, 0.15), dark);
    high.position.set(-0.13, T + 0.09, 0);
    high.rotation.z = 0.25;
    const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.16), accent);
    strap1.position.set(0.06, T + 0.115, 0);
    const strap2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.15), accent);
    strap2.position.set(0.12, T + 0.05, 0);
    b.add(plate, high, strap1, strap2);
    b.position.z = z;
    b.rotation.y = ang;
    group.add(b);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}
