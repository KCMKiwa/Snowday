import * as THREE from 'three';
import { Course, SPAWN_D, FINISH_D } from './course.js';
import { RiderPhysics, damp, clamp } from './physics.js';
import { TrickTracker, GRABS, sideName, describeAir } from './tricks.js';
import { DESIGNS, statsToPhysics, drawBoardPreview } from './boards.js';
import { RiderModel, OUTFITS } from './rider.js';
import { buildWorld } from './world.js';
import { SnowSpray, Snowfall, Tracks } from './effects.js';
import { Input, IDLE_INPUT } from './input.js';
import { AudioFX } from './audio.js';
import { loadProps, loadCharacter, CHARACTERS } from './assets.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('snowday.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('snowday.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const KEYS = [
  ['W', 'Tuck / Anschieben'], ['S', 'Bremsen'],
  ['A D', 'Carven · in der Luft drehen'], ['Leertaste', 'Halten = laden, loslassen = Ollie'],
  ['W S', 'In der Luft: Front- / Backflip'], ['J K L', 'Indy · Mute · Melon'],
  ['U I O', 'Nose · Stalefish · Tail'], ['R', 'Run neu starten'],
];

function boot(saved = {}, props = {}) {
  // ---------- renderer ----------
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 5000);
  const course = new Course();
  const world = buildWorld(scene, course, props);

  const settings = {
    board: saved.board ?? store.get('board', 0),
    outfit: saved.outfit ?? store.get('outfit', 0),
    character: saved.character ?? store.get('character', 0),
    quality: store.get('quality', 'high'),
    muted: store.get('muted', false),
  };
  let best = store.get('best', 0);

  const phys = new RiderPhysics(course);
  const rider = new RiderModel(DESIGNS[settings.board], OUTFITS[settings.outfit]);
  scene.add(rider.root);
  let charRequest = 0;
  function applyCharacter() {
    const req = ++charRequest;
    loadCharacter(settings.character)
      .then((sc) => { if (req === charRequest) rider.setCharacter(sc); })
      .catch((err) => { console.warn('Figur nicht geladen, nutze prozeduralen Fahrer', err); rider.setCharacter(null); });
  }
  applyCharacter();
  const spray = new SnowSpray(scene);
  const snowfall = new Snowfall(scene);
  const tracks = new Tracks(scene);
  const input = new Input();
  const audio = new AudioFX();
  audio.muted = settings.muted;

  function applyQuality() {
    const high = settings.quality === 'high';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
    world.setShadowQuality(high);
    renderer.shadowMap.type = high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    snowfall.points.visible = high;
    resize();
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
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

  // ---------- HUD ----------
  const hud = {
    score: $('hudScore'), time: $('hudTime'), speed: $('hudSpeed'), progress: $('hudProgress'),
    live: $('hudLive'), combo: $('hudCombo'), chain: $('hudChain'), callout: $('hudCallout'),
    balance: $('hudBalance'), needle: $('hudNeedle'), help: $('hudHelp'),
  };
  hud.help.innerHTML = `<p class="label">Steuerung</p><div class="keys">${KEYS.map(([k, t]) => `<div>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')}<span>${t}</span></div>`).join('')}</div>`;
  $('keysList').innerHTML = hud.help.querySelector('.keys').innerHTML;

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
  function updateCamera(dt) {
    const p = phys.pos;
    const sp = phys.speed;
    if (phys.state !== 'crash' && sp > 1) {
      tv.set(phys.vel.x, 0, phys.vel.z).normalize();
      const rate = phys.state === 'air' ? 1.2 : 3.2;
      cam.dir.lerp(tv, 1 - Math.exp(-rate * dt)).normalize();
    }
    const dist = 6.4 + Math.min(sp, 28) * 0.07;
    const height = 2.9 + (phys.state === 'air' ? 0.6 : 0);
    tv.copy(p).addScaledVector(cam.dir, -dist);
    tv.y = p.y + height;
    const ground = course.heightAt(tv.x, tv.z) + 1.4;
    if (tv.y < ground) tv.y = ground;
    cam.pos.x = damp(cam.pos.x, tv.x, 7, dt);
    cam.pos.z = damp(cam.pos.z, tv.z, 7, dt);
    cam.pos.y = damp(cam.pos.y, tv.y, phys.state === 'air' ? 3.5 : 6, dt);
    tv2.copy(p).addScaledVector(cam.dir, 4.5);
    tv2.y = p.y + 0.9 - (phys.state === 'air' ? 0.6 : 0);
    cam.look.lerp(tv2, 1 - Math.exp(-10 * dt));
    camera.position.copy(cam.pos);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 2.5);
      camera.position.x += (Math.random() - 0.5) * cam.shake * 0.3;
      camera.position.y += (Math.random() - 0.5) * cam.shake * 0.3;
    }
    camera.lookAt(cam.look);
    const fov = 60 + Math.min(sp, 30) * 0.35;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
  }
  let orbit = 0.8;
  function updateMenuCamera(dt) {
    orbit += dt * 0.12;
    const c = rider.root.position;
    const r = 5.2;
    camera.position.set(c.x + Math.sin(orbit) * r, c.y + 1.4, c.z + Math.cos(orbit) * r);
    // keep the rider in the right half of the screen, clear of the menu rail
    const shift = camera.aspect > 1.1 ? 1.5 : 0;
    tv.set(-Math.cos(orbit), 0, Math.sin(orbit)).multiplyScalar(-shift);
    camera.lookAt(c.x + tv.x, c.y + 0.7, c.z + tv.z);
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  }
  // ---------- menu ----------
  const boardCanvas = $('boardCanvas');
  let showBase = false;
  function renderBoardCard() {
    const d = DESIGNS[settings.board];
    drawBoardPreview(boardCanvas, d, showBase ? 'base' : 'top');
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
  }
  $('prevBoard').onclick = () => selectBoard(-1);
  $('nextBoard').onclick = () => selectBoard(1);
  $('flipBoard').onclick = () => { showBase = !showBase; renderBoardCard(); };
  const ridersEl = $('riders');
  ridersEl.innerHTML = CHARACTERS.map((c, i) => `<button data-i="${i}" aria-pressed="${i === settings.character}">${c.name}</button>`).join('');
  ridersEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.character = +b.dataset.i;
    store.set('character', settings.character);
    applyCharacter();
    ridersEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.i === settings.character)));
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
  const showBest = () => { $('menuBest').textContent = best ? `Bester Run: ${best.toLocaleString('de-DE')} Punkte` : 'Noch kein Run gefahren'; };

  // ---------- game state ----------
  let mode = 'menu';
  function setMode(m) {
    mode = m;
    $('menu').hidden = m !== 'menu';
    $('hud').hidden = !(m === 'run' || m === 'pause' || m === 'results');
    $('pause').hidden = m !== 'pause';
    $('results').hidden = m !== 'results';
    if (m === 'menu') { renderBoardCard(); showBest(); phys.restart(); phys.vel.set(0, 0, 0); tracks.reset(); }
  }

  function startRun() {
    audio.init();
    audio.setMuted(settings.muted);
    phys.restart();
    tracker.reset();
    tracks.reset();
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
    if (isBest) { best = score; store.set('best', best); }
    $('resScore').textContent = score.toLocaleString('de-DE');
    $('resBest').innerHTML = isBest && score > 0 ? '<span class="newbest">Neuer Rekord</span>' : '';
    $('resTime').textContent = fmtTime(run.time, false);
    $('resTricks').textContent = tracker.landed.length;
    $('resCrashes').textContent = run.crashes;
    const top = [...tracker.landed].sort((a, b) => b.points - a.points).slice(0, 5);
    $('resList').innerHTML = top.length
      ? top.map((t) => `<li><span>${t.name}</span><span>${t.points.toLocaleString('de-DE')}</span></li>`).join('')
      : '<li><span>Keine Tricks gestanden. Space laden, über die Kante loslassen!</span><span></span></li>';
    setTimeout(() => { if (mode === 'run') setMode('results'); }, 1400);
  }

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
        cam.shake = Math.min(1, strength / 14);
        tracks.breakLine();
      } else if (e.type === 'crash') {
        run.crashes++;
        callout('Crash', 'crash');
        audio.thud(10);
        audio.chime(false);
        cam.shake = 1;
        spray.emit(phys.pos, tv.copy(phys.vel).multiplyScalar(0.3), 60, 4, 0.3, 1.2);
      } else if (e.type === 'takeoff') {
        tracks.breakLine();
        if (e.kind !== 'rail') spray.emit(phys.pos, tv.copy(phys.vel).multiplyScalar(0.2), 14, 1.5, 0.18, 0.7);
      } else if (e.type === 'grindStart') {
        if (phys.grind) hud.live.textContent = phys.grind.type;
        audio.thud(3);
      } else if (e.type === 'respawn') {
        tracks.breakLine();
        boardQuat.copy(phys.orientation(targetQuat));
      } else if (e.type === 'finish' && mode === 'run') {
        callout('Finish', 'bank');
        finishRun();
      }
    }
    phys.events.length = 0;
  }

  // Live readout while airborne or grinding.
  function updateLive() {
    if (phys.state === 'air' && phys.airTime > 0.25) {
      const deg = Math.floor(Math.abs(phys.spinAccum) / Math.PI + 0.15) * 180;
      const flips = Math.floor(Math.abs(phys.flip) / (2 * Math.PI) + 0.2);
      const parts = [];
      if (flips) parts.push(flips > 1 ? `${flips}× ${phys.flip > 0 ? 'Backflip' : 'Frontflip'}` : (phys.flip > 0 ? 'Backflip' : 'Frontflip'));
      if (deg) parts.push(`${sideName(Math.sign(phys.spinAccum), phys.takeoffSwitch)} ${deg}`);
      if (phys.grab) parts.push(GRABS[phys.grab.name].name);
      if (parts.length) hud.live.textContent = parts.join(' · ');
    } else if (phys.state === 'grind' && phys.grind) {
      const g = phys.grind;
      hud.live.textContent = `${g.press && g.type === '50-50' ? g.press : g.type} · ${g.dist.toFixed(1)} m`;
    }
    hud.balance.classList.toggle('on', phys.state === 'grind');
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
    const dt = Math.min((now - last) / 1000, 0.05) * debug.timeScale;
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
      tracker.update(dt, phys.state);
      if (run.active) run.time += dt;
    } else {
      acc = 0;
    }
    input.endFrame();

    // board orientation smoothing
    phys.orientation(targetQuat);
    const rate = phys.state === 'air' ? 40 : phys.landT < 0.25 ? 14 : 22;
    boardQuat.slerp(targetQuat, 1 - Math.exp(-rate * dt));
    rider.update(dt, phys, inp, boardQuat);

    // snow spray & tracks while riding
    if (phys.state === 'ground' && (mode === 'run' || mode === 'results')) {
      const sp = phys.speed;
      sideVec.set(1, 0, 0).applyQuaternion(boardQuat);
      contact.copy(phys.pos);
      tracks.add(contact, sideVec, 0.14, Math.min(1, 0.4 + Math.abs(phys.edge) * 0.6 + phys.skid * 0.6));
      const carve = Math.abs(phys.edge) * sp * 0.08 + phys.skid * sp * 0.25;
      if (carve > 0.4 && Math.random() < Math.min(1, carve * 0.5)) {
        const side = phys.edge * (phys.switch ? -1 : 1) > 0 ? 1 : -1;
        tv.copy(phys.vel).multiplyScalar(0.25).addScaledVector(sideVec, side * (1 + phys.skid * 2.5));
        tv.y += 1.2 + phys.skid * 1.5;
        spray.emit(contact, tv, Math.ceil(carve), 1.2, 0.16 + phys.skid * 0.08, 0.8);
      }
    }
    if (phys.state === 'grind' && Math.random() < 0.5) {
      spray.emit(phys.pos, tv.set(0, 1.5, 0), 1, 1.5, 0.07, 0.35);
    }

    if (debug.camera) debug.camera(camera, phys);
    else if (mode === 'menu') updateMenuCamera(dt);
    else updateCamera(dt);

    world.follow(phys.pos);
    const pixelScale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    spray.update(dt, pixelScale);
    snowfall.update(dt, camera.position, pixelScale);
    audio.update(phys, inp, mode === 'run' || mode === 'results');

    if (mode === 'run' || mode === 'results') {
      hud.speed.textContent = Math.round(phys.speed * 3.6);
      hud.time.textContent = fmtTime(run.time);
      hud.progress.style.width = `${clamp((phys.distance - SPAWN_D) / (FINISH_D - SPAWN_D), 0, 1) * 100}%`;
      updateLive();
    }

    renderer.render(scene, camera);
    clock.fpsT += dt;
  }

  applyQuality();
  setMode('menu');
  boardQuat.copy(phys.orientation(targetQuat));
  requestAnimationFrame(frame);

  window.__snowday = { debug, rider, phys, tracker, course, renderer, startRun, setMode, get mode() { return mode; }, describeAir };
  window.claude?.hot?.snapshot?.(() => ({ board: settings.board, outfit: settings.outfit, character: settings.character }));

  const loading = $('loading');
  loading.classList.add('fade');
  setTimeout(() => { loading.hidden = true; }, 600);
}

function start(saved) {
  // Wait for the display font (board art and banners use it) and the downloaded models.
  const fonts = document.fonts && document.fonts.load ? document.fonts.load('100px "Bungee"').catch(() => {}) : Promise.resolve();
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
