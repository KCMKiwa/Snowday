// Winter headwear fitted to each rider's own head: cuffed rib beanie, fisherman beanie,
// pom-pom beanie, slouch beanie, knitted chullo with ear flaps and braids, and a fur-lined
// trapper. The crown follows the skull (an ellipsoid set from the eyes, since the models'
// hair is sculpted into the head mesh); the hat line sits on the measured head surface, so
// the edge touches skin or hair all round. The rider code then presses the sculpted hair
// under the hat (pressHead), like a real beanie does. Procedural fabric maps (rib knit,
// Fair Isle, suede, fur). Hat frame: origin = skull centre, +Z forward (face), +Y up.
import * as THREE from 'three';

const rnd = (() => { let s = 777; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();

// ---------- fabric ----------

// Height field -> tangent-space normal map + matching albedo variation.
function fabric(N, heightAt, { strength = 2.5, tint = 0.18, colorAt = null } = {}) {
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = heightAt(x, y);
  const nc = document.createElement('canvas'), cc = document.createElement('canvas');
  nc.width = nc.height = cc.width = cc.height = N;
  const ni = nc.getContext('2d').createImageData(N, N), ci = cc.getContext('2d').createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const nx = -dx * strength, ny = dy * strength, l = Math.hypot(nx, ny, 1);
      const i = (y * N + x) * 4;
      ni.data[i] = (nx / l * 0.5 + 0.5) * 255; ni.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; ni.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[i + 3] = 255;
      const k = 1 - tint + tint * Math.min(1, Math.max(0, h[y * N + x]));
      const c = colorAt ? colorAt(x, y) : [255, 255, 255];
      ci.data[i] = c[0] * k; ci.data[i + 1] = c[1] * k; ci.data[i + 2] = c[2] * k; ci.data[i + 3] = 255;
    }
  }
  nc.getContext('2d').putImageData(ni, 0, 0);
  cc.getContext('2d').putImageData(ci, 0, 0);
  const nt = new THREE.CanvasTexture(nc), ct = new THREE.CanvasTexture(cc);
  ct.colorSpace = THREE.SRGBColorSpace;
  for (const t of [nt, ct]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return { normal: nt, color: ct };
}

const cache = {};
// 2x2 rib: raised columns of V-shaped stitches
const ribHeight = (x, y) => {
  const col = (x % 16) / 16, row = (y % 10) / 10;
  const rib = Math.cos((col - 0.5) * Math.PI) ** 0.6;
  const v = 1 - Math.abs(Math.abs(col - 0.5) * 2 - row) * 1.4;
  return rib * 0.7 + Math.max(0, v) * 0.35 + (rnd() - 0.5) * 0.05;
};
const knitMaps = () => (cache.knit ??= fabric(128, ribHeight, { strength: 3.2, tint: 0.3 }));
// stockinette for the crown of a fisherman / chullo: smaller Vs, no ribs
const stockMaps = () => (cache.stock ??= fabric(128, (x, y) => {
  const col = (x % 8) / 8, row = (y % 8) / 8;
  return Math.max(0, 1 - Math.abs(Math.abs(col - 0.5) * 2 - row) * 1.6) * 0.8 + (rnd() - 0.5) * 0.06;
}, { strength: 2.6, tint: 0.28 }));
const suedeMaps = () => (cache.suede ??= fabric(128, () => rnd() * 0.4 + 0.3, { strength: 0.8, tint: 0.15 }));
const furMaps = () => (cache.fur ??= fabric(128, (x, y) => 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(y * 0.3) * 2) * (0.6 + rnd() * 0.4), { strength: 2.4, tint: 0.35 }));

// Fair Isle band (zigzags and diamonds) in two colours, knitted texture on top.
function fairIsle(c1, c2) {
  const key = `fi${c1.getHexString()}${c2.getHexString()}`;
  return (cache[key] ??= fabric(128, (x, y) => (x % 8) / 8 * 0.2 + ((y % 8) / 8) * 0.2 + (rnd() - 0.5) * 0.05, {
    strength: 2.2, tint: 0.25,
    colorAt: (x, y) => {
      const cx = Math.floor(x / 8), cy = Math.floor(y / 8);
      const zig = Math.abs(((cx + cy * 0) % 8) - 4);
      const band = cy % 16;
      const on = band < 2 || band === 15 || (band > 4 && band < 11 && Math.abs(zig - (band - 5)) < 1) || (band === 8 && cx % 4 === 0);
      const c = on ? c2 : c1;
      return [c.r * 255, c.g * 255, c.b * 255].map((v) => Math.pow(v / 255, 1 / 2.2) * 255);
    },
  }));
}

