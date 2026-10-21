// Arcade snowboard physics: ground carving, air rotation, rail grinds, crashes.
// Emits events (takeoff, land, grindStart, grindEnd, crash, respawn, finish)
// that the trick system and effects consume.
import * as THREE from 'three';
import { DEG, SPAWN_D, FINISH_D } from './course.js';

const G = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3();
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();

export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapPi = (a) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};
export const forward = (h, out) => out.set(-Math.sin(h), 0, -Math.cos(h));

const MAX_CHARGE = 0.55;

export class RiderPhysics {
  constructor(course) {
    this.course = course;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.stats = { speed: 1, pop: 1, spin: 1 };
    this.events = [];
    this.finished = false;
    this.reset();
  }

  reset(d = SPAWN_D, x = 0, speed = 7) {
    const c = this.course;
    this.pos.set(x, c.heightAtD(x, d), -d);
    c.normalAt(this.pos.x, this.pos.z, this.normal);
    this.vel.set(0, 0, -1).addScaledVector(this.normal, this.normal.z).normalize().multiplyScalar(speed);
    this.heading = 0;
    this.switch = false;
    this.state = 'ground';
    this.flip = 0; this.spinVel = 0; this.flipVel = 0; this.spinAccum = 0;
    this.edge = 0; this.skid = 0; this.charge = 0; this.popWindow = 0;
    this.airTime = 0; this.grab = null; this.grabs = []; this.flipLock = false;
    this.takeoffSwitch = false;
    this.grind = null; this.balance = 0; this.balanceVel = 0; this.balanceNoise = 0;
    this.noiseT = 0; this.noiseTarget = 0;
    this.crashT = 0; this.tumble = 0; this.tumbleAxis = new THREE.Vector3(1, 0, 0);
    this.groundTime = 0; this.relockT = 0; this.landT = 1; this.impact = 0;
  }

  restart() {
    this.finished = false;
    this.reset();
  }

  get speed() { return this.vel.length(); }
  get distance() { return -this.pos.z; }

  maxSpin() { return 9.6 * this.stats.spin; }

