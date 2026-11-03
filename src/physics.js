// Snowboard and ski physics: edge carving with a grip limit, skids, butters, manual air
// rotation (spins, flips, rolls, corks), assisted rail grinds and crashes.
// Emits events (takeoff, land, butter, grindStart, grindEnd, crash, respawn, finish)
// that the trick system and effects consume.
import * as THREE from 'three';
import { DEG } from './course.js';

const G = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3();
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
const W = new THREE.Vector3();
// (the air rotation's own scratch vectors)
const aUp = new THREE.Vector3(), aWant = new THREE.Vector3(), aGoal = new THREE.Vector3(), aAx = new THREE.Vector3(), aD = new THREE.Vector3();
const NO_KEYS = { flip: 0, spin: 0, roll: 0, over: false, grab: false };

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
// in a tuck is slimmer, double-poling pushes harder on the flats.
export const GEAR = {
  board: { rMin: 5.5, grip: 18.5, edgeRate: 5.5, drag: 0.0052, tuckDrag: 0.0034, push: 2.4 },
  ski: { rMin: 6.0, grip: 19.5, edgeRate: 6.8, drag: 0.0049, tuckDrag: 0.0029, push: 3.0 },
};

// Air control, as cork7 has it, at a calmer pace than its numbers. A held key turns the body
// at a set rate (rad/s, at a spin rating of 3): it gets there quickly and dies away within a
// moment of letting go, so the body turns exactly as long as the key is held, from the lip
// on (a key already held as the board leaves the snow counts). A flip comes round in about
// a second and a half, the way a backflip floats over a big kicker; a held spin pulls the
// body in and turns a little faster, with a grab held faster still. The opposite flip key first slows a flip down. Let go of everything and, once the
// body has all but stopped turning, it comes upright the shortest way and levels to the
// landing: a flip let go past halfway goes round, one let go too early falls back. The spin
// is never touched: landing it straight is the rider's.
export const AIR = {
  rate: 4.4, // a roll (and a spin just started); the easy pace a flip is planned at
  // A held flip is planned (flipRate): it turns at whatever brings it round on its feet as
  // the arc meets the snow, within these (rad/s)
  flipMin: 2.6, flipMax: 7.5,
  tight: 4.8, // a spin held
  grabbed: 6.6, // a spin held with a grab
  windUp: 8, // 1/s: a held key brings its rotation up to rate
  settle: 6.5, // 1/s: a let-go rotation dies away
  reverse: { flip: 3.2, spin: 28, roll: 5 }, // 1/s against the opposite key
  // Coming upright once everything is let go: after `after` s, and once the body turns
  // slower than `below` rad/s, it turns upright at up to `rate` rad/s (`gain` per radian
  // still to go), that turn building up at `accel` rad/s² (and dying away at `brake` while a
  // key is held); not on the way up off the lip (the first `rising` s). From `near` to
  // `full` s before touchdown the upright it aims for tips over to the slope ahead.
  upright: { after: 0.035, below: 2.2, rate: 3.4, gain: 6, accel: 22, brake: 40, rising: 0.22, near: 1.5, full: 0.3 },
  level: { rate: 2.2, gain: 7 }, // a spin held on its own, upright: levels the body the same way, gentler
  // Off-axis tricks: a spin held together with a flip or roll within corkT s of takeoff (a
  // spin added later only tilts the flip). The body flips about one tilted axis, fixed in
  // the world from the throw (degrees off the vertical; past 45 the head goes below the
  // board once a turn: a cork just about, a rodeo or misty well over), and twists about its
  // own spine like a spin. The flip key drives the flip (held on through a turn: a double),
  // the spin key the twist, so the spin is landed like any spin: a cork 540 lands switch, a
  // cork 720 forward. Spin + S = cork, spin + W = bio (a forward cork; on a board it is
  // called a cork); with the over key held the feet go over the head: S = rodeo, W = misty.
  // Spin + Q/E = flatspin.
  corkT: 0.25,
  tilt: { cork: 55, bio: 55, rodeo: 70, misty: 70, flatspin: 50 },
  twist: 0.85, // the twist about the spine in an off-axis trick, as a share of the rate
};

// In the air the body turns about its hips, this far above the boots (cork7's 0.94 m), not
// about the boots: a flip goes round the rider's middle.
export const HIP = 0.94;

