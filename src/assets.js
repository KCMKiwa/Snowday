// Loads the downloaded CC0 models (KayKit characters, Kenney props).
// Every load is optional: if a file fails, the game falls back to procedural meshes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const CHARACTERS = [
  { id: 'rogue_hooded', name: 'Hood', file: 'assets/characters/rogue_hooded.glb' },
  { id: 'rogue', name: 'Rogue', file: 'assets/characters/rogue.glb' },
  { id: 'knight', name: 'Knight', file: 'assets/characters/knight.glb' },
  { id: 'barbarian', name: 'Barbar', file: 'assets/characters/barbarian.glb' },
  { id: 'mage', name: 'Mage', file: 'assets/characters/mage.glb' },
];

const PROPS = {
  forest: 'assets/props/forest.glb',
  treesTall: 'assets/props/trees-tall.glb',
  tents: 'assets/props/tents.glb',
  flag: 'assets/props/flag.glb',
};

const loader = new GLTFLoader();
const cache = new Map();

// Hosts that cannot serve .glb get the same bytes base64-wrapped in .glb.json
// (opt in with window.SNOWDAY_ASSET_FORMAT = 'json').
const JSON_ASSETS = typeof window !== 'undefined' && window.SNOWDAY_ASSET_FORMAT === 'json';

async function fetchWrapped(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const { glb } = await res.json();
  const bin = atob(glb);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Promise((resolve, reject) => loader.parse(bytes.buffer, '', resolve, reject));
}

export function loadGLB(url) {
  if (!cache.has(url)) {
    cache.set(url, JSON_ASSETS
      ? fetchWrapped(url + '.json')
      : new Promise((resolve, reject) => loader.load(url, (g) => resolve(g), undefined, reject)));
  }
  return cache.get(url);
}

export async function loadCharacter(index) {
  const c = CHARACTERS[index] ?? CHARACTERS[0];
  const g = await loadGLB(c.file);
  return g.scene;
}

export async function loadProps(onProgress = () => {}) {
  const entries = Object.entries(PROPS);
  let done = 0;
  const results = await Promise.allSettled(entries.map(([, url]) => loadGLB(url).finally(() => onProgress(++done / entries.length))));
  const props = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') props[entries[i][0]] = r.value.scene;
    else console.warn('Modell nicht geladen:', entries[i][1], r.reason);
  });
  return props;
}

// Collect the meshes of a loaded prop as baked geometries (world transform applied),
// so they can be drawn with InstancedMesh.
export function bakeMeshes(root) {
  root.updateMatrixWorld(true);
  const out = [];
  root.traverse((o) => {
    if (o.isMesh) {
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      out.push({ geometry: g, material: o.material });
    }
  });
  return out;
}

export function boundsOf(root) {
  return new THREE.Box3().setFromObject(root);
}
