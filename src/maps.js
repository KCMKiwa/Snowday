// Map definitions: slope, length, features and lighting. Rail heights are relative
// to the base slope at the rail start, segment angles are absolute (negative = downhill).

export const ENVS = {
  day: {
    // clear sun and a deep blue sky: warm-white lit snow, clearly blue shade
    sun: [-0.45, 0.58, 0.42], sunColor: '#fff0d8', sunI: 3.1, sunDisc: 1,
    hemiSky: '#86aef5', hemiGround: '#d9e2ee', hemiI: 0.62,
    zenith: '#2a62b8', horizon: '#bcd3ee', ground: '#dfe8f3', haze: 0.32,
    fog: '#c3d6ec', fogNear: 230, fogFar: 1500, snowfall: 0.5, exposure: 1.55,
    shade: [0.7, 0.82, 1.08], clouds: 0.6,
  },
  sunset: {
    sun: [-0.78, 0.22, 0.3], sunColor: '#ffb27a', sunI: 3.0, sunDisc: 1.3,
    hemiSky: '#7f93d4', hemiGround: '#efcdb5', hemiI: 0.55,
    zenith: '#29407f', horizon: '#f2b088', ground: '#f0d6c4', haze: 0.42,
    fog: '#d7ad97', fogNear: 190, fogFar: 1200, snowfall: 0.15, exposure: 1.4,
    shade: [0.62, 0.7, 1.08], clouds: 0.8,
  },
  overcast: {
    // flat light still needs some direction, or the snow has no shape at all
    sun: [-0.35, 0.72, 0.35], sunColor: '#f2f5fa', sunI: 1.9, sunDisc: 0,
    hemiSky: '#c3cfdf', hemiGround: '#eef1f5', hemiI: 1.05,
    zenith: '#7d8ca1', horizon: '#c9d1dc', ground: '#e3e8ee', haze: 0.75,
    fog: '#c9d1dc', fogNear: 70, fogFar: 650, snowfall: 1.6, exposure: 1.45,
    shade: [0.74, 0.83, 1.05],
  },
};

const park = {
  id: 'park', name: 'Slopestyle Park', env: 'day', time: 11.5, slope: 15, length: 800, parkHalf: 26,
  tags: ['Slopestyle Park', '800 m', '7 Kicker', '8 Rails & Boxes'],
  gate: 'SNOWDAY', fences: true, camps: true,
  snow: { groomHalf: 26, powder: 0.5 },
  kickers: [
    // line 1
    { name: 'Kicker S', x: -9, d: 125, width: 8, lip: 20, takeoff: 7, table: 5, land: 22 },
    { name: 'Kicker M', x: 9.5, d: 120, width: 9, lip: 24, takeoff: 10, table: 9, land: 24 },
    // line 2
    { name: 'Kicker M', x: -9, d: 235, width: 9, lip: 24, takeoff: 10, table: 9, land: 24 },
    { name: 'Kicker L', x: 9.5, d: 230, width: 10, lip: 27, takeoff: 12, table: 12, land: 26 },
    // line 3: the money booter
    { name: 'Kicker XL', x: 0, d: 440, width: 12, lip: 28, takeoff: 13, table: 10, land: 27, knuckle: 6 },
    // line 4
    { name: 'Kicker M', x: -9, d: 590, width: 9, lip: 24, takeoff: 10, table: 9, land: 24 },
    { name: 'Kicker L', x: 9.5, d: 585, width: 10, lip: 27, takeoff: 12, table: 12, land: 26 },
  ],
  rails: [
    // rail garden 1
    { name: 'Down Box', kind: 'box', x: -11, d: 57, h: 0.48, ramp: 5, segs: [{ len: 12, angle: -15 }] },
    { name: 'Flat-Down Rail', kind: 'rail', x: 0, d: 62, h: 0.52, ramp: 5, segs: [{ len: 3.5, angle: -6 }, { len: 10, angle: -15 }] },
    { name: 'Kink Rail', kind: 'rail', x: 11, d: 60, h: 0.8, segs: [{ len: 5, angle: -15 }, { len: 3, angle: -25 }, { len: 5, angle: -15 }] },
    // rail garden 2
    { name: 'Long Down Rail', kind: 'rail', x: -10, d: 355, h: 0.55, ramp: 5, segs: [{ len: 18, angle: -15 }] },
    { name: 'Kink Box', kind: 'box', x: 0, d: 362, h: 0.5, ramp: 5, segs: [{ len: 5, angle: -8 }, { len: 6, angle: -24 }] },
    { name: 'Down Rail', kind: 'rail', x: 10.5, d: 358, h: 0.72, segs: [{ len: 14, angle: -15 }] },
    // final jib line
    { name: 'Rainbow Box', kind: 'box', x: -8, d: 700, h: 0.45, ramp: 5, segs: [{ len: 4, angle: 4 }, { len: 4, angle: -15 }, { len: 4, angle: -32 }] },
    { name: 'Down Box', kind: 'box', x: 8, d: 702, h: 0.48, ramp: 5, segs: [{ len: 14, angle: -15 }] },
  ],
  props: [
    { model: 'snowman', x: -14, d: 4, rot: 0.6, s: 1.6 },
    { model: 'snowmanHat', x: 15, d: 3, rot: -0.7, s: 1.6 },
    { model: 'bench', x: -13, d: 812, rot: 2.8, s: 1.5 },
    { model: 'bench', x: 13, d: 815, rot: -2.8, s: 1.5 },
  ],
  lodge: { x: 0, d: 870, rot: Math.PI },
};