function cloth(color, maps, repeat, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.93, ...opts });
  m.map = maps.color.clone(); m.map.repeat.set(...repeat); m.map.needsUpdate = true;
  m.normalMap = maps.normal.clone(); m.normalMap.repeat.set(...repeat); m.normalMap.needsUpdate = true;
  return m;
}

// ---------- the head ----------

const NA = 64, NE = 44, E0 = -1.35, E1 = Math.PI / 2;
const dirOf = (a, e, out = new THREE.Vector3()) => out.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));

// Skull as an ellipsoid (semi-axes: aW side, aH up, aL front-back): radius by direction.
export const skullShape = (aW, aH, aL) => (a, e) => {
  const x = Math.sin(a) * Math.cos(e), y = Math.sin(e), z = Math.cos(a) * Math.cos(e);
  return 1 / Math.sqrt((x / aW) ** 2 + (y / aH) ** 2 + (z / aL) ** 2);
};

// Radial shape of a head from its mesh vertices (hat frame, around the origin): the
// furthest vertex per direction, dilated then smoothed (dilation >= blur radius, so the
// smooth shape never dips inside a measured point), with bilinear lookup.
export function headShape(points) {
  const g = new Float32Array(NA * NE).fill(-1);
  const cell = (a, e) => {
    const i = ((Math.floor(((a + Math.PI) / (Math.PI * 2)) * NA) % NA) + NA) % NA;
    const j = Math.min(NE - 1, Math.max(0, Math.floor(((e - E0) / (E1 - E0)) * NE)));
    return j * NA + i;
  };
  for (const [x, y, z] of points) {
    const r = Math.hypot(x, y, z);
    if (r < 1e-4) continue;
    const k = cell(Math.atan2(x, z), Math.asin(y / r));
    if (r > g[k]) g[k] = r;
  }
  const at = (arr, i, j) => arr[Math.min(NE - 1, Math.max(0, j)) * NA + ((i % NA) + NA) % NA];
  // fill cells nothing landed in from their neighbours
  for (let it = 0; it < 40; it++) {
    let empty = 0;
    const next = g.slice();
    for (let j = 0; j < NE; j++) for (let i = 0; i < NA; i++) {
      if (g[j * NA + i] >= 0) continue;
      let s = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = at(g, i + di, j + dj); if (v >= 0) { s += v; n++; } }
      if (n) next[j * NA + i] = s / n; else empty++;
    }
    g.set(next);
    if (!empty) break;
  }
  for (let k = 0; k < g.length; k++) if (g[k] < 0) g[k] = 0.09;
  const pass = (src, fn, R) => {
    const out = new Float32Array(src.length);
    for (let j = 0; j < NE; j++) for (let i = 0; i < NA; i++) {
      let acc = fn === 'max' ? -Infinity : 0, n = 0;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const v = at(src, i + di, j + dj);
        if (fn === 'max') acc = Math.max(acc, v); else { acc += v; n++; }
      }
      out[j * NA + i] = fn === 'max' ? acc : acc / n;
    }
    return out;
  };
  let sm = pass(g, 'max', 2);
  sm = pass(pass(sm, 'avg', 1), 'avg', 1);
  // the crown is one point: average the top row
  let top = 0;
  for (let i = 0; i < NA; i++) top += sm[(NE - 1) * NA + i];
  top /= NA;
  for (let i = 0; i < NA; i++) sm[(NE - 1) * NA + i] = top;
  const rad = (a, e) => {
    const fi = ((a + Math.PI) / (Math.PI * 2)) * NA - 0.5, fj = Math.min(NE - 1, Math.max(0, ((e - E0) / (E1 - E0)) * NE - 0.5));
    const i0 = Math.floor(fi), j0 = Math.floor(fj), ti = fi - i0, tj = fj - j0;
    const v00 = at(sm, i0, j0), v10 = at(sm, i0 + 1, j0), v01 = at(sm, i0, j0 + 1), v11 = at(sm, i0 + 1, j0 + 1);
    return (v00 * (1 - ti) + v10 * ti) * (1 - tj) + (v01 * (1 - ti) + v11 * ti) * tj;
  };
  return { rad };
}

