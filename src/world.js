// Everything static in the scene: terrain chunks, sky, mountains, trees, rocks,
// fences, park features (kicker lips, rails, boxes, ledges, logs), props, the
// lodge and the start and finish gates. Built per map into one group so a map
// switch can throw it away.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ENVS } from './maps.js';
import { addFirs } from './trees.js';
import { Atmosphere } from './atmosphere.js';

let rnd;
const seedRandom = (seed) => { let s = seed >>> 0; rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
seedRandom(1234567);

// ---------- textures ----------

function valueNoise(N, cell) {
  const g = [];
  const n = N / cell;
  for (let i = 0; i < n * n; i++) g.push(rnd());
  return (x, y) => {
    const gx = x / cell, gy = y / cell;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const s = (t) => t * t * (3 - 2 * t);
    const at = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
    const a = at(x0, y0), b = at(x0 + 1, y0), cc = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * s(fx) + (cc - a) * s(fy) + (a - b - cc + d) * s(fx) * s(fy);
  };
}

// Tileable snow surface: soft wind ripples, clumps and fine grain.
// The shader samples it at three scales, so it does not need corduroy baked in.
let snowNormalCache = null;
function snowNormalMap() {
  if (snowNormalCache) return snowNormalCache;
  const N = 512;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const h = new Float32Array(N * N);
  const o1 = valueNoise(N, 64), o2 = valueNoise(N, 32), o3 = valueNoise(N, 16), o4 = valueNoise(N, 8), o5 = valueNoise(N, 4), o6 = valueNoise(N, 2);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // wind ripples: stretched, warped bands
      const warp = o1(x, y) * 3.0;
      const ripple = Math.sin((y / N) * Math.PI * 2 * 9 + warp + Math.sin((x / N) * Math.PI * 2 * 2) * 0.8) * 0.09;
      const clumps = Math.pow(o3(x, y), 2) * 0.35;
      h[y * N + x] = o1(x, y) * 0.45 + o2(x, y) * 0.3 + clumps + o4(x, y) * 0.16 + o5(x, y) * 0.1 + o6(x, y) * 0.07 + ripple;
    }
  }
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const hy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const nx = -hx * 3.2, ny = -hy * 3.2, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  snowNormalCache = t;
  return t;
}