  travelHeading() {
    const vx = this.vel.x, vz = this.vel.z;
    if (vx * vx + vz * vz < 0.04) return this.heading + (this.switch ? Math.PI : 0);
    return Math.atan2(-vx, -vz);
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  update(dt, inp) {
    this.relockT = Math.max(0, this.relockT - dt);
    this.landT += dt;
    switch (this.state) {
      case 'ground': this.updateGround(dt, inp); break;
      case 'air': this.updateAir(dt, inp); break;
      case 'grind': this.updateGrind(dt, inp); break;
      case 'crash': this.updateCrash(dt); break;
    }
    if (!this.finished && this.distance > FINISH_D) {
      this.finished = true;
      this.emit('finish');
    }
  }

  updateGround(dt, inp) {
    const c = this.course, n = this.normal, v = this.vel;
    this.groundTime += dt;
    let sp = v.length();

    const turn = THREE.MathUtils.lerp(2.5, 1.45, clamp(sp / 24, 0, 1)) * (this.finished ? 0.5 : 1);
    this.heading += inp.steer * turn * dt;
    this.edge = damp(this.edge, inp.steer * clamp(sp / 10, 0.25, 1), 7, dt);
    this.skid = damp(this.skid, inp.down || this.finished ? 1 : 0, 6, dt);

    v.y -= G * dt;
    v.addScaledVector(n, -v.dot(n));
    sp = v.length();

    // Edge grip pulls the velocity toward where the board points.
    const ride = forward(this.heading + (this.switch ? Math.PI : 0), tA);
    ride.addScaledVector(n, -ride.dot(n)).normalize();
    if (sp > 0.4) {
      if (v.dot(ride) < -0.2 * sp) {
        this.switch = !this.switch;
        ride.negate();
      }
      const grip = inp.down ? 2.5 : 8;
      tB.copy(ride).multiplyScalar(sp);
      v.lerp(tB, 1 - Math.exp(-grip * dt));
    } else {
      v.copy(ride).multiplyScalar(sp);
    }

    const drag = (inp.up ? 0.0034 : 0.0052) / this.stats.speed;
    const dec = 0.035 * G * n.y + drag * sp * sp + (inp.down ? 7.5 : 0) + (this.finished ? 5 : 0);
    const acc = inp.up && sp < 8 && !this.finished ? 2.4 : 0;
    sp = Math.max(0, sp + (acc - dec) * dt);
    if (v.lengthSq() > 1e-8) v.setLength(sp);
    else v.copy(ride).multiplyScalar(sp);

    if (inp.jumpHeld && !this.finished) this.charge = Math.min(this.charge + dt, MAX_CHARGE);
    if (inp.jumpReleased && this.charge > 0) {
      const k = this.charge / MAX_CHARGE;
      v.addScaledVector(n, (3.2 + 2.8 * k) * this.stats.pop);
      this.charge = 0;
      this.takeoff('ollie', inp);
      this.pos.addScaledVector(v, dt);
      return;
    }

    this.pos.addScaledVector(v, dt);
    const gy = c.heightAt(this.pos.x, this.pos.z);
    // The ground falls away faster than the board can follow: we left a lip.
    if (this.pos.y - gy > 0.012) {
      this.takeoff('lip', inp);
      return;
    }
    this.pos.y = gy;
    c.normalAt(this.pos.x, this.pos.z, n);
    const s2 = v.length();
    v.addScaledVector(n, -v.dot(n));
    if (v.lengthSq() > 1e-8) v.setLength(s2);
    this.checkRails(inp);
  }

  takeoff(kind, inp) {
    this.state = 'air';
    this.airTime = 0;
    this.spinAccum = 0;
    this.flip = 0;
    this.flipVel = 0;
    this.spinVel = kind === 'rail' ? 0 : inp.steer * this.maxSpin() * 0.5;
    this.flipLock = inp.up || inp.down;
    this.takeoffSwitch = this.switch;
    this.grabs = [];
    this.grab = null;
    this.popWindow = kind === 'lip' && this.charge > 0 ? 0.16 : 0;
    if (kind !== 'lip') this.charge = 0;
    this.skid = 0;
    this.takeoffKind = kind;
    this.emit('takeoff', { kind });
  }

  updateAir(dt, inp) {
    const v = this.vel;
    this.airTime += dt;

    // Releasing the charged pop right at the lip adds height.
    if (this.popWindow > 0) {
      this.popWindow -= dt;
      if (inp.jumpReleased) {
        const k = this.charge / MAX_CHARGE;
        v.y += (1.8 + 2.6 * k) * this.stats.pop;
        this.popWindow = 0;
        this.emit('pop');
      } else if (inp.jumpHeld) {
        this.charge = Math.min(this.charge + dt, MAX_CHARGE);
      }
      if (this.popWindow <= 0) this.charge = 0;
    }

    v.y -= G * dt;
    v.multiplyScalar(1 - 0.0016 * v.length() * dt);

    // Spin: held input drives the spin, otherwise ease to the nearest clean 180.
    const th = this.travelHeading();
    if (inp.steer !== 0) {
      this.spinVel = damp(this.spinVel, inp.steer * this.maxSpin(), 6, dt);
    } else {
      const rel = this.heading - th;
      const target = Math.round((rel + this.spinVel * 0.22) / Math.PI) * Math.PI;
      this.spinVel = damp(this.spinVel, (target - rel) * 7, 9, dt);
    }
    this.heading += this.spinVel * dt;
    this.spinAccum += this.spinVel * dt;

    // Flips only respond to a fresh press after takeoff.
    if (this.flipLock && !inp.up && !inp.down) this.flipLock = false;
    const maxFlip = 6.3 * (0.85 + 0.15 * this.stats.spin);
    const fIn = this.flipLock ? 0 : (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    if (fIn !== 0) {
      this.flipVel = damp(this.flipVel, fIn * maxFlip, 5, dt);
    } else {
      const tgt = Math.round((this.flip + this.flipVel * 0.25) / (2 * Math.PI)) * 2 * Math.PI;
      this.flipVel = damp(this.flipVel, (tgt - this.flip) * 6, 8, dt);
    }
    this.flip += this.flipVel * dt;

    if (inp.grab) {
      if (!this.grab || this.grab.name !== inp.grab) {
        this.grab = { name: inp.grab, time: 0 };
        this.grabs.push(this.grab);
        this.emit('grab', { name: inp.grab });
      }
      this.grab.time += dt;
    } else {
      this.grab = null;
    }

    this.pos.addScaledVector(v, dt);
    if (this.checkRails(inp)) return;
    const gy = this.course.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      this.land();
    }
  }

  airQuat(out) {
    out.setFromAxisAngle(UP, this.heading);
    qA.setFromAxisAngle(AX_X, this.flip);
    return out.multiply(qA);
  }

  land() {
    const n = this.course.normalAt(this.pos.x, this.pos.z, this.normal);
    const v = this.vel;
    const up = tA.set(0, 1, 0).applyQuaternion(this.airQuat(qB));
    const upErr = Math.acos(clamp(up.dot(n), -1, 1));
    const th = this.travelHeading();
    const rel = wrapPi(this.heading - th);
    const yawErr = Math.min(Math.abs(rel), Math.PI - Math.abs(rel));
    const sw = Math.abs(rel) > Math.PI / 2;
    const impact = Math.max(0, -v.dot(n));
    const grabbing = !!this.grab;

    let quality = 'clean';
    if (upErr > 62 * DEG || yawErr > 58 * DEG || impact > 18) quality = 'crash';
    else if (upErr > 28 * DEG || yawErr > 24 * DEG || impact > 12 || grabbing) quality = 'sketchy';

    const data = {
      quality,
      spinDeg: Math.round(Math.abs(this.spinAccum) / Math.PI) * 180,
      spinDir: Math.sign(this.spinAccum),
      flips: Math.round(Math.abs(this.flip) / (2 * Math.PI)),
      flipDir: Math.sign(this.flip),
      airTime: this.airTime,
      grabs: this.grabs.map((g) => ({ ...g })),
      takeoffSwitch: this.takeoffSwitch,
      takeoffKind: this.takeoffKind,
      landSwitch: sw,
      impact, upErr, yawErr,
    };

    v.addScaledVector(n, -v.dot(n));
    v.multiplyScalar(quality === 'clean' ? 0.98 : quality === 'sketchy' ? 0.78 : 0.5);
    this.switch = sw;
    this.heading = th + (sw ? Math.PI : 0);
    this.flip = 0; this.spinVel = 0; this.flipVel = 0; this.grab = null;
    this.state = 'ground';
    this.groundTime = 0;
    this.landT = 0;
    this.impact = impact;
    this.emit('land', data);
    if (quality === 'crash') this.crash('land');
  }

  checkRails(inp) {
    if (this.relockT > 0 || this.finished) return false;
    const p = this.pos, v = this.vel;
    if (v.y > 2.5) return false;
    const hs = Math.hypot(v.x, v.z);
    if (hs < 1.5) return false;
    for (const rail of this.course.rails) {
      if (p.z > rail.zMax + 0.5 || p.z < rail.zMin - 0.5) continue;
      for (let i = 0; i < rail.segments.length; i++) {
        const s = rail.segments[i];
        let t = tB.subVectors(p, s.a).dot(s.dir);
        if (t < -0.35 || t > s.len) continue;
        t = Math.max(0, t);
        tC.copy(s.a).addScaledVector(s.dir, t);
        const hd = Math.hypot(p.x - tC.x, p.z - tC.z);
        const dy = p.y - tC.y;
        if (hd > rail.tol || dy < -0.38 || dy > 0.45) continue;
        if ((v.x * s.dir.x + v.z * s.dir.z) / (hs * s.hlen) < 0.6) continue;
        this.startGrind(rail, i, t, inp);
        return true;
      }
    }
    return false;
  }

  startGrind(rail, segIdx, t, inp) {
    if (this.state === 'air' && Math.abs(wrapPi(this.flip)) > 0.6) {
      this.crash('rail');
      return;
    }
    const s = rail.segments[segIdx];
    const railHeading = Math.atan2(-s.dir.x, -s.dir.z);
    const rel = wrapPi(this.heading - railHeading);
    const q = Math.round(rel / (Math.PI / 2));
    const type = Math.abs(q) % 2 === 1 ? 'Boardslide' : '50-50';
    this.state = 'grind';
    this.grind = {
      rail, seg: segIdx, t, railHeading,
      speed: Math.max(3, this.vel.dot(s.dir)),
      type, rel: (q * Math.PI) / 2, dist: 0, time: 0, press: null, pressTime: 0,
      fromAir: this.airTime > 0.05,
    };
    if (type === '50-50') this.switch = Math.abs(q) === 2;
    this.heading = railHeading + this.grind.rel;
    this.flip = 0; this.spinVel = 0; this.flipVel = 0; this.grab = null;
    this.balance = (Math.random() - 0.5) * 0.15;
    this.balanceVel = 0;
    this.balanceNoise = 0;
    this.noiseT = 0;
    this.charge = 0;
    this.emit('grindStart', { type, rail: rail.name, kind: rail.kind });
  }

  updateGrind(dt, inp) {
    const g = this.grind, rail = g.rail;
    let s = rail.segments[g.seg];
    g.time += dt;
    g.speed += (-G * s.dir.y - 0.45 - 0.003 * g.speed * g.speed) * dt;
    g.speed = Math.max(g.speed, 1.2);

    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 0.35 + Math.random() * 0.4;
      this.noiseTarget = (Math.random() * 2 - 1) * (0.9 + g.time * 0.35);
    }
    this.balanceNoise = damp(this.balanceNoise, this.noiseTarget, 3, dt);
    this.balanceVel += (this.balance * 1.6 + this.balanceNoise - inp.steer * 3.4) * dt;
    this.balanceVel *= Math.exp(-1.5 * dt);
    this.balance += this.balanceVel * dt;

    if (g.type === '50-50') {
      const press = inp.up ? 'Nose Press' : inp.down ? 'Tail Press' : null;
      if (press) {
        if (g.press !== press) { g.press = press; g.pressTime = 0; }
        g.pressTime += dt;
      }
    }

    if (Math.abs(this.balance) > 1) {
      this.vel.copy(s.dir).multiplyScalar(g.speed);
      tA.set(-s.dir.z, 0, s.dir.x).normalize().multiplyScalar(Math.sign(this.balance) * 1.5);
      this.vel.add(tA);
      this.emit('grindEnd', { type: g.type, press: g.press, dist: g.dist, time: g.time, rail: rail.name, kind: rail.kind, bail: true });
      this.grind = null;
      this.relockT = 0.6;
      this.crash('rail');
      return;
    }

    if (inp.jumpHeld) this.charge = Math.min(this.charge + dt, MAX_CHARGE);

    const step = g.speed * dt;
    g.t += step;
    g.dist += step;
    while (g.t > s.len) {
      g.t -= s.len;
      g.seg++;
      if (g.seg >= rail.segments.length) {
        this.pos.copy(s.b);
        this.exitGrind(inp, false);
        return;
      }
      s = rail.segments[g.seg];
    }
    this.pos.copy(s.a).addScaledVector(s.dir, g.t);
    this.vel.copy(s.dir).multiplyScalar(g.speed);

    if (inp.jumpReleased) this.exitGrind(inp, true);
  }