// Elevation of a height (relative to the hat origin) at azimuth a on this head.
const elevAt = (head, a, y) => {
  let e = 0;
  for (let k = 0; k < 3; k++) e = Math.asin(Math.max(-0.99, Math.min(0.99, y / head.rad(a, e))));
  return e;
};

// A sheet over the head: columns by azimuth a0..a1, rows v = 0 (rim) .. 1 (crown);
// elev(a, v) gives the elevation, off(a, v) the distance out from the head surface,
// shift(a, v, p) may move the point (slouch). uv: [repeat u, repeat v].
function sheet(head, { a0 = -Math.PI, a1 = Math.PI, na = 72, nv = 30, elev, off, shift, closeTop = false }) {
  const pos = [], uv = [], idx = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i <= na; i++) {
      const a = a0 + (i / na) * (a1 - a0);
      const e = elev(a, v);
      dirOf(a, e, p).multiplyScalar(head.rad(a, e) + off(a, v));
      if (shift) shift(a, v, p);
      pos.push(p.x, p.y, p.z);
      uv.push(i / na, v);
    }
  }
  const w = na + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < na; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closeTop) {
    // all crown vertices share one point: give them the straight-up normal
    const n = g.attributes.normal;
    for (let i = nv * w; i < (nv + 1) * w; i++) n.setXYZ(i, 0, 1, 0);
  }
  return g;
}

// Rim height above the eyes (scene units), by azimuth: low on the brow, over the tops of
// the ears, lower still at the back of the head. `lift` raises it for shallow hats.
const RIM = (lift = 0) => (a) => -0.006 + 0.034 * Math.cos(a) + lift * (1 - 0.5 * Math.cos(a));