const jib = {
  id: 'jib', name: 'Jib Garden', env: 'sunset', time: 16.9, slope: 12, length: 520, parkHalf: 24,
  tags: ['Jib Garden', '520 m', '3 Kicker', '13 Rails, Boxes & Ledges', 'Abendsonne'],
  gate: 'JIB GARDEN', fences: true, camps: true, lanterns: true,
  snow: { groomHalf: 24, powder: 0.45 },
  kickers: [
    { name: 'Kicker S', x: -8, d: 95, width: 8, lip: 20, takeoff: 7, table: 5, land: 20 },
    { name: 'Kicker S', x: 8, d: 95, width: 8, lip: 22, takeoff: 8, table: 6, land: 22 },
    { name: 'Kicker M', x: 0, d: 310, width: 9, lip: 24, takeoff: 10, table: 8, land: 23 },
  ],
  rails: [
    // entry line
    { name: 'Down Box', kind: 'box', x: -10, d: 42, h: 0.45, ramp: 5, segs: [{ len: 10, angle: -12 }] },
    { name: 'Flat Ledge', kind: 'ledge', x: 0, d: 45, h: 0.5, ramp: 5, segs: [{ len: 6, angle: -8 }, { len: 6, angle: -12 }] },
    { name: 'Down Rail', kind: 'rail', x: 10, d: 42, h: 0.55, ramp: 5, segs: [{ len: 12, angle: -12 }] },
    // rainbow line
    { name: 'Rainbow Rail', kind: 'rail', x: -9, d: 150, h: 0.5, ramp: 5, segs: [{ len: 3, angle: -4 }, { len: 3, angle: -12 }, { len: 3, angle: -20 }] },
    { name: 'Kink Box', kind: 'box', x: 0, d: 152, h: 0.5, ramp: 5, segs: [{ len: 4, angle: -6 }, { len: 4, angle: -20 }] },
    { name: 'Angle Rail', kind: 'rail', x: 7, d: 150, h: 0.55, ramp: 5, yaw: 12, segs: [{ len: 13, angle: -12 }] },
    // ledge line
    { name: 'Long Ledge', kind: 'ledge', x: -9, d: 230, h: 0.5, ramp: 5, segs: [{ len: 18, angle: -12 }] },
    { name: 'Down-Flat-Down', kind: 'rail', x: 9, d: 232, h: 0.6, ramp: 5, segs: [{ len: 5, angle: -14 }, { len: 4, angle: -4 }, { len: 6, angle: -16 }] },
    // angled boxes around a double kink
    { name: 'Angle Box', kind: 'box', x: -10, d: 380, h: 0.45, ramp: 5, yaw: -10, segs: [{ len: 12, angle: -12 }] },
    { name: 'Double Kink', kind: 'rail', x: 0, d: 385, h: 0.7, ramp: 5, segs: [{ len: 4, angle: -10 }, { len: 3, angle: -18 }, { len: 4, angle: -10 }, { len: 3, angle: -18 }] },
    { name: 'Angle Box', kind: 'box', x: 10, d: 380, h: 0.45, ramp: 5, yaw: 10, segs: [{ len: 12, angle: -12 }] },
    // finale
    { name: 'Log Slide', kind: 'log', x: -6, d: 465, h: 0.5, ramp: 5, segs: [{ len: 12, angle: -12 }] },
    { name: 'Flat Box', kind: 'box', x: 6, d: 465, h: 0.45, ramp: 5, segs: [{ len: 5, angle: -7 }, { len: 6, angle: -12 }] },
  ],
  props: [
    { model: 'snowman', x: -12, d: 4, rot: 0.5, s: 1.6 },
    { model: 'sled', x: -10.5, d: 6, rot: 1.2, s: 1.4 },
    { model: 'snowmanHat', x: 13, d: 2, rot: -0.6, s: 1.7 },
    { model: 'reindeer', x: 16, d: 530, rot: -2.2, s: 1.6 },
    { model: 'bench', x: -12, d: 530, rot: 2.6, s: 1.5 },
  ],
  lodge: { x: -2, d: 590, rot: Math.PI },
};

