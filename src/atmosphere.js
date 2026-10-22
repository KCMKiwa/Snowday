// Atmosphere: time of day, sky, clouds, stars, sun and moon light with two shadow cascades,
// sky light, fog, valley mist and floodlights for night riding.
//
// The sky is a single-scattering approximation: Rayleigh (blue sky, red sunsets through a
// long air path), Mie haze around the sun (turbidity from the weather) and an air-mass based
// extinction. The same model, evaluated on the CPU, colours the sun/moon light, the sky light
// and the fog, so light and sky always agree.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const LAT = 47 * DEG; // an Alpine resort
const DEC = -8 * DEG; // late winter: a low midday sun and long shadows
const TAU_R = [0.05, 0.12, 0.27]; // Rayleigh optical depth at the zenith (R, G, B)
const SUN_E = 3.1; // direct sun at the zenith, before extinction
const SKY_SCALE = 7.5; // sky radiance scale against the lights (tuned by eye)

export const TIME_PRESETS = { morning: 8.3, noon: 12.5, evening: 16.9, night: 21.5 };

// Weather from the map's environment: haze, cloud cover, fog and valley mist.
const WEATHER = {
  day: { turbidity: 0.035, cover: 0.32, fog: 0.0006, mist: 0.0, sunCloud: 0 },
  sunset: { turbidity: 0.07, cover: 0.42, fog: 0.0008, mist: 0.12, sunCloud: 0 },
  overcast: { turbidity: 0.3, cover: 0.93, fog: 0.0024, mist: 0.22, sunCloud: 0.72 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Kasten & Young relative air mass (1 at the zenith, ~38 at the horizon).
function airMass(y) {
  const z = Math.acos(clamp(y, -0.05, 1)) / DEG;
  return 1 / (Math.cos(Math.min(z, 92) * DEG) + 0.50572 * Math.pow(Math.max(96.07995 - z, 0.5), -1.6364));
}

function bodyDirection(hours, dec, out) {
  const H = (hours - 12) * 15 * DEG;
  const sinE = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H);
  const e = Math.asin(sinE);
  // azimuth from south, positive toward west; scene: south = +z, west = -x
  const A = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(dec) * Math.cos(LAT));
  return out.set(-Math.sin(A) * Math.cos(e), sinE, Math.cos(A) * Math.cos(e)).normalize();
}

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `
uniform vec3 uSun, uMoon, uTauR, uSunCol, uMoonCol, uAmb, uFog;
uniform float uTauM, uDay, uNight, uCover, uTime, uScale, uSunCloud;
varying vec3 vDir;
const float PI = 3.14159265;
float airMass(float y){ float z = degrees(acos(clamp(y, -0.05, 1.0))); return 1.0 / (cos(radians(min(z, 92.0))) + 0.50572 * pow(max(96.07995 - z, 0.5), -1.6364)); }
float phaseR(float mu){ return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float phaseM(float mu, float g){ return (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5)); }
// single scattering towards the eye from one light (irradiance E arriving from direction l)
vec3 scatter(vec3 v, vec3 l, vec3 E){
  float mu = dot(v, l);
  vec3 tau = uTauR + vec3(uTauM);
  vec3 ext = exp(-tau * airMass(max(v.y, 0.0)));
  vec3 s = (uTauR * phaseR(mu) + vec3(uTauM * phaseM(mu, 0.76))) / tau;
  return E * s * (1.0 - ext);
}
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; } return s; }
void main(){
  vec3 v = normalize(vDir);
  float vy = max(v.y, 0.0);
  // sky light from sun (with twilight) and moon
  vec3 col = scatter(v, uSun, uSunCol) + scatter(v, uMoon, uMoonCol);
  // multiple scattering keeps the sky from going black right after sunset
  col += uAmb * (0.35 + 0.65 * (1.0 - vy));
  // aerial perspective: towards the horizon the sky melts into the same haze as the fog,
  // and below it there is only distant terrain in that haze
  col = mix(col, uFog / uScale, exp(-max(v.y, 0.0) * 14.0) * 0.55);
  col = mix(col, uFog / uScale, smoothstep(0.02, -0.03, v.y));
  float mu = dot(v, uSun), mm = dot(v, uMoon);
  // clouds: a domain-warped layer, lit by the key light with a silver lining toward it
  float cloud = 0.0;
  if (uCover > 0.0 && v.y > 0.0) {
    vec2 p = v.xz / (v.y + 0.07) * 0.55 + vec2(uTime * 0.004, uTime * 0.0013);
    vec2 w = vec2(fbm(p * 0.6), fbm(p * 0.6 + 5.2));
    float n = fbm(p * 1.15 + w * 1.6);
    cloud = smoothstep(1.0 - uCover - 0.02, 1.0 - uCover + 0.32, n) * smoothstep(0.0, 0.1, v.y);
    float thick = smoothstep(0.4, 1.0, n);
    vec3 key = uDay > 0.001 ? uSunCol : uMoonCol;
    float kmu = uDay > 0.001 ? mu : mm;
    vec3 lit = key * (0.18 + 1.6 * phaseM(kmu, 0.55)) * (1.0 - thick * 0.6) + uAmb * (1.4 - thick * 0.5);
    // overcast: a heavy, grey deck
    lit = mix(lit, uFog / uScale * 1.08, uSunCloud * 0.85);
    col = mix(col, lit, cloud * 0.95);
  }
  // sun and moon discs (bright enough to bloom), moon halo
  float disc = smoothstep(0.99994, 0.99997, mu) * (1.0 - cloud);
  col += uSunCol * disc * 60.0 * (1.0 - uSunCloud);
  float mdisc = smoothstep(0.99990, 0.99994, mm);
  float crater = 0.8 + 0.2 * vnoise(v.xy * 1800.0);
  col += uMoonCol * mdisc * 900.0 * crater * (1.0 - cloud * 0.8);
  col += uMoonCol * pow(max(mm, 0.0), 300.0) * 6.0 * uNight;
  // stars above the clouds at night, gently twinkling
  if (v.y > 0.0 && uNight > 0.0) {
    vec3 c = floor(v * 190.0);
    float h = h31(c);
    float star = step(0.9968, h) * (0.5 + 0.5 * sin(uTime * (1.5 + h * 4.0) + h * 80.0));
    col += vec3(0.85, 0.9, 1.0) * star * pow(fract(h * 37.0), 2.0) * 0.06 * uNight * (1.0 - cloud) * smoothstep(0.0, 0.15, v.y);
  }
  gl_FragColor = vec4(col * uScale, 1.0);
}`;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.3, 'rgba(255,230,190,0.5)'); g.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function mistTexture() {
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  let s = 99;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blobs = Array.from({ length: 14 }, () => [rnd() * N, N * 0.35 + rnd() * N * 0.3, 12 + rnd() * 30]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let a = 0;
      for (const [bx, by, r] of blobs) a += Math.exp(-((x - bx) ** 2 + ((y - by) * 2.2) ** 2) / (r * r));
      const edge = Math.sin((x / N) * Math.PI) * Math.sin((y / N) * Math.PI);
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 120 * edge);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

export class Atmosphere {
  constructor(scene) {
    this.scene = scene;
    this.hours = TIME_PRESETS.noon;
    this.cycle = false;
    this.time = 0;
    this.weather = WEATHER.day;
    this.envExposure = 1.5;
    this.exposure = 1.5;
    this.light = 1; // overall light level 0..1 for unlit effects (spray, snowfall)
    // shared with the snow and effect shaders
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.shade = new THREE.Vector3(0.7, 0.82, 1.08);
    this.sun = new THREE.Vector3();
    this.moon = new THREE.Vector3();
    this.fogColor = new THREE.Color();

    this.group = new THREE.Group();
    scene.add(this.group);
    this.uniforms = {
      uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() },
      uTauR: { value: new THREE.Vector3(...TAU_R) }, uTauM: { value: 0.07 },
      uSunCol: { value: new THREE.Vector3() }, uMoonCol: { value: new THREE.Vector3() }, uAmb: { value: new THREE.Vector3() },
      uFog: { value: new THREE.Vector3() }, uDay: { value: 1 }, uNight: { value: 0 }, uCover: { value: 0.3 }, uTime: { value: 0 }, uScale: { value: SKY_SCALE }, uSunCloud: { value: 0 },
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    }));
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.sky = sky;
    this.group.add(sky);

    // key light (sun by day, moon by night): a sharp near cascade and a soft far cascade
    this.near = new THREE.DirectionalLight(0xffffff, 1);
    this.far = new THREE.DirectionalLight(0xffffff, 1);
    for (const [l, size, half] of [[this.near, 2048, 24], [this.far, 2048, 190]]) {
      l.castShadow = true;
      l.shadow.mapSize.set(size, size);
      const c = l.shadow.camera;
      c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = 900;
      l.shadow.bias = half > 50 ? -0.0012 : -0.0004;
      l.shadow.normalBias = half > 50 ? 0.25 : 0.03;
      this.group.add(l, l.target);
    }
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.group.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xcfdcea, 0.0008);

    this.buildMist();
    this.lamps = [];
    // a fixed pool of spot lights (a fixed light count keeps every material compiled once)
    this.spots = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.SpotLight(0xfff1dd, 0, 70, 0.95, 0.65, 2);
      this.group.add(s, s.target);
      this.spots.push(s);
    }
    this.update(0, null, new THREE.Vector3());
  }

  // ---------- configuration ----------

  setWeather(envName, env) {
    this.snap = true;
    this.weather = WEATHER[envName] ?? WEATHER.day;
    this.envExposure = env.exposure ?? 1.5;
    this.uniforms.uTauM.value = this.weather.turbidity;
    this.uniforms.uCover.value = this.weather.cover;
    this.uniforms.uSunCloud.value = this.weather.sunCloud;
  }

  // preset: 'auto' (the map's own time), a preset name, or 'cycle' (a day in six minutes)
  setTime(preset, mapDefault) {
    this.snap = true;
    this.snapShadows = true;
    this.cycle = preset === 'cycle';
    this.hours = TIME_PRESETS[preset] ?? (preset === 'cycle' ? this.hours : mapDefault ?? TIME_PRESETS.noon);
  }

  setShadowQuality(high) {
    this.near.shadow.mapSize.set(high ? 4096 : 1024, high ? 4096 : 1024);
    this.far.castShadow = high;
    for (const l of [this.near, this.far]) if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
  }

  // Floodlight heads from the world (positions of the lamps); lights are pooled near the rider.
  setLamps(lamps) {
    this.lamps = lamps;
  }

  buildMist() {
    const tex = mistTexture();
    this.mist = [];
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
      m.userData.seed = Math.random();
      this.group.add(m);
      this.mist.push(m);
    }
    this.mistReady = false;
  }

  // ---------- CPU side of the sky model ----------

  transmit(y, out) {
    const m = airMass(y), tm = this.weather.turbidity;
    return out.set(Math.exp(-(TAU_R[0] + tm) * m), Math.exp(-(TAU_R[1] + tm) * m), Math.exp(-(TAU_R[2] + tm) * m));
  }

  skyRadiance(v, out) {
    const tm = this.weather.turbidity, u = this.uniforms;
    const tau = [TAU_R[0] + tm, TAU_R[1] + tm, TAU_R[2] + tm];
    const m = airMass(Math.max(v.y, 0));
    const add = (l, E) => {
      const mu = v.dot(l);
      const pr = 3 / (16 * Math.PI) * (1 + mu * mu);
      const g = 0.76, pm = (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * mu, 1.5));
      for (let k = 0; k < 3; k++) {
        const s = (TAU_R[k] * pr + tm * pm) / tau[k];
        out.setComponent(k, out.getComponent(k) + E.getComponent(k) * s * (1 - Math.exp(-tau[k] * m)));
      }
    };
    out.set(0, 0, 0);
    add(this.sun, u.uSunCol.value);
    add(this.moon, u.uMoonCol.value);
    out.addScaledVector(u.uAmb.value, 0.35 + 0.65 * (1 - Math.max(v.y, 0)));
    return out.multiplyScalar(SKY_SCALE);
  }

  // ---------- per frame ----------

  update(dt, camera, focus) {
    this.time += dt;
    if (this.cycle) this.hours = (this.hours + dt * (24 / 360)) % 24;
    const W = this.weather, u = this.uniforms;
    bodyDirection(this.hours, DEC, this.sun);
    bodyDirection(this.hours + 12, 10 * DEG, this.moon);
    u.uSun.value.copy(this.sun);
    u.uMoon.value.copy(this.moon);
    u.uTime.value = this.time;

    // day: the sun's disc above the horizon; twilight while it is just below
    const sy = this.sun.y, my = this.moon.y;
    const day = smooth(-0.035, 0.05, sy);
    const twilight = smooth(-0.2, -0.01, sy) * (1 - day);
    const night = 1 - smooth(-0.2, -0.04, sy);
    u.uDay.value = day; u.uNight.value = night;
    const t = this.transmit(Math.max(sy, 0), new THREE.Vector3());
    const sunE = t.clone().multiplyScalar(SUN_E * day);
    // twilight sky light: scattered from below the horizon, deep blue
    u.uSunCol.value.copy(sunE).add(new THREE.Vector3(0.2, 0.32, 0.6).multiplyScalar(twilight * 0.35));
    const tm = this.transmit(Math.max(my, 0), new THREE.Vector3());
    const moonE = tm.multiplyScalar(0.03 * smooth(-0.02, 0.1, my) * night);
    u.uMoonCol.value.copy(moonE);
    // multiple scattering and night glow
    u.uAmb.value.set(0.0025, 0.0065, 0.016).multiplyScalar(day * 3 + twilight * 1.2 + 0.25)
      .add(new THREE.Vector3(0.0006, 0.0010, 0.0022).multiplyScalar(night));

    // key light: the sun by day, the moon by night (they cross over near the horizon,
    // where both are weak, so the switch is invisible)
    const useSun = sy > -0.02 || my < 0.05;
    const keyDir = useSun ? this.sun : this.moon;
    const keyE = useSun ? sunE : moonE;
    const cloudDim = 1 - W.sunCloud;
    const keyI = Math.max(keyE.x, keyE.y, keyE.z) * cloudDim;
    const keyCol = new THREE.Color().setRGB(keyE.x, keyE.y, keyE.z).multiplyScalar(1 / Math.max(1e-4, Math.max(keyE.x, keyE.y, keyE.z)));
    this.near.color.copy(keyCol); this.far.color.copy(keyCol);
    this.near.intensity = keyI * 0.62;
    this.far.intensity = keyI * 0.38;
    this.lightDir.copy(keyDir.y > 0.02 ? keyDir : new THREE.Vector3(keyDir.x, 0.02, keyDir.z).normalize());

    // sky light: average of the sky above, ground bounce from the lit snow
    const zen = this.skyRadiance(new THREE.Vector3(0, 1, 0), new THREE.Vector3());
    // horizon at right angles to the sun: the typical colour behind distant terrain
    const hor = this.skyRadiance(new THREE.Vector3(this.sun.z, 0.08, -this.sun.x).normalize(), new THREE.Vector3());
    const skyAvg = zen.clone().multiplyScalar(0.55).addScaledVector(hor, 0.45);
    // overcast: the cloud deck diffuses the sun and becomes the light source; it dims with
    // the sun's height but much less than the direct beam through a long air path
    const deck = 0.3 * SUN_E * Math.pow(Math.max(sy, 0) + 0.02, 0.7) * day + 0.004 * twilight;
    const deckCol = new THREE.Vector3(0.95, 0.98, 1.03).multiplyScalar(deck);
    skyAvg.lerp(deckCol, W.sunCloud);
    hor.lerp(deckCol.clone().multiplyScalar(0.72), W.sunCloud);
    const skyI = Math.max(skyAvg.x, skyAvg.y, skyAvg.z);
    this.hemi.color.setRGB(skyAvg.x / skyI, skyAvg.y / skyI, skyAvg.z / skyI);
    const bounce = keyE.clone().multiplyScalar(0.25 * cloudDim).add(skyAvg.clone().multiplyScalar(0.4));
    const bI = Math.max(bounce.x, bounce.y, bounce.z, 1e-5);
    this.hemi.groundColor.setRGB(bounce.x / bI, bounce.y / bI, bounce.z / bI);
    this.hemi.intensity = skyI * 1.35;

    // shadow tint for the snow shader: the colour of the sky light, normalised
    const sl = (skyAvg.x + skyAvg.y + skyAvg.z) / 3 || 1;
    this.shade.set(skyAvg.x / sl, skyAvg.y / sl, skyAvg.z / sl).multiplyScalar(0.82);

    // fog: the colour of the horizon sky away from the sun
    this.fogColor.setRGB(hor.x, hor.y, hor.z);
    u.uFog.value.copy(hor);
    this.scene.fog.color.copy(this.fogColor);
    this.scene.fog.density = W.fog * (1 + night * 0.4);
    this.scene.background = this.fogColor;

    // exposure follows the light level like an eye (or a camera) adapts
    const level = keyI * 0.8 + skyI * 2.2;
    const ref = SUN_E * 0.55;
    const target = this.envExposure * Math.pow(clamp(ref / Math.max(level, 1e-4), 1, 60), 0.24);
    this.exposure = dt > 0 && !this.snap ? this.exposure + (target - this.exposure) * (1 - Math.exp(-2.5 * dt)) : target;
    this.snap = false;
    this.light = clamp(level / ref, 0.04, 1);

    this.updateShadows(focus);
    this.updateMist(camera, focus, night, day);
    this.updateLamps(focus, night * 0.8 + twilight * 0.6);
  }

  updateShadows(p) {
    if (!p) return;
    // the far cascade (190 m of forest) refreshes a few times a second; its light only moves
    // on those frames, so the map and its lookup always match
    this.farTick = (this.farTick ?? 0) + 1;
    const refreshFar = this.farTick % 8 === 1 || this.snapShadows;
    this.far.shadow.autoUpdate = false;
    if (refreshFar) this.far.shadow.needsUpdate = true;
    this.snapShadows = false;
    for (const [l, dist] of [[this.near, 220], [this.far, 450]]) {
      if (l === this.far && !refreshFar) continue;
      // follow the rider, snapped to whole shadow texels so the edges do not shimmer
      const c = l.shadow.camera;
      const t = (c.right - c.left) / l.shadow.mapSize.x;
      const cx = Math.round(p.x / t) * t, cy = Math.round(p.y / t) * t, cz = Math.round(p.z / t) * t;
      l.target.position.set(cx, cy, cz);
      l.position.set(cx + this.lightDir.x * dist, cy + this.lightDir.y * dist, cz + this.lightDir.z * dist);
    }
  }

  // Low banks of mist along the valley floor ahead, strongest in the morning and in cloud.
  updateMist(camera, focus, night, day) {
    if (!camera || !focus) return;
    const hourMist = smooth(9.5, 7.5, this.hours) * 0.5 + smooth(15.5, 17.5, this.hours) * 0.25 + night * 0.2;
    const amount = clamp(this.weather.mist + hourMist, 0, 0.75);
    const fwd = new THREE.Vector3(0, 0, -1);
    for (const m of this.mist) {
      if (!this.mistReady || m.position.distanceTo(camera.position) > 700 || m.position.z > camera.position.z + 60) {
        const s = Math.random();
        // lying in the valley floor, not up on the walls
        m.position.set((Math.random() - 0.5) * (this.valleyHalf ?? 30) * 2.4, 0, focus.z + fwd.z * (80 + s * 520));
        m.userData.h = 2 + Math.random() * 5;
        m.scale.set(70 + Math.random() * 80, 12 + Math.random() * 10, 1);
      }
      const ground = this.groundAt ? this.groundAt(m.position.x, m.position.z) : focus.y;
      m.position.y = ground + m.userData.h;
      const d = m.position.distanceTo(camera.position);
      m.material.opacity = amount * 0.7 * smooth(40, 140, d) * (0.55 + 0.45 * m.userData.seed);
      m.material.color.copy(this.fogColor).multiplyScalar(1.05 + day * 0.15);
      m.visible = m.material.opacity > 0.005;
    }
    this.mistReady = true;
  }

  updateLamps(focus, on) {
    if (!this.lamps.length || !focus) { for (const s of this.spots) s.intensity = 0; return; }
    // the pooled spot lights go to the lamps nearest the rider
    const near = [...this.lamps].sort((a, b) => a.head.distanceToSquared(focus) - b.head.distanceToSquared(focus)).slice(0, this.spots.length);
    this.spots.forEach((s, i) => {
      const l = near[i];
      if (!l) { s.intensity = 0; return; }
      s.position.copy(l.head);
      s.target.position.copy(l.aim);
      s.intensity = on * 70;
    });
    for (const l of this.lamps) {
      l.glow.material.opacity = on;
      l.cone.material.uniforms.opacity.value = on * 0.016;
      l.bulb.material.emissiveIntensity = on * 40;
    }
  }

  // Night lighting needs floodlight poles; built by the world for groomed parks.
  static buildPoles(course, root) {
    const lamps = [];
    if (!course.map.fences) return lamps;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5, metalness: 0.6 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xfff1dd, emissiveIntensity: 0, roughness: 0.3 });
    const glowTex = glowTexture();
    const coneGeo = new THREE.ConeGeometry(6, 11, 24, 1, true);
    coneGeo.translate(0, -5.5, 0);
    const coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { opacity: { value: 0 } },
      vertexShader: 'varying float vY; varying float vRim; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vRim = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float opacity; varying float vY; varying float vRim; void main(){ float a = smoothstep(-12.0, -1.0, vY) * smoothstep(0.0, 0.7, vRim); gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a * opacity, 1.0); }',
    });
    let k = 0;
    for (let d = 30; d < course.finishD + 30; d += 46) {
      const side = k++ % 2 ? 1 : -1;
      const x = side * (course.parkHalf + 3.5);
      const gy = course.heightAtD(x, d);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 11, 8), poleMat);
      pole.position.set(x, gy + 5.5, -d);
      pole.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 0.3), poleMat);
      arm.position.set(x - side * 1.0, gy + 10.9, -d);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.6), bulbMat.clone());
      const head = new THREE.Vector3(x - side * 2.0, gy + 10.7, -d);
      bulb.position.copy(head);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0dc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      glow.position.copy(head);
      glow.scale.setScalar(2.6);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.copy(head);
      // aim into the run, at the snow a few metres in
      const aim = new THREE.Vector3(x - side * 13, course.heightAtD(x - side * 13, d), -d);
      root.add(pole, arm, bulb, glow, cone);
      lamps.push({ head, aim, glow, cone, bulb });
    }
    return lamps;
  }
}