// ---------- hats ----------
// shape: { mesh(a, e) measured head surface, skull(a, e) skull ellipsoid, eyeY } (hat frame).
// Returns the hat group plus what the rider code needs: the surface the hat lies on (fit),
// the hat line (rimE) for pressing hair under it, and where goggles go.
export function buildHat(hat, shape) {
  const group = new THREE.Group();
  const c1 = new THREE.Color(hat.color), c2 = new THREE.Color(hat.color2 ?? hat.color);
  const style = hat.style;
  const lift = style === 'fisherman' ? 0.03 : 0;
  const rimY = RIM(lift);
  const rimE = (a) => elevAt({ rad: shape.skull }, a, shape.eyeY + rimY(a));
  // The surface under the hat: at the hat line the real head (skin or hair, within reason),
  // blending over the first few centimetres into the skull shape for the crown. Below the
  // line (ear flaps) it goes over whatever is there.
  const atRim = (a, e) => Math.min(shape.skull(a, e) + 0.006, Math.max(shape.skull(a, e) - 0.02, shape.mesh(a, e)));
  const fit = (a, e) => {
    const e0 = rimE(a);
    if (e < e0) {
      // ear flaps hug what is under them, joining the hat line smoothly
      const m = shape.mesh(a, e);
      return m + (atRim(a, e0) - shape.mesh(a, e0)) * smooth(e0 - 0.3, e0, e);
    }
    const r0 = atRim(a, e);
    return r0 + (shape.skull(a, e) - r0) * smooth(0, 0.3, e - e0);
  };
  const head = { rad: fit };
  const T = 0.007; // knit thickness over hair and scalp
  const crownE = (a, v) => { const e0 = rimE(a); return e0 + (E1 - e0) * Math.pow(v, 0.9); };

  if (style === 'beanie' || style === 'pom' || style === 'fisherman' || style === 'slouch' || style === 'chullo') {
    const knit = knitMaps();
    const cuffed = style !== 'slouch' && style !== 'chullo';
    const cuffV = style === 'fisherman' ? 0.42 : 0.3;
    // the crown: snug, with a soft bit of air at the top for a beanie, a short point for a
    // fisherman, a deep bag drooping behind for a slouch
    const crownOff = (a, v) => {
      const top = style === 'fisherman' ? 0.009 * Math.pow(v, 3) : style === 'slouch' ? 0.012 * smooth(0.3, 1, v) : 0.004 * v * v;
      return T + top;
    };
    const slouch = style === 'slouch'
      ? (a, v, p) => {
        // the spare length bags out behind and droops toward the nape
        // (the same at the crown point for every azimuth, so the top stays closed)
        const w = smooth(0.2, 1, v) * (0.45 - 0.45 * Math.cos(a) * (1 - v * v)) + smooth(0.55, 1, v) * 0.3;
        p.z -= w * 0.07; p.y -= w * 0.045 * v;
        p.multiplyScalar(1 + w * 0.05);
      }
      : null;
    const crownMat = cloth(c1, style === 'fisherman' || style === 'chullo' ? stockMaps() : knit, style === 'chullo' ? [20, 3] : [16, 3]);
    if (style === 'chullo') {
      // Fair Isle band above the rim, plain knit crown
      const fi = fairIsle(c1, c2);
      const band = new THREE.Mesh(sheet(head, { nv: 8, elev: (a, v) => crownE(a, v * 0.42), off: () => T + 0.0005 }), cloth(new THREE.Color(1, 1, 1), fi, [6, 1]));
      group.add(band);
    }
    const crownFrom = cuffed ? cuffV * 0.75 : style === 'chullo' ? 0.4 : 0;
    const crown = new THREE.Mesh(sheet(head, {
      nv: 30, closeTop: !slouch,
      elev: (a, v) => crownE(a, crownFrom + (1 - crownFrom) * v),
      // a cuffed hat's crown starts under the cuff; otherwise the edge is turned in onto the head
      off: (a, v) => crownOff(a, crownFrom + (1 - crownFrom) * v) * (crownFrom ? 1 : Math.min(1, 0.25 + v * 12)) - (crownFrom && v < 0.05 ? 0.002 : 0),
      shift: slouch && ((a, v, p) => slouch(a, crownFrom + (1 - crownFrom) * v, p)),
    }), crownMat);
    group.add(crown);
    if (cuffed) {
      // folded cuff: double thickness, a rolled top edge, tucked against the head at the bottom
      const cuffMat = cloth(c1.clone().multiplyScalar(0.93), knit, [18, 1.2]);
      const cuff = new THREE.Mesh(sheet(head, {
        nv: 12,
        elev: (a, v) => crownE(a, v * cuffV),
        off: (a, v) => T + 0.009 * Math.sqrt(Math.min(1, v / 0.12)) * Math.sqrt(Math.min(1, (1 - v) / 0.18)) + 0.004 * Math.min(1, v / 0.1),
      }), cuffMat);
      group.add(cuff);
      if (hat.stripe) {
        const st = new THREE.Mesh(sheet(head, { nv: 3, elev: (a, v) => crownE(a, cuffV * (0.42 + 0.16 * v)), off: () => T + 0.0135 }), cloth(new THREE.Color(hat.stripe), knit, [18, 0.3]));
        group.add(st);
      }
    }
    if (style === 'pom' || style === 'chullo') {
      // fluffy yarn pom-pom on the crown
      const R = style === 'pom' ? 0.042 : 0.026;
      const geo = new THREE.IcosahedronGeometry(R, 3);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + (rnd() - 0.5) * 0.24; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
      geo.computeVertexNormals();
      const pom = new THREE.Mesh(geo, cloth(c2, furMaps(), [3, 3]));
      pom.position.set(0, head.rad(0, E1) + T + R * 0.75, 0);
      group.add(pom);
    }
    if (style === 'chullo') {
      // knitted ear flaps down over the ears, braided ties hanging from their points
      for (const s of [-1, 1]) {
        const aC = s * Math.PI / 2;
        const flap = new THREE.Mesh(sheet(head, {
          a0: aC - 0.62, a1: aC + 0.62, na: 18, nv: 12,
          elev: (a, v) => { const u = (a - aC) / 0.62; const depth = 0.78 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.6 + 0.4 * (1 - Math.abs(u))); return rimE(a) + 0.08 - (1 - v) * depth; },
          off: () => T + 0.002,
        }), cloth(c1, fairIsle(c1, c2), [2, 1]));
        group.add(flap);
        const tipE = rimE(aC) + 0.08 - 0.78;
        const tip = dirOf(aC, tipE).multiplyScalar(head.rad(aC, tipE) + T);
        const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.15, 6, 8), cloth(c2, knitMaps(), [1, 6]));
        braid.position.copy(tip).add(new THREE.Vector3(0, -0.075, 0));
        group.add(braid);
        const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.04, 8), cloth(c2, furMaps(), [1, 1]));
        tassel.position.copy(tip).add(new THREE.Vector3(0, -0.165, 0));
        group.add(tassel);
      }
    }
  } else if (style === 'trapper') {
    const suede = cloth(c1, suedeMaps(), [6, 2]);
    const fur = cloth(c2, furMaps(), [18, 2]);
    group.add(new THREE.Mesh(sheet(head, { nv: 26, closeTop: true, elev: crownE, off: (a, v) => 0.009 + 0.004 * v * v }), suede));
    // fur band folded up round the rim, a little taller at the front
    group.add(new THREE.Mesh(sheet(head, {
      nv: 10, elev: (a, v) => crownE(a, v * (0.2 + 0.06 * Math.max(0, Math.cos(a)))),
      off: (a, v) => 0.008 + 0.012 * Math.sqrt(Math.min(1, v / 0.15)) * Math.sqrt(Math.min(1, (1 - v) / 0.25)) * (1 + 0.3 * Math.max(0, Math.cos(a))),
    }), fur));
    // ear flaps over the ears down to the jaw: suede outside, the fur lining showing round the edge
    for (const s of [-1, 1]) {
      const aC = s * Math.PI / 2;
      const flap = (span, depth, off, mat) => {
        const elev = (a, v) => { const u = (a - aC) / span; return rimE(a) + 0.06 - (1 - v) * depth * Math.pow(Math.max(0, 1 - u * u), 0.35); };
        group.add(new THREE.Mesh(sheet(head, { a0: aC - span, a1: aC + span, na: 20, nv: 12, elev, off: () => off }), mat));
      };
      flap(0.74, 0.9, 0.011, fur);
      flap(0.68, 0.84, 0.016, suede);
    }
  }
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return {
    group, fit, rimE, head,
    // hair is under the hat above this elevation (a little below the rim: the hem presses it)
    hideAbove: (a) => rimE(a) - 0.04,
    // goggle strap around the hat: about halfway up the crown (on the cuff for a beanie)
    gogglesE: (a) => crownE(a, style === 'trapper' ? 0.42 : style === 'fisherman' ? 0.55 : style === 'slouch' ? 0.24 : 0.36),
    off: style === 'trapper' ? 0.024 : style === 'slouch' || style === 'chullo' ? 0.009 : 0.018,
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Goggles pushed up onto the hat: frame and mirrored lens bent round the front of the hat,
// branded strap round the back, all laid on the hat's own surface.
export function buildGoggles(hatInfo, lensColor) {
  const g = new THREE.Group();
  const head = hatInfo.head;
  const e = hatInfo.gogglesE, base = hatInfo.off;
  const H = 0.045; // frame height
  const band = (a0, a1, h, off, mat, tilt = 0) => new THREE.Mesh(sheet(head, {
    a0, a1, na: 28, nv: 4,
    elev: (a, v) => { const e0 = e(a); const r = head.rad(a, e0) + off; return e0 + ((v - 0.5) * h) / r; },
    off: (a, v) => off + tilt * (v - 0.5),
  }), mat);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.5, side: THREE.DoubleSide });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: lensColor, metalness: 0.9, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.6, emissive: lensColor, emissiveIntensity: 0.12, side: THREE.DoubleSide });
  const stripes = document.createElement('canvas');
  stripes.width = 256; stripes.height = 16;
  const ctx = stripes.getContext('2d');
  ctx.fillStyle = '#16181d'; ctx.fillRect(0, 0, 256, 16);
  ctx.fillStyle = '#e9edf2'; ctx.font = 'bold 12px Arial'; for (let x = 0; x < 256; x += 64) ctx.fillText('SNOWDAY', x + 4, 12);
  const st = new THREE.CanvasTexture(stripes); st.wrapS = THREE.RepeatWrapping; st.repeat.set(3, 1); st.colorSpace = THREE.SRGBColorSpace;
  const strapMat = new THREE.MeshStandardMaterial({ map: st, roughness: 0.8, side: THREE.DoubleSide });
  // the goggles stand off the hat at the top edge (they rest on the brim of the frame)
  g.add(band(-0.95, 0.95, H, base + 0.004, frameMat, 0.01));
  g.add(band(-0.86, 0.86, H * 0.78, base + 0.016, lensMat, 0.01));
  g.add(band(0.9, Math.PI * 2 - 0.9, 0.032, base + 0.002, strapMat));
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