  exitGrind(inp, popped) {
    const g = this.grind;
    const s = g.rail.segments[Math.min(g.seg, g.rail.segments.length - 1)];
    this.vel.copy(s.dir).multiplyScalar(g.speed);
    const k = this.charge / MAX_CHARGE;
    this.vel.y += popped ? (3.2 + 1.6 * k) * this.stats.pop : 1.0;
    this.emit('grindEnd', { type: g.type, press: g.press, pressTime: g.pressTime, dist: g.dist, time: g.time, rail: g.rail.name, kind: g.rail.kind, bail: false });
    // Pop out of a boardslide back in line with the direction of travel.
    const th = this.travelHeading();
    const rel = wrapPi(this.heading - th);
    this.switch = Math.abs(rel) > Math.PI / 2 + 0.01;
    this.heading = th + (this.switch ? Math.PI : 0);
    this.grind = null;
    this.relockT = 0.4;
    this.charge = 0;
    this.takeoff('rail', inp);
  }

  crash(reason) {
    this.state = 'crash';
    this.crashT = 0;
    this.grab = null;
    this.grind = null;
    this.charge = 0;
    this.tumble = 0;
    const a = Math.random() * Math.PI * 2;
    this.tumbleAxis.set(Math.cos(a), 0.3, Math.sin(a)).normalize();
    this.emit('crash', { reason });
  }