// Landings as cork7 judges them: down clean while the body is within 45 degrees of the slope
// fore and aft and 20 to the side, with the skis or board along the line of travel; saved
// (sketchy) as long as it is less than about 75 degrees off, even sideways; further over,
// or slammed in too hard, it is a crash.
const LAND = { pitch: 45 * DEG, roll: 20 * DEG, yaw: 24 * DEG, saved: 0.25 };

// One rotation's response, as cork7's: a held key brings it to the key's rate quickly,
// against its turn (rev) at revRate, and a let-go one dies away.
const approach = (v, target, dt, rev, revRate) => damp(v, target, !target ? AIR.settle : rev ? revRate : AIR.windUp, dt);

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
    this.flipLoad = 0; this.blockUp = false; this.blockDown = false; this.heldUp = false; this.heldDown = false;
    this.stallT = 0; this.spinIn = 0; this.flipIn = 0; this.rollIn = 0;
    this.airQ = new THREE.Quaternion(); this.air = this.newAir(this.airQ);
    this.offAxis = null; this.lastOffAxis = null; this.inversions = 0;
    this.landAt = { t: 1, n: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3() }; this.landAtT = 0;
    this.roll = 0; this.rollVel = 0; this.rollLock = false; this.flipLock = false;
    this.edge = 0; this.lean = 0; this.slip = 0; this.brake = 0; this.skid = 0; this.sink = 0;
    this.charge = 0; this.popWindow = 0; this.windup = 0;
    this.butter = null; this.butterPitch = 0;
    this.airTime = 0; this.grab = null; this.grabs = [];
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
  // The body's own axes: a skier flips about the hips' side-to-side line and rolls about the
  // skis; a snowboarder stands sideways, so their back- and frontflips go over the heels or
  // toes, about the board's long axis, and the roll is the nose-over-tail cartwheel. A
  // backflip (S) and a roll toward the tail (Q) turn positive.
  flipAxis() { return this.gear === 'ski' ? AX_X : AX_Z; }
  rollAxis() { return this.gear === 'ski' ? AX_Z : AX_X; }

  // The rate a held key turns the body at: a spin held pulls the body in, a grab with it
  // more so, all with the board's spin rating.
  airRate(s) {
    const tight = AIR.tight + (AIR.grabbed - AIR.tight) * s.grab;
    return (AIR.rate + (tight - AIR.rate) * s.tight) * (0.5 + 0.5 * this.stats.spin);
  }

  // How fast a held flip turns: so that it comes round on its feet just as the arc meets the
  // snow, the way riders time a flip to the jump: a slow float over a big kicker, about a
  // turn a second off a small one, and twice round when the air is long enough for a double
  // at an easy pace. Held from the lip it lands; let go early, the landing help finishes it;
  // held on past the landing it over-rotates. turned: how far this flip has gone (rad).
  flipRate(s, land, turned) {
    // (how many times round is settled as the flip starts, while the pop still adds height)
    if (!s.flips || s.t - s.flipT < 0.2) s.flips = Math.max(1, Math.round((land.t - 0.05) * AIR.rate / (2 * Math.PI)));
    const left = s.flips * 2 * Math.PI - Math.abs(turned);
    return clamp(left / Math.max(0.2, land.t - 0.08), AIR.flipMin, AIR.flipMax) * (0.5 + 0.5 * this.stats.spin);
  }

  // The upright the body comes to in the air: straight up, tipping over to the slope ahead
  // (normal n) as the landing (t s away) comes near.
  landingUp(t, n, out) {
    const U = AIR.upright;
    return out.copy(UP).lerp(n, clamp((U.near - t) / (U.near - U.full), 0, 1)).normalize();
  }

  // Where a point h up the body (from the boots) is in the air, with the boots' arc at p and
  // the body's up `up`: the body turns about its hips, which ride HIP above the arc along the
  // upright `ref` (so the boots are back on the arc once the body is upright for the landing).
  bodyAt(p, up, ref, h, out) {
    return out.copy(p).addScaledVector(ref, HIP).addScaledVector(up, h - HIP);
  }

  // The body's rotation in the air: its orientation q (turned in place) and what drives it.
  // A copy is stepped on to see where a let-go rotation ends up (the readout).
  // rates = [flip, spin, roll] (rad/s); L, F: the axis a flip turns about (world) and the
  // one a spin held with it tilts that axis about; off / lastOff: the off-axis trick being
  // turned / just finished; help: the turn coming upright (world, rad/s); flip, spin, roll:
  // how far each has turned, as judges count it.
  newAir(q) {
    return {
      q, rates: [0, 0, 0], tight: 0, grab: 0, t: 0, flipHeld: false, flipRev: 0, flips: 0, flipT: 0, flipFrom: 0,
      L: new THREE.Vector3(), F: new THREE.Vector3(), off: null, lastOff: null,
      help: new THREE.Vector3(), released: 0, flip: 0, spin: 0, roll: 0, inversions: 0, inverted: false,
    };
  }

  static copyAir(s) {
    return {
      ...s, q: s.q.clone(), rates: s.rates.slice(), L: s.L.clone(), F: s.F.clone(), help: s.help.clone(),
      off: s.off && { ...s.off }, lastOff: s.lastOff && { ...s.lastOff },
    };
  }

  // A flip goes toward the rider's own back or front as they stand when it is thrown (switch
  // or after a 180 too), about an axis that then stays put in the world.
  flipFrame(s) {
    s.flips = 0; s.flipT = s.t; s.flipFrom = s.flip;
    s.L.copy(this.flipAxis()).applyQuaternion(s.q);
    s.F.crossVectors(s.L, aAx.set(0, 1, 0).applyQuaternion(s.q)).normalize();
  }

  // One step of the body's rotation. k: the keys held ({ flip, spin, roll: -1..1, over,
  // grab }; null = everything let go); land: { t, n }, when and on what slope the arc meets
  // the snow; rising: still on the way up.
  airStep(s, k, land, rising, dt) {
    k ??= NO_KEYS;
    s.t += dt;
    s.tight = damp(s.tight, Math.abs(k.spin), k.spin ? 12 : 10, dt);
    s.grab = damp(s.grab, k.grab ? 1 : 0, 12, dt);
    const g = this.airRate(s), r = s.rates;
    if (k.flip && !s.flipHeld && Math.abs(r[0]) < 0.1 && Math.abs(r[2]) < 0.1) this.flipFrame(s);
    s.flipHeld = !!k.flip;
    // a spin held with a flip or roll off the lip throws an off-axis trick; the over key
    // while it is still being thrown takes a cork over the top (a rodeo, a bio into a misty)
    if (s.t <= AIR.corkT && !s.off && k.spin && (k.flip || k.roll)) this.startOffAxis(s, Math.sign(k.spin), k.flip, k.flip ? 0 : k.roll, k.over);
    else if (s.t <= AIR.corkT && s.off && k.over && (s.off.type === 'cork' || s.off.type === 'bio')) this.overTheTop(s);
    let speed;
    if (s.off) {
      const o = s.off;
      this.offStep(s, k, g, land, dt);
      RiderPhysics.offRates(o, r);
      s.flip += r[0] * dt; s.spin += r[1] * dt; s.roll += r[2] * dt;
      speed = Math.hypot(o.wL, o.wT);
      // (the trick is remembered for its name at the landing)
      if (!k.spin && !(o.rollDir ? k.roll : k.flip) && Math.abs(o.wL) < 0.3 && Math.abs(o.wT) < 0.3) { s.lastOff = o; s.off = null; r.fill(0); }
    } else {
      // the opposite flip key slows the flip, then turns it back the other way, slowly
      if (k.flip * r[0] < -0.12) s.flipRev = Math.sign(k.flip);
      if (Math.sign(k.flip) !== s.flipRev || Math.abs(k.flip * g - r[0]) < g * 0.05) s.flipRev = 0;
      const fr = k.flip ? this.flipRate(s, land, s.flip - s.flipFrom) : g;
      r[0] = approach(r[0], k.flip * fr, dt, s.flipRev !== 0, AIR.reverse.flip);
      r[1] = approach(r[1], k.spin * g, dt, r[1] * k.spin < 0, AIR.reverse.spin);
      r[2] = approach(r[2], k.roll * g, dt, r[2] * k.roll < 0, AIR.reverse.roll);
      if (!k.flip && Math.abs(r[0]) < 0.015) r[0] = 0;
      if (!k.spin && Math.abs(r[1]) < 0.015) r[1] = 0;
      if (!k.roll && Math.abs(r[2]) < 0.015) r[2] = 0;
      this.omega(s, W);
      speed = W.length();
      this.turnBy(s, W, dt);
    }
    this.upright(s, k, land, rising, speed, dt);
    // inversions, counted from the body itself (head lower than the board)
    const upY = aUp.set(0, 1, 0).applyQuaternion(s.q).y;
    if (upY < 0 && !s.inverted) { s.inversions++; s.inverted = true; } else if (upY > 0.3) s.inverted = false;
  }

  // The body's angular velocity (world) from the rates, put together as cork7 does: a flip
  // turns about the axis it was thrown on, a spin about the spine, a roll about the body's
  // roll axis; a spin held with a flip only tilts the flip's axis (as far as the flip leads)
  // instead of wrapping the flip round the spine. The body turns as fast as its fastest key.
  omega(s, out) {
    const [f, sp, r] = s.rates;
    const top = Math.max(Math.abs(f), Math.abs(sp), Math.abs(r));
    out.set(0, 0, 0);
    if (top < 1e-6) return out;
    const share = f ? Math.abs(f) / Math.max(Math.abs(f), Math.abs(sp)) : 0;
    out.addScaledVector(s.L, f).addScaledVector(s.F, sp * share)
      .addScaledVector(aAx.set(0, 1, 0).applyQuaternion(s.q), sp * (1 - share))
      .addScaledVector(aAx.copy(this.rollAxis()).applyQuaternion(s.q), r);
    const len = out.length();
    return len > 1e-9 ? out.multiplyScalar(top / len) : out;
  }

  // Turn the body by the world angular velocity w for dt, counted on its own axes (flips,
  // rolls and the spin about the spine, as judges count them).
  turnBy(s, w, dt) {
    const rate = w.length();
    if (rate < 1e-9) return;
    s.flip += w.dot(aAx.copy(this.flipAxis()).applyQuaternion(s.q)) * dt;
    s.roll += w.dot(aAx.copy(this.rollAxis()).applyQuaternion(s.q)) * dt;
    s.spin += w.dot(aAx.set(0, 1, 0).applyQuaternion(s.q)) * dt;
    s.q.premultiply(qA.setFromAxisAngle(aAx.copy(w).divideScalar(rate), rate * dt)).normalize();
  }

  // Coming upright once everything is let go (cork7's landing help): the shortest way, at up
  // to AIR.upright.rate, aiming for the slope ahead as the landing comes near; the spin is
  // left as it is. A spin held on its own, upright, levels the body the same way, gentler.
  // Not while a key turns the body, a grab holds it tucked through an inverted trick, or it
  // is still on the way up off the lip.
  upright(s, k, land, rising, speed, dt) {
    const U = AIR.upright;
    const up = aUp.set(0, 1, 0).applyQuaternion(s.q);
    const want = this.landingUp(land.t, land.n, aWant);
    const off = Math.acos(clamp(up.dot(want), -1, 1));
    const plain = !s.off && !s.inversions && up.y > 0.64 && Math.abs(s.rates[0]) < 0.1 && Math.abs(s.rates[2]) < 0.1;
    const busy = !!(k.flip || k.spin || k.roll) || (k.grab && !plain) || (rising && s.t < U.rising);
    s.released = busy ? 0 : s.released + dt;
    const goal = aGoal.set(0, 0, 0);
    if (!busy && s.released > U.after && speed < U.below && off > 1e-4) {
      goal.crossVectors(up, want);
      // right upside down: on round about the trick's own axis
      if (goal.lengthSq() < 1e-8) goal.copy(s.off?.L ?? s.lastOff?.L ?? s.L).addScaledVector(up, -goal.dot(up));
      if (goal.lengthSq() > 1e-12) goal.setLength(Math.min(U.rate, off * U.gain));
    }
    // the turn builds up and dies away smoothly
    const dv = aD.subVectors(goal, s.help);
    const most = (busy ? U.brake : U.accel) * dt;
    if (dv.length() > most) dv.setLength(most);
    s.help.add(dv);
    if (s.help.lengthSq() > 1e-12) {
      const o = s.off ?? s.lastOff;
      if (o) o.total += s.help.dot(o.L) * dt;
      this.turnBy(s, s.help, dt);
    } else if (k.spin && !k.flip && !k.roll && plain && off > 1e-4) {
      // (coming in over the first moments of the air)
      const rate = Math.min(AIR.level.rate, off * AIR.level.gain) * clamp((s.t - 0.03) / 0.12, 0, 1);
      goal.crossVectors(up, want);
      if (goal.lengthSq() > 1e-12) s.q.premultiply(qA.setFromAxisAngle(goal.normalize(), Math.min(off, rate * dt))).normalize();
    }
  }

  // Throw an off-axis trick: spin direction, flip or roll direction, and whether the over
  // key is held (rodeo, misty). The trick's axis is tilted from the spine toward the flip
  // (or roll) axis, as the body stands at the throw (q), and stays fixed in the world. What
  // was already turning carries into it.
  startOffAxis(s, spinDir, flipDir, rollDir, over, q = s.q) {
    const type = rollDir ? 'flatspin' : over ? (flipDir > 0 ? 'rodeo' : 'misty') : flipDir > 0 ? 'cork' : 'bio';
    const tilt = AIR.tilt[type] * DEG;
    const L = new THREE.Vector3(0, spinDir * Math.cos(tilt), 0)
      .addScaledVector(rollDir ? this.rollAxis() : this.flipAxis(), (rollDir || flipDir) * Math.sin(tilt)).applyQuaternion(q);
    s.flips = 0; s.flipT = s.t;
    s.off = {
      type, L, tilt, spinDir, flipDir, rollDir, q0: q.clone(), total: 0, flipped: 0,
      wL: Math.abs(rollDir ? s.rates[2] : s.rates[0]), wT: Math.abs(s.rates[1]) * AIR.twist,
    };
    return s.off;
  }

  // The over key pressed while the trick is still being thrown takes a cork over the top
  // (a rodeo), a bio into a misty.
  overTheTop(s) {
    const { wL, wT, total, flipped, spinDir, flipDir, q0 } = s.off;
    Object.assign(this.startOffAxis(s, spinDir, flipDir, 0, true, q0), { wL, wT, total, flipped });
  }

  // One step of an off-axis trick: the flip about the trick's axis and the twist about the
  // spine, each driven by its key like any rotation (the opposite key slows it, let go it
  // dies away).
  offStep(s, k, g, land, dt) {
    const o = s.off;
    const f = o.rollDir ? k.roll * o.rollDir : k.flip * o.flipDir;
    const t = k.spin * o.spinDir;
    const fr = f > 0 ? this.flipRate(s, land, o.flipped) : g;
    o.wL = approach(o.wL, f * fr, dt, o.wL * f < 0, AIR.reverse.flip);
    o.wT = approach(o.wT, t * g * AIR.twist, dt, o.wT * t < 0, AIR.reverse.spin);
    s.q.premultiply(qA.setFromAxisAngle(o.L, o.wL * dt));
    s.q.multiply(qA.setFromAxisAngle(UP, o.spinDir * o.wT * dt)).normalize();
    // degrees as judges count them: each turn about the axis is a 360, plus the twist
    o.total += (o.wL + o.wT) * dt;
    o.flipped += o.wL * dt;
  }

  // The trick's rates as [flip, spin, roll], for the poses and the spin count.
  static offRates(o, out) {
    const c = Math.cos(o.tilt), s = Math.sin(o.tilt);
    out[0] = o.rollDir ? 0 : o.flipDir * o.wL * s;
    out[1] = o.spinDir * (o.wT + o.wL * c);
    out[2] = o.rollDir ? o.rollDir * o.wL * s : 0;
    return out;
  }

  // The rotation's state as the rest of the game reads it (poses, landing, readout).
  syncAir() {
    const s = this.air;
    [this.flipVel, this.spinVel, this.rollVel] = s.rates;
    this.flip = s.flip; this.roll = s.roll; this.spinAccum = s.spin;
    this.spinPeak = Math.max(this.spinPeak, Math.abs(s.spin));
    this.inversions = s.inversions; this.offAxis = s.off; this.lastOffAxis = s.lastOff;
  }

  // Let go of everything now and ride the rotation out to the landing on a copy (for the
  // readout): returns the copy, and whether the body, upside down, would reach the snow
  // before the board does.
  coastAir(h = 1 / 60) {
    const s = RiderPhysics.copyAir(this.air);
    const p = this.pos, v = this.vel, c = this.course, T = this.landAt.t;
    const land = { t: T, n: this.landAt.n };
    let headFirst = false;
    for (let time = 0; time < Math.min(T, 2.5); time += h) {
      land.t = Math.max(0.02, T - time);
      this.airStep(s, null, land, v.y - G * time > 0, h);
      const up = aUp.set(0, 1, 0).applyQuaternion(s.q);
      if (up.y < 0.3 && !headFirst) {
        const tt = time + h;
        const at = tB.set(p.x + v.x * tt, p.y + v.y * tt - 0.5 * G * tt * tt, p.z + v.z * tt);
        const ref = this.landingUp(land.t, land.n, tD);
        for (const k of [0.85, 1.5]) {
          // (with some room to spare: a readout that says clean has to land clean)
          const b = this.bodyAt(at, up, ref, k, tC);
          if (b.y < c.heightAt(b.x, b.z) + 0.35) headFirst = true;
        }
      }
    }
    return { s, headFirst };
  }

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
    this.landAt.p.y = c.heightAt(this.landAt.p.x, this.landAt.p.z);
    c.normalAt(this.landAt.p.x, this.landAt.p.z, this.landAt.n);
    return this.landAt;
  }

  // What the rotation would count as, and how it would land, if it were let go now (the
  // live readout): the rotation is ridden out on a copy, coming upright as it would, and
  // judged like a landing on the slope ahead.
  predictRotation() {
    if (this.state !== 'air') return null;
    const { s, headFirst } = this.coastAir();
    const o = s.off ?? s.lastOff;
    const off = o ? { offAxis: o.type, offDeg: Math.max(0, Math.round(o.total / Math.PI)) * 180, offSpinDir: o.spinDir, inversions: s.inversions } : {};
    const fwd = tB.set(0, 0, -1).applyQuaternion(s.q);
    const yaw = wrapPi(Math.atan2(-fwd.x, -fwd.z) - this.travelHeading());
    const yawErr = Math.min(Math.abs(yaw), Math.PI - Math.abs(yaw));
    return {
      spinDeg: Math.round(Math.abs(s.spin) / Math.PI) * 180, spinDir: Math.sign(s.spin),
      flips: Math.round(Math.abs(s.flip) / (Math.PI * 2)), flipDir: Math.sign(s.flip),
      rolls: Math.round(Math.abs(s.roll) / (Math.PI * 2)), rollDir: Math.sign(s.roll),
      // judged with a few degrees in hand, so a "clean" readout really lands clean
      landing: headFirst ? 'crash' : RiderPhysics.judge(s.q, this.landAt.n, yawErr, 0, false, 4 * DEG),
      ...off,
    };
  }

  // Landing quality (LAND) from how the body (q) sits on the slope (normal n), how far the
  // skis or board are off the line of travel, and how hard it comes down; margin: degrees
  // held in hand.
  static judge(q, n, yawErr, impact, grabbing, margin = 0) {
    const up = tC.set(0, 1, 0).applyQuaternion(q).dot(n);
    if (up < LAND.saved + margin || impact > 18) return 'crash';
    const pitch = Math.abs(Math.asin(clamp(tC.set(0, 0, -1).applyQuaternion(q).dot(n), -1, 1))) + margin;
    const roll = Math.abs(Math.asin(clamp(tC.set(1, 0, 0).applyQuaternion(q).dot(n), -1, 1))) + margin;
    const tilt = (pitch / LAND.pitch) ** 2 + (roll / LAND.roll) ** 2;
    if (tilt > 1 || yawErr + margin > LAND.yaw || impact > 12 || grabbing) return 'sketchy';
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

  // On the run-in to a kicker: its takeoff ramp and the last 12 m before it, in line with it.
  onTakeoffRamp() {
    const d = this.distance, x = this.pos.x;
    return this.course.kickers.some((k) => d > k.d - 12 && d < k.d + k.lipU && Math.abs(x - (k.x ?? 0)) < k.width / 2 + 1.5);
  }

  // Grip: how hard the edge can hold before the board washes out (m/s²).
  grip() { return this.g.grip * (0.92 + 0.08 * this.stats.speed); }

  updateGround(dt, inp) {
    const c = this.course, n = this.normal, v = this.vel;
    this.groundTime += dt;
    let sp = v.length();
    const powder = c.powderAt(this.pos.x);
    // while loading a pop, or on the run-in to a kicker (nobody hockey-stops into a kicker:
    // they sink into the heels), S sets up a backflip instead of braking
    const ramp = this.onTakeoffRamp();
    const braking = inp.down && !inp.jumpHeld && !ramp;

    this.updateButter(dt, inp, sp);
    const b = this.butter;

    // Steering tilts the board onto an edge; the edge angle builds up over a moment.
    // (on the run-in to a kicker A/D wind up the spin instead of carving off the ramp: only a
    // touch of steering is left, to stay in line)
    const edgeT = b ? 0 : inp.steer * clamp(0.4 + sp / 12, 0.4, 1) * (ramp ? 0.15 : 1);
    this.edge = damp(this.edge, edgeT, b ? 10 : this.g.edgeRate, dt);
    this.brake = damp(this.brake, braking || this.finished ? 1 : 0, 6, dt);
    this.windup = damp(this.windup, inp.jumpHeld || ramp ? inp.steer : 0, inp.jumpHeld || ramp ? 3.2 : 6, dt);
    // W/S pressed while loading the pop sets up a front/back flip, already turning as the
    // board leaves the snow. A key that was already held before the pop started (W for a
    // tuck, S to brake) does not load one until it is let go; the other one does (tucking in
    // on W, then S while loading = a backflip). Off the lip either key held flips anyway.
    if (inp.jumpHeld && this.charge === 0) { this.blockUp = this.heldUp; this.blockDown = this.heldDown; }
    if (!inp.up) this.blockUp = false;
    if (!inp.down) this.blockDown = false;
    const fl = inp.jumpHeld ? (inp.down && !this.blockDown ? 1 : 0) - (inp.up && !this.blockUp ? 1 : 0) : ramp && inp.down ? 1 : 0;
    this.flipLoad = damp(this.flipLoad, fl, fl ? 5 : 8, dt);
    this.heldUp = inp.up && !inp.jumpHeld; this.heldDown = inp.down && !inp.jumpHeld;

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

    // Stuck in a dip (in front of a kicker, or between two whose shoulders meet): like a rider
    // would, skate out once the board has come to a stop: sideways round a kicker that is
    // straight ahead, otherwise on down the hill over the little rise.
    this.stallT = sp < 0.8 && !braking && !b && !this.finished ? (this.stallT ?? 0) + dt : 0;
    if (this.stallT > 1.5) {
      const d = this.distance;
      const f = c.features.find((q) => d > q.dMin - 2 && d < q.dMax && Math.abs(this.pos.x - (q.x ?? 0)) < (q.width ?? 0) / 2 + 1.5);
      const dir = f ? (this.pos.x >= (f.x ?? 0) ? 1 : -1) : 0;
      tC.set(dir, 0, f ? 0 : -1);
      tC.addScaledVector(n, -tC.dot(n)).normalize();
      v.addScaledVector(tC, (f ? 2.2 : 2.8) * dt);
      const want = f ? Math.atan2(-dir, 0) : 0;
      this.heading += wrapPi(want - (this.heading + (this.switch ? Math.PI : 0))) * (1 - Math.exp(-3 * dt));
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
    // A crest the board cannot follow (the snow turns away faster than gravity could pull
    // it round) is a lip too, even when this step happened to end on the snow just past it:
    // otherwise the takeoff would be flattened onto the table.
    if (v.dot(n) > Math.max(0.6, 3 * G * dt)) {
      const carry = b ? omega : 0;
      this.endButter(true);
      this.takeoff('lip', inp, carry);
      return;
    }
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
    // the body leaves the snow upright, pointing where the board points
    this.airQ.setFromAxisAngle(UP, this.heading);
    this.landAtT = 0; // (the landing of the new arc, on its first step)
    const s = this.air = this.newAir(this.airQ);
    const g = this.airRate(s);
    // Spins wound up while loading the pop (A/D held with the pop key: the upper body against
    // the coming turn) unwind into the air; steering right at the lip adds a bit.
    const pre = clamp(this.windup * 0.75 + inp.steer * 0.15, -1, 1);
    s.rates[1] = clamp(kind === 'rail' ? inp.steer * g * 0.3 : pre * g + carrySpin, -g, g);
    this.windup = 0;
    this.spinIn = 0; this.flipIn = 0; this.rollIn = 0;
    // a flip loaded during the pop (W/S held while charging) is already turning off the lip
    const load = this.flipLoad;
    s.rates[0] = Math.abs(load) > 0.3 && kind !== 'rail' ? load * g * 0.7 : 0;
    this.flipLoad = 0;
    this.flipFrame(s);
    // a spin and a flip both loaded while popping throw an off-axis trick off the lip
    if (kind !== 'rail' && Math.abs(s.rates[1]) > 1 && Math.abs(s.rates[0]) > 1) {
      this.startOffAxis(s, Math.sign(s.rates[1]), Math.sign(s.rates[0]), 0, inp.over);
    }
    this.syncAir();
    // W/S held off a rail (a press) and a roll from the touch TAIL / NOSE buttons held off a
    // butter do not turn the body until they have been let go once
    this.flipLock = kind === 'rail' && (inp.up || inp.down);
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

    // Tricks, with cork7's keys: A/D spin, W/S flip (S toward the rider's back), ← / → roll,
    // turning while held and stopping when let go, from the lip on; a spin held with a flip
    // or roll off the lip is an off-axis cork, bio, rodeo, misty (↑ held) or flatspin. Once
    // everything is let go the body comes upright for the landing (airStep).
    if (this.flipLock && !inp.up && !inp.down) this.flipLock = false;
    if (this.rollLock && !inp.nose && !inp.tail) this.rollLock = false;
    const keys = {
      flip: this.flipLock ? 0 : (inp.down ? 1 : 0) - (inp.up ? 1 : 0),
      spin: Math.abs(inp.steer) > 0.06 ? clamp(inp.steer, -1, 1) : 0,
      roll: this.rollLock ? 0 : Math.sign(inp.roll ?? 0),
      over: !!inp.over, grab: !!inp.grab,
    };
    // (how hard each key is being worked, for the poses)
    this.spinIn = damp(this.spinIn, keys.spin, 12, dt);
    this.flipIn = damp(this.flipIn, keys.flip, 12, dt);
    this.rollIn = damp(this.rollIn, keys.roll, 12, dt);
    this.predictLanding(dt);
    this.airStep(this.air, keys, this.landAt, v.y > 0, dt);
    this.syncAir();
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
      const ref = this.landingUp(this.landAt.t, this.landAt.n, tB);
      for (const h of [0.85, 1.5]) {
        const b = this.bodyAt(this.pos, up, ref, h, tC);
        if (b.y < this.course.heightAt(b.x, b.z) + 0.12) {
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

    const quality = RiderPhysics.judge(this.airQuat(qB), n, yawErr, impact, grabbing);

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
      offAxis: this.offAxis?.type ?? this.lastOffAxis?.type ?? null,
      offDeg: Math.max(0, Math.round(((this.offAxis ?? this.lastOffAxis)?.total ?? 0) / Math.PI)) * 180,
      inversions: this.inversions,
    };
    this.offAxis = null; this.lastOffAxis = null;

    v.addScaledVector(n, -v.dot(n));
    v.multiplyScalar(quality === 'clean' ? 0.98 : quality === 'sketchy' ? 0.88 : 0.5);
    this.switch = sw;
    // The rider straightens half of the yaw error, the rest slides out on the edge.
    const off = wrapPi(rel - (sw ? Math.PI : 0));
    this.heading = th + (sw ? Math.PI : 0) + off * 0.5;
    this.flip = 0; this.roll = 0; this.spinVel = 0; this.flipVel = 0; this.rollVel = 0; this.grab = null; this.offAxis = null;
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
    this.flip = 0; this.roll = 0; this.spinVel = 0; this.flipVel = 0; this.rollVel = 0; this.grab = null; this.offAxis = null;
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
    this.flip = 0; this.roll = 0; this.spinVel = 0; this.flipVel = 0; this.rollVel = 0; this.offAxis = null;
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
    // never respawn on top of an obstacle, or inside a kicker or roller (the rider would get
    // up in its trough or on its face): walk down past it
    for (let i = 0; i < 40; i++) {
      const f = c.features.find((q) => q.type !== 'ramp' && d > q.dMin - 2 && d < q.dMax && Math.abs(x - (q.x ?? 0)) < (q.width ?? 0) / 2 + 3);
      if (f) { d = f.dMax + 2; continue; }
      if (c.obstacleAt(tA.set(x, c.heightAtD(x, d), -d), 1.2)) { d += 2; continue; }
      // and not in a hollow the board could not roll out of
      if (d < c.finishD && c.heightAtD(x, d + 3) > c.heightAtD(x, d) - 0.05) { d += 2; continue; }
      break;
    }
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
