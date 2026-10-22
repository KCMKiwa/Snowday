// Snowboard and ski physics: edge carving with a grip limit, skids, butters, manual air
// rotation (spins, flips, rolls, corks), assisted rail grinds and crashes.
// Emits events (takeoff, land, butter, grindStart, grindEnd, crash, respawn, finish)
// that the trick system and effects consume.
import * as THREE from 'three';
import { DEG } from './course.js';

const G = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3();
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
const W = new THREE.Vector3();

export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapPi = (a) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};
export const forward = (h, out) => out.set(-Math.sin(h), 0, -Math.cos(h));

export const MAX_CHARGE = 0.55;
const SKID_FRICTION = 8.5; // deceleration of a board sliding fully sideways
const BUTTER_RATE = 3.6; // rad/s pivot while pressing nose or tail
const BUTTER_PITCH = 0.34;

// What is strapped on. Skis: two edges hold a little better and react quicker, a skier
// in a tuck is slimmer, double-poling pushes harder on the flats. Spin and flip rates
// (rad/s at stats 1) are real-world: a big spin turns about 1 to 1.2 times a second,
// a flip about 0.7 times; how far you get round depends on the air time.
// Air control (per axis): how fast holding winds the rotation up (right off the lip and
// later in the air) and how fast it settles once let go (opening the body; a grab keeps
// the body tucked, so the rotation carries on much longer).
export const AIR = {
  spin: { onLip: 4.5, on: 2.8, off: 4.5 },
  flip: { onLip: 3.6, on: 2.4, off: 3.2 },
  roll: { onLip: 3.4, on: 2.2, off: 3.2 },
  grabHold: 0.4,
};
export const GEAR = {
  board: { rMin: 5.5, grip: 18.5, edgeRate: 5.5, drag: 0.0052, tuckDrag: 0.0034, push: 2.4, spin: 6.4, flip: 4.6 },
  ski: { rMin: 6.0, grip: 19.5, edgeRate: 6.8, drag: 0.0049, tuckDrag: 0.0029, push: 3.0, spin: 6.8, flip: 4.4 },
};

export class RiderPhysics {
  constructor(course) {
    this.course = course;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.renderOffset = new THREE.Vector3();
    this.stats = { speed: 1, pop: 1, spin: 1 };
    this.assist = true;
    this.gear = 'board';
    this.events = [];
    this.finished = false;
    this.reset();
  }

  reset(d = this.course.spawnD, x = 0, speed = 7) {
    const c = this.course;
    this.pos.set(x, c.heightAtD(x, d), -d);
    c.normalAt(this.pos.x, this.pos.z, this.normal);
    this.vel.set(0, 0, -1).addScaledVector(this.normal, this.normal.z).normalize().multiplyScalar(speed);
    this.renderOffset.set(0, 0, 0);
    this.heading = 0;
    this.switch = false;
    this.state = 'ground';
    this.flip = 0; this.spinVel = 0; this.flipVel = 0; this.spinAccum = 0; this.spinPeak = 0;
    this.flipLoad = 0; this.flipBlock = false; this.heldUD = false; this.stallT = 0; this.spinIn = 0; this.flipIn = 0; this.rollIn = 0;
    this.airQ = new THREE.Quaternion();
    this.landAt = { t: 1, n: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3() }; this.landAtT = 0;
    this.roll = 0; this.rollVel = 0; this.rollLock = false;
    this.edge = 0; this.lean = 0; this.slip = 0; this.brake = 0; this.skid = 0; this.sink = 0;
    this.charge = 0; this.popWindow = 0; this.windup = 0;
    this.butter = null; this.butterPitch = 0;
    this.airTime = 0; this.grab = null; this.grabs = []; this.flipLock = false;
    this.takeoffSwitch = false; this.takeoffKind = 'ollie';
    this.grind = null; this.balance = 0; this.balanceVel = 0; this.balanceNoise = 0;
    this.noiseT = 0; this.noiseTarget = 0;
    this.assistRail = null;
    this.crashT = 0; this.crashPhase = null; this.fallSide = 1; this.fallTilt = 0; this.restT = 0; this.slam = 0;
    this.groundTime = 0; this.relockT = 0; this.landT = 1; this.impact = 0;
  }

  setCourse(course) {
    this.course = course;
    this.restart();
  }

  restart() {
    this.finished = false;
    this.reset();
  }

  get speed() { return this.vel.length(); }
  get distance() { return -this.pos.z; }

  get g() { return GEAR[this.gear] ?? GEAR.board; }
  maxSpin() { return this.g.spin * this.stats.spin; }
  maxFlip() { return this.g.flip * (0.85 + 0.15 * this.stats.spin); }

  // How fast each axis settles once let go (a held grab keeps the body tucked).
  settleRate(axis) { return AIR[axis].off * (this.grab ? AIR.grabHold : 1); }

