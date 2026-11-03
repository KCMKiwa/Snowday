import * as THREE from 'three';
import { Course } from './course.js';
import { MAPS, mapById } from './maps.js';
import { RiderPhysics, damp, clamp } from './physics.js';
import { TrickTracker, grabName, sideName, describeAir, offAxisName } from './tricks.js';
import { DESIGNS, statsToPhysics, drawBoardPreview } from './boards.js';
import { drawSkiPreview } from './skis.js';
import { RiderModel, OUTFITS } from './rider.js';
import { buildWorld } from './world.js';
import { Atmosphere } from './atmosphere.js';
import { SnowSpray, Snowfall, Tracks, Sparks, WindLines, ContactShadow } from './effects.js';
import { createPost } from './post.js';
import { Input, IDLE_INPUT } from './input.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { AudioFX } from './audio.js';
import { loadProps, loadCharacter, CHARACTERS } from './assets.js';
import { Wallet, ITEMS, flakesFor } from './shop.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('snowday.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('snowday.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// What the on-screen controls do (shown instead of the keyboard list on touch screens).
const TOUCH_KEYS = [
  ['Stick ← →', 'Carven · in der Luft drehen (wenig = langsam)'], ['Stick ↑', 'Tuck · in der Luft Frontflip'],
  ['Stick ↓', 'Bremsen · in der Luft Backflip'], ['Stick ↘ ↙', 'An der Kante schräg: Cork'], ['Stick ↗ ↖', 'An der Kante schräg: Bio (Board: Cork nach vorn)'],
  ['RODEO', 'Dazu halten: über Kopf, ↓ Rodeo, ↑ Misty'],
  ['POP', 'Halten = laden, loslassen = Absprung'], ['GRAB', 'Drücken, zum gewünschten Grab ziehen'],
  ['TAIL NOSE', 'Butter, Press auf dem Rail, Cartwheel / Lincoln Loop in der Luft (mit Spin: Flatspin)'], ['II', 'Pause'],
];

const KEYS = {
  board: [
    ['W', 'Tuck / Anschieben'], ['S', 'Bremsen · Skid'],
    ['A D', 'Carven'], ['Leertaste', 'Halten = laden, loslassen = Ollie'],
    ['A D Leertaste', 'Beim Laden aufdrehen = Spin ab der Kante'], ['A D', 'In der Luft: halten = drehen, loslassen = stoppen'],
    ['Q E', 'Tail / Nose Butter (+ A D drehen)'], ['E Leertaste', 'Nollie aus dem Nose Press'],
    ['W S', 'In der Luft: Front- / Backflip über die Kanten'], ['← →', 'In der Luft: Cartwheel'],
    ['A D + S', 'An der Kante: Cork (S halten = Double)'], ['A D + W', 'An der Kante: Cork nach vorn'],
    ['↑ A D S', 'An der Kante: Rodeo'], ['↑ A D W', 'An der Kante: Misty'], ['A D + ← →', 'An der Kante: Flatspin'],
    ['J K L', 'Indy · Mute · Melon'], ['U I O', 'Nose · Stalefish · Tail'],
    ['B N', 'Method · Japan'], ['W S', 'Auf dem Rail: Nose / Tail Press'],
  ],
  ski: [
    ['W', 'Hocke / Doppelstockschub'], ['S', 'Bremsen · Hockey Stop'],
    ['A D', 'Carven (Stockeinsatz)'], ['Leertaste', 'Halten = laden, loslassen = Absprung'],
    ['A D Leertaste', 'Beim Laden aufdrehen = Spin ab der Kante'], ['A D', 'In der Luft: halten = drehen, loslassen = stoppen'],
    ['Q E', 'Tail / Nose Butter (+ A D drehen)'], ['E Leertaste', 'Nollie aus dem Nose Press'],
    ['W S', 'In der Luft: Front- / Backflip'], ['← →', 'In der Luft: Lincoln Loop'],
    ['A D + S', 'An der Kante: Cork (S halten = Double)'], ['A D + W', 'An der Kante: Bio'],
    ['↑ A D S', 'An der Kante: Rodeo'], ['↑ A D W', 'An der Kante: Misty'], ['A D + ← →', 'An der Kante: Flatspin'],
    ['J K L', 'Safety · Mute · Critical'], ['U I O', 'Tip · Blunt · Tail'],
    ['B N', 'Truckdriver · Japan'], ['W S', 'Auf dem Rail: Nose / Tail Press'],
  ],
};

function boot(saved = {}, props = {}) {
  // ---------- renderer ----------
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // AgX keeps detail in bright snow where ACES flattens it to white
  renderer.toneMapping = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  // shaders are not read back for errors after compiling: that check makes every compile wait
  // for the GPU (a hitch whenever something new comes into view)
  renderer.debug.checkShaderErrors = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 5000);
  const post = createPost(renderer, scene, camera);
  const settings = {
    map: saved.map ?? store.get('map', MAPS[0].id),
    assist: store.get('assist', true),
    board: saved.board ?? store.get('board', 0),
    outfit: saved.outfit ?? store.get('outfit', 0),
    character: saved.character ?? store.get('character', 0),
    // phones and tablets start on the lighter setting
    quality: store.get('quality', isTouchDevice() ? 'medium' : 'high'),
    gear: saved.gear ?? store.get('gear', 'board'),
    time: store.get('time', 'auto'),
    muted: store.get('muted', false),
  };
  // Flakes and what has been bought in the shop (what is in use counts as owned)
  const wallet = new Wallet(store, { designs: settings.board, outfits: settings.outfit });
  let course = new Course(mapById(settings.map));
  const atmo = new Atmosphere(scene);
  atmo.groundAt = (x, z) => course.heightAt(x, z);
  Object.defineProperty(atmo, 'valleyHalf', { get: () => course.parkHalf });
  let world = buildWorld(scene, course, props, atmo);
  const bestKey = () => (course.map.id === 'park' ? 'best' : `best.${course.map.id}`);
  let best = store.get(bestKey(), 0);

  const phys = new RiderPhysics(course);
  phys.assist = settings.assist;
  const rider = new RiderModel(DESIGNS[settings.board], OUTFITS[settings.outfit]);
  scene.add(rider.root);
  let charRequest = 0;
  let cheerOnLoad = false;
  let mode = 'menu';
  function applyCharacter() {
    const req = ++charRequest;
    loadCharacter(settings.character)
      .then((c) => { if (req === charRequest) { rider.setCharacter(c.scene, c.info); if (mode === 'menu' && cheerOnLoad) rider.cheer(); cheerOnLoad = false; } })
      .catch((err) => { console.warn('Figur nicht geladen, nutze prozeduralen Fahrer', err); rider.setCharacter(null); });
  }
  applyCharacter();
  const spray = new SnowSpray(scene);
  const snowfall = new Snowfall(scene);
  // one wide groove for a board; skis leave two narrow ones (second line)
  const tracks = new Tracks(scene);
  const tracks2 = new Tracks(scene);
  const allTracks = [tracks, tracks2];
  const sparks = new Sparks(scene);
  const wind = new WindLines(scene);
  const contactShadow = new ContactShadow(scene);
  const input = new Input();
  // On-screen controls on touch screens (also switched on by the first touch on a hybrid device).
  let touch = null;
  const enableTouch = () => {
    if (touch) return;
    document.body.classList.add('touch-on');
    touch = new TouchControls(input, { onPause: () => { if (mode === 'run') setMode('pause'); }, gear: () => settings.gear });
    touch.setVisible(mode === 'run');
    renderKeys();
  };
  const audio = new AudioFX();
  audio.muted = settings.muted;

  function applyEnv() {
    const env = world.env;
    atmo.setWeather(course.map.env, env);
    atmo.setTime(settings.time, course.map.time);
    atmo.setLamps(world.lamps);
    spray.setEnv(env);
    for (const t of allTracks) t.setEnv(env, atmo.lightDir);
    snowfall.setIntensity(env.snowfall);
  }
  applyEnv();

  function setMap(id) {
    if (id === course.map.id) return;
    world.dispose();
    course = new Course(mapById(id));
    world = buildWorld(scene, course, props, atmo);
    settings.map = course.map.id;
    store.set('map', settings.map);
    best = store.get(bestKey(), 0);
    phys.setCourse(course);
    phys.vel.set(0, 0, 0);
    for (const t of allTracks) t.reset();
    applyEnv();
    applyQuality();
    boardQuat.copy(phys.orientation(targetQuat));
    // (behind the map wipe) compile the new world's materials with and without floodlights
    atmo.warmLights(renderer, scene, camera);
  }

  // Render resolution: the quality setting caps the pixel ratio (1.5 is plenty with MSAA),
  // and an adaptive scale holds the frame rate: it steps down when frames take too long and
  // back up when there is room again.
  const perf = { scale: 1, ema: 16.7, t: 0 };
  const basePixelRatio = () => Math.min(window.devicePixelRatio || 1, settings.quality === 'high' ? 1.25 : 1);
  function applyPixelRatio() {
    renderer.setPixelRatio(basePixelRatio() * perf.scale);
    resize();
  }
  function adaptResolution(rawDt) {
    if (rawDt <= 0 || rawDt > 0.25) return; // a hidden tab or a hitch, not the steady frame time
    perf.ema += (rawDt * 1000 - perf.ema) * 0.06;
    perf.t += rawDt;
    if (perf.t < 1.2) return;
    let next = perf.scale;
    if (perf.ema > 20) next = Math.max(0.5, perf.scale * 0.85);
    else if (perf.ema < 14 && perf.scale < 1) next = Math.min(1, perf.scale * 1.12);
    perf.t = next === perf.scale ? 0.6 : 0;
    if (next !== perf.scale) { perf.scale = next; applyPixelRatio(); }
  }

  function applyQuality() {
    const high = settings.quality === 'high';
    perf.scale = 1;
    renderer.setPixelRatio(basePixelRatio());
    atmo.setShadowQuality(high);
    renderer.shadowMap.type = high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    snowfall.points.visible = high && snowfall.intensity > 0.01;
    post.setEnabled(high);
    resize();
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    post.setSize(w, h, renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function applyBoard() {
    const d = DESIGNS[settings.board];
    phys.stats = statsToPhysics(d.stats);
    rider.setBoard(d);
  }
  applyBoard();
  function applyGear() {
    phys.gear = settings.gear;
    rider.setGear(settings.gear);
    for (const t of allTracks) t.reset();
  }
  applyGear();

  // ---------- HUD ----------
  const hud = {
    score: $('hudScore'), time: $('hudTime'), speed: $('hudSpeed'), progress: $('hudProgress'),
    live: $('hudLive'), combo: $('hudCombo'), chain: $('hudChain'), callout: $('hudCallout'),
    balance: $('hudBalance'), needle: $('hudNeedle'), help: $('hudHelp'),
  };
  const renderKeys = () => {
    const list = touch ? TOUCH_KEYS : KEYS[settings.gear];
    hud.help.innerHTML = `<p class="label">Steuerung</p><div class="keys">${list.map(([k, t]) => `<div>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')}<span>${t}</span></div>`).join('')}</div>`;
    $('keysList').innerHTML = hud.help.querySelector('.keys').innerHTML;
  };
  renderKeys();
  if (isTouchDevice()) enableTouch();
  window.addEventListener('touchstart', enableTouch, { once: true, passive: true });

  let calloutTimer = 0;
  function callout(text, cls) {
    hud.callout.textContent = text;
    hud.callout.className = 'callout';
    void hud.callout.offsetWidth;
    hud.callout.className = `callout show ${cls}`;
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => { hud.callout.className = 'callout'; }, 1200);
  }

  const run = { time: 0, crashes: 0, active: false };
  const tracker = new TrickTracker((type, p) => {
    if (type === 'trick') {
      hud.combo.innerHTML = `${p.total.toLocaleString('de-DE')} <b>×${p.mult}</b>`;
      hud.chain.textContent = p.combo.map((t) => t.name).join('  +  ');
      hud.live.textContent = p.trick.name;
    } else if (type === 'bank') {
      callout(`+${p.total.toLocaleString('de-DE')}`, 'bank');
      hud.score.textContent = p.runScore.toLocaleString('de-DE');
      hud.combo.textContent = ''; hud.chain.textContent = '';
      setTimeout(() => { if (!tracker.combo.length && phys.state !== 'air') hud.live.textContent = ''; }, 600);
      audio.chime(true);
    } else if (type === 'lost') {
      hud.combo.textContent = ''; hud.chain.textContent = '';
      hud.live.textContent = '';
    } else if (type === 'landing') {
      if (p.quality === 'clean') callout('Clean!', 'clean');
      else if (p.quality === 'sketchy') callout('Sketchy', 'sketchy');
    }
  });

  // ---------- camera ----------
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), shake: 0 };
  function snapCamera() {
    cam.dir.set(0, 0, -1);
    cam.heading = Math.PI;
    cam.pos.copy(phys.pos).add(new THREE.Vector3(0, 1.3, 4.3));
    cam.look.copy(phys.pos);
    cam.ry = phys.pos.y;
    cam.trick = cam.crash = 0;
    cam.grade = cam.pitch = cam.tilt = cam.floor = undefined;
  }
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  // Follow cam after cork7's close camera (its default rig): 4.3 m behind, 1.3 m above and a
  // little left of the rider at any speed. Only the heading and the height are smoothed, so
  // the rider never drifts away from the lens. The arm tips with the slope behind; the view
  // pitches with the slope ahead but always keeps the rider between the middle and the lower
  // part of the frame. On a big air it pulls out, up and to the side to show trick and
  // landing. Leans a little into carves, dips on landings, widens with speed.
  function updateCamera(dt) {
    const p = phys.pos, sp = phys.speed, air = phys.state === 'air', crash = phys.state === 'crash';
    if (!crash && sp > 1) {
      const want = Math.atan2(phys.vel.x, phys.vel.z);
      const turn = Math.atan2(Math.sin(want - cam.heading), Math.cos(want - cam.heading));
      cam.heading += turn * (1 - Math.exp(-(6 - 2.5 * Math.min(1, Math.abs(phys.lean))) * clamp((sp - 1) / 3, 0, 1) * dt));
    }
    const dir = cam.dir.set(Math.sin(cam.heading), 0, Math.cos(cam.heading));
    const hAt = (k) => course.heightAt(p.x + dir.x * k, p.z + dir.z * k);
    // the level it rides on: the snow averaged over a few metres on the ground (small bumps
    // stay out of the picture), the rider's own height in the air; at most 0.5 m off the rider
    const snow = air || crash ? p.y : Math.max((hAt(-2) + hAt(-1) + hAt(0) + hAt(1) + hAt(2)) / 5 + p.y - hAt(0), p.y - 0.15);
    cam.ry = clamp(damp(cam.ry ?? p.y, snow, air ? 14 : 8, dt), p.y - 0.5, p.y + 0.5);
    // big airs (more than about 1.3 s): the trick cam
    const big = air ? clamp((phys.airTime + phys.landAt.t - 1.3) / 0.7, 0, 1) * clamp(phys.landAt.t / 0.35, 0, 1) : 0;
    cam.trick = damp(cam.trick ?? 0, big, big > (cam.trick ?? 0) ? 3 : 5, dt);
    cam.crash = damp(cam.crash ?? 0, crash ? 1 : 0, 7, dt);
    const narrow = clamp(1.2 - camera.aspect, 0, 0.7); // phones held upright: a little further out
    const dist = (4.3 + 2.4 * cam.crash + narrow * 1.6) * (1 + 0.5 * cam.trick);
    const height = 1.3 + 1.1 * cam.crash + 1.6 * cam.trick;
    // the arm tips with the slope behind the rider (downhill: the camera stands higher)
    const grade = clamp((hAt(-dist) - hAt(0)) / dist, 0, 0.9);
    cam.grade = damp(cam.grade ?? grade, air ? cam.grade ?? grade : grade, 3, dt);
    const tilt = Math.atan(cam.grade), back = dist * Math.cos(tilt) - height * Math.sin(tilt), up = height * Math.cos(tilt) + dist * Math.sin(tilt);
    const side = 0.42 + 1.4 * cam.trick;
    const cx = p.x - dir.x * back + dir.z * side, cz = p.z - dir.z * back - dir.x * side;
    // never under the snow along the arm (a soft floor, so it does not bump)
    let floor = course.heightAt(cx, cz);
    for (let k = 1; k <= 8; k++) floor = Math.max(floor, course.heightAt(cx + dir.x * back * k / 8, cz + dir.z * back * k / 8));
    cam.floor = damp(cam.floor ?? floor + 0.6, floor + 0.6, 8, dt);
    const want = cam.ry + up, over = want - cam.floor;
    const cy = Math.max((want + cam.floor + Math.sqrt(over * over + 0.16)) / 2, course.heightAt(cx, cz) + 0.45);
    cam.pos.set(cx, cy, cz);
    // where it looks: the slope ahead (uphill only partly); in the air the grade at takeoff
    // turns toward the landing slope as the landing nears, and toward the drop when falling
    const run = Math.max(1, Math.hypot(phys.vel.x, phys.vel.z));
    if (air) {
      if (!cam.wasAir) cam.takeoff = cam.pitch ?? 0;
      const L = phys.landAt.p, total = phys.airTime + phys.landAt.t;
      const landSlope = clamp((course.heightAt(L.x + dir.x * 8, L.z + dir.z * 8) - L.y) / 8, -1.1, 1.1);
      const drop = clamp((L.y - p.y) / Math.max(4, Math.hypot(L.x - p.x, L.z - p.z)), -1.1, 0) * 0.6;
      let g = cam.takeoff + (landSlope - cam.takeoff) * clamp(phys.airTime / Math.max(0.25, total), 0, 1);
      g = Math.min(g, g + (drop - g) * clamp((-phys.vel.y - 2) / 6, 0, 1));
      cam.pitch = damp(cam.pitch ?? cam.takeoff, cam.takeoff + (g - cam.takeoff) * clamp((total - 0.6) / 0.6, 0, 1), 3, dt);
    } else {
      cam.pitch = damp(cam.pitch ?? 0, clamp(Math.max(phys.vel.y / run, 0.8 * (hAt(8) - hAt(0)) / 8), -1.1, 1.1), 3, dt);
    }
    cam.wasAir = air;
    const fast = clamp(sp / 30, 0, 1);
    const fov = 58 + 8 * fast * fast + narrow * 18 + 6 * cam.trick + (cam.kick ?? 0);
    cam.kick = damp(cam.kick ?? 0, 0, 4, dt);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
    const T = Math.tan(camera.fov * Math.PI / 360), flat = Math.max(0.5, Math.hypot(p.x - cx, p.z - cz));
    const at = (h) => Math.atan2(p.y + h - cy, flat); // angle up to a height on the rider
    let aim = Math.atan(clamp(Math.min(0, cam.pitch), -0.9, 0) + clamp(Math.max(0, cam.pitch), 0, 0.8) * 0.6);
    if (cam.trick > 0) {
      // the trick cam aims a third of the way toward the landing
      const L = phys.landAt.p;
      const mx = p.x + (L.x - p.x) * 0.35, mz = p.z + (L.z - p.z) * 0.35, my = p.y + 1 + (L.y - p.y - 1) * 0.35;
      aim += (Math.atan2(my - cy, Math.max(0.5, Math.hypot(mx - cx, mz - cz))) - aim) * cam.trick;
    }
    // the rider's head stays between a third above and half below the middle of the frame
    aim = clamp(aim, at(1) - Math.atan(T * 0.33), at(1) + Math.atan(T * 0.47));
    cam.tilt = cam.tilt === undefined ? aim : damp(cam.tilt, aim, air ? 5.5 : 10, dt);
    // and never leaves it: the whole rider in the picture
    const lo = Math.max(at(1) - Math.atan(T * 0.4), at(1.8) - Math.atan(T)), hi = Math.min(at(1) + Math.atan(T * 0.5), at(0) + Math.atan(T * 0.9));
    cam.tilt = lo <= hi ? clamp(cam.tilt, lo, hi) : (lo + hi) / 2;
    const lx = p.x + dir.x * 12, lz = p.z + dir.z * 12;
    cam.look.set(lx, cy + Math.tan(cam.tilt) * Math.max(0.5, Math.hypot(lx - cx, lz - cz)), lz);
    // landing dip: a spring that the impact kicks downward
    cam.dipV = (cam.dipV ?? 0) + (-(cam.dip ?? 0) * 120 - (cam.dipV ?? 0) * 14) * dt;
    cam.dip = (cam.dip ?? 0) + cam.dipV * dt;
    camera.position.copy(cam.pos);
    camera.position.y += cam.dip;
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 2.5);
      const t = performance.now() * 0.001;
      camera.position.x += Math.sin(t * 37) * cam.shake * 0.12;
      camera.position.y += Math.sin(t * 43 + 1.3) * cam.shake * 0.12;
    }
    camera.lookAt(cam.look);
    // lean into the carve
    cam.roll = damp(cam.roll ?? 0, phys.state === 'ground' ? -phys.lean * 0.06 : 0, 4, dt);
    camera.rotateZ(cam.roll);
  }
  let orbit = 0.8;
  let menuT = 0, menuShift = 1.25;
  function updateMenuCamera(dt) {
    // fixed three-quarter view with a slow drift; the rider turns to face it
    menuT += dt;
    orbit = 0.8 + Math.sin(menuT * 0.18) * 0.22;
    rider.menuYaw = Math.atan2(-Math.cos(0.8 + 0.35), Math.sin(0.8 + 0.35));
    const c = rider.root.position;
    const r = 4.6;
    camera.position.set(c.x + Math.sin(orbit) * r, c.y + 1.5, c.z + Math.cos(orbit) * r);
    // aim left of the rider so they stand in the right half of the screen, clear of the menu;
    // further over beside the wide locker and shop pages
    menuShift = damp(menuShift, camera.aspect > 1.1 ? (screen === 'locker' || screen === 'shop' ? 2.2 : 1.25) : 0, 5, dt);
    const shift = menuShift;
    tv.set(-Math.cos(orbit), 0, Math.sin(orbit)).multiplyScalar(shift);
    camera.lookAt(c.x + tv.x, c.y + 0.95, c.z + tv.z);
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  }
  // ---------- menu ----------
  const boardCanvas = $('boardCanvas');
  let showBase = false;
  const fmtN = (n) => n.toLocaleString('de-DE');
  // Trying on: in the locker and the shop the rider shows what is picked even before it is
  // bought (tryOn: an index, or null for what is equipped); a run always rides what is
  // equipped (settings).
  const tryOn = { designs: null, outfits: null };
  const shown = (kind) => tryOn[kind] ?? (kind === 'designs' ? settings.board : settings.outfit);
  function dressRider() {
    rider.setBoard(DESIGNS[shown('designs')]);
    rider.setOutfit(OUTFITS[shown('outfits')]);
  }
  function clearTryOn() {
    if (tryOn.designs === null && tryOn.outfits === null) return;
    tryOn.designs = tryOn.outfits = null;
    dressRider();
    renderBoardCard();
    renderOutfits();
    showRider();
  }
  // the price on a buy button, or how many Flakes are still missing
  const priceLabel = (kind, i) => {
    const p = wallet.price(kind, i);
    return wallet.flakes >= p ? `<b>${fmtN(p)} ❄</b> Kaufen` : `<b>${fmtN(p)} ❄</b> noch ${fmtN(p - wallet.flakes)}`;
  };
  function renderBoardCard() {
    const i = shown('designs'), d = DESIGNS[i], own = wallet.has('designs', i);
    if (settings.gear === 'ski') drawSkiPreview(boardCanvas, d);
    else drawBoardPreview(boardCanvas, d, showBase ? 'base' : 'top');
    $('flipBoard').hidden = settings.gear === 'ski';
    $('boardName').textContent = d.name;
    $('boardTag').textContent = d.tagline;
    const card = boardCanvas.closest('.board-card');
    card.style.setProperty('--board-accent', d.accent);
    card.classList.toggle('locked', !own);
    $('designBuy').hidden = own;
    if (!own) $('buyDesign').innerHTML = priceLabel('designs', i);
    $('boardStats').innerHTML = [['Speed', d.stats.speed], ['Pop', d.stats.pop], ['Spin', d.stats.spin]]
      .map(([k, v]) => `<dt>${k}</dt><dd aria-label="${v} von 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</dd>`).join('');
    $('boardDots').innerHTML = DESIGNS.map((_, j) => `<i class="${j === i ? 'on' : ''}${wallet.has('designs', j) ? '' : ' lock'}"></i>`).join('');
    $('flipBoard').textContent = showBase ? 'Oberseite zeigen' : 'Unterseite zeigen';
  }
  // The locker steps through every design: one that is owned is equipped, one that is not
  // is tried on, with its price to buy it right there.
  function selectBoard(delta) {
    const i = (shown('designs') + delta + DESIGNS.length) % DESIGNS.length;
    if (wallet.has('designs', i)) { tryOn.designs = null; equip('designs', i); } else { tryOn.designs = i; dressRider(); renderBoardCard(); }
    boardCanvas.classList.remove('from-left', 'from-right');
    void boardCanvas.offsetWidth;
    boardCanvas.classList.add(delta > 0 ? 'from-right' : 'from-left');
  }
  $('prevBoard').onclick = () => selectBoard(-1);
  $('nextBoard').onclick = () => selectBoard(1);
  $('flipBoard').onclick = () => { showBase = !showBase; renderBoardCard(); };
  $('buyDesign').onclick = (e) => buy('designs', shown('designs'), e.currentTarget);
  const ridersEl = $('riders');
  if (!CHARACTERS[settings.character]) settings.character = 0;
  // restart a CSS animation by toggling its class
  const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const showRider = () => {
    const c = CHARACTERS[settings.character], o = OUTFITS[shown('outfits')] ?? OUTFITS[0];
    $('riderBig').textContent = c.name;
    $('riderName').textContent = c.name;
    $('riderOutfit').textContent = `${o.name} · ${c.hat.label}`;
    $('chipRider').textContent = c.name;
    $('chipGear').textContent = settings.gear === 'ski' ? 'Ski' : 'Board';
    replay($('riderBig'), 'swap');
    replay($('riderName').parentElement, 'swap');
  };
  // every pressed tile / swatch / toggle gets a short pick flash
  $('menu').addEventListener('click', (e) => {
    const b = e.target.closest('.tile, .swatch, .seg button');
    if (b) requestAnimationFrame(() => { const now = b.closest('[id]')?.querySelector(`[data-i="${b.dataset.i}"], [data-id="${b.dataset.id}"], [data-a="${b.dataset.a}"], [data-q="${b.dataset.q}"]`) ?? b; replay(now, 'picked'); });
  });
  ridersEl.innerHTML = CHARACTERS.map((c, i) => `<button class="tile" data-i="${i}" aria-pressed="${i === settings.character}"><i>${String(i + 1).padStart(2, '0')}</i><span>${c.name}</span></button>`).join('');
  const outfitsEl = $('outfits');
  // An outfit not bought yet is shown striped; picking it tries it on, with its price to
  // buy it right there.
  const renderOutfits = () => {
    const cur = shown('outfits');
    outfitsEl.innerHTML = OUTFITS.map((o, i) => {
      const own = wallet.has('outfits', i);
      const state = !own ? `${fmtN(wallet.price('outfits', i))} ❄` : i === settings.outfit ? 'Angezogen' : 'Anziehen';
      const label = own ? o.name : `${o.name}: ${fmtN(wallet.price('outfits', i))} Flakes`;
      return `<button class="fit-card${own ? '' : ' locked'}" data-i="${i}" aria-label="${label}" title="${label}" aria-pressed="${i === cur}">`
        + `<span class="fit" style="--h:${o.helmet};--l:${o.lens};--j:${o.jacket};--a:${o.accent};--p:${o.pants}"><i class="j"></i><i class="p"></i><i class="h"></i><i class="l"></i></span>`
        + `<b>${o.name}</b><small>${state}</small></button>`;
    }).join('');
    const own = wallet.has('outfits', cur);
    $('outfitBuy').hidden = own;
    if (!own) { $('outfitLock').textContent = OUTFITS[cur].name; $('buyOutfit').innerHTML = priceLabel('outfits', cur); }
  };
  renderOutfits();
  outfitsEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = +b.dataset.i;
    if (wallet.has('outfits', i)) { tryOn.outfits = null; equip('outfits', i); } else { tryOn.outfits = i; dressRider(); renderOutfits(); showRider(); }
  };
  $('buyOutfit').onclick = (e) => buy('outfits', shown('outfits'), e.currentTarget);
  // Buy item i (from the locker or the shop) and wear it, or say what is missing.
  function buy(kind, i, btn) {
    const owned = wallet.has(kind, i);
    if (!owned && !wallet.buy(kind, i)) {
      toast(`Noch ${fmtN(wallet.price(kind, i) - wallet.flakes)} ❄ Flakes: jeder Run, der unten ankommt, bringt welche.`);
      replay(btn, 'nope');
      return false;
    }
    tryOn[kind] = null;
    equip(kind, i);
    if (!owned) { showFlakes(true); toast(`${ITEMS[kind][i].name} gehört jetzt dir!`); }
    return true;
  }
  let toastT = 0;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    replay(t, 'show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function equip(kind, i) {
    if (kind === 'designs') {
      settings.board = i;
      store.set('board', i);
      applyBoard();
      renderBoardCard();
    } else {
      settings.outfit = i;
      store.set('outfit', i);
      rider.setOutfit(OUTFITS[i]);
      renderOutfits();
      showRider();
    }
  }
  showRider();
  ridersEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    cheerOnLoad = true;
    settings.character = +b.dataset.i;
    store.set('character', settings.character);
    applyCharacter();
    ridersEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.i === settings.character)));
    showRider();
  };
  const qEl = $('quality');
  const syncQuality = () => qEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === settings.quality)));
  qEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.quality = b.dataset.q;
    store.set('quality', settings.quality);
    syncQuality();
    applyQuality();
  };
  syncQuality();
  const showBest = () => { $('menuBest').textContent = best ? `Bester Run auf ${course.map.name}: ${best.toLocaleString('de-DE')} Punkte` : `Noch kein Run auf ${course.map.name}`; };
  const mapsEl = $('maps');
  const renderMaps = () => {
    mapsEl.innerHTML = MAPS.map((m) => {
      const record = store.get(m.id === 'park' ? 'best' : `best.${m.id}`, 0);
      return `<button class="tile map-card" data-id="${m.id}" data-env="${m.env}" aria-pressed="${m.id === course.map.id}">`
        + `<span class="map-name">${m.name}</span><small>${m.length} m · ${m.slope}° · ${m.tags.slice(2, 4).join(' · ')}</small>`
        + `<small class="map-best">${record ? `Rekord ${record.toLocaleString('de-DE')}` : 'Noch kein Run'}</small></button>`;
    }).join('');
    $('mapMeta').innerHTML = course.map.tags.map((t) => `<span>${t}</span>`).join('');
  };
  // A map change rebuilds the whole world: cover it with a slash wipe, swap while covered.
  const wipe = $('wipe');
  mapsEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.id === course.map.id) return;
    $('wipeName').textContent = MAPS.find((m) => m.id === b.dataset.id).name;
    replay(wipe, 'go');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { setMap(b.dataset.id); renderMaps(); showBest(); }, reduce ? 0 : 480);
    setTimeout(() => wipe.classList.remove('go'), reduce ? 50 : 1250);
  };
  const assistEl = $('assist');
  const syncAssist = () => assistEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.a === 'on') === settings.assist)));
  assistEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.assist = b.dataset.a === 'on';
    phys.assist = settings.assist;
    store.set('assist', settings.assist);
    syncAssist();
  };
  syncAssist();
  const gearEl = $('gear');
  const syncGear = () => gearEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === settings.gear)));
  gearEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.g === settings.gear) return;
    settings.gear = b.dataset.g;
    store.set('gear', settings.gear);
    applyGear();
    syncGear();
    renderKeys();
    renderBoardCard();
    showRider();
    if (mode === 'menu') rider.cheer();
  };
  syncGear();
  const timeEl = $('daytime');
  const syncTime = () => timeEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === settings.time)));
  timeEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.time = b.dataset.t;
    store.set('time', settings.time);
    atmo.setTime(settings.time, course.map.time);
    syncTime();
  };
  syncTime();

  // ---------- shop ----------
  const shopGrid = $('shopGrid'), tabsEl = $('shopTabs');
  let shopTab = 'designs';
  const showFlakes = (bump = false) => {
    $('flakes').textContent = fmtN(wallet.flakes);
    if (bump) replay($('flakes').parentElement, 'bump');
  };
  showFlakes();
  const syncTabs = () => tabsEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === shopTab)));
  // One card per design or outfit: its art, name, and buy / equip. Clicking a card tries it
  // on (the rider stands beside the shop).
  function renderShop(fresh = false) {
    const kind = shopTab, inUse = kind === 'designs' ? settings.board : settings.outfit;
    shopGrid.innerHTML = ITEMS[kind].map((it, i) => {
      const owned = wallet.has(kind, i), price = wallet.price(kind, i);
      const state = i === inUse ? 'equipped' : owned ? 'owned' : 'locked';
      const art = kind === 'designs'
        ? '<canvas width="440" height="110"></canvas>'
        : `<div class="fit" style="--h:${it.helmet};--l:${it.lens};--j:${it.jacket};--a:${it.accent};--p:${it.pants}"><i class="j"></i><i class="p"></i><i class="h"></i><i class="l"></i></div>`;
      const btn = state === 'equipped' ? '<button class="buy" disabled>In Benutzung</button>'
        : state === 'owned' ? '<button class="buy equip">Ausrüsten</button>'
          : `<button class="buy${wallet.flakes >= price ? '' : ' short'}">${priceLabel(kind, i)}</button>`;
      const tag = kind === 'designs' ? it.tagline : 'Jacke, Hose, Helm und Goggles';
      const trying = tryOn[kind] === i ? ' trying' : '';
      return `<article class="item${trying}" data-i="${i}" data-state="${state}" style="--item:${kind === 'designs' ? it.accent : it.jacket};--n:${i}"><div class="item-art">${art}</div><b class="item-name">${it.name}</b><p class="item-tag">${tag}</p>${btn}</article>`;
    }).join('');
    if (kind === 'designs') {
      shopGrid.querySelectorAll('canvas').forEach((cv, i) => (settings.gear === 'ski' ? drawSkiPreview(cv, DESIGNS[i]) : drawBoardPreview(cv, DESIGNS[i], 'top')));
    }
    shopGrid.classList.toggle('fresh', fresh);
    showFlakes();
  }
  shopGrid.onclick = (e) => {
    const card = e.target.closest('.item');
    if (!card) return;
    const kind = shopTab, i = +card.dataset.i, b = e.target.closest('button.buy');
    if (b) {
      if (b.disabled) return;
      const owned = wallet.has(kind, i);
      if (!buy(kind, i, b)) return;
      renderShop();
      if (!owned) replay(shopGrid.querySelector(`.item[data-i="${i}"]`), 'bought');
      return;
    }
    // the card itself: try it on (again: back to what is equipped)
    tryOn[kind] = tryOn[kind] === i || i === (kind === 'designs' ? settings.board : settings.outfit) ? null : i;
    dressRider();
    renderShop();
  };
  tabsEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.tab === shopTab) return;
    shopTab = b.dataset.tab;
    syncTabs();
    renderShop(true);
  };
  $('toShop').onclick = () => { shopTab = 'designs'; syncTabs(); showScreen('shop'); };

  // ---------- menu screens: home (Play, Locker, Shop) and a page for each ----------
  const menuEl = $('menu');
  const screens = { home: $('scrHome'), play: $('scrPlay'), locker: $('scrLocker'), shop: $('scrShop') };
  const navBtns = [...$('homeNav').querySelectorAll('.nav-btn')];
  let screen = 'home', navI = 0;
  const HINTS = {
    home: [['↑ ↓', 'Wählen'], ['Enter', 'Öffnen']],
    play: [['Enter', 'Droppen'], ['Esc', 'Zurück']],
    locker: [['← →', 'Design'], ['Esc', 'Zurück']],
    shop: [['Esc', 'Zurück']],
  };
  function showScreen(name) {
    clearTryOn();
    screen = name;
    menuEl.dataset.screen = name;
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
    $('playCta').hidden = name !== 'play';
    $('menuHints').innerHTML = HINTS[name].map(([k, t]) => `<span>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')} ${t}</span>`).join('');
    if (name === 'shop') renderShop(true);
    if (name === 'locker') { renderBoardCard(); renderOutfits(); }
    (name === 'home' ? navBtns[navI] : screens[name]).focus({ preventScroll: true });
  }
  const setNav = (i) => {
    navI = (i + navBtns.length) % navBtns.length;
    navBtns.forEach((b, j) => b.setAttribute('aria-current', String(j === navI)));
  };
  navBtns.forEach((b, i) => {
    b.addEventListener('pointerenter', () => setNav(i));
    b.addEventListener('focus', () => setNav(i));
    b.onclick = () => showScreen(b.dataset.go);
  });
  menuEl.querySelectorAll('.back').forEach((b) => { b.onclick = () => showScreen('home'); });

  // ---------- game state ----------
  function setMode(m) {
    mode = m;
    // off the board: mocap idles in the menu, a celebration on the results screen
    rider.setMenuMode(m === 'menu' || m === 'results');
    $('menu').hidden = m !== 'menu';
    $('hud').hidden = !(m === 'run' || m === 'pause' || m === 'results');
    $('pause').hidden = m !== 'pause';
    $('results').hidden = m !== 'results';
    touch?.setVisible(m === 'run');
    if (m === 'menu') { showScreen('home'); renderBoardCard(); renderMaps(); showBest(); showFlakes(); phys.restart(); phys.vel.set(0, 0, 0); for (const t of allTracks) t.reset(); }
  }

  function startRun() {
    // on a phone: full screen and landscape where the browser allows it (needs this tap)
    if (touch && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    }
    audio.init();
    audio.setMuted(settings.muted);
    phys.restart();
    tracker.reset();
    for (const t of allTracks) t.reset();
    run.time = 0; run.crashes = 0; run.active = true;
    hud.score.textContent = '0';
    hud.live.textContent = ''; hud.combo.textContent = ''; hud.chain.textContent = '';
    snapCamera();
    setMode('run');
    callout('Drop in!', 'bank');
  }

  function finishRun() {
    tracker.bank();
    run.active = false;
    const score = tracker.runScore;
    const isBest = score > best;
    if (isBest) { best = score; store.set(bestKey(), best); }
    setTimeout(() => { if (isBest && score > 0) rider.cheer(); }, 1600);
    $('resScore').textContent = score.toLocaleString('de-DE');
    // Flakes for the shop, for every run that gets to the bottom
    const flakes = flakesFor(score);
    wallet.earn(flakes);
    $('resFlakes').innerHTML = `<b>+${fmtN(flakes)} ❄</b>Flakes`;
    $('resBest').innerHTML = isBest && score > 0 ? '<span class="newbest">Neuer Rekord</span>' : '';
    $('resTime').textContent = fmtTime(run.time, false);
    $('resTricks').textContent = tracker.landed.length;
    $('resCrashes').textContent = run.crashes;
    const top = [...tracker.landed].sort((a, b) => b.points - a.points).slice(0, 5);
    $('resList').innerHTML = top.length
      ? top.map((t) => `<li><span>${esc(t.name)}</span><span>${t.points.toLocaleString('de-DE')}</span></li>`).join('')
      : '<li><span>Keine Tricks gestanden. Space laden, über die Kante loslassen!</span><span></span></li>';
    setTimeout(() => { if (mode === 'run') setMode('results'); }, 1400);
  }

  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmtTime = (t, tenth = true) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${(tenth ? s.toFixed(1) : Math.floor(s).toString()).padStart(tenth ? 4 : 2, '0')}`;
  };

  $('startBtn').onclick = startRun;
  $('againBtn').onclick = startRun;
  $('resumeBtn').onclick = () => setMode('run');
  $('restartBtn').onclick = startRun;
  $('menuBtn').onclick = () => setMode('menu');
  $('resMenuBtn').onclick = () => setMode('menu');

  // ---------- events → effects ----------
  const sideVec = new THREE.Vector3(), boardQuat = new THREE.Quaternion(), targetQuat = new THREE.Quaternion();
  function handleEvents() {
    for (const e of phys.events) {
      tracker.handle(e);
      if (e.type === 'land') {
        const strength = e.impact;
        spray.emit(phys.pos, tv.copy(phys.vel).multiplyScalar(0.3), 28 + Math.min(40, strength * 4), 3.2, 0.26, 1.0);
        audio.thud(strength);
        cam.shake = Math.min(0.6, strength / 20);
        cam.dipV = (cam.dipV ?? 0) - Math.min(2.2, strength * 0.18);
        if (e.quality === 'clean' && (e.spinDeg >= 180 || e.flips || e.rolls || e.grabs.length)) { post.punch(0.8); cam.kick = 2.5; }
        for (const t of allTracks) t.breakLine();
      } else if (e.type === 'crash') {
        run.crashes++;
        callout('Crash', 'crash');
        audio.chime(false);
        // the visible board jumps straight to its fallen orientation: slerping from a
        // mid-flip angle would sweep the body through the snow
        boardQuat.copy(phys.orientation(targetQuat));
        cam.shake = 0.5;
        spray.emit(phys.pos, tv.copy(phys.vel).multiplyScalar(0.3), 30, 3, 0.26, 1.0);
        for (const t of allTracks) t.breakLine();
      } else if (e.type === 'impact') {
        // the body hits the snow
        audio.thud(8 + e.slam * 8);
        cam.shake = 0.7 + e.slam * 0.5;
        cam.dipV = (cam.dipV ?? 0) - 0.8 - e.slam;
        spray.emit(phys.pos, tv.copy(phys.vel).multiplyScalar(0.35), 50 + e.slam * 40, 3.6, 0.32, 1.2);
      } else if (e.type === 'takeoff') {
        for (const t of allTracks) t.breakLine();
        if (e.kind !== 'rail') spray.emit(phys.pos, tv.copy(phys.vel).multiplyScalar(0.2), 14, 1.5, 0.18, 0.7);
      } else if (e.type === 'grindStart') {
        if (phys.grind) hud.live.textContent = grindLabel(phys.grind);
        audio.thud(3);
        spray.emit(phys.pos, tv.set(0, 1.2, 0), 8, 1.2, 0.1, 0.4, 0.3);
      } else if (e.type === 'butterStart') {
        hud.live.textContent = e.kind === 'nose' ? 'Nose Butter' : 'Tail Butter';
      } else if (e.type === 'respawn') {
        // after a fall the rider has already stood up facing downhill: no snap
        for (const t of allTracks) t.breakLine();
      } else if (e.type === 'finish' && mode === 'run') {
        callout('Finish', 'bank');
        finishRun();
      }
    }
    phys.events.length = 0;
  }

  const grindLabel = (g) => [g.side, g.press && g.type === '50-50' ? g.press : phys.gear === 'ski' && g.type === 'Boardslide' ? 'Slide' : g.type].filter(Boolean).join(' ');

  // Live readout while airborne, buttering or grinding. In the air it shows what the
  // rotation counts as if it is let go now (coming upright the way it would), coloured by how
  // that would land (green clean, amber sketchy, red crash); it only shows, letting go is the
  // player's.
  function updateLive() {
    hud.live.toggleAttribute('data-land', false);
    if (phys.state === 'air' && phys.airTime > 0.12) {
      const pr = phys.predictRotation();
      const ski = phys.gear === 'ski';
      const parts = [];
      if (phys.takeoffKind === 'nollie') parts.push('Nollie');
      if (pr.offAxis && pr.inversions >= 1) parts.push(offAxisName(pr.offAxis, pr.offDeg, pr.inversions, pr.offSpinDir, phys.takeoffSwitch, phys.gear));
      else {
        if (pr.flips) parts.push(`${pr.flips > 1 ? pr.flips + '× ' : ''}${pr.flipDir > 0 ? 'Backflip' : 'Frontflip'}`);
        if (pr.rolls) parts.push(`${pr.rolls > 1 ? pr.rolls + '× ' : ''}${ski ? 'Lincoln Loop' : 'Cartwheel'}`);
        if (pr.spinDeg) parts.push(`${sideName(pr.spinDir, phys.takeoffSwitch, phys.gear)} ${pr.spinDeg}`);
      }
      if (phys.grab) parts.push(grabName(phys.grab.name, phys.gear));
      if (parts.length) { hud.live.textContent = parts.join(' · '); hud.live.dataset.land = pr.landing; }
    } else if (phys.state === 'grind' && phys.grind) {
      const g = phys.grind;
      hud.live.textContent = `${grindLabel(g)} · ${g.dist.toFixed(1)} m`;
    } else if (phys.state === 'ground' && phys.butter) {
      const b = phys.butter;
      const deg = Math.floor(Math.abs(b.spin) / Math.PI + 0.2) * 180;
      hud.live.textContent = `${b.kind === 'nose' ? 'Nose' : 'Tail'} Butter${deg ? ' ' + deg : ''}`;
    }
    hud.balance.classList.toggle('on', phys.state === 'grind');
    // stalled: tell the player how to get going again
    if (phys.state === 'ground' && (phys.stallT ?? 0) > 1.2 && !phys.finished) hud.live.textContent = 'W: anschieben';
    if (phys.state === 'grind') hud.needle.style.left = `${50 + clamp(phys.balance, -1, 1) * 50}%`;
  }

  // ---------- keyboard shortcuts ----------
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (mode === 'menu') {
      if (screen === 'home') {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { setNav(navI - 1); navBtns[navI].focus(); }
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') { setNav(navI + 1); navBtns[navI].focus(); }
        else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); showScreen(navBtns[navI].dataset.go); }
      } else if (e.code === 'Escape' || e.code === 'Backspace') showScreen('home');
      else if (screen === 'play' && e.code === 'Enter') { e.preventDefault(); startRun(); }
      else if (screen === 'locker' && e.code === 'ArrowLeft') selectBoard(-1);
      else if (screen === 'locker' && e.code === 'ArrowRight') selectBoard(1);
    } else if (mode === 'run') {
      if (e.code === 'Escape' || e.code === 'KeyP') setMode('pause');
      else if (e.code === 'KeyR') startRun();
      else if (e.code === 'KeyH') hud.help.hidden = !hud.help.hidden;
    } else if (mode === 'pause') {
      if (e.code === 'Escape' || e.code === 'KeyP') setMode('run');
      else if (e.code === 'KeyR') startRun();
    } else if (mode === 'results') {
      if (e.code === 'Enter' || e.code === 'KeyR') startRun();
      else if (e.code === 'Escape') setMode('menu');
    }
    if (e.code === 'KeyM') { settings.muted = !settings.muted; store.set('muted', settings.muted); audio.setMuted(settings.muted); }
  });

  // ---------- main loop ----------
  const STEP = 1 / 120;
  let acc = 0, last = performance.now();
  const clock = { fpsT: 0 };
  const contact = new THREE.Vector3();
  const debug = { camera: null, timeScale: 1, freeze: false };

  function frame(now) {
    requestAnimationFrame(frame);
    // never negative: a timestamp hiccup would otherwise wind every damper backwards
    const rawDt = (now - last) / 1000;
    const dt = Math.max(0, Math.min(rawDt, 0.05)) * debug.timeScale;
    last = now;
    if (mode === 'run') adaptResolution(rawDt);

    const inpRaw = input.state();
    const inp = mode === 'run' ? inpRaw : IDLE_INPUT;
    if ((mode === 'run' || mode === 'results') && !debug.freeze) {
      acc += dt;
      let first = true;
      while (acc >= STEP) {
        phys.update(STEP, first ? inp : { ...inp, jumpReleased: false });
        first = false;
        acc -= STEP;
      }
      handleEvents();
      tracker.update(dt, phys.state === 'ground' && phys.butter ? 'butter' : phys.state);
      if (run.active) run.time += dt;
    } else {
      acc = 0;
    }
    input.endFrame();

    // board orientation smoothing
    phys.orientation(targetQuat);
    // in the air the body follows its rotation with a touch of softness (no robotic snapping)
    const rate = phys.state === 'air' ? 26 : phys.state === 'crash' ? 12 : phys.landT < 0.25 ? 14 : 22;
    boardQuat.slerp(targetQuat, 1 - Math.exp(-rate * dt));
    rider.update(dt, phys, inp, boardQuat);

    // snow spray & tracks while riding
    if (phys.state === 'ground' && (mode === 'run' || mode === 'results')) {
      const sp = phys.speed;
      const powder = course.powderAt(phys.pos.x);
      sideVec.set(1, 0, 0).applyQuaternion(boardQuat);
      contact.copy(phys.pos);
      if (phys.butter) {
        // only the pressed end touches the snow
        tv2.set(0, 0, phys.butter.kind === 'nose' ? -0.7 : 0.7).applyQuaternion(boardQuat);
        contact.add(tv2);
      }
      const depth = Math.min(1, 0.4 + Math.abs(phys.lean) * 0.6 + phys.skid * 0.6 + powder);
      if (phys.gear === 'ski') {
        // two narrow grooves, one per ski
        const half = 0.045 + powder * 0.05 + phys.skid * 0.08;
        tracks.add(tv2.copy(contact).addScaledVector(sideVec, -0.1), sideVec, half, depth);
        tracks2.add(tv2.copy(contact).addScaledVector(sideVec, 0.1), sideVec, half, depth);
      } else {
        tracks.add(contact, sideVec, phys.butter ? 0.1 : 0.14 + powder * 0.12 + phys.skid * 0.1, depth);
      }
      const carve = Math.abs(phys.lean) * sp * 0.1 + phys.skid * sp * 0.25 + powder * sp * 0.12 + (phys.butter ? sp * 0.08 : 0);
      if (carve > 0.4 && Math.random() < Math.min(1, carve * 0.5)) {
        const side = phys.lean * (phys.switch ? -1 : 1) > 0 ? 1 : -1;
        tv.copy(phys.vel).multiplyScalar(0.25).addScaledVector(sideVec, side * (1 + phys.skid * 2.5));
        tv.y += 1.2 + phys.skid * 1.5 + powder * 1.5;
        // powder hangs in the air as a cloud, groomed snow flies as chunks
        spray.emit(contact, tv, Math.ceil(carve * (1 + powder)), 1.2 + powder, 0.16 + phys.skid * 0.08 + powder * 0.2, 0.8 + powder * 0.9, 0.9 + powder * 1.8);
      }
    }
    if (phys.state === 'grind' && phys.grind) {
      // steel and coping spark, boxes and logs shed snow from the base
      const kind = phys.grind.rail.kind, seg = phys.grind.rail.segments[phys.grind.seg];
      if ((kind === 'rail' || kind === 'ledge') && phys.speed > 2.5) sparks.emit(phys.pos, seg.dir, phys.speed, Math.random() < 0.6 ? 2 : 1);
      if (Math.random() < 0.45) spray.emit(phys.pos, tv.set(0, 1.2, 0), 1, 1.2, 0.07, 0.35, 0.4);
    }

    if (debug.camera) debug.camera(camera, phys);
    else if (mode === 'menu') updateMenuCamera(dt);
    else updateCamera(dt);

    // detail, culling and shadow casting by distance; then time of day, sky, light, fog,
    // mist and floodlights (exposure adapts to the light)
    world.update(camera.position);
    atmo.update(dt, camera, phys.pos);
    renderer.toneMappingExposure = atmo.exposure;
    for (const t of allTracks) { t.sunDir.copy(atmo.lightDir); t.setLight(atmo.light, atmo.shade); }
    spray.setLight(Math.max(0.12, atmo.light), atmo.shade);
    snowfall.setLight(Math.max(0.1, atmo.light));
    const pixelScale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    spray.update(dt, pixelScale, camera, atmo.lightDir);
    sparks.update(dt, pixelScale);
    wind.update(dt, camera.position, mode === 'run' ? phys.vel : tv.set(0, 0, 0), Math.max(0.15, atmo.light));
    contactShadow.update(course, rider.root.position, phys.heading + (phys.switch ? Math.PI : 0), mode === 'menu' || mode === 'results');
    snowfall.update(dt, camera.position, pixelScale);
    audio.update(phys, inp, mode === 'run' || mode === 'results');

    if (mode === 'run' || mode === 'results') {
      hud.speed.textContent = Math.round(phys.speed * 3.6);
      hud.time.textContent = fmtTime(run.time);
      hud.progress.style.width = `${clamp((phys.distance - course.spawnD) / (course.finishD - course.spawnD), 0, 1) * 100}%`;
      updateLive();
    }

    post.render(dt);
    clock.fpsT += dt;
  }

  applyQuality();
  setMode('menu');
  boardQuat.copy(phys.orientation(targetQuat));
  atmo.update(0, camera, phys.pos);
  atmo.warmLights(renderer, scene, camera);
  requestAnimationFrame(frame);

  window.__snowday = { debug, rider, phys, tracker, atmo, input, scene, camera, post, perf, updateCamera, get world() { return world; }, get course() { return course; }, renderer, startRun, setMode, setMap, get mode() { return mode; }, describeAir, setGear: (g) => { settings.gear = g; applyGear(); syncGear(); renderKeys(); renderBoardCard(); } };
  window.claude?.hot?.snapshot?.(() => ({ board: settings.board, outfit: settings.outfit, character: settings.character, map: settings.map, gear: settings.gear }));

  const loading = $('loading');
  loading.classList.add('fade');
  setTimeout(() => { loading.hidden = true; }, 600);
}

function start(saved) {
  // Wait for the display font (board art and banners use it) and the downloaded models.
  const fonts = document.fonts && document.fonts.load ? document.fonts.load('100px "Anton"').catch(() => {}) : Promise.resolve();
  const text = $('loadingText');
  const props = loadProps((f) => { text.textContent = `Modelle werden geladen … ${Math.round(f * 100)} %`; }).catch(() => ({}));
  Promise.all([Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]), props]).then(([, p]) => {
    try {
      boot(saved || {}, p);
    } catch (err) {
      console.error(err);
      text.textContent = 'WebGL konnte nicht gestartet werden. Bitte einen aktuellen Browser mit Hardwarebeschleunigung verwenden.';
    }
  });
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
