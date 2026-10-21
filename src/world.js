// Everything static in the scene: terrain chunks, sky, mountains, trees,
// fences, park features (kicker lips, rails, boxes), start and finish gates.
import * as THREE from 'three';
import { START_D, END_D, FINISH_D, PARK_HALF, baseY } from './course.js';

const rnd = (() => { let s = 1234567; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();

// ---------- textures ----------

function snowNormalMap() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const h = new Float32Array(N * N);
  // value noise octaves + corduroy grooming lines
  const grid = (cell) => {
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
  };
  const o1 = grid(32), o2 = grid(16), o3 = grid(8), o4 = grid(4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cord = Math.sin((x / N) * Math.PI * 2 * 24) * 0.07;
      h[y * N + x] = o1(x, y) * 0.5 + o2(x, y) * 0.3 + o3(x, y) * 0.22 + o4(x, y) * 0.14 + cord;
    }
  }
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const hy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const nx = -hx * 2.2, ny = -hy * 2.2, nz = 1;
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
  return t;
}

export function textTexture(text, { w = 1024, h = 256, bg = '#ff5a1f', fg = '#ffffff', font = 'Bungee', size = 150 } = {}) {
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

// ---------- terrain ----------

function columnXs() {
  const xs = [];
  for (let x = -140; x < -32; x += 4) xs.push(x);
  for (let x = -32; x <= 32.001; x += 0.6) xs.push(+x.toFixed(3));
  for (let x = 36; x <= 140; x += 4) xs.push(x);
  return xs;
}

function snowMaterial(normalMap) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0,
    normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSnowPos;
float snowHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
{
  vec3 cell = floor(vSnowPos * 22.0);
  vec3 vdir = normalize(cameraPosition - vSnowPos);
  float h = snowHash(cell + floor(vdir * 7.0));
  float dist = length(cameraPosition - vSnowPos);
  float sparkle = step(0.9965, h) * smoothstep(60.0, 4.0, dist);
  gl_FragColor.rgb += sparkle * vec3(0.9, 0.95, 1.0) * 0.9;
}`);
  };
  return mat;
}

function buildTerrain(course, scene) {
  const xs = columnXs();
  const nx = xs.length;
  const normalMap = snowNormalMap();
  const mat = snowMaterial(normalMap);
  const step = 0.7;
  const chunkLen = 63;
  const meshes = [];
  for (let d0 = START_D; d0 < END_D; d0 += chunkLen) {
    const rows = Math.round(chunkLen / step) + 1;
    const pos = new Float32Array(nx * rows * 3);
    const col = new Float32Array(nx * rows * 3);
    const uv = new Float32Array(nx * rows * 2);
    for (let j = 0; j < rows; j++) {
      const d = d0 + j * step;
      for (let i = 0; i < nx; i++) {
        const x = xs[i];
        const y = course.heightAtD(x, d);
        const k = j * nx + i;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = -d;
        uv[k * 2] = x * 0.22; uv[k * 2 + 1] = d * 0.22;
        // groomed lane is bright, natural snow slightly blue and varied
        const off = Math.min(1, Math.max(0, (Math.abs(x) - PARK_HALF + 2) / 10));
        const v = 1 - off * (0.06 + 0.04 * Math.sin(x * 0.7 + d * 0.3));
        col[k * 3] = v * (1 - off * 0.05);
        col[k * 3 + 1] = v * (1 - off * 0.02);
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
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    scene.add(m);
    meshes.push(m);
  }
  return meshes;
}

// ---------- sky & mountains ----------

function buildSky(scene, sunDir) {
  const g = new THREE.SphereGeometry(4000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      sunDir: { value: sunDir.clone().normalize() },
      zenith: { value: new THREE.Color('#2f6fbf') },
      horizon: { value: new THREE.Color('#cfe1f3') },
      ground: { value: new THREE.Color('#e6eef7') },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 sunDir, zenith, horizon, ground; varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 col = mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.55));
        col = mix(col, ground, smoothstep(0.0, -0.08, y));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.86, 0.62) * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.28);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(g, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}

function buildMountains(scene) {
  const segs = 220, rings = 14;
  const pos = [], col = [], idx = [];
  const haze = new THREE.Color('#cfe1f3');
  const rock = new THREE.Color('#5c6b80');
  const snow = new THREE.Color('#f4f8fc');
  const cy = baseY(450), cz = -450;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const rad = 1300 + t * 1300;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const n = Math.sin(a * 5 + 1.3) * 0.5 + Math.sin(a * 11 + r * 0.5) * 0.3 + Math.sin(a * 23 + r) * 0.15 + Math.sin(a * 47) * 0.06;
      const ridge = Math.max(0, Math.sin(t * Math.PI)) * (420 + n * 330) + Math.abs(Math.sin(a * 3.0 + t * 4.0)) * 120 * t;
      const y = cy - 260 + ridge;
      pos.push(Math.cos(a) * rad, y, cz + Math.sin(a) * rad);
      const snowy = THREE.MathUtils.smoothstep(ridge + Math.sin(a * 37) * 40, 230, 380);
      const c = rock.clone().lerp(snow, snowy).lerp(haze, 0.35 + t * 0.4);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, flatShading: true, side: THREE.DoubleSide }));
  scene.add(m);
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

function treeVariants(props) {
  const pieces = [...propPieces(props.forest), ...propPieces(props.treesTall)];
  // trees are the tall, narrow pieces
  const tallest = Math.max(0, ...pieces.map((p) => p.size.y));
  const trees = pieces.filter((p) => p.size.y > p.size.x * 1.2 && p.size.y > tallest * 0.3);
  const seen = new Set();
  const unique = [];
  for (const t of trees.sort((a, b) => b.size.y - a.size.y)) {
    const key = `${t.size.y.toFixed(2)}:${t.size.x.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  return unique.slice(0, 6);
}

// ---------- trees ----------

function mergeGeometries(list) {
  let count = 0;
  const parts = list.map((g) => { const n = g.index ? g.toNonIndexed() : g; count += n.attributes.position.count; return n; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function pineGeometry() {
  const parts = [];
  const paint = (g, fn) => {
    const p = g.attributes.position, n = g.attributes.normal;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const [r, gg, b] = fn(p.getY(i), n.getY(i));
      c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6);
  trunk.translate(0, 0.8, 0);
  parts.push(paint(trunk, () => [0.28, 0.2, 0.14]));
  const tiers = [[2.2, 2.6, 1.2], [1.75, 2.2, 2.4], [1.3, 1.9, 3.5], [0.8, 1.5, 4.5]];
  for (const [r, h, y] of tiers) {
    const cone = new THREE.ConeGeometry(r, h, 8, 1);
    cone.translate(0, y + h / 2, 0);
    parts.push(paint(cone, (py, ny) => {
      const top = (py - y) / h;
      const snowy = ny > 0.35 && top > 0.15 ? 1 : 0;
      return snowy ? [0.93, 0.96, 1.0] : [0.11 + top * 0.06, 0.24 + top * 0.06, 0.18];
    }));
  }
  return mergeGeometries(parts);
}

function scatterTreePositions(rand) {
  const out = [];
  const chunk = 140;
  for (let d0 = START_D; d0 < END_D; d0 += chunk) {
    const items = [];
    for (let i = 0; i < 200; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      items.push([side * (PARK_HALF + 9 + Math.pow(rand(), 0.7) * 110), d0 + rand() * chunk]);
    }
    if (d0 > 0 && d0 < FINISH_D) {
      for (let i = 0; i < 4; i++) items.push([(rand() < 0.5 ? -1 : 1) * (PARK_HALF - 1 + rand() * 3), d0 + rand() * chunk]);
    }
    out.push(items);
  }
  return out;
}

function buildTrees(course, scene, props) {
  const variants = treeVariants(props);
  const chunks = scatterTreePositions(rnd);
  const dummy = new THREE.Object3D();
  if (variants.length) {
    const mats = new Map();
    const matFor = (m) => { if (!mats.has(m)) mats.set(m, snowify(m, 0.8)); return mats.get(m); };
    for (const items of chunks) {
      const byVariant = variants.map(() => []);
      for (const it of items) byVariant[Math.floor(rnd() * variants.length)].push(it);
      byVariant.forEach((list, vi) => {
        if (!list.length) return;
        const v = variants[vi];
        const mesh = new THREE.InstancedMesh(v.geometry, matFor(v.material), list.length);
        list.forEach(([x, d], i) => {
          const h = 6 + rnd() * 7;
          const s = h / v.size.y;
          dummy.position.set(x, course.heightAtD(x, d) - 0.15, -d);
          dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.computeBoundingSphere();
        scene.add(mesh);
      });
    }
    return;
  }
  const geo = pineGeometry();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (const items of chunks) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach(([x, d], i) => {
      const s = 0.7 + rnd() * 0.9;
      dummy.position.set(x, course.heightAtD(x, d) - 0.2, -d);
      dummy.rotation.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08);
      dummy.scale.set(s, s * (0.9 + rnd() * 0.35), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
}

// Kenney tent camp, laid piece by piece onto the slope beside the start and finish.
function buildCamps(course, scene, props) {
  const pieces = propPieces(props.tents);
  if (!pieces.length) return;
  const mats = new Map();
  const matFor = (m) => { if (!mats.has(m)) mats.set(m, snowify(m, 0.55)); return mats.get(m); };
  const scale = 1.6;
  for (const [cx, cd, rot] of [[-17, -8, 0.4], [17, -10, -0.5], [-18, FINISH_D + 24, 2.6], [18, FINISH_D + 30, -2.4]]) {
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
      scene.add(m);
    }
  }
}

// ---------- fences & gates ----------

function buildFences(course, scene) {
  const netMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.7, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.6 });
  const posts = [];
  for (const side of [-1, 1]) {
    const x = side * (PARK_HALF + 1.5);
    const pos = [], idx = [];
    let n = 0;
    for (let d = -6; d <= FINISH_D + 40; d += 2) {
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
    const m = new THREE.Mesh(g, netMat);
    scene.add(m);
  }
  const pg = new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5);
  pg.translate(0, 0.65, 0);
  const pm = new THREE.InstancedMesh(pg, postMat, posts.length);
  const dummy = new THREE.Object3D();
  posts.forEach(([x, y, d], i) => { dummy.position.set(x, y, -d); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); });
  pm.computeBoundingSphere();
  scene.add(pm);
}

function buildGate(course, scene, d, label, color) {
  const g = new THREE.Group();
  const y = course.heightAtD(0, d);
  const mat = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.5, metalness: 0.4 });
  for (const x of [-9, 9]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.5, 0.6), mat);
    p.position.set(x, course.heightAtD(x, d) - y + 3.25, 0);
    p.castShadow = true;
    g.add(p);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(18.6, 2.2, 0.3),
    [mat, mat, mat, mat,
      new THREE.MeshStandardMaterial({ map: textTexture(label, { bg: color }), roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: textTexture(label, { bg: color }), roughness: 0.6 })]);
  banner.position.y = 6.2;
  banner.castShadow = true;
  g.add(banner);
  g.position.set(0, y, -d);
  scene.add(g);
}