export function textTexture(text, { w = 1024, h = 256, bg = '#ff5a1f', fg = '#ffffff', font = 'Anton', size = 170 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `${size}px "${font}", Impact, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + size * 0.06);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function barkTexture() {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a3d27'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W, w = 2 + rnd() * 7;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(30,18,10,0.55)' : 'rgba(140,105,70,0.35)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= H; y += 32) ctx.lineTo(x + Math.sin(y * 0.03 + i) * 4, y);
    ctx.lineTo(x + w, H); ctx.lineTo(x + w, 0);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function stripeTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const ctx = c.getContext('2d');
  ctx.fillStyle = a; ctx.fillRect(0, 0, 128, 16);
  ctx.fillStyle = b;
  for (let x = -16; x < 128; x += 32) { ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 16); ctx.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- terrain ----------

function columnXs(course) {
  const inner = course.parkHalf + 6;
  const xs = [];
  for (let x = -150; x < -inner - 2; x += 4) xs.push(x);
  for (let x = -inner - 2; x < -inner; x += 1) xs.push(x);
  for (let x = -inner; x <= inner + 0.001; x += 0.5) xs.push(+x.toFixed(3));
  for (let x = inner + 1; x <= inner + 2; x += 1) xs.push(x);
  for (let x = Math.ceil((inner + 4) / 4) * 4; x <= 150; x += 4) xs.push(x);
  return xs;
}

// Snow: multi-scale normals against tiling, corduroy on the groomed lane,
// sun glints from tiny ice facets, blue sky light in the shade.
function snowMaterial(normalMap, sunDir, shade) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.82, metalness: 0,
    normalMap, normalScale: new THREE.Vector2(0.85, 0.85),
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunDir = { value: sunDir };
    sh.uniforms.uShade = { value: shade };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGroom;\nvarying vec3 vSnowPos;\nvarying float vGroom;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGroom = aGroom;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSnowPos;
varying float vGroom;
uniform vec3 uSunDir;
uniform vec3 uShade;
float snowHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <normal_fragment_maps>', `{
  float sDist = length(cameraPosition - vSnowPos);
  vec3 nA = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
  vec3 nB = texture2D(normalMap, vNormalMapUv * 0.137 + vec2(0.31, 0.77)).xyz * 2.0 - 1.0;
  vec3 nC = texture2D(normalMap, vNormalMapUv * 3.7 + vec2(0.5, 0.2)).xyz * 2.0 - 1.0;
  float fine = smoothstep(16.0, 2.5, sDist);
  // groomed snow is smoother at the large scale, natural snow keeps its drifts
  vec2 dn = nA.xy * 0.55 + nB.xy * (1.1 - vGroom * 0.75) + nC.xy * 0.45 * fine;
  // corduroy: grooming ridges running down the fall line, every 11 cm
  // fade the ridges out before they get finer than a pixel (no moire)
  float cordAA = clamp(1.6 - fwidth(vSnowPos.x) * 57.12 * 0.6, 0.0, 1.0);
  dn.x += sin(vSnowPos.x * 57.12) * 0.24 * mix(0.4, 1.0, smoothstep(0.25, 0.6, uSunDir.y)) * vGroom * cordAA * smoothstep(22.0, 4.0, sDist);
  vec3 mapN = vec3(dn * normalScale, 1.0);
  normal = normalize(tbn * mapN);
}`)
      .replace('#include <opaque_fragment>', `{
  vec3 vdir = normalize(cameraPosition - vSnowPos);
  float sDist = length(cameraPosition - vSnowPos);
  // how much of this pixel's light is direct sun: 0 in shadow
  float direct = dot(reflectedLight.directDiffuse, vec3(0.333));
  float total = dot(outgoingLight, vec3(0.333)) + 1e-4;
  float lit = clamp(direct / total * 1.5, 0.0, 1.0);
  outgoingLight *= mix(uShade, vec3(1.0), lit);
  // ice facets mirroring the sun; only while a facet is about pixel-sized
  vec3 cell = floor(vSnowPos * 70.0);
  float cellPx = fwidth(vSnowPos.x + vSnowPos.z) * 70.0;
  float tiny = smoothstep(0.12, 0.45, cellPx) * smoothstep(3.0, 1.2, cellPx);
  float h = snowHash(cell);
  vec3 facet = normalize(vec3(snowHash(cell + 1.7) - 0.5, 1.2, snowHash(cell + 3.1) - 0.5));
  vec3 hv = normalize(uSunDir + vdir);
  float glint = pow(max(dot(facet, hv), 0.0), 220.0) * step(0.55, h) * lit * tiny * smoothstep(45.0, 3.0, sDist);
  // view-dependent sparkle for the shimmer while moving
  float sp = step(0.997, snowHash(cell + floor(vdir * 7.0))) * tiny * smoothstep(50.0, 4.0, sDist) * (0.35 + 0.65 * lit);
  outgoingLight += (glint * 3.0 + sp * 1.2) * vec3(1.0, 0.97, 0.92);
  // soft sheen at grazing angles
  outgoingLight *= 1.0 + pow(1.0 - clamp(vdir.y, 0.0, 1.0), 5.0) * 0.08;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'snow-v2';
  return mat;
}

function buildTerrain(course, root, sunDir, shade) {
  const xs = columnXs(course);
  const nx = xs.length;
  const mat = snowMaterial(snowNormalMap(), sunDir, shade);
  const step = 0.55;
  const chunkLen = 55;
  const gh = course.groomHalf;
  for (let d0 = course.startD; d0 < course.endD; d0 += chunkLen) {
    const rows = Math.round(chunkLen / step) + 1;
    const pos = new Float32Array(nx * rows * 3);
    const col = new Float32Array(nx * rows * 3);
    const uv = new Float32Array(nx * rows * 2);
    const groom = new Float32Array(nx * rows);
    // heights first (with a margin), so occlusion can look at the neighbours
    const M = 4, hRows = rows + 2 * M;
    const H = new Float32Array(hRows * nx);
    for (let j = 0; j < hRows; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = course.heightAtD(xs[i], d0 + (j - M) * step);
    const hAt = (j, i) => H[(j + M) * nx + Math.min(nx - 1, Math.max(0, i))];
    for (let j = 0; j < rows; j++) {
      const d = d0 + j * step;
      for (let i = 0; i < nx; i++) {
        const x = xs[i];
        const y = hAt(j, i);
        const k = j * nx + i;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = -d;
        uv[k * 2] = x * 0.22; uv[k * 2 + 1] = d * 0.22;
        const g = gh > 0 ? 1 - Math.min(1, Math.max(0, (Math.abs(x) - gh + 1.5) / 3)) : 0;
        groom[k] = d > course.startD + 60 && d < course.finishD + course.runout ? g : g * 0.4;
        // occlusion: dips, kicker bases and landings collect less sky light
        const di = Math.max(1, Math.round(2 / Math.max(0.5, Math.abs((xs[Math.min(nx - 1, i + 1)] - xs[Math.max(0, i - 1)]) / 2))));
        const avg = (hAt(j - 4, i) + hAt(j + 4, i) + hAt(j, i - di) + hAt(j, i + di)) * 0.25;
        const cav = avg - y;
        const ao = 1 - Math.min(0.22, Math.max(0, cav) * 0.5) + Math.min(0.04, Math.max(0, -cav) * 0.15);
        // snow is never pure white: slightly off-white, with large soft patches
        const patch = 1 + 0.035 * Math.sin(x * 0.045 + d * 0.06) * Math.sin(d * 0.023 - x * 0.07) + 0.02 * Math.sin(d * 0.21 + x * 0.17);
        const off = 1 - g;
        const v = 0.93 * ao * patch * (1 - off * (0.04 + 0.03 * Math.sin(x * 0.7 + d * 0.3)));
        col[k * 3] = v * (0.985 - off * 0.04);
        col[k * 3 + 1] = v * (0.99 - off * 0.015);
        col[k * 3 + 2] = v;
      }
    }
    const idx = [];
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
        idx.push(a, b, c, b, e, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aGroom', new THREE.BufferAttribute(groom, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    root.add(m);
  }
  buildFarTerrain(course, root, mat);
}

// Beyond the ridden terrain the valley carries on as a coarse mesh and climbs into a head
// wall, so the view down the valley ends on snow and rock instead of an empty gap.
function buildFarTerrain(course, root, mat) {
  const d0 = course.endD - 4, d1 = course.endD + 1100, step = 8;
  // wide enough that the valley walls carry on out of view on both sides
  const xs = [];
  for (let x = -700; x < -150; x += 25) xs.push(x);
  for (let x = -150; x <= 150; x += 6) xs.push(x);
  for (let x = 175; x <= 700; x += 25) xs.push(x);
  const nx = xs.length, rows = Math.ceil((d1 - d0) / step) + 1;
  const pos = new Float32Array(nx * rows * 3), col = new Float32Array(nx * rows * 3), uv = new Float32Array(nx * rows * 2);
  for (let j = 0; j < rows; j++) {
    const d = d0 + j * step;
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = xs[i];
      pos.set([x, course.heightAtD(x, d), -d], k * 3);
      uv.set([x * 0.22, d * 0.22], k * 2);
      const v = 0.9 - 0.04 * Math.sin(x * 0.05 + d * 0.013);
      col.set([v * 0.97, v * 0.985, v], k * 3);
    }
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1; idx.push(a, b, c, b, e, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aGroom', new THREE.BufferAttribute(new Float32Array(nx * rows), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  root.add(m);
}

// ---------- sky & mountains ----------

// Distant range: ridged multi-octave relief, smooth shaded, rock showing on steep faces
// and below the snow line, fading into the haze with distance.
function buildMountains(root, course, env) {
  const segs = 420, rings = 26;
  const pos = [], idx = [];
  const mid = course.finishD * 0.55;
  const cy = course.baseY(mid), cz = -mid;
  const ridge = (a, t) => {
    let h = 0, amp = 1, f = 3;
    for (let o = 0; o < 5; o++) {
      const n = 1 - Math.abs(Math.sin(a * f + o * 1.7 + t * (2 + o)) * Math.cos(a * f * 0.53 + o * 2.3 - t * 3));
      h += n * n * amp; amp *= 0.5; f *= 2.13;
    }
    return h;
  };
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const rad = 1250 + t * 1500;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const env_ = Math.sin(t * Math.PI) ** 0.8;
      const y = cy - 240 + env_ * (240 + ridge(a, t) * 520);
      pos.push(Math.cos(a) * rad, y, cz + Math.sin(a) * rad);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // colour from slope and height: snow on gentle faces, rock on steep ones and low down
  const haze = new THREE.Color(env.horizon), rock = new THREE.Color('#4f5866'), rockLight = new THREE.Color('#7b8492'), snow = new THREE.Color('#f2f6fb');
  const col = new Float32Array(pos.length), n = g.attributes.normal;
  const c = new THREE.Color();
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1] - (cy - 240);
    const ny = n.getY(i);
    // rock strata: roughly level bands, broken up along the range
    const streak = Math.sin(y * 0.045 + Math.sin(Math.atan2(pos[i * 3 + 2] - cz, pos[i * 3]) * 9) * 1.5) * 0.5 + 0.5;
    const snowy = THREE.MathUtils.smoothstep(ny, 0.55, 0.78) * THREE.MathUtils.smoothstep(y, 160, 300) + THREE.MathUtils.smoothstep(y, 520, 700) * 0.5;
    c.copy(rock).lerp(rockLight, streak * 0.6).lerp(snow, Math.min(1, snowy));
    const r = Math.floor(i / (segs + 1)) / rings;
    c.lerp(haze, Math.min(0.6, env.haze * 0.3 + r * 0.25));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, fog: true }));
  root.add(m);
}

// ---------- downloaded props (Kenney, CC0) ----------

// Lay snow on every upward-facing surface of a prop material.
function snowify(material, amount = 0.85) {
  const m = material.clone();
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float up = inverseTransformDirection(normal, viewMatrix).y;
  float snowAmt = smoothstep(0.42, 0.78, up) * ${amount.toFixed(2)};
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), snowAmt);
}`);
  };
  m.customProgramCacheKey = () => 'snow' + amount;
  return m;
}

// Split a baked prop into its connected pieces (single trees, tents, ...),
// dropping the flat ground plate the Kenney tiles sit on.
function splitPieces(geometry, groundY = 0.06) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const triCount = pos.count / 3;
  const parent = new Int32Array(triCount).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const keyOwner = new Map();
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const minY = box.min.y;
  const keep = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t++) {
    let maxY = -Infinity;
    for (let k = 0; k < 3; k++) maxY = Math.max(maxY, pos.getY(t * 3 + k));
    if (maxY - minY < groundY) continue;
    keep[t] = 1;
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      const o = keyOwner.get(key);
      if (o === undefined) keyOwner.set(key, t);
      else parent[find(t)] = find(o);
    }
  }
  const groups = new Map();
  for (let t = 0; t < triCount; t++) {
    if (!keep[t]) continue;
    const r = find(t);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t);
  }
  const pieces = [];
  for (const tris of groups.values()) {
    const ng = new THREE.BufferGeometry();
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name];
      const arr = new Float32Array(tris.length * 3 * a.itemSize);
      tris.forEach((t, j) => { for (let k = 0; k < 3; k++) for (let c = 0; c < a.itemSize; c++) arr[(j * 3 + k) * a.itemSize + c] = a.getComponent(t * 3 + k, c); });
      ng.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    ng.computeBoundingBox();
    const b = ng.boundingBox;
    const base = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
    ng.translate(-base.x, -base.y, -base.z);
    ng.computeBoundingBox();
    pieces.push({ geometry: ng, base, size: ng.boundingBox.getSize(new THREE.Vector3()) });
  }
  return pieces;
}

function propPieces(root) {
  if (!root) return [];
  root.updateMatrixWorld(true);
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const p of mergeOverlapping(splitPieces(g))) out.push({ ...p, material: o.material });
  });
  return out;
}

// Re-join pieces that stack on top of each other (a trunk under its crown).
function mergeOverlapping(pieces) {
  const n = pieces.length;
  const parent = pieces.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = pieces[i], b = pieces[j];
      const ox = Math.abs(a.base.x - b.base.x) < Math.min(a.size.x, b.size.x) * 0.5 + 0.01;
      const oz = Math.abs(a.base.z - b.base.z) < Math.min(a.size.z, b.size.z) * 0.5 + 0.01;
      if (ox && oz) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  pieces.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
  const out = [];
  for (const list of groups.values()) {
    if (list.length === 1) { out.push(list[0]); continue; }
    const geos = list.map((p) => p.geometry.clone().translate(p.base.x, p.base.y, p.base.z));
    const names = Object.keys(geos[0].attributes);
    const merged = new THREE.BufferGeometry();
    for (const name of names) {
      const size = geos[0].attributes[name].itemSize;
      const arr = new Float32Array(geos.reduce((a, g) => a + g.attributes[name].count * size, 0));
      let o = 0;
      for (const g of geos) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    merged.computeBoundingBox();
    const b = merged.boundingBox;
    const base = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
    merged.translate(-base.x, -base.y, -base.z);
    merged.computeBoundingBox();
    out.push({ geometry: merged, base, size: merged.boundingBox.getSize(new THREE.Vector3()) });
  }
  return out;
}

// ---------- trees ----------

// A whole downloaded model as instancable parts (one per mesh, world transform baked).
function modelParts(root) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => { if (o.isMesh) parts.push({ geometry: o.geometry.clone().applyMatrix4(o.matrixWorld), material: o.material }); });
  if (!parts.length) return null;
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  return { parts, size: box.getSize(new THREE.Vector3()), box };
}

// Draw one model many times: list of matrices -> one InstancedMesh per part.
function instance(root, model, matrices, { shadow = true, matFor = (m) => m } = {}) {
  if (!model || !matrices.length) return;
  for (const p of model.parts) {
    const mesh = new THREE.InstancedMesh(p.geometry, matFor(p.material), matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

const dummy = new THREE.Object3D();
function matrixAt(x, y, z, rotY, s, sy = s) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, rotY, 0);
  dummy.scale.set(s, sy, s);
  dummy.updateMatrix();
  return dummy.matrix.clone();
}

function scatterTreePositions(course) {
  const out = [];
  const chunk = 140;
  const ph = course.parkHalf;
  const dens = course.map.treeDensity ?? 1;
  const gap = course.map.fences ? 9 : 5;
  for (let d0 = course.startD; d0 < course.endD; d0 += chunk) {
    const items = [];
    for (let i = 0; i < 200 * dens; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      items.push([side * (ph + gap + Math.pow(rnd(), 0.7) * 110), d0 + rnd() * chunk]);
    }
    if (d0 > 0 && d0 < course.finishD && course.map.fences) {
      for (let i = 0; i < 4; i++) items.push([(rnd() < 0.5 ? -1 : 1) * (ph - 1 + rnd() * 3), d0 + rnd() * chunk]);
    }
    out.push(items);
  }
  return out;
}

// Firs from scanned textures: full detail near the riding area, lighter further out.
function buildTrees(course, root) {
  const chunks = scatterTreePositions(course);
  const near = [], far = [];
  for (const items of chunks) {
    for (const [x, d] of items) {
      const h = 8 + rnd() * 9;
      const it = [x, course.heightAtD(x, d) - 0.3, -d, h, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.06];
      (Math.abs(x) < course.parkHalf + 45 ? near : far).push(it);
    }
  }
  addFirs(root, near, 0, { shadows: true });
  addFirs(root, far, 1, { shadows: true });
}

// ---------- rocks & obstacles ----------

function fallbackRock() {
  const g = new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + rnd() * 0.4;
    p.setXYZ(i, p.getX(i) * k, Math.max(0, p.getY(i) * k * 0.8 + 0.3), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  return { parts: [{ geometry: g, material: new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95, flatShading: true }) }], size: g.boundingBox.getSize(new THREE.Vector3()) };
}

// Photoscanned rocks (Poly Haven, CC0) with snow settled on their tops.
function buildRocks(course, root, props) {
  const mats = new Map();
  const matFor = (m) => { if (!mats.has(m)) mats.set(m, snowify(m, 0.75)); return mats.get(m); };
  const rock = modelParts(props.rockScan) || fallbackRock();
  const cliffs = [props.cliffA, props.cliffB].map(modelParts).filter(Boolean);
  const stump = modelParts(props.stumpScan);
  const ph = course.parkHalf;
  const span = course.endD - course.startD;

  // boulders on the valley walls (the scan is a small stone: scale it up)
  const rocks = [];
  const n = Math.round(span / (course.map.roughness ? 4 : 8));
  for (let i = 0; i < n; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (ph + 3 + Math.pow(rnd(), 1.3) * 90);
    const d = course.startD + rnd() * span;
    const s = (0.8 + rnd() * 2.6) / Math.max(rock.size.x, rock.size.z);
    rocks.push(matrixAt(x, course.heightAtD(x, d) - 0.25 * s * rock.size.y, -d, rnd() * Math.PI * 2, s, s * (0.6 + rnd() * 0.5)));
  }
  // rocks inside the riding area: these are the obstacles physics collides with
  for (const o of course.obstacles) {
    if (o.type !== 'rock') continue;
    const s = (o.r * 2) / Math.max(rock.size.x, rock.size.z);
    rocks.push(matrixAt(o.x, o.y - 0.12, -o.d, rnd() * Math.PI * 2, s, Math.max(o.h / rock.size.y, s * 0.6)));
  }
  instance(root, rock, rocks, { matFor });

  // rock outcrops breaking through the snow higher up the valley walls
  if (cliffs.length) {
    const lists = cliffs.map(() => []);
    const m = Math.round(span / (course.map.roughness ? 30 : 55));
    for (let i = 0; i < m; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (ph + 25 + rnd() * 70);
      const d = course.startD + rnd() * span;
      const s = 2 + rnd() * 3.5;
      // face the outcrop down the valley wall, towards the run
      lists[i % cliffs.length].push(matrixAt(x, course.heightAtD(x, d) - s * 0.6, -d, (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (rnd() - 0.5) * 0.8, s));
    }
    cliffs.forEach((c, i) => instance(root, c, lists[i], { matFor }));
  }

  // stumps along the tree lines (and in the backcountry riding area)
  if (stump) {
    const st = [];
    const k = Math.round(span / (course.map.roughness ? 9 : 20));
    for (let i = 0; i < k; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (course.map.roughness ? 8 + rnd() * (ph + 10) : ph + 4 + rnd() * 20);
      const d = course.startD + 40 + rnd() * (span - 40);
      const s = 0.7 + rnd() * 0.6;
      st.push(matrixAt(x, course.heightAtD(x, d) - 0.12, -d, rnd() * Math.PI * 2, s));
    }
    instance(root, stump, st, { matFor: (m) => matFor(m) });
  }

  // firs standing in the backcountry riding area (also obstacles)
  const trees = course.obstacles.filter((o) => o.type === 'tree');
  addFirs(root, trees.map((o) => [o.x, o.y - 0.3, -o.d, o.h, rnd() * Math.PI * 2, 0]), 0);
}

// ---------- props, camps, lodge ----------

function placeModel(root, course, model, x, d, rot, s) {
  if (!model) return;
  for (const p of model.parts) {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.position.set(x, course.heightAtD(x, d) - 0.04, -d);
    m.rotation.y = rot;
    m.scale.setScalar(s);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
}

function buildProps(course, root, props) {
  const byName = {};
  const get = (n) => (byName[n] ??= modelParts(props[n]));
  for (const p of course.map.props || []) placeModel(root, course, get(p.model), p.x, p.d, p.rot, p.s);
  // snow piles at the end of every rail, where riders spray off
  const pile = get('snowPile');
  for (const r of course.rails) {
    const e = r.points[r.points.length - 1];
    placeModel(root, course, pile, e.x + (rnd() - 0.5) * 2, -e.z + 2.5 + rnd() * 2, rnd() * 6, 2.2 + rnd());
  }
  if (course.map.lanterns) {
    const lantern = get('lantern');
    const glowTex = glowTexture();
    for (let d = 20; d < course.finishD; d += 26) {
      for (const sx of [-1, 1]) {
        const x = sx * (course.parkHalf + 0.6);
        placeModel(root, course, lantern, x, d, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1.3);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb35c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
        glow.position.set(x, course.heightAtD(x, d) + 1.75, -d);
        glow.scale.setScalar(1.6);
        root.add(glow);
      }
    }
  }
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.25, 'rgba(255,190,110,0.55)'); g.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Log cabin lodge from the Holiday Kit wall pieces with a snow-covered gable roof.
function buildLodge(course, root, props) {
  const L = course.map.lodge;
  if (!L) return;
  const wall = modelParts(props.cabinWall), corner = modelParts(props.cabinCorner);
  const win = modelParts(props.cabinWindow) || wall, door = modelParts(props.cabinDoorway) || wall;
  const S = 2.6, W = 5, D = 3;
  const g = new THREE.Group();
  const floorH = Math.max(...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => course.heightAtD(L.x + sx * W * S / 2, L.d + sz * D * S / 2))));
  const add = (model, i, j, rot) => {
    if (!model) return;
    for (const p of model.parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.position.set((i - (W - 1) / 2) * S, 0, (j - (D - 1) / 2) * S);
      m.rotation.y = rot;
      m.scale.setScalar(S);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }
  };
  if (wall) {
    for (let i = 0; i < W; i++) {
      add(i === (W >> 1) ? door : i % 2 ? win : wall, i, D - 1, 0);
      add(i % 2 ? win : wall, i, 0, Math.PI);
    }
    for (let j = 0; j < D; j++) {
      add(j === 1 ? win : wall, W - 1, j, Math.PI / 2);
      add(j === 1 ? win : wall, 0, j, -Math.PI / 2);
    }
    add(corner, 0, D - 1, 0); add(corner, W - 1, D - 1, Math.PI / 2);
    add(corner, W - 1, 0, Math.PI); add(corner, 0, 0, -Math.PI / 2);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(W * S, S, D * S), new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.9 }));
    body.position.y = S / 2;
    g.add(body);
  }
  // gable roof: two snow slabs over a dark timber underside
  const halfD = (D * S) / 2 + 0.6, rise = 2.4, len = W * S + 1.4;
  const slope = Math.hypot(halfD, rise);
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 0.85 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
  for (const sz of [-1, 1]) {
    const slab = new THREE.Mesh(new RoundedBoxGeometry(len, 0.42, slope, 2, 0.15), snowMat);
    slab.position.set(0, S + rise / 2 + 0.15, sz * halfD / 2);
    slab.rotation.x = sz * Math.atan2(rise, halfD);
    const under = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, 0.12, slope), woodMat);
    under.position.copy(slab.position).y -= 0.25;
    under.rotation.copy(slab.rotation);
    slab.castShadow = under.castShadow = true;
    g.add(slab, under);
  }
  const gable = new THREE.Shape([new THREE.Vector2(-halfD + 0.6, 0), new THREE.Vector2(halfD - 0.6, 0), new THREE.Vector2(0, rise - 0.2)]);
  for (const sx of [-1, 1]) {
    const tri = new THREE.Mesh(new THREE.ShapeGeometry(gable), woodMat);
    tri.material.side = THREE.DoubleSide;
    tri.position.set(sx * (W * S / 2 - 0.25), S, 0);
    tri.rotation.y = Math.PI / 2;
    g.add(tri);
  }
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), new THREE.MeshStandardMaterial({ color: 0x6d6f75, roughness: 0.95 }));
  chimney.position.set(W * S * 0.28, S + rise + 0.2, -halfD * 0.35);
  chimney.castShadow = true;
  g.add(chimney);
  // stone plinth so the downhill side does not float
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W * S + 0.6, 4, D * S + 0.6), new THREE.MeshStandardMaterial({ color: 0x8a8d94, roughness: 1 }));
  plinth.position.y = -2;
  plinth.receiveShadow = true;
  g.add(plinth);
  g.position.set(L.x, floorH, -L.d);
  g.rotation.y = L.rot ? L.rot - Math.PI : 0;
  root.add(g);
}

// Kenney tent camp, laid piece by piece onto the slope beside the start and finish.
function buildCamps(course, root, props) {
  if (!course.map.camps) return;
  const pieces = propPieces(props.tents);
  if (!pieces.length) return;
  const mats = new Map();
  const matFor = (m) => { if (!mats.has(m)) mats.set(m, snowify(m, 0.55)); return mats.get(m); };
  const scale = 1.6;
  const F = course.finishD, ph = course.parkHalf;
  for (const [cx, cd, rot] of [[-(ph - 9), -8, 0.4], [ph - 9, -10, -0.5], [-(ph - 8), F + 24, 2.6], [ph - 8, F + 30, -2.4]]) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (const p of pieces) {
      const lx = p.base.x * scale, lz = p.base.z * scale;
      const x = cx + lx * c + lz * sn;
      const d = cd - (-lx * sn + lz * c);
      const m = new THREE.Mesh(p.geometry, matFor(p.material));
      m.position.set(x, course.heightAtD(x, d) - 0.05, -d);
      m.rotation.y = rot;
      m.scale.setScalar(scale);
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
  }
}

// ---------- fences & gates ----------

function buildFences(course, root) {
  if (!course.map.fences) return;
  const netMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.7, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.6 });
  const posts = [];
  for (const side of [-1, 1]) {
    const x = side * (course.parkHalf + 1.5);
    const pos = [], idx = [];
    let n = 0;
    for (let d = -6; d <= course.finishD + 40; d += 2) {
      const y = course.heightAtD(x, d);
      pos.push(x, y + 0.25, -d, x, y + 1.05, -d);
      if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      n++;
      if (Math.round(d) % 4 === 0) posts.push([x, y, d]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, netMat));
  }
  const pg = new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5);
  pg.translate(0, 0.65, 0);
  const pm = new THREE.InstancedMesh(pg, postMat, posts.length);
  posts.forEach(([x, y, d], i) => { dummy.position.set(x, y, -d); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); });
  pm.computeBoundingSphere();
  root.add(pm);
}

function buildGate(course, root, d, label, color) {
  const g = new THREE.Group();
  const y = course.heightAtD(0, d);
  const mat = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.5, metalness: 0.4 });
  for (const x of [-9, 9]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.5, 0.6), mat);
    p.position.set(x, course.heightAtD(x, d) - y + 3.25, 0);
    p.castShadow = true;
    g.add(p);
  }
  const size = label.length > 9 ? 110 : 150;
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(18.6, 2.2, 0.3),
    [mat, mat, mat, mat,
      new THREE.MeshStandardMaterial({ map: textTexture(label, { bg: color, size }), roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: textTexture(label, { bg: color, size }), roughness: 0.6 })]);
  banner.position.y = 6.2;
  banner.castShadow = true;
  g.add(banner);
  g.position.set(0, y, -d);
  root.add(g);
}

// ---------- park features ----------

function buildKickerDetails(course, root, props) {
  const flagPieces = propPieces(props.flag);
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x1f6fff, roughness: 0.8 });
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35 });
  for (const k of course.kickers) {
    // natural hits are read by their shape alone
    if (k.natural) continue;
    // blue dye line across the lip and the knuckle so riders can read the jump
    for (const u of [k.lipU - 0.25, k.knuckleU + 0.6]) {
      const d = k.d + u;
      const pts = [];
      for (let x = k.x - k.width / 2 + 0.3; x <= k.x + k.width / 2 - 0.3; x += 0.5) {
        pts.push(new THREE.Vector3(x, course.heightAtD(x, d) + 0.025, -d));
      }
      const pos = [], idx = [];
      pts.forEach((p, i) => {
        pos.push(p.x, p.y, p.z - 0.18, p.x, p.y, p.z + 0.18);
        if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, lipMat);
      m.receiveShadow = true;
      root.add(m);
    }
    for (const sx of [-1, 1]) {
      const x = k.x + sx * (k.width / 2 + 0.8);
      const d = k.d + k.lipU;
      const y = course.heightAtD(x, d);
      if (flagPieces.length) {
        for (const p of flagPieces) {
          const m = new THREE.Mesh(p.geometry, p.material);
          m.scale.setScalar(1.8);
          m.position.set(x + p.base.x * 1.8, y + p.base.y * 1.8, -d + p.base.z * 1.8);
          m.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
          m.castShadow = true;
          root.add(m);
        }
        continue;
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), poleMat);
      pole.position.set(x, y + 1.1, -d);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), flagMat);
      flag.position.set(x + sx * 0.36, y + 1.95, -d);
      flag.rotation.y = 0.3 * sx;
      pole.castShadow = flag.castShadow = true;
      root.add(pole, flag);
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);

// Orient a mesh built along +Z so it runs from a to b with its top up.
function alongSegment(mesh, a, b) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.lookAt(b.clone().add(b).sub(a));
  return mesh;
}

function buildRails(course, root, props = {}) {
  const trunkScan = modelParts(props.trunkScan);
  const trunkMats = new Map();
  const metal = new THREE.MeshStandardMaterial({ color: 0xd3dae2, roughness: 0.22, metalness: 0.92 });
  const leg = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.5 });
  const cap = new THREE.MeshStandardMaterial({ map: stripeTexture('#ffcc1f', '#1b1d22'), roughness: 0.5 });
  const boxTop = new THREE.MeshStandardMaterial({ color: 0xe9eef3, roughness: 0.3, metalness: 0.15 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.95 });
  const coping = new THREE.MeshStandardMaterial({ color: 0x8c949e, roughness: 0.3, metalness: 0.85 });
  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 });
  const endWood = new THREE.MeshStandardMaterial({ color: 0xc9a273, roughness: 0.9 });
  const snowCap = new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.85 });
  const sideMats = new Map();
  const sideFor = (r) => {
    if (!sideMats.has(r.name)) {
      const t = textTexture(r.name.toUpperCase(), { bg: '#1f6fff', size: 120 });
      sideMats.set(r.name, new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }));
    }
    return sideMats.get(r.name);
  };

  for (const r of course.rails) {
    const segs = r.segments;
    segs.forEach((s, si) => {
      let mesh;
      if (r.kind === 'rail') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, s.len, 14), metal);
        mesh.quaternion.setFromUnitVectors(UP, s.dir);
        mesh.position.addVectors(s.a, s.b).multiplyScalar(0.5).y -= 0.045;
        // round joint at every kink so the tube reads as one bent pipe
        if (si > 0) {
          const j = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), metal);
          j.position.copy(s.a).y -= 0.045;
          root.add(j);
        }
      } else if (r.kind === 'box') {
        mesh = new THREE.Group();
        const top = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.05, s.len + 0.02, 2, 0.02), boxTop);
        top.position.y = -0.025;
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, s.len), [sideFor(r), sideFor(r), leg, leg, leg, leg]);
        side.position.y = -0.2;
        const tex = side.material[0].map;
        tex.wrapS = THREE.RepeatWrapping;
        tex.repeat.set(Math.max(1, Math.round(s.len / 4)), 1);
        mesh.add(top, side);
        alongSegment(mesh, s.a, s.b);
      } else if (r.kind === 'ledge') {
        mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, s.len + 0.01), concrete);
        body.position.y = -0.45;
        mesh.add(body);
        for (const sx of [-1, 1]) {
          const e = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, s.len, 8), coping);
          e.rotation.x = Math.PI / 2;
          e.position.set(sx * 0.44, -0.01, 0);
          mesh.add(e);
        }
        alongSegment(mesh, s.a, s.b);
      } else if (trunkScan) {
        // log: a scanned dead trunk stretched over the segment, its top along the ridden line
        mesh = new THREE.Group();
        const L = trunkScan.size.x, T = trunkScan.box.max.y;
        const k = 0.42 / trunkScan.size.y;
        for (const part of trunkScan.parts) {
          if (!trunkMats.has(part.material)) trunkMats.set(part.material, snowify(part.material, 0.55));
          const m = new THREE.Mesh(part.geometry, trunkMats.get(part.material));
          m.scale.set(s.len / L * 1.04, k, k);
          m.position.set(0, -T * k, 0);
          mesh.add(m);
        }
        mesh.position.addVectors(s.a, s.b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), s.dir);
      } else {
        // log fallback: bark cylinder lying on the ridden line, a little snow along its sides
        mesh = new THREE.Group();
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, s.len, 16), bark);
        log.rotation.x = Math.PI / 2;
        log.position.y = -0.21;
        bark.map.repeat.set(2, Math.max(1, s.len / 2));
        mesh.add(log);
        for (let k = 0; k < 3; k++) {
          const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.5, 6), bark);
          stub.position.set((rnd() < 0.5 ? -1 : 1) * 0.25, -0.15, (rnd() - 0.5) * s.len * 0.8);
          stub.rotation.z = Math.PI / 2 + (rnd() - 0.5) * 0.8;
          mesh.add(stub);
        }
        const drift = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, s.len * 0.9, 10, 1, false, Math.PI * 0.55, Math.PI * 0.9), snowCap);
        drift.rotation.x = Math.PI / 2;
        drift.scale.set(1.35, 1, 0.5);
        drift.position.y = -0.36;
        mesh.add(drift);
        alongSegment(mesh, s.a, s.b);
        if (si === 0 || si === segs.length - 1) {
          for (const end of si === 0 ? [s.a] : [s.b]) {
            const disc = new THREE.Mesh(new THREE.CircleGeometry(0.215, 16), endWood);
            disc.position.copy(end).y -= 0.21;
            disc.lookAt(end.clone().addScaledVector(s.dir, si === 0 ? -1 : 1).setY(end.y - 0.21));
            root.add(disc);
          }
        }
      }
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      root.add(mesh);
    });
    if (r.kind === 'rail') {
      // striped end caps make the rail ends readable at speed
      for (const [p, s] of [[segs[0].a, segs[0]], [segs[segs.length - 1].b, segs[segs.length - 1]]]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 14), cap);
        c.quaternion.setFromUnitVectors(UP, s.dir);
        c.position.copy(p).addScaledVector(s.dir, p === segs[0].a ? 0.15 : -0.15).y -= 0.045;
        c.castShadow = true;
        root.add(c);
      }
    }
    if (r.kind === 'log') continue;
    // supports with base plates
    const total = r.length;
    const n = Math.max(2, Math.ceil(total / 2.6));
    const drop = r.kind === 'box' ? 0.34 : r.kind === 'ledge' ? 0.9 : 0.08;
    for (let i = 0; i <= n; i++) {
      let t = (i / n) * total;
      let seg = segs[0];
      for (const s of segs) { seg = s; if (t <= s.len) break; t -= s.len; }
      const p = seg.a.clone().addScaledVector(seg.dir, Math.min(t, seg.len));
      const gy = course.heightAt(p.x, p.z);
      const h = p.y - gy - drop;
      if (h < 0.05) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(r.kind === 'ledge' ? 0.12 : 0.05, r.kind === 'ledge' ? 0.12 : 0.05, h + 0.4, 8), r.kind === 'ledge' ? concrete : leg);
      post.position.set(p.x, gy + (h - 0.4) / 2, p.z);
      post.castShadow = true;
      root.add(post);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), leg);
      plate.position.set(p.x, gy + 0.01, p.z);
      root.add(plate);
    }
  }
}

// ---------- lights & assembly ----------

export function buildWorld(scene, course, props = {}, atmo) {
  seedRandom(1234567 + course.finishD);
  const env = ENVS[course.map.env] ?? ENVS.day;
  const root = new THREE.Group();
  root.name = 'world';

  buildMountains(root, course, env);
  buildTerrain(course, root, atmo.lightDir, atmo.shade);
  buildTrees(course, root);
  buildRocks(course, root, props);
  buildProps(course, root, props);
  buildLodge(course, root, props);
  buildCamps(course, root, props);
  buildFences(course, root);
  buildKickerDetails(course, root, props);
  buildRails(course, root, props);
  buildGate(course, root, 2, course.map.gate ?? 'SNOWDAY', '#ff2d78');
  buildGate(course, root, course.finishD, 'FINISH', '#12121c');
  const lamps = Atmosphere.buildPoles(course, root);
  scene.add(root);

  return {
    env, lamps,
    dispose() {
      scene.remove(root);
      // geometries are rebuilt per map; materials of loaded models are shared and stay
      root.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    },
  };
}
