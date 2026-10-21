// Trick naming, scoring and combo banking.

export const GRABS = {
  indy: { name: 'Indy', value: 1.0 },
  mute: { name: 'Mute', value: 1.05 },
  melon: { name: 'Melon', value: 1.1 },
  stalefish: { name: 'Stalefish', value: 1.2 },
  nose: { name: 'Nosegrab', value: 1.15 },
  tail: { name: 'Tailgrab', value: 1.1 },
};

const round10 = (v) => Math.round(v / 10) * 10;
const MULTI = ['', 'Double ', 'Triple ', 'Quad '];

// Regular stance: a counter-clockwise spin (A key) opens the chest downhill = frontside.
export function sideName(spinDir, switchStance) {
  return (spinDir > 0) !== switchStance ? 'Frontside' : 'Backside';
}

export function mainGrab(grabs) {
  let best = null;
  for (const g of grabs) if (g.time >= 0.18 && (!best || g.time > best.time)) best = g;
  return best;
}

export function describeAir(e) {
  const deg = e.spinDeg, flips = e.flips;
  const grab = mainGrab(e.grabs);
  const side = sideName(e.spinDir, e.takeoffSwitch);
  let name = '';

  if (flips > 0) {
    const mult = MULTI[Math.min(flips - 1, 3)];
    if (deg >= 180) {
      const kind = e.flipDir > 0 ? (side === 'Frontside' ? 'Rodeo' : 'Cork') : 'Misty';
      name = `${side} ${mult}${kind} ${deg}`;
    } else {
      name = mult + (e.flipDir > 0 ? 'Backflip' : 'Frontflip');
    }
  } else if (deg >= 180) {
    name = `${side} ${deg}`;
  }
  if ((deg > 0 || flips > 0) && e.takeoffSwitch) name = 'Switch ' + name;

  if (grab) name = name ? `${name} ${GRABS[grab.name].name}` : `${GRABS[grab.name].name} Grab`;

  let pts = 0;
  if (!name) {
    if (e.airTime < 0.9) return null;
    name = 'Straight Air';
    pts = 50 + e.airTime * 40;
  } else {
    const spinPts = (deg / 180) * 160 * (1 + deg / 1800);
    const flipPts = flips * 450 * (flips > 1 ? 1.35 : 1);
    let grabPts = 0;
    if (grab) {
      const v = GRABS[grab.name].value;
      grabPts = 120 * v + 240 * v * Math.min(grab.time, 1.6) / 1.6;
    }
    pts = spinPts + flipPts + grabPts + e.airTime * 40;
    if (flips > 0 && deg >= 180) pts *= 1.25;
    if (e.takeoffSwitch && (deg > 0 || flips > 0)) pts *= 1.2;
  }
  if (e.quality === 'sketchy') pts *= 0.5;
  return { name, points: round10(pts), quality: e.quality };
}

export function describeGrind(e) {
  let name = e.type;
  if (e.type === '50-50' && e.press && e.pressTime > e.time * 0.5) name = e.press;
  name = `${name} · ${e.rail}`;
  let pts = 120 + e.dist * 55;
  if (e.type === 'Boardslide') pts *= 1.2;
  if (e.press && e.pressTime > e.time * 0.5) pts *= 1.25;
  return { name, points: round10(pts), quality: 'clean' };
}

export class TrickTracker {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.reset();
  }

  reset() {
    this.runScore = 0;
    this.combo = [];
    this.comboIdle = 0;
    this.landed = [];
  }

  get comboPoints() { return this.combo.reduce((a, t) => a + t.points, 0); }

  push(trick) {
    this.combo.push(trick);
    this.comboIdle = 0;
    this.onEvent('trick', { trick, combo: this.combo, total: this.comboPoints, mult: this.combo.length });
  }

  handle(ev) {
    if (ev.type === 'land') {
      if (ev.quality === 'crash') { this.drop(); return; }
      const t = describeAir(ev);
      if (t) this.push(t);
      this.onEvent('landing', { quality: ev.quality });
      if (ev.quality === 'sketchy') this.bank();
    } else if (ev.type === 'grindEnd') {
      if (ev.bail) { this.drop(); return; }
      if (ev.dist > 1) this.push(describeGrind(ev));
    } else if (ev.type === 'crash') {
      this.drop();
    }
  }

  update(dt, state) {
    if (!this.combo.length) return;
    if (state === 'ground') {
      this.comboIdle += dt;
      if (this.comboIdle > 1.1) this.bank();
    } else {
      this.comboIdle = 0;
    }
  }

  bank() {
    if (!this.combo.length) return;
    const mult = this.combo.length;
    const total = this.comboPoints * mult;
    this.runScore += total;
    this.landed.push(...this.combo);
    this.onEvent('bank', { total, mult, combo: this.combo, runScore: this.runScore });
    this.combo = [];
  }

  drop() {
    if (this.combo.length) this.onEvent('lost', { combo: this.combo });
    this.combo = [];
  }
}
