// Slopestyle course: analytic height field (base slope + valley walls + park
// features) and rail geometry. Pure logic, no rendering, so physics can run
// headless. Coordinates: x = lateral (right is +x when facing downhill),
// z = -d, where d is the distance down the course.
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const BASE_ANGLE = 15 * DEG;
export const GRADE = Math.tan(BASE_ANGLE);
export const START_D = -80;
export const SPAWN_D = 6;
export const FINISH_D = 800;
export const RUNOUT = 80;
export const END_D = 1000;
export const PARK_HALF = 26;

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function baseY(d) {
  if (d <= FINISH_D) return -d * GRADE;
  const s = Math.min(d - FINISH_D, RUNOUT);
  return -FINISH_D * GRADE - GRADE * (s - (s * s) / (2 * RUNOUT));
}

// Valley walls and natural terrain outside the groomed park lane.
function lateral(x, d) {
  const ax = Math.abs(x);
  let y = 0;
  if (ax > PARK_HALF) {
    const e = ax - PARK_HALF;
    y += 45 * (1 - Math.exp(-(e * e) / 700)) + e * 0.15;
  }
  const w = smoothstep(PARK_HALF - 4, PARK_HALF + 12, ax);
  if (w > 0) {
    y += w * (Math.sin(x * 0.13 + d * 0.021) * Math.cos(d * 0.047 - x * 0.06) * 1.6 +
      Math.sin(d * 0.16 + x * 0.29) * 0.3);
  }
  // uphill of the start the terrain rises into a ridge
  if (d < -20) y += (d + 20) * (d + 20) * 0.012;
  return y;
}

// Height gained over a horizontal run whose surface angle changes linearly a0 -> a1.
function arcRise(a0, a1, len) {
  if (Math.abs(a1 - a0) < 1e-6) return len * Math.tan(a0);
  return (len / (a1 - a0)) * (Math.log(Math.cos(a0)) - Math.log(Math.cos(a1)));
}

function sideFalloff(h, x, cx, halfWidth, k = 0.8, min = 1.5) {
  const dx = Math.abs(x - cx) - halfWidth;
  if (dx <= 0) return h;
  const side = min + h * k;
  if (dx >= side) return 0;
  return h * (1 - smoothstep(0, 1, dx / side));
}

// A table-top kicker: takeoff arc -> lip -> deck -> knuckle -> landing -> runout.
// Landing length is solved so the profile rejoins the base slope exactly.
export class Kicker {
  constructor(o) {
    Object.assign(this, { knuckle: 5, land: 24, runout: 9, deck: -2, width: 9 }, o);
    this.type = 'kicker';
    const ab = -BASE_ANGLE, lip = this.lip * DEG, deck = this.deck * DEG, land = -this.land * DEG;
    const segs = [
      { len: this.takeoff, a0: ab, a1: lip },
      { len: this.table, a0: deck, a1: deck },
      { len: this.knuckle, a0: deck, a1: land },
    ];
    let u = 0, p = 0;
    for (const s of segs) { p += arcRise(s.a0, s.a1, s.len); u += s.len; }
    const rr = arcRise(land, ab, this.runout);
    const landLen = (p + rr + GRADE * (u + this.runout)) / (Math.tan(-land) - GRADE);
    segs.push({ len: landLen, a0: land, a1: land }, { len: this.runout, a0: land, a1: ab });
    this.segs = segs;
    this.landLen = landLen;
    this.len = segs.reduce((a, s) => a + s.len, 0);
    this.lipU = this.takeoff;
    this.knuckleU = this.takeoff + this.table;
    this.landU = this.knuckleU + this.knuckle;
    this.dMin = this.d;
    this.dMax = this.d + this.len;

    this.step = 0.1;
    const n = Math.ceil(this.len / this.step) + 2;
    this.tab = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const uu = Math.min(i * this.step, this.len);
      this.tab[i] = this.profile(uu) + GRADE * uu;
    }
  }

  profile(u) {
    let y = 0;
    for (const s of this.segs) {
      if (u <= s.len) {
        const a = s.a0 + (s.a1 - s.a0) * (u / s.len);
        return y + arcRise(s.a0, a, u);
      }
      y += arcRise(s.a0, s.a1, s.len);
      u -= s.len;
    }
    return y;
  }

  centerOffset(d) {
    const u = d - this.d;
    if (u <= 0 || u >= this.len) return 0;
    const f = u / this.step, i = f | 0, t = f - i;
    return this.tab[i] * (1 - t) + this.tab[i + 1] * t;
  }

  heightOffset(x, d) {
    if (d <= this.dMin || d >= this.dMax) return 0;
    return sideFalloff(this.centerOffset(d), x, this.x, this.width / 2);
  }
}