const backcountry = {
  id: 'backcountry', name: 'Backcountry', env: 'overcast', time: 13, slope: 19, length: 900, parkHalf: 34,
  tags: ['Backcountry', '900 m', 'Powder', 'Natural Hits & Logs', 'Felsen & Bäume'],
  gate: 'BACKCOUNTRY', fences: false, camps: false, roughness: 1,
  snow: { groomHalf: 0, powder: 0.4 },
  treeDensity: 1.5,
  rollers: [
    { d: 55, len: 16, h: 1.3, width: 46 },
    { d: 160, len: 14, h: 1.1, width: 40, x: -4 },
    { d: 340, len: 18, h: 1.6, width: 50 },
    { d: 520, len: 15, h: 1.2, width: 44, x: 6 },
    { d: 690, len: 16, h: 1.4, width: 50 },
  ],
  kickers: [
    { name: 'Windlip', x: -12, d: 100, width: 14, lip: 22, takeoff: 6, table: 2, land: 27, natural: true },
    { name: 'Natural Booter', x: 11, d: 215, width: 16, lip: 25, takeoff: 10, table: 6, land: 28, natural: true },
    { name: 'Cornice', x: 0, d: 420, width: 22, lip: 27, takeoff: 12, table: 9, land: 31, knuckle: 6, natural: true },
    { name: 'Pillow', x: -13, d: 590, width: 12, lip: 18, takeoff: 6, table: 3, land: 26, natural: true },
    { name: 'Side Hit', x: 14, d: 600, width: 11, lip: 24, takeoff: 7, table: 3, land: 27, natural: true },
    { name: 'Last Hit', x: 0, d: 790, width: 18, lip: 25, takeoff: 10, table: 7, land: 29, natural: true },
  ],
  rails: [
    { name: 'Fallen Log', kind: 'log', x: 8, d: 285, h: 0.5, ramp: 4, yaw: 14, segs: [{ len: 10, angle: -19 }] },
    { name: 'Fallen Log', kind: 'log', x: -9, d: 475, h: 0.5, ramp: 4, yaw: -18, segs: [{ len: 9, angle: -19 }] },
    { name: 'Log Jib', kind: 'log', x: 4, d: 735, h: 0.55, ramp: 4, yaw: 8, segs: [{ len: 11, angle: -17 }] },
  ],
  obstacles: [
    { type: 'rock', x: -21, d: 88, r: 1.6, h: 1.5 },
    { type: 'rock', x: 19, d: 140, r: 1.2, h: 1.0 },
    { type: 'rock', x: -3, d: 262, r: 0.9, h: 0.7 },
    { type: 'tree', x: 26, d: 330, r: 0.6, h: 9 },
    { type: 'rock', x: 21, d: 385, r: 1.7, h: 1.6 },
    { type: 'rock', x: -25, d: 455, r: 1.5, h: 1.4 },
    { type: 'tree', x: -27, d: 520, r: 0.6, h: 10 },
    { type: 'rock', x: 5, d: 555, r: 1.0, h: 0.8 },
    { type: 'tree', x: 28, d: 645, r: 0.6, h: 9 },
    { type: 'rock', x: -19, d: 690, r: 1.4, h: 1.3 },
    { type: 'rock', x: 17, d: 765, r: 1.2, h: 1.0 },
    { type: 'tree', x: -24, d: 760, r: 0.6, h: 11 },
    { type: 'rock', x: -9, d: 860, r: 1.1, h: 0.9 },
  ],
  props: [
    { model: 'sled', x: -9, d: 3, rot: 1.0, s: 1.4 },
    { model: 'snowBunker', x: 10, d: 2, rot: -0.4, s: 2.2 },
    { model: 'reindeer', x: -15, d: 925, rot: 2.4, s: 1.6 },
  ],
  lodge: { x: 8, d: 960, rot: Math.PI },
};

export const MAPS = [park, jib, backcountry];
export const mapById = (id) => MAPS.find((m) => m.id === id) ?? MAPS[0];
