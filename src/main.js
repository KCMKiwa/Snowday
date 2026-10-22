import * as THREE from 'three';
import { Course } from './course.js';
import { MAPS, mapById } from './maps.js';
import { RiderPhysics, damp, clamp } from './physics.js';
import { TrickTracker, grabName, sideName, describeAir } from './tricks.js';
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

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('snowday.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('snowday.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// What the on-screen controls do (shown instead of the keyboard list on touch screens).
const TOUCH_KEYS = [
  ['Stick ← →', 'Carven · in der Luft drehen (wenig = langsam)'], ['Stick ↑', 'Tuck · in der Luft Frontflip'],
  ['Stick ↓', 'Bremsen · in der Luft Backflip'], ['Stick ↗ ↘', 'In der Luft: Cork, Misty, Rodeo'],
  ['POP', 'Halten = laden, loslassen = Absprung'], ['GRAB', 'Drücken, zum gewünschten Grab ziehen'],
  ['TAIL NOSE', 'Butter, Press auf dem Rail, Roll in der Luft'], ['II', 'Pause'],
];

const KEYS = {
  board: [
    ['W', 'Tuck / Anschieben'], ['S', 'Bremsen · Skid'],
    ['A D', 'Carven'], ['Leertaste', 'Halten = laden, loslassen = Ollie'],
    ['A D Leertaste', 'Beim Laden aufdrehen = Spin ab der Kante'], ['A D', 'In der Luft: halten = drehen, loslassen = ausdrehen lassen'],
    ['Q E', 'Tail / Nose Butter (+ A D drehen)'], ['E Leertaste', 'Nollie aus dem Nose Press'],
    ['W S', 'In der Luft: Front- / Backflip (mit A D: Cork, Rodeo)'], ['Q E', 'In der Luft: Wildcat / Tamedog'],
    ['J K L', 'Indy · Mute · Melon'], ['U I O', 'Nose · Stalefish · Tail'],
    ['B N', 'Method · Japan'], ['W S', 'Auf dem Rail: Nose / Tail Press'],
  ],
  ski: [
    ['W', 'Hocke / Doppelstockschub'], ['S', 'Bremsen · Hockey Stop'],
    ['A D', 'Carven (Stockeinsatz)'], ['Leertaste', 'Halten = laden, loslassen = Absprung'],
    ['A D Leertaste', 'Beim Laden aufdrehen = Spin ab der Kante'], ['A D', 'In der Luft: halten = drehen, loslassen = ausdrehen lassen'],
    ['Q E', 'Tail / Nose Butter (+ A D drehen)'], ['E Leertaste', 'Nollie aus dem Nose Press'],
    ['W S', 'In der Luft: Front- / Backflip (mit A D: Misty, Rodeo, Cork)'], ['Q E', 'In der Luft: Lincoln Loop'],
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
  }

  function applyQuality() {
    const high = settings.quality === 'high';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
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
    cam.pos.copy(phys.pos).add(new THREE.Vector3(0, 3, 7));
    cam.look.copy(phys.pos);
  }
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  // Follow cam: looks ahead along the line, leans a little into carves, dips on landings,
  // pulls back and up in the air so the landing stays in view, widens with speed.
  function updateCamera(dt) {
    const p = phys.pos;
    const sp = phys.speed;
    const air = phys.state === 'air';
    if (phys.state !== 'crash' && sp > 1) {
      tv.set(phys.vel.x, 0, phys.vel.z).normalize();
      cam.dir.lerp(tv, 1 - Math.exp(-(air ? 1.1 : 3.0) * dt)).normalize();
    }
    cam.air = damp(cam.air ?? 0, air ? Math.min(1, phys.airTime * 2) : 0, 3, dt);
    const dist = 6.2 + Math.min(sp, 28) * 0.075 + cam.air * 1.6;
    const height = 2.7 + cam.air * 1.1;
    tv.copy(p).addScaledVector(cam.dir, -dist);
    tv.y = p.y + height;
    const ground = course.heightAt(tv.x, tv.z) + 1.4;
    if (tv.y < ground) tv.y = ground;
    cam.pos.x = damp(cam.pos.x, tv.x, 7, dt);
    cam.pos.z = damp(cam.pos.z, tv.z, 7, dt);
    cam.pos.y = damp(cam.pos.y, tv.y, air ? 3.5 : 6, dt);
    tv2.copy(p).addScaledVector(cam.dir, 4.5 + Math.min(sp, 25) * 0.08);
    tv2.y = p.y + 0.9 - cam.air * 0.9;
    cam.look.lerp(tv2, 1 - Math.exp(-10 * dt));
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
    const fov = 58 + Math.min(sp, 30) * 0.42 + cam.air * 3 + (cam.kick ?? 0);
    cam.kick = damp(cam.kick ?? 0, 0, 4, dt);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
  }
  let orbit = 0.8;
  let menuT = 0;
  function updateMenuCamera(dt) {
    // fixed three-quarter view with a slow drift; the rider turns to face it
    menuT += dt;
    orbit = 0.8 + Math.sin(menuT * 0.18) * 0.22;
    rider.menuYaw = Math.atan2(-Math.cos(0.8 + 0.35), Math.sin(0.8 + 0.35));
    const c = rider.root.position;
    const r = 4.6;
    camera.position.set(c.x + Math.sin(orbit) * r, c.y + 1.5, c.z + Math.cos(orbit) * r);
    // aim left of the rider so they stand in the right half of the screen, clear of the menu rail
    const shift = camera.aspect > 1.1 ? 1.25 : 0;
    tv.set(-Math.cos(orbit), 0, Math.sin(orbit)).multiplyScalar(shift);
    camera.lookAt(c.x + tv.x, c.y + 0.95, c.z + tv.z);
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  }
  // ---------- menu ----------
  const boardCanvas = $('boardCanvas');
  let showBase = false;
  function renderBoardCard() {
    const d = DESIGNS[settings.board];
    if (settings.gear === 'ski') drawSkiPreview(boardCanvas, d);
    else drawBoardPreview(boardCanvas, d, showBase ? 'base' : 'top');
    $('flipBoard').hidden = settings.gear === 'ski';
    $('boardName').textContent = d.name;
    $('boardTag').textContent = d.tagline;
    const card = boardCanvas.closest('.board-card');
    card.style.setProperty('--board-accent', d.accent);
    $('boardStats').innerHTML = [['Speed', d.stats.speed], ['Pop', d.stats.pop], ['Spin', d.stats.spin]]
      .map(([k, v]) => `<dt>${k}</dt><dd aria-label="${v} von 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</dd>`).join('');
    $('boardDots').innerHTML = DESIGNS.map((_, i) => `<i class="${i === settings.board ? 'on' : ''}"></i>`).join('');
    $('flipBoard').textContent = showBase ? 'Oberseite zeigen' : 'Unterseite zeigen';
  }
  function selectBoard(delta) {
    settings.board = (settings.board + delta + DESIGNS.length) % DESIGNS.length;
    store.set('board', settings.board);
    applyBoard();
    renderBoardCard();
    boardCanvas.classList.remove('from-left', 'from-right');
    void boardCanvas.offsetWidth;
    boardCanvas.classList.add(delta > 0 ? 'from-right' : 'from-left');
  }
  $('prevBoard').onclick = () => selectBoard(-1);
  $('nextBoard').onclick = () => selectBoard(1);
  $('flipBoard').onclick = () => { showBase = !showBase; renderBoardCard(); };
  const ridersEl = $('riders');
  if (!CHARACTERS[settings.character]) settings.character = 0;
  // restart a CSS animation by toggling its class
  const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const showRider = () => {
    const c = CHARACTERS[settings.character], o = OUTFITS[settings.outfit] ?? OUTFITS[0];
    $('riderBig').textContent = c.name;
    $('riderName').textContent = c.name;
    $('riderOutfit').textContent = `${o.name} · ${c.hat.label}`;
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
  outfitsEl.innerHTML = OUTFITS.map((o, i) => `<button class="swatch" data-i="${i}" style="--a:${o.jacket};--b:${o.pants}" aria-label="${o.name}" title="${o.name}" aria-pressed="${i === settings.outfit}"></button>`).join('');
  outfitsEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.outfit = +b.dataset.i;
    store.set('outfit', settings.outfit);
    rider.setOutfit(OUTFITS[settings.outfit]);
    outfitsEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.i === settings.outfit)));
    showRider();
  };
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
    mapsEl.innerHTML = MAPS.map((m) => `<button class="tile" data-id="${m.id}" aria-pressed="${m.id === course.map.id}"><b>${m.name}</b><small>${m.length} m · ${m.slope}°</small></button>`).join('');
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
    if (m === 'menu') { renderBoardCard(); renderMaps(); showBest(); phys.restart(); phys.vel.set(0, 0, 0); for (const t of allTracks) t.reset(); }
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
  // rotation counts as if it is let go now, coloured by how that would land (green clean,
  // amber sketchy, red crash): it never steers the rotation, the player still has to let go.
  function updateLive() {
    hud.live.toggleAttribute('data-land', false);
    if (phys.state === 'air' && phys.airTime > 0.12) {
      const pr = phys.predictRotation();
      const ski = phys.gear === 'ski';
      const parts = [];
      if (phys.takeoffKind === 'nollie') parts.push('Nollie');
      if (pr.flips) parts.push(`${pr.flips > 1 ? pr.flips + '× ' : ''}${pr.flipDir > 0 ? 'Backflip' : 'Frontflip'}`);
      if (pr.rolls) parts.push(`${pr.rolls > 1 ? pr.rolls + '× ' : ''}${ski ? 'Lincoln Loop' : pr.rollDir > 0 ? 'Wildcat' : 'Tamedog'}`);
      if (pr.spinDeg) parts.push(`${sideName(pr.spinDir, phys.takeoffSwitch, phys.gear)} ${pr.spinDeg}`);
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
      if (e.code === 'Enter') startRun();
      else if (e.code === 'ArrowLeft') selectBoard(-1);
      else if (e.code === 'ArrowRight') selectBoard(1);
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
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)) * debug.timeScale;
    last = now;

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

    // time of day, sky, light, fog, mist and floodlights; exposure adapts to the light
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
  requestAnimationFrame(frame);

  window.__snowday = { debug, rider, phys, tracker, atmo, input, get course() { return course; }, renderer, startRun, setMode, setMap, get mode() { return mode; }, describeAir, setGear: (g) => { settings.gear = g; applyGear(); syncGear(); renderKeys(); renderBoardCard(); } };
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