// Small snow ramp leading up to the start of a box or rail.
export class Ramp {
  constructor(o) {
    Object.assign(this, { width: 2.2 }, o);
    this.type = 'ramp';
    this.dMin = this.d;
    this.dMax = this.d + this.len;
  }
  heightOffset(x, d) {
    if (d <= this.dMin || d >= this.dMax) return 0;
    const u = (d - this.d) / this.len;
    return sideFalloff(this.h * Math.pow(u, 1.6), x, this.x, this.width / 2, 0.5, 0.8);
  }
}

// Rails and boxes run straight down the fall line; each segment has an absolute angle
// (negative = downhill). Heights are relative to the base slope at the start.
export class Rail {
  constructor(o) {
    Object.assign(this, { kind: 'rail' }, o);
    this.tol = this.kind === 'box' ? 0.62 : 0.48;
    const pts = [];
    let d = this.d, y = baseY(this.d) + this.h;
    pts.push(new THREE.Vector3(this.x, y, -d));
    for (const s of this.segs) {
      d += s.len;
      y += s.len * Math.tan(s.angle * DEG);
      pts.push(new THREE.Vector3(this.x, y, -d));
    }
    this.points = pts;
    this.segments = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      dir.normalize();
      this.segments.push({ a, b, dir, len, hlen: Math.hypot(dir.x, dir.z) });
    }
    this.zMax = -this.d;
    this.zMin = -d;
  }
}

export class Course {
  constructor() {
    this.kickers = [
      // line 1
      new Kicker({ name: 'Kicker S', x: -9, d: 125, width: 8, lip: 20, takeoff: 7, table: 5, land: 22 }),
      new Kicker({ name: 'Kicker M', x: 9.5, d: 120, width: 9, lip: 24, takeoff: 10, table: 9, land: 24 }),
      // line 2
      new Kicker({ name: 'Kicker M', x: -9, d: 235, width: 9, lip: 24, takeoff: 10, table: 9, land: 24 }),
      new Kicker({ name: 'Kicker L', x: 9.5, d: 230, width: 10, lip: 27, takeoff: 12, table: 12, land: 26 }),
      // line 3: the money booter
      new Kicker({ name: 'Kicker XL', x: 0, d: 440, width: 12, lip: 28, takeoff: 13, table: 10, land: 27, knuckle: 6 }),
      // line 4
      new Kicker({ name: 'Kicker M', x: -9, d: 590, width: 9, lip: 24, takeoff: 10, table: 9, land: 24 }),
      new Kicker({ name: 'Kicker L', x: 9.5, d: 585, width: 10, lip: 27, takeoff: 12, table: 12, land: 26 }),
    ];

    const R = (o) => o;
    const railDefs = [
      // rail garden 1
      R({ name: 'Down Box', kind: 'box', x: -11, d: 57, h: 0.48, ramp: 5, segs: [{ len: 12, angle: -15 }] }),
      R({ name: 'Flat-Down Rail', kind: 'rail', x: 0, d: 62, h: 0.52, ramp: 5, segs: [{ len: 3.5, angle: -6 }, { len: 10, angle: -15 }] }),
      R({ name: 'Kink Rail', kind: 'rail', x: 11, d: 60, h: 0.8, segs: [{ len: 5, angle: -15 }, { len: 3, angle: -25 }, { len: 5, angle: -15 }] }),
      // rail garden 2
      R({ name: 'Long Down Rail', kind: 'rail', x: -10, d: 355, h: 0.55, ramp: 5, segs: [{ len: 18, angle: -15 }] }),
      R({ name: 'Kink Box', kind: 'box', x: 0, d: 362, h: 0.5, ramp: 5, segs: [{ len: 5, angle: -8 }, { len: 6, angle: -24 }] }),
      R({ name: 'Down Rail', kind: 'rail', x: 10.5, d: 358, h: 0.72, segs: [{ len: 14, angle: -15 }] }),
      // final jib line
      R({ name: 'Rainbow Box', kind: 'box', x: -8, d: 700, h: 0.45, ramp: 5, segs: [{ len: 4, angle: 4 }, { len: 4, angle: -15 }, { len: 4, angle: -32 }] }),
      R({ name: 'Down Box', kind: 'box', x: 8, d: 702, h: 0.48, ramp: 5, segs: [{ len: 14, angle: -15 }] }),
    ];
    this.rails = railDefs.map((o) => new Rail(o));
    this.ramps = [];
    for (const r of this.rails) {
      if (r.ramp) this.ramps.push(new Ramp({ x: r.x, d: r.d - r.ramp, len: r.ramp, h: r.h - 0.06 }));
    }
    this.features = [...this.kickers, ...this.ramps];
  }

  heightAtD(x, d) {
    let y = baseY(d) + lateral(x, d);
    const f = this.features;
    for (let i = 0; i < f.length; i++) {
      if (d > f[i].dMin && d < f[i].dMax) y += f[i].heightOffset(x, d);
    }
    return y;
  }

  heightAt(x, z) { return this.heightAtD(x, -z); }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.12;
    const hx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const hz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out.set(-hx, 1, -hz).normalize();
  }
}