// ---------- park features ----------

function buildKickerDetails(course, scene, props) {
  const flagPieces = propPieces(props.flag);
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x1f6fff, roughness: 0.8 });
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35 });
  for (const k of course.kickers) {
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
      scene.add(m);
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
          scene.add(m);
        }
        continue;
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), poleMat);
      pole.position.set(x, y + 1.1, -d);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), flagMat);
      flag.position.set(x + sx * 0.36, y + 1.95, -d);
      flag.rotation.y = 0.3 * sx;
      pole.castShadow = flag.castShadow = true;
      scene.add(pole, flag);
    }
  }
}

function buildRails(course, scene) {
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9d1da, roughness: 0.25, metalness: 0.9 });
  const leg = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.5 });
  const boxTop = new THREE.MeshStandardMaterial({ color: 0xe9eef3, roughness: 0.35, metalness: 0.2 });
  const boxSide = new THREE.MeshStandardMaterial({ color: 0x1f6fff, roughness: 0.55 });
  const up = new THREE.Vector3(0, 1, 0);
  for (const r of course.rails) {
    for (const s of r.segments) {
      const mid = new THREE.Vector3().addVectors(s.a, s.b).multiplyScalar(0.5);
      let mesh;
      if (r.kind === 'rail') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, s.len + 0.04, 10), metal);
        mesh.quaternion.setFromUnitVectors(up, s.dir);
        mesh.position.copy(mid).y -= 0.045;
      } else {
        mesh = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, s.len + 0.02), boxTop);
        top.position.y = -0.02;
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, s.len), boxSide);
        side.position.y = -0.17;
        mesh.add(top, side);
        mesh.position.copy(mid);
        mesh.lookAt(mid.clone().add(s.dir));
      }
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(mesh);
    }
    // supports
    const total = r.segments.reduce((a, s) => a + s.len, 0);
    const n = Math.max(2, Math.ceil(total / 2.6));
    for (let i = 0; i <= n; i++) {
      let t = (i / n) * total;
      let seg = r.segments[0];
      for (const s of r.segments) { seg = s; if (t <= s.len) break; t -= s.len; }
      const p = seg.a.clone().addScaledVector(seg.dir, Math.min(t, seg.len));
      const gy = course.heightAt(p.x, p.z);
      const h = p.y - gy - (r.kind === 'box' ? 0.28 : 0.08);
      if (h < 0.05) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h + 0.4, 6), leg);
      post.position.set(p.x, gy + (h - 0.4) / 2, p.z);
      post.castShadow = true;
      scene.add(post);
    }
  }
}