  updateCrash(dt) {
    const v = this.vel, c = this.course;
    this.crashT += dt;
    v.y -= G * dt;
    this.pos.addScaledVector(v, dt);
    const gy = c.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      c.normalAt(this.pos.x, this.pos.z, this.normal);
      v.addScaledVector(this.normal, -v.dot(this.normal));
      v.multiplyScalar(Math.exp(-1.8 * dt));
    }
    this.tumble += dt * clamp(v.length() * 0.5, 0, 9);
    if (this.crashT > 2.2) this.respawn();
  }

  respawn() {
    const d = clamp(this.distance, SPAWN_D, FINISH_D + 30);
    const x = clamp(this.pos.x, -18, 18);
    this.reset(d, x, this.finished ? 0 : 5);
    this.emit('respawn');
  }

  // Board orientation for rendering.
  orientation(out) {
    if (this.state === 'air') return this.airQuat(out);
    let up = this.normal;
    if (this.state === 'grind') {
      const dir = this.grind.rail.segments[this.grind.seg].dir;
      up = tA.copy(UP).addScaledVector(dir, -dir.y).normalize();
    }
    out.setFromUnitVectors(UP, up);
    const skidSign = this.switch ? -1 : 1;
    qA.setFromAxisAngle(UP, this.heading + this.skid * 0.95 * skidSign);
    out.multiply(qA);
    if (this.state === 'ground') {
      qA.setFromAxisAngle(AX_Z, this.edge * 0.42 * (this.switch ? -1 : 1));
      out.multiply(qA);
    } else if (this.state === 'grind') {
      qA.setFromAxisAngle(AX_Z, -this.balance * 0.18);
      out.multiply(qA);
    } else if (this.state === 'crash') {
      qA.setFromAxisAngle(this.tumbleAxis, this.tumble * 2.4);
      out.premultiply(qA);
    }
    return out;
  }
}