  // Where and when the current arc meets the snow, refreshed a few times a second.
  predictLanding(dt) {
    this.landAtT -= dt;
    if (this.landAtT > 0) { this.landAt.t = Math.max(0.02, this.landAt.t - dt); return this.landAt; }
    this.landAtT = 0.08;
    const p = this.pos, v = this.vel, c = this.course;
    const above = (t) => p.y + v.y * t - 0.5 * G * t * t - c.heightAt(p.x + v.x * t, p.z + v.z * t);
    let t = 0.05;
    for (; t < 4; t += 0.05) if (above(t) <= 0) break;
    // refine between the last two samples
    if (t < 4) { let a = Math.max(0, t - 0.05), b = t; for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (above(m) > 0) a = m; else b = m; } t = b; }
    this.landAt.t = t;
    this.landAt.p.set(p.x + v.x * t, 0, p.z + v.z * t);
    c.normalAt(this.landAt.p.x, this.landAt.p.z, this.landAt.n);
    return this.landAt;
  }

  // What the rotation would count as, and how it would land, if it were let go now (the
  // live readout): each axis settles on its own, the body is turned through that settle,
  // and the result is judged like a landing on the slope ahead.
  predictRotation() {
    if (this.state !== 'air') return null;
    const ks = this.settleRate('spin'), kf = this.settleRate('flip'), kr = this.settleRate('roll');
    const spin = this.spinAccum + this.spinVel / ks;
    const flip = this.flip + this.flipVel / kf;
    const roll = this.roll + this.rollVel / kr;
    // the orientation at touchdown: decaying rates integrated until the landing
    const q = qB.copy(this.airQ);
    let wx = this.flipVel, wy = this.spinVel, wz = this.rollVel;
    const T = Math.min(this.landAt.t, 2);
    const steps = Math.ceil(T * 40), h = T / steps;
    const ef = Math.exp(-kf * h), es = Math.exp(-ks * h), er = Math.exp(-kr * h);
    for (let i = 0; i < steps; i++) {
      // the exact angle each decaying axis turns through in this step
      W.set(wx * (1 - ef) / kf, wy * (1 - es) / ks, wz * (1 - er) / kr);
      const r = W.length();
      if (r > 1e-6) q.multiply(qA.setFromAxisAngle(W.divideScalar(r), r));
      wx *= ef; wy *= es; wz *= er;
    }
    const n = this.landAt.n;
    const up = tA.set(0, 1, 0).applyQuaternion(q);
    const upErr = Math.acos(clamp(up.dot(n), -1, 1));
    const fwd = tB.set(0, 0, -1).applyQuaternion(q);
    const yaw = wrapPi(Math.atan2(-fwd.x, -fwd.z) - this.travelHeading());
    const yawErr = Math.min(Math.abs(yaw), Math.PI - Math.abs(yaw));
    return {
      spinDeg: Math.round(Math.abs(spin) / Math.PI) * 180, spinDir: Math.sign(spin),
      flips: Math.round(Math.abs(flip) / (Math.PI * 2)), flipDir: Math.sign(flip),
      rolls: Math.round(Math.abs(roll) / (Math.PI * 2)), rollDir: Math.sign(roll),
      // judged with a few degrees in hand, so a "clean" readout really lands clean
      landing: RiderPhysics.judge(upErr + 4 * DEG, yawErr + 4 * DEG, 0, false),
    };
  }

  // Landing quality from how far the body is off the slope and off the line of travel.
  static judge(upErr, yawErr, impact, grabbing) {
    if (upErr > 62 * DEG || yawErr > 58 * DEG || impact > 18) return 'crash';
    if (upErr > 28 * DEG || yawErr > 24 * DEG || impact > 12 || grabbing) return 'sketchy';
    return 'clean';
  }

  travelHeading() {
    const vx = this.vel.x, vz = this.vel.z;
    if (vx * vx + vz * vz < 0.04) return this.heading + (this.switch ? Math.PI : 0);
    return Math.atan2(-vx, -vz);
  }

  emit(type, data = {}) { this.events.push({ ...data, type }); }

  update(dt, inp) {
    this.relockT = Math.max(0, this.relockT - dt);
    this.landT += dt;
    this.renderOffset.multiplyScalar(Math.exp(-16 * dt));
    switch (this.state) {
      case 'ground': this.updateGround(dt, inp); break;
      case 'air': this.updateAir(dt, inp); break;
      case 'grind': this.updateGrind(dt, inp); break;
      case 'crash': this.updateCrash(dt); break;
    }
    if (this.state === 'ground' || this.state === 'air') {
      if (this.course.obstacles.length && this.course.obstacleAt(this.pos)) {
        this.endButter(false);
        this.vel.multiplyScalar(0.25);
        this.crash('obstacle', 1);
      }
    }
    if (!this.finished && this.distance > this.course.finishD) {
      this.finished = true;
      this.endButter(false);
      this.emit('finish');
    }
  }

  // Grip: how hard the edge can hold before the board washes out (m/s²).
  grip() { return this.g.grip * (0.92 + 0.08 * this.stats.speed); }

  updateGround(dt, inp) {
    const c = this.course, n = this.normal, v = this.vel;
    this.groundTime += dt;
    let sp = v.length();
    const powder = c.powderAt(this.pos.x);
    // while loading a pop, S sets up a backflip instead of braking
    const braking = inp.down && !inp.jumpHeld;

    this.updateButter(dt, inp, sp);
    const b = this.butter;

    // Steering tilts the board onto an edge; the edge angle builds up over a moment.
    const edgeT = b ? 0 : inp.steer * clamp(0.4 + sp / 12, 0.4, 1);
    this.edge = damp(this.edge, edgeT, b ? 10 : this.g.edgeRate, dt);
    this.brake = damp(this.brake, braking || this.finished ? 1 : 0, 6, dt);
    this.windup = damp(this.windup, inp.jumpHeld ? inp.steer : 0, inp.jumpHeld ? 3.2 : 6, dt);
    // W/S pressed while loading the pop sets up a front/back flip. A W that was already
    // held for a tuck before the pop started does not count until it is let go.
    if (inp.jumpHeld && this.charge === 0) this.flipBlock = this.heldUD;
    if (this.flipBlock && !inp.up && !inp.down) this.flipBlock = false;
    const fl = inp.jumpHeld && !this.flipBlock ? (inp.down ? 1 : 0) - (inp.up ? 1 : 0) : 0;
    this.flipLoad = damp(this.flipLoad, fl, fl ? 5 : 8, dt);
    this.heldUD = (inp.up || inp.down) && !inp.jumpHeld;

    // Carve: the sidecut steers the board. Turn radius is limited by grip at speed,
    // at walking pace the rider can twist the board around (pivot).
    const sp2 = Math.max(sp * sp, 1);
    const kMax = Math.min(1 / this.g.rMin, (this.grip() * 0.92) / sp2);
    let omega = this.edge * sp * kMax + this.edge * 2.2 * (1 - clamp(sp / 8, 0, 1));
    if (braking) omega *= 1.5; // skidded turn: brake and twist
    if (this.finished) omega *= 0.5;
    // stalled across the slope: the rider points the board back down the fall line
    if (sp < 1.5 && inp.steer === 0 && !braking && !b && !this.finished) {
      const fall = Math.atan2(n.x, n.z); // heading that points straight downhill
      const rel = wrapPi(this.heading + (this.switch ? Math.PI : 0) - fall);
      const tgt = Math.abs(rel) > Math.PI / 2 ? Math.sign(rel) * Math.PI : 0; // nose or tail first, whichever is closer
      omega += clamp((tgt - rel) * 2, -1.2, 1.2) * (1 - sp / 1.5);
    }
    if (b) {
      // butter: pivot on the pressed end, the board turns but the snow contact does not carve
      const spin = inp.steer * BUTTER_RATE * Math.sqrt(this.stats.spin);
      if (inp.steer !== 0) {
        omega = spin;
      } else {
        // let go of the steer: ease back to the nearest clean 180
        const rel = wrapPi(this.heading - this.travelHeading() + (this.switch ? Math.PI : 0));
        const tgt = Math.round(rel / Math.PI) * Math.PI;
        omega = clamp((tgt - rel) * 6, -BUTTER_RATE, BUTTER_RATE);
      }
      b.spin += omega * dt;
      b.peak = Math.max(b.peak, Math.abs(b.spin));
    }
    this.heading += omega * dt;

    v.y -= G * dt;
    v.addScaledVector(n, -v.dot(n));
    sp = v.length();

    // Edge grip pulls the velocity toward where the board points, up to the grip limit.
    const ride = forward(this.heading + (this.switch ? Math.PI : 0), tA);
    ride.addScaledVector(n, -ride.dot(n)).normalize();
    let velTurn = 0;
    if (sp > 0.4) {
      if (v.dot(ride) < -0.2 * sp && !b) {
        this.switch = !this.switch;
        ride.negate();
      }
      tB.copy(v).divideScalar(sp);
      let slip = Math.atan2(tC.crossVectors(tB, ride).dot(n), clamp(tB.dot(ride), -1, 1));
      // mid butter spin the board may point backwards: only the angle to its axis matters
      if (b && Math.abs(slip) > Math.PI / 2) slip -= Math.sign(slip) * Math.PI;
      const gripMul = b ? 0.25 : braking ? 0.45 : 1 - powder * 0.35;
      const maxRot = (this.grip() * gripMul / Math.max(sp, 1)) * dt;
      const rot = clamp(slip * (1 - Math.exp(-11 * dt)), -maxRot, maxRot);
      qA.setFromAxisAngle(n, rot);
      v.applyQuaternion(qA);
      velTurn = rot / dt;
      this.slip = slip - rot;
    } else {
      // at walking pace the board just follows its own axis, whichever way gravity pulls
      let along = v.dot(ride);
      if (along < -0.05 && !b) { this.switch = !this.switch; ride.negate(); along = -along; }
      v.copy(ride).multiplyScalar(along);
      this.slip = 0;
    }
    const slipAmt = Math.abs(Math.sin(this.slip));
    this.skid = Math.max(this.brake, clamp(slipAmt * 2.2, 0, 1));

    // Lean into the turn so the body balances the lateral load.
    const aLat = sp * velTurn;
    const leanT = clamp(Math.atan2(aLat, G), -1.05, 1.05) + this.edge * 0.1;
    this.lean = damp(this.lean, b ? 0 : leanT, 9, dt);

    const tuck = inp.up && !b;
    const drag = (tuck ? this.g.tuckDrag : this.g.drag) / this.stats.speed;
    const fric = (0.035 + powder * 0.05) * G * n.y;
    const deep = powder * (0.6 + 0.035 * sp);
    const dec = fric + drag * sp * sp + deep + SKID_FRICTION * slipAmt * (b ? 0.3 : 1) +
      (braking ? 6.5 : 0) + (this.finished ? 5 : 0);
    const acc = tuck && sp < 8 && !this.finished ? this.g.push : 0;
    sp = Math.max(0, sp + (acc - dec) * dt);
    if (v.lengthSq() > 1e-8) v.setLength(sp);
    else v.copy(ride).multiplyScalar(sp);
    this.sink = damp(this.sink, powder * (0.16 - Math.min(0.1, sp * 0.004)), 4, dt);

    if (inp.jumpHeld && !this.finished) this.charge = Math.min(this.charge + dt, MAX_CHARGE);
    if (inp.jumpReleased && this.charge > 0) {
      const k = this.charge / MAX_CHARGE;
      // popping off a pressed nose or tail loads the board like a spring
      const kind = b ? (b.kind === 'nose' ? 'nollie' : 'ollie') : 'ollie';
      const bonus = b ? 1.1 : 1;
      v.addScaledVector(n, (3.2 + 2.8 * k) * this.stats.pop * bonus);
      this.charge = 0;
      const carry = b ? omega : 0;
      this.endButter(true);
      this.takeoff(kind, inp, carry);
      this.pos.addScaledVector(v, dt);
      return;
    }

    // Stuck in the dip in front of a kicker (or a roller): like a rider would, skate out
    // sideways to the nearer edge of the feature once the board has come to a stop.
    this.stallT = sp < 0.8 && inp.steer === 0 && !inp.up && !braking && !b && !this.finished ? (this.stallT ?? 0) + dt : 0;
    if (this.stallT > 1.5) {
      const d = this.distance;
      const f = c.features.find((q) => d > q.dMin - 2 && d < q.dMax && Math.abs(this.pos.x - (q.x ?? 0)) < (q.width ?? 0) / 2 + 3);
      if (f) {
        const dir = this.pos.x >= (f.x ?? 0) ? 1 : -1;
        tC.set(dir, 0, 0).addScaledVector(n, -n.x * dir).normalize();
        v.addScaledVector(tC, 2.2 * dt);
        this.heading += wrapPi(Math.atan2(-dir, 0) - (this.heading + (this.switch ? Math.PI : 0))) * (1 - Math.exp(-3 * dt));
      }
    }
    this.assistApproach(dt, inp);
    this.pos.addScaledVector(v, dt);
    const gy = c.heightAt(this.pos.x, this.pos.z);
    // The ground falls away faster than the board can follow: we left a lip.
    if (this.pos.y - gy > 0.012) {
      const carry = b ? omega : 0;
      this.endButter(true);
      this.takeoff('lip', inp, carry);
      return;
    }
    this.pos.y = gy;
    c.normalAt(this.pos.x, this.pos.z, n);
    const s2 = v.length();
    v.addScaledVector(n, -v.dot(n));
    if (v.lengthSq() > 1e-8) v.setLength(s2);
    this.checkRails(inp);
  }

  // Nose / tail press on the snow. Steering while pressing pivots the board (butter spins).
  updateButter(dt, inp, sp) {
    const want = this.finished || sp < 1.5 || this.landT < 0.12 ? null : inp.nose ? 'nose' : inp.tail ? 'tail' : null;
    if (this.butter && this.butter.kind !== want) this.endButter(false);
    if (want && !this.butter) {
      this.butter = { kind: want, time: 0, spin: 0, peak: 0, switchStart: this.switch };
      this.emit('butterStart', { kind: want });
    }
    if (this.butter) this.butter.time += dt;
    const target = this.butter ? (this.butter.kind === 'nose' ? -1 : 1) * BUTTER_PITCH : (inp.jumpHeld && this.charge > 0.08 ? 0.12 : 0);
    this.butterPitch = damp(this.butterPitch, target, 12, dt);
  }

  endButter(popped) {
    const b = this.butter;
    if (!b) return;
    this.butter = null;
    // a butter spin only counts the 180s the board actually came round to
    const r = Math.abs(b.spin), k = Math.round(r / Math.PI);
    const spinDeg = (Math.abs(r - k * Math.PI) < 0.6 ? k : Math.floor(r / Math.PI)) * 180;
    this.emit('butter', {
      kind: b.kind, time: b.time, popped, spinDeg, gear: this.gear,
      spinDir: Math.sign(b.spin), switchStart: b.switchStart,
    });
  }

  takeoff(kind, inp, carrySpin = 0) {
    this.state = 'air';
    this.airTime = 0;
    this.spinAccum = 0;
    this.spinPeak = 0;
    this.flip = 0;
    this.roll = 0;
    this.rollVel = 0;
    // Real spins are set at takeoff: the upper body wound up against the coming turn
    // (A/D held while loading the pop) unwinds into it. Steering right at the lip adds a bit.
    const pre = clamp(this.windup * 0.75 + inp.steer * 0.15, -1, 1);
    this.spinVel = clamp(kind === 'rail' ? inp.steer * this.maxSpin() * 0.3 : pre * this.maxSpin() + carrySpin, -this.maxSpin(), this.maxSpin());
    this.windup = 0;
    this.spinIn = 0; this.flipIn = 0; this.rollIn = 0;
    // a flip loaded during the pop (W/S held while charging) starts right off the lip;
    // otherwise holding W for a tuck does not turn into a flip by accident
    const load = this.flipLoad;
    this.flipVel = Math.abs(load) > 0.3 && kind !== 'rail' ? load * this.maxFlip() * 0.7 : 0;
    this.flipLoad = 0;
    this.flipLock = (inp.up || inp.down) && this.flipVel === 0;
    // the body leaves the snow upright, pointing where the board points
    this.airQ.setFromAxisAngle(UP, this.heading);
    this.rollLock = inp.nose || inp.tail;
    this.takeoffSwitch = this.switch;
    this.grabs = [];
    this.grab = null;
    this.popWindow = kind === 'lip' && this.charge > 0 ? 0.16 : 0;
    if (kind !== 'lip') this.charge = 0;
    this.skid = 0; this.brake = 0; this.slip = 0;
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

    // Rotation is fully in the rider's hands. Each axis is the body's own: spin about its
    // up axis (A/D), flip about the shoulders/hips line (W/S), roll about the board (Q/E).
    // Holding winds the rotation up smoothly (strongest right off the lip, where riders set
    // their rotation); letting go opens the body and the motion settles where it settles.
    // Nothing is rounded to a clean angle: land it straight yourself. Because the axes are
    // the body's, spinning while flipping tilts the flip into a cork, as in real air.
    const early = this.airTime < 0.3;
    const axis = (vel, input, max, name) => {
      if (Math.abs(input) > 0.05) return vel + (input * max - vel) * (1 - Math.exp(-(early ? AIR[name].onLip : AIR[name].on) * dt));
      return vel * Math.exp(-this.settleRate(name) * dt);
    };
    this.spinIn = damp(this.spinIn, inp.steer, 12, dt);
    this.spinVel = axis(this.spinVel, inp.steer === 0 ? 0 : this.spinIn, this.maxSpin(), 'spin');
    // flips (W/S) and rolls (Q/E); a key that was already held at takeoff (a tuck, a press)
    // does not count until it is let go
    if (this.flipLock && !inp.up && !inp.down) this.flipLock = false;
    if (this.rollLock && !inp.nose && !inp.tail) this.rollLock = false;
    const maxFlip = this.maxFlip();
    const fIn = this.flipLock ? 0 : (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const rIn = this.rollLock ? 0 : (inp.tail ? 1 : 0) - (inp.nose ? 1 : 0);
    this.flipIn = damp(this.flipIn, fIn, 12, dt);
    this.rollIn = damp(this.rollIn, rIn, 12, dt);
    this.flipVel = axis(this.flipVel, fIn === 0 ? 0 : this.flipIn, maxFlip, 'flip');
    this.rollVel = axis(this.rollVel, rIn === 0 ? 0 : this.rollIn, maxFlip * 0.95, 'roll');
    // integrate the body-frame angular velocity
    W.set(this.flipVel, this.spinVel, this.rollVel);
    const rate = W.length();
    if (rate > 1e-6) this.airQ.multiply(qA.setFromAxisAngle(W.divideScalar(rate), rate * dt)).normalize();
    // Balance: a rider who is not flipping or rolling and is roughly upright levels the body
    // to the slope coming up (pitch and lean only, never the spin), as riders do in the air.
    const land = this.predictLanding(dt);
    if (fIn === 0 && rIn === 0) {
      const up = tA.set(0, 1, 0).applyQuaternion(this.airQ);
      const off = Math.acos(clamp(up.dot(land.n), -1, 1));
      if (off > 1e-3 && off < 0.6) {
        const ax = tB.crossVectors(up, land.n).normalize();
        this.airQ.premultiply(qA.setFromAxisAngle(ax, Math.min(off, 0.9 * dt))).normalize();
      }
    }
    this.spinAccum += this.spinVel * dt;
    this.spinPeak = Math.max(this.spinPeak, Math.abs(this.spinAccum));
    this.flip += this.flipVel * dt;
    this.roll += this.rollVel * dt;
    // heading: the twist of the body about the vertical (unaffected by flips and rolls)
    const q = this.airQ;
    if (Math.abs(q.y) + Math.abs(q.w) > 0.15) this.heading += wrapPi(2 * Math.atan2(q.y, q.w) - this.heading);

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

    this.assistApproach(dt, inp);
    this.pos.addScaledVector(v, dt);
    if (this.checkRails(inp)) return;
    const gy = this.course.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      this.land();
      return;
    }
    // Upside down the body reaches the snow before the board does: that is the landing
    // (a crash), right there, instead of the body passing into the snow.
    const up = tA.set(0, 1, 0).applyQuaternion(this.airQuat(qB));
    if (up.y < 0.3) {
      for (const h of [0.85, 1.5]) {
        const x = this.pos.x + up.x * h, z = this.pos.z + up.z * h;
        if (this.pos.y + up.y * h < this.course.heightAt(x, z) + 0.12) {
          this.pos.y = Math.max(gy, Math.min(this.pos.y, gy + 0.3));
          this.land();
          return;
        }
      }
    }
  }

  airQuat(out) { return out.copy(this.airQ); }

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

    const quality = RiderPhysics.judge(upErr, yawErr, impact, grabbing);

    const data = {
      quality,
      spinDeg: Math.round(Math.abs(this.spinAccum) / Math.PI) * 180,
      spinDir: Math.sign(this.spinAccum),
      spinPeak: this.spinPeak,
      flips: Math.round(Math.abs(this.flip) / (2 * Math.PI)),
      flipDir: Math.sign(this.flip),
      rolls: Math.round(Math.abs(this.roll) / (2 * Math.PI)),
      rollDir: Math.sign(this.roll),
      airTime: this.airTime,
      grabs: this.grabs.map((g) => ({ ...g })),
      takeoffSwitch: this.takeoffSwitch,
      takeoffKind: this.takeoffKind,
      landSwitch: sw,
      impact, upErr, yawErr,
      gear: this.gear,
    };

    v.addScaledVector(n, -v.dot(n));
    v.multiplyScalar(quality === 'clean' ? 0.98 : quality === 'sketchy' ? 0.88 : 0.5);
    this.switch = sw;
    // The rider straightens half of the yaw error, the rest slides out on the edge.
    const off = wrapPi(rel - (sw ? Math.PI : 0));
    this.heading = th + (sw ? Math.PI : 0) + off * 0.5;
    this.flip = 0; this.roll = 0; this.spinVel = 0; this.flipVel = 0; this.rollVel = 0; this.grab = null;
    this.lean = 0; this.edge *= 0.3;
    this.state = 'ground';
    this.groundTime = 0;
    this.landT = 0;
    this.impact = impact;
    this.lastLand = quality;
    this.emit('land', data);
    if (quality === 'crash') {
      // fall to the side the body was tipping toward: toes (forward) or heels (back),
      // starting from how far over it already was (a body upside down lands already down)
      const toes = tC.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
      const tip = up.clone().sub(n).dot(toes);
      this.crash('land', Math.abs(tip) > 0.15 ? -Math.sign(tip) : (Math.random() < 0.6 ? 1 : -1), clamp(upErr / 1.5, 0, 1));
    }
  }

  // ---------- rails ----------

  // Rail assist: steer and float the rider onto a rail they are lined up with.
  assistApproach(dt, inp) {
    this.assistRail = null;
    if (!this.assist || this.relockT > 0 || this.finished) return;
    const p = this.pos, v = this.vel;
    const hs = Math.hypot(v.x, v.z);
    if (hs < 2) return;
    let best = null;
    for (const rail of this.course.rails) {
      if (p.z > rail.zMax + 14 || p.z < rail.zMin - 1) continue;
      for (let i = 0; i < rail.segments.length; i++) {
        const s = rail.segments[i];
        const hx = s.dir.x / s.hlen, hz = s.dir.z / s.hlen;
        const along = (p.x - s.a.x) * hx + (p.z - s.a.z) * hz;
        const segH = s.len * s.hlen;
        if (along > segH - 0.8 || (i === 0 ? along < -12 : along < 0)) continue;
        const align = (v.x * hx + v.z * hz) / hs;
        if (align < 0.8) continue;
        const lat = (p.x - s.a.x) * -hz + (p.z - s.a.z) * hx;
        if (Math.abs(lat) > 2.6) continue;
        const ahead = Math.max(0, -along);
        if (!best || ahead < best.ahead) best = { rail, s, hx, hz, lat, ahead, along };
      }
    }
    if (!best) return;
    // Steering away on the snow overrides the assist; in the air it always helps.
    const { s, hx, hz, lat, ahead } = best;
    if (this.state === 'ground' && inp.steer !== 0) return;
    const t = Math.max(ahead / hs, 0.22);
    const rx = -hz, rz = hx;
    const vLat = v.x * rx + v.z * rz;
    const want = clamp(-lat / t, -3.5, 3.5);
    const k = 1 - Math.exp(-7 * dt);
    const dv = (want - vLat) * k;
    v.x += rx * dv;
    v.z += rz * dv;
    if (this.state === 'ground' && inp.steer === 0 && !this.butter) {
      // line the board up with the rail (forward or switch, whichever is closer)
      const railHeading = Math.atan2(-hx, -hz);
      const rel = wrapPi(this.heading - railHeading);
      const q = Math.round(rel / Math.PI) * Math.PI;
      this.heading -= (rel - q) * (1 - Math.exp(-5 * dt));
    }
    if (this.state === 'air' && ahead < hs * 0.6) {
      // float a short hop up to rail height
      const railY = s.a.y + s.dir.y / s.hlen * Math.max(0, best.along + ahead);
      const yAt = p.y + v.y * t - 0.5 * G * t * t;
      const deficit = railY + 0.05 - yAt;
      if (deficit > 0 && deficit < 1.2) v.y += Math.min(deficit / t, 6) * k;
    }
    this.assistRail = best.rail;
  }

  checkRails(inp) {
    if (this.relockT > 0 || this.finished) return false;
    const p = this.pos, v = this.vel;
    if (v.y > 2.5) return false;
    const hs = Math.hypot(v.x, v.z);
    if (hs < 1.5) return false;
    const a = this.assist;
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
        if (hd > rail.tol * (a ? 1.5 : 1) || dy < (a ? -0.6 : -0.38) || dy > (a ? 0.7 : 0.45)) continue;
        if ((v.x * s.dir.x + v.z * s.dir.z) / (hs * s.hlen) < (a ? 0.5 : 0.6)) continue;
        this.startGrind(rail, i, t, inp, tD.set(p.x - tC.x, 0, p.z - tC.z));
        return true;
      }
    }
    return false;
  }

  startGrind(rail, segIdx, t, inp, offset) {
    const fromAir = this.state === 'air';
    if (fromAir && tA.set(0, 1, 0).applyQuaternion(this.airQ).y < 0.82) {
      this.crash('rail');
      return;
    }
    this.endButter(false);
    const s = rail.segments[segIdx];
    const railHeading = Math.atan2(-s.dir.x, -s.dir.z);
    const rel = wrapPi(this.heading - railHeading);
    const q = Math.round(rel / (Math.PI / 2));
    const slide = Math.abs(q) % 2 === 1;
    const snapped = railHeading + (q * Math.PI) / 2;

    // Which end crossed the rail decides boardslide vs lipslide; facing decides the side.
    let type = '50-50', side = null;
    if (slide) {
      const right = tA.set(-s.dir.z, 0, s.dir.x).normalize();
      const approach = offset.dot(right);
      const tail = tB.set(Math.sin(snapped), 0, Math.cos(snapped));
      type = Math.abs(approach) > 0.08 && Math.sign(tail.dot(right)) !== Math.sign(approach) ? 'Lipslide' : 'Boardslide';
      const toes = tC.set(Math.cos(snapped), 0, -Math.sin(snapped));
      side = toes.dot(s.dir) > 0 ? 'Frontside' : 'Backside';
    }
    let spinOn = 0, spinOnDir = 0;
    if (fromAir) {
      const total = this.spinAccum + wrapPi(snapped - this.heading);
      spinOn = Math.round(Math.abs(total) / (Math.PI / 2)) * 90;
      spinOnDir = Math.sign(total);
    }

    const prevPos = tD.copy(this.pos);
    this.state = 'grind';
    this.grind = {
      rail, seg: segIdx, t, railHeading, type, side,
      speed: Math.max(3, this.vel.dot(s.dir)), entrySpeed: Math.max(3, this.vel.dot(s.dir)),
      rel: (q * Math.PI) / 2, dist: 0, time: 0, press: null, pressTime: 0,
      fromAir, spinOn, spinOnDir, spinOnSwitch: this.takeoffSwitch,
      switch: false,
    };
    if (!slide) this.switch = Math.abs(q) === 2;
    this.grind.switch = !slide && this.switch;
    this.heading = snapped;
    this.flip = 0; this.roll = 0; this.spinVel = 0; this.flipVel = 0; this.rollVel = 0; this.grab = null;
    this.balance = (Math.random() - 0.5) * (this.assist ? 0.05 : 0.15);
    this.balanceVel = 0;
    this.balanceNoise = 0;
    this.noiseT = 0;
    this.charge = 0;
    this.lean = 0; this.skid = 0; this.brake = 0; this.slip = 0;
    this.pos.copy(s.a).addScaledVector(s.dir, t);
    // ease the visible board onto the rail instead of teleporting it
    this.renderOffset.add(prevPos.sub(this.pos));
    this.emit('grindStart', { grindType: type, side, rail: rail.name, kind: rail.kind, spinOn, switch: this.grind.switch });
  }

  updateGrind(dt, inp) {
    const g = this.grind, rail = g.rail;
    let s = rail.segments[g.seg];
    g.time += dt;
    // sliding friction by surface: steel is fastest, bark slowest; a slide (board across)
    // scrubs more than a 50-50
    const fric = { rail: 0.35, ledge: 0.5, box: 0.55, log: 0.8 }[rail.kind] ?? 0.5;
    const across = g.type === '50-50' ? 1 : 1.25;
    g.speed += (-G * s.dir.y - fric * across - 0.003 * g.speed * g.speed) * dt;
    // a rider who locks on keeps enough speed to ride it out
    g.speed = Math.max(g.speed, Math.min(g.entrySpeed * 0.5, 4), 1.6);

    // Balance: an unstable pendulum with random pushes; the assist adds a centering spring.
    const assist = this.assist;
    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 0.35 + Math.random() * 0.4;
      this.noiseTarget = (Math.random() * 2 - 1) * (0.9 + g.time * 0.35) * (assist ? 0.45 : 1);
    }
    this.balanceNoise = damp(this.balanceNoise, this.noiseTarget, 3, dt);
    const center = assist ? -this.balance * 4.2 - this.balanceVel * 1.4 : 0;
    this.balanceVel += (this.balance * 1.6 + this.balanceNoise - inp.steer * 3.4 + center) * dt;
    this.balanceVel *= Math.exp(-1.5 * dt);
    this.balance += this.balanceVel * dt;

    if (g.type === '50-50') {
      const press = inp.up || inp.nose ? 'Nose Press' : inp.down || inp.tail ? 'Tail Press' : null;
      if (press) {
        if (g.press !== press) { g.press = press; g.pressTime = 0; }
        g.pressTime += dt;
      }
      this.butterPitch = damp(this.butterPitch, press === 'Nose Press' ? -0.2 : press === 'Tail Press' ? 0.2 : 0, 12, dt);
    } else {
      this.butterPitch = damp(this.butterPitch, 0, 12, dt);
    }

    if (Math.abs(this.balance) > 1) {
      this.vel.copy(s.dir).multiplyScalar(g.speed);
      tA.set(-s.dir.z, 0, s.dir.x).normalize().multiplyScalar(Math.sign(this.balance) * 1.5);
      this.vel.add(tA);
      this.emit('grindEnd', { ...this.grindSummary(), bail: true });
      this.grind = null;
      this.relockT = 0.6;
      // off the side the balance was lost to
      this.crash('rail', this.balance > 0 ? 1 : -1);
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

  grindSummary() {
    const g = this.grind;
    return {
      grindType: g.type, side: g.side, switch: g.switch, press: g.press, pressTime: g.pressTime,
      dist: g.dist, time: g.time, rail: g.rail.name, kind: g.rail.kind,
      spinOn: g.spinOn, spinOnDir: g.spinOnDir, spinOnSwitch: g.spinOnSwitch, gear: this.gear,
    };
  }

  exitGrind(inp, popped) {
    const g = this.grind;
    const s = g.rail.segments[Math.min(g.seg, g.rail.segments.length - 1)];
    this.vel.copy(s.dir).multiplyScalar(g.speed);
    const k = this.charge / MAX_CHARGE;
    this.vel.y += popped ? (3.2 + 1.6 * k) * this.stats.pop : 1.0;
    this.emit('grindEnd', { ...this.grindSummary(), bail: false });
    // never leave a feature from below the snow
    const gy = this.course.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < gy) this.pos.y = gy;
    // Pop out of a slide back in line with the direction of travel.
    const th = this.travelHeading();
    const rel = wrapPi(this.heading - th);
    this.switch = Math.abs(rel) > Math.PI / 2 + 0.01;
    this.heading = th + (this.switch ? Math.PI : 0);
    this.grind = null;
    this.relockT = 0.4;
    this.charge = 0;
    this.takeoff('rail', inp);
  }

  // A fall, in four phases like a real one: the body goes down to one side (heelside onto
  // the seat and back, toeside onto the knees and forearms; on skis onto the hip), slides
  // out on the snow with body friction, rests a moment and gets back up where it stopped.
  // The board stays on the snow; the body is posed lying on it (rider.js), so nothing ever
  // rotates through the ground. A hard, fast slam bounces the body once.
  // side: +1 = falls to the heel side (-X of the board frame), -1 = to the toe side (+X).
  crash(reason, side = Math.random() < 0.6 ? 1 : -1, tilt0 = 0) {
    this.state = 'crash';
    this.crashT = 0;
    this.grab = null;
    this.grind = null;
    this.butter = null;
    this.charge = 0;
    this.flip = 0; this.roll = 0; this.spinVel = 0; this.flipVel = 0; this.rollVel = 0;
    this.lean = 0; this.edge = 0; this.skid = 0; this.brake = 0;
    this.fallSide = side >= 0 ? 1 : -1;
    this.fallTilt = clamp(tilt0, 0, 0.85);
    this.crashPhase = 'fall';
    this.restT = 0;
    this.slam = clamp((this.speed - 12) / 10, 0, 1);
    this.emit('crash', { reason, side: this.fallSide });
  }

  updateCrash(dt) {
    const v = this.vel, c = this.course;
    this.crashT += dt;
    v.y -= G * dt;
    this.pos.addScaledVector(v, dt);
    const gy = c.heightAt(this.pos.x, this.pos.z);
    let onSnow = false;
    if (this.pos.y <= gy) {
      onSnow = true;
      this.pos.y = gy;
      c.normalAt(this.pos.x, this.pos.z, this.normal);
      v.addScaledVector(this.normal, -v.dot(this.normal));
      // a body sliding on snow: kinetic friction plus a little drag
      const sp = v.length();
      // after a few seconds the rider digs in hands and board edge to stop
      const dig = this.crashT > 2 ? 2.8 : 1;
      const dec = (0.42 * dig * G * this.normal.y + 0.02 * sp * sp) * dt;
      if (sp > 1e-4) v.setLength(Math.max(0, sp - dec));
    }
    const sp = v.length();
    // the board drags behind and turns across the slide, as a fallen rider's board does
    if (sp > 1) this.heading = this.heading + wrapPi(this.travelHeading() + Math.PI / 2 - this.heading) * (1 - Math.exp(-1.5 * dt));
    if (this.crashPhase === 'fall') {
      // the body drops like a falling stick: slow to start, fast at the end (0.45 s from upright)
      this.fallTilt = Math.min(1, this.fallTilt + dt * (0.9 + 4 * this.fallTilt));
      if (this.fallTilt >= 1) { this.crashPhase = 'slide'; this.slideT = 0; this.emit('impact', { slam: this.slam }); }
    } else if (this.crashPhase === 'slide') {
      this.slideT += dt;
      if (onSnow && sp < 1.4 && this.slideT > 0.35) this.crashPhase = 'rest';
    } else if (this.crashPhase === 'rest') {
      this.restT += dt;
      if (this.restT > 0.4) this.crashPhase = 'getup';
    } else if (this.crashPhase === 'getup') {
      this.fallTilt = Math.max(0, this.fallTilt - dt / 0.8);
      // standing up, the rider turns to face down the hill (where the respawn points them)
      this.heading += wrapPi(0 - this.heading) * (1 - Math.exp(-4 * dt));
      if (this.fallTilt <= 0) { this.respawn(); return; }
    }
    // safety net: never lie around for long
    if (this.crashT > 7) this.respawn();
  }

  respawn() {
    const c = this.course;
    // get up where the fall ended, pointing down the hill
    let d = clamp(this.distance, c.spawnD, c.finishD + 30);
    const x = clamp(this.pos.x, -(c.parkHalf - 2), c.parkHalf - 2);
    // never respawn on top of an obstacle
    for (let i = 0; i < 20 && c.obstacleAt(tA.set(x, c.heightAtD(x, d), -d), 1.2); i++) d += 2;
    this.reset(d, x, this.finished ? 0 : 3);
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
    qA.setFromAxisAngle(UP, this.heading + this.brake * 0.95 * skidSign);
    out.multiply(qA);
    if (this.state === 'ground') {
      qA.setFromAxisAngle(AX_Z, this.lean * 0.8 * (this.switch ? -1 : 1));
      out.multiply(qA);
    } else if (this.state === 'grind') {
      qA.setFromAxisAngle(AX_Z, -this.balance * 0.18);
      out.multiply(qA);
    } else if (this.state === 'crash') {
      // the board stays on the snow, dug in a little on the edge of the side we fell to
      const ease = this.fallTilt * this.fallTilt * (3 - 2 * this.fallTilt);
      qA.setFromAxisAngle(AX_Z, this.fallSide * ease * 0.16);
      out.multiply(qA);
    }
    return out;
  }
}
