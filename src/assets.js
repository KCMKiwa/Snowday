// Loads the downloaded models (Rocketbox riders and mocap, Poly Haven scans, Kenney props).
// Every load is optional: if a file fails, the game falls back to procedural meshes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Microsoft Rocketbox avatars (MIT), dressed as snowboarders in rider.js.
// hat: each rider's own winter hat (see hats.js); anim: which mocap set (Rocketbox, MIT) they use in the menu.
export const CHARACTERS = [
  { id: 'kai', name: 'Kai', file: 'assets/characters/riders/kai.glb', anim: 'male', hat: { style: 'fisherman', label: 'Fisherman Beanie', color: '#1d2b4f', stripe: '#d9a23a' } },
  { id: 'mia', name: 'Mia', file: 'assets/characters/riders/mia.glb', anim: 'female', hat: { style: 'pom', label: 'Bommelmütze', color: '#efe8dc', color2: '#c9b9a2', goggles: '#5fe3ff' } },
  { id: 'ryo', name: 'Ryo', file: 'assets/characters/riders/ryo.glb', anim: 'male', hat: { style: 'chullo', label: 'Chullo mit Ohrenklappen', color: '#a8322a', color2: '#f0e4cc' } },
  { id: 'zoe', name: 'Zoe', file: 'assets/characters/riders/zoe.glb', anim: 'female', hat: { style: 'trapper', label: 'Fellmütze', color: '#6b4630', color2: '#efe6da', goggles: '#ff3d7f' } },
  { id: 'theo', name: 'Theo', file: 'assets/characters/riders/theo.glb', anim: 'male', hat: { style: 'beanie', label: 'Rippbeanie', color: '#e8641e', goggles: '#ffa630' } },
  { id: 'lena', name: 'Lena', file: 'assets/characters/riders/lena.glb', anim: 'female', hat: { style: 'slouch', label: 'Slouch Beanie', color: '#7a2533', goggles: '#d7ff3a' } },
];
const ANIMS = { male: 'assets/characters/anims/male.glb', female: 'assets/characters/anims/female.glb' };

const W = (f) => `assets/props/winter/${f}.glb`;
const SCAN = (f) => `assets/props/scan/${f}.glb`;
const PROPS = {
  tents: 'assets/props/tents.glb',
  flag: 'assets/props/flag.glb',
  // Poly Haven photoscans (CC0), decimated for the game
  rockScan: SCAN('rock_07'), cliffA: SCAN('rock_face_01'), cliffB: SCAN('rock_face_02'),
  trunkScan: SCAN('dead_tree_trunk'), stumpScan: SCAN('tree_stump_01'),
  // Kenney Holiday Kit (CC0)
  snowman: W('snowman'), snowmanHat: W('snowman-hat'), snowPile: W('snow-pile'), snowBunker: W('snow-bunker'),
  sled: W('sled'), lantern: W('lantern'), bench: W('bench'), reindeer: W('reindeer'),
  cabinWall: W('cabin-wall'), cabinCorner: W('cabin-corner'), cabinWindow: W('cabin-window-a'), cabinDoorway: W('cabin-doorway'),
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

// Mocap clips keep only rotations (plus the root's translation), so one set of
// animations fits every body without stretching its bones.
const clipCache = new Map();
async function loadClips(kind) {
  if (!clipCache.has(kind)) {
    clipCache.set(kind, loadGLB(ANIMS[kind]).then((g) => g.animations.map((clip) => {
      const c = clip.clone();
      c.tracks = c.tracks.filter((t) => !t.name.startsWith('Bip01_Footsteps') && (t.name.endsWith('.quaternion') || t.name === 'Bip01.position'));
      return c;
    })).catch((err) => { console.warn('Animationen nicht geladen', err); return []; }));
  }
  return clipCache.get(kind);
}

export async function loadCharacter(index) {
  const c = CHARACTERS[index] ?? CHARACTERS[0];
  const [g, clips] = await Promise.all([loadGLB(c.file), loadClips(c.anim)]);
  return { scene: g.scene, info: { ...c, clips } };
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
