// Course: analytic height field (base slope + valley walls + park features)
// and rail geometry, built from a map definition (src/maps.js). Pure logic,
// no rendering, so physics can run headless. Coordinates: x = lateral (right
// is +x when facing downhill), z = -d, where d is the distance down the course.
import * as THREE from 'three';
import { MAPS } from './maps.js';

export const DEG = Math.PI / 180;

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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
// Natural kickers (windlips) get a wide, soft shoulder instead of a shaped wall.
export class Kicker {
  constructor(o, course) {
    Object.assign(this, { knuckle: 5, land: 24, runout: 9, deck: -2, width: 9, natural: false }, o);
    this.type = 'kicker';
    const base = course.angle;
    const grade = course.grade;
    const ab = -base, lip = this.lip * DEG, deck = this.deck * DEG, land = -this.land * DEG;
    const segs = [
      { len: this.takeoff, a0: ab, a1: lip },
      { len: this.table, a0: deck, a1: deck },
      { len: this.knuckle, a0: deck, a1: land },
    ];
    let u = 0, p = 0;
    for (const s of segs) { p += arcRise(s.a0, s.a1, s.len); u += s.len; }
    const rr = arcRise(land, ab, this.runout);
    const landLen = (p + rr + grade * (u + this.runout)) / (Math.tan(-land) - grade);
    segs.push({ len: landLen, a0: land, a1: land }, { len: this.runout, a0: land, a1: ab });
    this.segs = segs;
    this.landLen = landLen;
    this.len = segs.reduce((a, s) => a + s.len, 0);
    this.lipU = this.takeoff;
    this.knuckleU = this.takeoff + this.table;
    this.landU = this.knuckleU + this.knuckle;
    this.dMin = this.d;
    this.dMax = this.d + this.len;
    this.falloff = this.natural ? [2.2, 4] : [0.8, 1.5];

    this.step = 0.1;
    const n = Math.ceil(this.len / this.step) + 2;
    this.tab = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const uu = Math.min(i * this.step, this.len);
      this.tab[i] = this.profile(uu) + grade * uu;
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
    return sideFalloff(this.centerOffset(d), x, this.x, this.width / 2, this.falloff[0], this.falloff[1]);
  }
}

// Smooth natural bump across (part of) the slope. Riding over it fast gives air.
export class Roller {
  constructor(o) {
    Object.assign(this, { width: 30, x: 0 }, o);
    this.type = 'roller';
    this.dMin = this.d;
    this.dMax = this.d + this.len;
  }
  heightOffset(x, d) {
    if (d <= this.dMin || d >= this.dMax) return 0;
    const u = (d - this.d) / this.len;
    // steeper back side than front side, like a wind-blown roll
    const s = u < 0.55 ? Math.sin((u / 0.55) * Math.PI / 2) : Math.cos(((u - 0.55) / 0.45) * Math.PI / 2);
    return sideFalloff(this.h * s * s, x, this.x, this.width / 2, 2.5, 6);
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
    const cx = this.x + (this.x1 - this.x) * u;
    return sideFalloff(this.h * Math.pow(u, 1.6), x, cx, this.width / 2, 0.5, 0.8);
  }
}

// Rails, boxes, ledges and logs. Each segment has an absolute pitch angle
// (negative = downhill); `yaw` turns the whole feature off the fall line.
// Heights are relative to the base slope at the start.
const RAIL_TOL = { rail: 0.48, box: 0.62, ledge: 0.7, log: 0.55 };

