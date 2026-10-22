// Trick naming, scoring and combo banking (snowboard and freeski names).

export const GRABS = {
  indy: { name: 'Indy', value: 1.0 },
  mute: { name: 'Mute', value: 1.05 },
  melon: { name: 'Melon', value: 1.1 },
  stalefish: { name: 'Stalefish', value: 1.2 },
  nose: { name: 'Nosegrab', value: 1.15 },
  tail: { name: 'Tailgrab', value: 1.1 },
  method: { name: 'Method', value: 1.25 },
  japan: { name: 'Japan', value: 1.3 },
};

// The same grab keys on skis, with the freeski names.
export const SKI_GRABS = {
  indy: 'Safety', mute: 'Mute', melon: 'Critical', stalefish: 'Blunt',
  nose: 'Tip Grab', tail: 'Tail Grab', method: 'Truckdriver', japan: 'Japan',
};
export const grabName = (key, gear) => (gear === 'ski' ? SKI_GRABS[key] : GRABS[key].name);

const round10 = (v) => Math.round(v / 10) * 10;
const MULTI = ['', 'Double ', 'Triple ', 'Quad '];
const GRAB_MIN = 0.18;
const TWEAK_TIME = 0.9;

// Regular stance: a counter-clockwise spin (A key) opens the chest downhill = frontside.
// Skiers face forward, so their spins are just left (counter-clockwise) or right.
export function sideName(spinDir, switchStance, gear = 'board') {
  if (gear === 'ski') return spinDir > 0 ? 'Left' : 'Right';
  return (spinDir > 0) !== switchStance ? 'Frontside' : 'Backside';
}

export function mainGrab(grabs) {
  let best = null;
  for (const g of grabs) if (g.time >= GRAB_MIN && (!best || g.time > best.time)) best = g;
  return best;
}

// Distinct grabs held long enough to count, in the order they were done.
function heldGrabs(grabs) {
  const out = [];
  for (const g of grabs) {
    if (g.time < GRAB_MIN) continue;
    const last = out[out.length - 1];
    if (last && last.name === g.name) last.time += g.time;
    else out.push({ ...g });
  }
  return out;
}

export function describeAir(e) {
  const deg = e.spinDeg, flips = e.flips, rolls = e.rolls || 0;
  const inv = flips + rolls;
  const grab = mainGrab(e.grabs);
  const held = heldGrabs(e.grabs);
  const ski = e.gear === 'ski';
  const side = sideName(e.spinDir, e.takeoffSwitch, e.gear);
  const shifty = !inv && deg === 0 && (e.spinPeak || 0) >= 0.85;
  let name = '';

  if (inv > 0) {
    const mult = MULTI[Math.min(inv - 1, 3)];
    if (deg >= 180) {
      const kind = rolls > flips ? 'Cork' : e.flipDir > 0 ? 'Rodeo' : 'Misty';
      name = `${side} ${mult}${kind} ${deg}`;
    } else if (rolls > flips) {
      name = mult + (ski ? 'Lincoln Loop' : e.rollDir > 0 ? 'Wildcat' : 'Tamedog');
    } else {
      name = mult + (e.flipDir > 0 ? 'Backflip' : 'Frontflip');
    }
  } else if (deg >= 180) {
    name = `${side} ${deg}`;
  } else if (shifty) {
    name = 'Shifty';
  }
  const rotated = deg > 0 || inv > 0;
  if (rotated && e.takeoffKind === 'nollie') name = 'Nollie ' + name;
  else if (rotated && e.takeoffSwitch) name = 'Switch ' + name;
  if (rotated && e.takeoffKind === 'rail') name += ' Out';

  let grabTxt = '';
  const gn = (key) => grabName(key, e.gear);
  if (held.length >= 2) grabTxt = `${gn(held[0].name)} to ${gn(held[held.length - 1].name)}`;
  else if (grab) grabTxt = (grab.time >= TWEAK_TIME ? 'Tweaked ' : '') + gn(grab.name);
  if (grabTxt) name = name ? `${name} ${grabTxt}` : held.length >= 2 || /grab$/i.test(grabTxt) ? grabTxt : `${grabTxt} Grab`;

  let pts = 0;
  if (!name) {
    if (e.airTime < 0.9) return null;
    name = 'Straight Air';
    pts = 50 + e.airTime * 40;
  } else {
    const spinPts = (deg / 180) * 160 * (1 + deg / 1800);
    const invPts = inv * 450 * (inv > 1 ? 1.35 : 1);
    let grabPts = 0;
    if (grab) {
      const v = GRABS[grab.name].value;
      grabPts = 120 * v + 240 * v * Math.min(grab.time, 1.6) / 1.6;
      if (grab.time >= TWEAK_TIME) grabPts *= 1.2;
      if (held.length >= 2) grabPts *= 1.35;
    }
    pts = spinPts + invPts + grabPts + e.airTime * 40 + (shifty ? 90 : 0);
    if (inv > 0 && deg >= 180) pts *= 1.25;
    if (rotated && e.takeoffKind === 'nollie') pts *= 1.15;
    else if (rotated && e.takeoffSwitch) pts *= 1.2;
    if (rotated && e.takeoffKind === 'rail') pts *= 1.1;
  }
  if (e.quality === 'sketchy') pts *= 0.5;
  return { name, points: round10(pts), quality: e.quality };
}

export function describeButter(e) {
  if (e.time < 0.35 && e.spinDeg < 180) return null;
  let name = e.kind === 'nose' ? 'Nose Butter' : 'Tail Butter';
  if (e.spinDeg >= 180) name = `${sideName(e.spinDir, e.switchStart, e.gear)} ${name} ${e.spinDeg}`;
  if (e.switchStart) name = 'Switch ' + name;
  let pts = 60 + Math.min(e.time, 2.5) * 80 + (e.spinDeg / 180) * 150;
  if (e.switchStart) pts *= 1.15;
  return { name, points: round10(pts), quality: 'clean' };
}

export function describeGrind(e) {
  const pressed = e.press && e.pressTime > e.time * 0.5;
  // skiers slide a rail with the skis across it: a "slide" rather than a boardslide
  const type = e.gear === 'ski' && e.grindType === 'Boardslide' ? 'Slide' : e.grindType;
  let name = e.grindType === '50-50' && pressed ? e.press : type;
  if (e.side) name = `${e.side} ${name}`;
  if (e.switch) name = 'Switch ' + name;
  if (e.spinOn >= 180) name = `${sideName(e.spinOnDir, e.spinOnSwitch, e.gear)} ${e.spinOn} on ${name}`;
  name = `${name} · ${e.rail}`;
  let pts = 120 + e.dist * 55;
  if (e.grindType === 'Boardslide') pts *= 1.2;
  if (e.grindType === 'Lipslide') pts *= 1.3;
  if (pressed) pts *= 1.25;
  if (e.switch) pts *= 1.15;
  if (e.kind === 'log') pts *= 1.1;
  if (e.spinOn >= 180) pts += (e.spinOn / 90) * 70;
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
    } else if (ev.type === 'butter') {
      const t = describeButter(ev);
      if (t) this.push(t);
    } else if (ev.type === 'grindEnd') {
      if (ev.bail) { this.drop(); return; }
      if (ev.dist > 1) this.push(describeGrind(ev));
    } else if (ev.type === 'crash') {
      this.drop();
    }
  }

  // state: 'ground' while just riding (combo timer runs), anything else keeps it alive
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