// ---------- lights ----------

export function buildWorld(scene, course, props = {}) {
  const sunDir = new THREE.Vector3(-0.45, 0.62, 0.42).normalize();
  scene.background = new THREE.Color('#cfe1f3');
  scene.fog = new THREE.Fog('#d7e5f3', 160, 1150);

  const hemi = new THREE.HemisphereLight('#c4dcff', '#f1f4f8', 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2df', 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  buildSky(scene, sunDir);
  buildMountains(scene);
  buildTerrain(course, scene);
  buildTrees(course, scene, props);
  buildCamps(course, scene, props);
  buildFences(course, scene);
  buildKickerDetails(course, scene, props);
  buildRails(course, scene);
  buildGate(course, scene, 2, 'SNOWDAY', '#ff5a1f');
  buildGate(course, scene, FINISH_D, 'FINISH', '#1f6fff');

  const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
  return {
    sun, sunDir,
    setShadowQuality(high) {
      const size = high ? 2048 : 1024;
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    },
    follow(p) {
      // keep the shadow frustum centered on the rider, snapped to texels to avoid shimmer
      const t = (sc.right - sc.left) / sun.shadow.mapSize.x || texel;
      const cx = Math.round(p.x / t) * t, cy = Math.round(p.y / t) * t, cz = Math.round(p.z / t) * t;
      sun.target.position.set(cx, cy, cz);
      sun.position.set(cx + sunDir.x * 100, cy + sunDir.y * 100, cz + sunDir.z * 100);
    },
  };
}