export class Rail {
  constructor(o, course) {
    Object.assign(this, { kind: 'rail', yaw: 0 }, o);
    this.tol = RAIL_TOL[this.kind] ?? 0.5;
    const yaw = this.yaw * DEG;
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    // Built features are set relative to the base slope; fallen logs lie on the real snow,
    // which in the backcountry undulates, so their points follow the terrain.
    const onSnow = this.kind === 'log';
    const pts = [];
    let d = this.d, x = this.x, y = (onSnow ? course.heightAtD(x, d) : course.baseY(this.d)) + this.h;
    pts.push(new THREE.Vector3(x, y, -d));
    for (const s of this.segs) {
      d += s.len * cz;
      x += s.len * sx;
      y = onSnow ? course.heightAtD(x, d) + this.h : y + s.len * Math.tan(s.angle * DEG);
      pts.push(new THREE.Vector3(x, y, -d));
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
    this.length = this.segments.reduce((acc, s) => acc + s.len, 0);
    this.zMax = Math.max(...pts.map((p) => p.z));
    this.zMin = Math.min(...pts.map((p) => p.z));
  }
}

export class Course {
  constructor(map = MAPS[0]) {
    this.map = map;
    this.angle = map.slope * DEG;
    this.grade = Math.tan(this.angle);
    this.startD = -80;
    this.spawnD = 6;
    this.finishD = map.length;
    this.runout = 80;
    // terrain continues past the runout into the hill that closes the valley
    this.endD = map.length + this.runoutLen() + 300;
    this.parkHalf = map.parkHalf ?? 26;
    // groomed lane half width (0 = all natural snow) and how deep the untouched snow is
    this.groomHalf = map.snow?.groomHalf ?? this.parkHalf;
    this.powder = map.snow?.powder ?? 0.5;

    this.kickers = (map.kickers || []).map((o) => new Kicker(o, this));
    this.rollers = (map.rollers || []).map((o) => new Roller(o));
    // terrain without ramps first, so rails that lie on the snow can sample it
    this.features = [...this.kickers, ...this.rollers];
    this.rails = (map.rails || []).map((o) => new Rail(o, this));
    this.ramps = [];
    for (const r of this.rails) {
      if (!r.ramp) continue;
      // the ramp runs up to the rail start along the rail's own heading
      const yaw = r.yaw * DEG;
      this.ramps.push(new Ramp({ x: r.x - Math.sin(yaw) * r.ramp, x1: r.x, d: r.d - Math.cos(yaw) * r.ramp, len: Math.cos(yaw) * r.ramp, h: r.h - 0.06 }));
    }
    this.features = [...this.kickers, ...this.rollers, ...this.ramps];
    // rocks and trees in the riding area: hitting one is a crash
    this.obstacles = (map.obstacles || []).map((o) => ({ ...o, y: 0 }));
    for (const o of this.obstacles) o.y = this.heightAtD(o.x, o.d);
  }

  runoutLen() { return 80; }

  baseY(d) {
    const g = this.grade, f = this.finishD;
    if (d <= f) return -d * g;
    const s = Math.min(d - f, this.runout);
    return -f * g - g * (s - (s * s) / (2 * this.runout));
  }

  // Valley walls and natural terrain outside the groomed park lane.
  lateral(x, d) {
    const ph = this.parkHalf;
    const ax = Math.abs(x);
    let y = 0;
    if (ax > ph) {
      const e = ax - ph;
      y += 45 * (1 - Math.exp(-(e * e) / 700)) + e * 0.15;
    }
    const w = smoothstep(ph - 4, ph + 12, ax);
    const rough = this.map.roughness ?? 0;
    if (w > 0) {
      y += w * (Math.sin(x * 0.13 + d * 0.021) * Math.cos(d * 0.047 - x * 0.06) * 1.6 +
        Math.sin(d * 0.16 + x * 0.29) * 0.3);
    }
    // backcountry: gentle natural undulation over the whole slope
    if (rough > 0) {
      y += rough * (Math.sin(d * 0.045 + x * 0.05) * 0.9 + Math.sin(d * 0.11 - x * 0.13) * 0.35 + Math.sin(x * 0.21 + d * 0.02) * 0.25);
    }
    // far past the runout the valley floor fills up to its walls (no gorge in the head wall)
    const fillFrom = this.finishD + this.runout + 90;
    if (d > fillFrom) {
      const f = Math.min(1, (d - fillFrom) / 300);
      y += Math.max(0, 48 - y) * f * f * (3 - 2 * f);
    }
    // uphill of the start the terrain rises into a ridge; past the runout the valley closes
    if (d < -20) y += (d + 20) * (d + 20) * 0.012;
    const end = this.finishD + this.runout + 30;
    // a rounded rise past the runout, steepening further out into the valley's head wall
    if (d > end) {
      const e = d - end;
      const s = Math.min(1, Math.max(0, (e - 120) / 800));
      y += 38 * (1 - Math.exp(-((e / 70) ** 2))) + 240 * s * s * (3 - 2 * s);
    }
    return y;
  }

  heightAtD(x, d) {
    let y = this.baseY(d) + this.lateral(x, d);
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

  // 0 on groomed corduroy, up to 1 in deep untouched snow.
  powderAt(x) {
    const ax = Math.abs(x);
    const off = this.groomHalf > 0 ? smoothstep(this.groomHalf - 1, this.groomHalf + 6, ax) : 1;
    return this.powder * off;
  }

  // Obstacle the rider at p would hit (horizontal radius + height), or null.
  obstacleAt(p, pad = 0.3) {
    for (const o of this.obstacles) {
      const dx = p.x - o.x, dz = p.z + o.d;
      if (dx * dx + dz * dz > (o.r + pad) * (o.r + pad)) continue;
      if (p.y < o.y + o.h) return o;
    }
    return null;
  }
}
