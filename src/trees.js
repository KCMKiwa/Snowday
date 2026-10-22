// Realistic firs from photoscanned textures (Poly Haven fir_tree_01, CC0): a tapered
// bark trunk plus whorls of drooping branch cards cut from the scanned twig atlas.
// Card normals are bent outward so the crown shades like a volume, and snow settles
// on the upward-facing needles in the shader. Two detail levels per shape.
import * as THREE from 'three';

// Twig regions in the atlas (u0, v0, u1, v1), stem at v0, tip at v1.
const TWIGS = [
  [0.312, 0.223, 0.645, 0.6],
  [0.64, 0.17, 0.957, 0.545],
  [0.66, 0.63, 0.934, 0.957],
  [0.19, 0.69, 0.42, 0.95],
];

const loader = new THREE.TextureLoader();
let mats = null;
function materials() {
  if (mats) return mats;
  const tex = (f, srgb) => { const t = loader.load(f); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const bark = tex('assets/textures/fir_bark.jpg', true), barkN = tex('assets/textures/fir_bark_nor.jpg');
  for (const t of [bark, barkN]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  const needles = new THREE.MeshStandardMaterial({
    map: tex('assets/textures/fir_twig.png', true), normalMap: tex('assets/textures/fir_twig_nor.jpg'),
    alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, alphaToCoverage: true,
  });
  needles.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSnow;\nvarying float vSnow;\nvarying vec3 vTreeW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnow = aSnow;\nvTreeW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSnow;\nvarying vec3 vTreeW;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // clumps of snow lying on the needles, thicker on the outer, upper twigs
  float n = fract(sin(dot(floor(vTreeW * 7.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float snow = smoothstep(0.25, 0.75, vSnow + (n - 0.5) * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.78, 0.9, 0.82), vec3(0.93, 0.96, 1.0), snow);
}`);
  };
  needles.customProgramCacheKey = () => 'fir-needles';
  // shadows must respect the cut-out needles
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: needles.map, alphaTest: 0.42, side: THREE.DoubleSide });
  mats = { bark: new THREE.MeshStandardMaterial({ map: bark, normalMap: barkN, roughness: 0.95 }), needles, depth };
  return mats;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Unit-height fir (1 = top); scaled per instance. lod 0 = near detail, 1 = far.
function firGeometry(seed, lod) {
  const r = rng(seed);
  const pos = [], nor = [], uv = [], snow = [], idx = [];
  const H = 1, crownBase = 0.12 + r() * 0.06, maxR = 0.27 + r() * 0.06;
  const whorls = lod ? 9 : 16;
  const quad = (corners, normal, snowOf) => {
    const base = pos.length / 3;
    for (const [p, u, v, b] of corners) { pos.push(p.x, p.y, p.z); nor.push(normal.x, normal.y, normal.z); uv.push(u, v); snow.push(snowOf(b)); }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  };
  const card = (cx, cy, cz, dirX, dirZ, len, wid, droop, roll, twig, snowAmt) => {
    // card axes: along the branch (drooping), across it (rolled), its normal
    const along = new THREE.Vector3(dirX, -Math.sin(droop), dirZ).normalize();
    const flat = new THREE.Vector3(-dirZ, 0, dirX);
    const up = new THREE.Vector3().crossVectors(flat, along).normalize();
    const across = flat.clone().multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll)).normalize();
    const normal = new THREE.Vector3().crossVectors(across, along).normalize();
    if (normal.y < 0) normal.negate();
    // bend the shading normal outward from the trunk so the crown reads as a volume
    const bent = normal.clone().multiplyScalar(0.45).add(new THREE.Vector3(dirX, 0.35, dirZ)).normalize();
    // the atlas twigs grow along v (stem at v0), so v runs out along the branch
    const [u0, v0, u1, v1] = TWIGS[twig];
    const at = (a, b) => new THREE.Vector3(cx, cy, cz).addScaledVector(across, a * wid).addScaledVector(along, b * len);
    quad([[at(-0.5, 0), u0, v0, 0], [at(0.5, 0), u1, v0, 0], [at(-0.5, 1), u0, v1, 1], [at(0.5, 1), u1, v1, 1]],
      bent, (b) => snowAmt * (0.4 + 0.6 * b) * Math.max(0, normal.y));
  };
  for (let k = 0; k < whorls; k++) {
    const t = k / whorls;
    const y = crownBase + (H - crownBase - 0.06) * Math.pow(t, 0.92);
    const L = maxR * Math.pow(1 - t, 1.05) + 0.03;
    const n = Math.max(4, Math.round((lod ? 6 : 8) - t * 3));
    const droop = 0.45 - t * 0.25 + (r() - 0.5) * 0.1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.6 + k * 1.3;
      const dx = Math.cos(a), dz = Math.sin(a);
      const twig = Math.floor(r() * 3);
      const snowAmt = 0.55 + r() * 0.45;
      // main frond and a second one rolled against it for depth
      card(dx * 0.008, y, dz * 0.008, dx, dz, L * 1.08, L * 0.85, droop, (r() - 0.5) * 0.5, twig, snowAmt);
      if (!lod || i % 2 === 0) card(dx * L * 0.25, y - L * 0.06, dz * L * 0.25, dx, dz, L * 0.8, L * 0.7, droop + 0.15, 0.9 + r() * 0.3, (twig + 1) % 3, snowAmt * 0.8);
    }
  }
  // spire: crossed upright cards at the top
  const [u0, v0, u1, v1] = TWIGS[3];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI, w = 0.07, h = 0.18;
    const ax = Math.cos(a) * w, az = Math.sin(a) * w;
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    quad([[P(-ax, H - h, -az), u0, v0, 0], [P(ax, H - h, az), u1, v0, 0], [P(-ax, H, -az), u0, v1, 1], [P(ax, H, az), u1, v1, 1]],
      new THREE.Vector3(0, 1, 0), () => 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSnow', new THREE.Float32BufferAttribute(snow, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function trunkGeometry() {
  // stops inside the crown so no bare pole shows above the spire
  const g = new THREE.CylinderGeometry(0.0015, 0.022, 0.8, 8, 4, true);
  g.translate(0, 0.4, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 6);
  return g;
}

// Shapes: several seeds, each at two levels of detail.
let shapes = null;
export function firShapes() {
  if (shapes) return shapes;
  const m = materials();
  shapes = [11, 23, 37, 58].map((seed) => ({
    near: firGeometry(seed, 0), far: firGeometry(seed, 1), trunk: trunkGeometry(), mats: m,
  }));
  return shapes;
}

// Add instanced firs for a list of [x, y, z, height, rotY] at the given detail.
export function addFirs(root, items, lod, { shadows = true } = {}) {
  const S = firShapes();
  const groups = S.map(() => []);
  items.forEach((it, i) => groups[i % S.length].push(it));
  const dummy = new THREE.Object3D();
  groups.forEach((list, si) => {
    if (!list.length) return;
    const shape = S[si];
    const crown = new THREE.InstancedMesh(lod ? shape.far : shape.near, shape.mats.needles, list.length);
    const trunk = new THREE.InstancedMesh(shape.trunk, shape.mats.bark, list.length);
    list.forEach(([x, y, z, h, rot, lean], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(lean ?? 0, rot, 0);
      dummy.scale.set(h * (0.9 + (i % 5) * 0.05), h, h * (0.9 + (i % 3) * 0.06));
      dummy.updateMatrix();
      crown.setMatrixAt(i, dummy.matrix);
      trunk.setMatrixAt(i, dummy.matrix);
    });
    crown.customDepthMaterial = shape.mats.depth;
    crown.castShadow = shadows; trunk.castShadow = shadows;
    crown.receiveShadow = true; trunk.receiveShadow = true;
    crown.computeBoundingSphere(); trunk.computeBoundingSphere();
    root.add(crown, trunk);
  });
}
