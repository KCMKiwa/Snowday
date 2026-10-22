// Particle snow spray, ambient snowfall and board tracks in the snow.
import * as THREE from 'three';

const shadeColor = (env) => new THREE.Vector3(...(env?.shade ?? [0.82, 0.9, 1.06])).multiplyScalar(0.82);

export class SnowSpray {
  constructor(scene, max = 2400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.seed = new Float32Array(max).map(() => Math.random() * 50);
    this.grow = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.geo = g;
    // Each particle is shaded as a soft lit ball of snow grains, blue on its shadow side.
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uShade: { value: shadeColor() }, uLight: { value: 1 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aSeed; varying float vA; varying float vSeed; uniform float uScale;
        void main(){ vA = aAlpha; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying float vSeed; uniform vec3 uSun; uniform vec3 uShade; uniform float uLight;
        void main(){
          vec2 c = gl_PointCoord - 0.5; c.y = -c.y;
          float d = length(c); if (d > 0.5) discard;
          vec3 n = vec3(c * 2.0, sqrt(max(0.0, 1.0 - 4.0 * d * d)));
          float l = 0.35 + 0.65 * max(dot(n, uSun), 0.0);
          vec2 g = floor(gl_PointCoord * 7.0) + vSeed;
          float grain = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
          float a = smoothstep(0.5, 0.12, d) * vA * (0.7 + 0.3 * grain);
          gl_FragColor = vec4(mix(uShade, vec3(1.0), l) * uLight, a);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.mat = mat;
    scene.add(this.points);
  }

  setEnv(env) { this.mat.uniforms.uShade.value.copy(shadeColor(env)); }
  // light level of the scene and the colour of its shade (from the atmosphere)
  setLight(k, shade) { this.mat.uniforms.uLight.value = k; if (shade) this.mat.uniforms.uShade.value.copy(shade).multiplyScalar(0.82); }

  // grow: how fast a particle puffs up (powder clouds grow, chunks do not)
  emit(p, baseVel, count, spread = 1.5, size = 0.18, life = 0.9, grow = 0.9) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * 0.4;
      this.pos[i * 3 + 1] = p.y + Math.random() * 0.1;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.4;
      this.vel[i * 3] = baseVel.x + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = baseVel.y + Math.random() * spread * 0.8;
      this.vel[i * 3 + 2] = baseVel.z + (Math.random() - 0.5) * spread;
      this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.size[i] = size * (0.6 + Math.random() * 0.9);
      this.grow[i] = grow;
    }
  }

  update(dt, pixelScale, camera, sunDir) {
    this.mat.uniforms.uScale.value = pixelScale;
    if (camera && sunDir) this.mat.uniforms.uSun.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= 6 * dt;
      const drag = Math.exp(-2.2 * dt);
      this.vel[k] *= drag; this.vel[k + 1] *= drag; this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 1.6) * 0.85;
      this.size[i] *= 1 + dt * this.grow[i];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

// Grind sparks: hot, short-lived additive streaks that fall and fade from yellow to red.
export class Sparks {
  constructor(scene, max = 400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.heat = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aHeat', new THREE.BufferAttribute(this.heat, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute float aHeat; varying float vH; uniform float uScale;
        void main(){ vH = aHeat; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = (0.02 + aHeat * 0.025) * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vH; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5 || vH <= 0.0) discard;
        vec3 c = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.92, 0.6), vH); gl_FragColor = vec4(c * 2.0, smoothstep(0.5, 0.0, d) * vH); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p, dir, speed, count) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      this.pos.set([p.x, p.y, p.z], i * 3);
      // thrown backwards along the rail and out to the sides
      const k = speed * (0.3 + Math.random() * 0.5);
      this.vel.set([-dir.x * k + (Math.random() - 0.5) * 2.5, Math.random() * 1.8, -dir.z * k + (Math.random() - 0.5) * 2.5], i * 3);
      this.life[i] = 0.25 + Math.random() * 0.35;
    }
  }
  update(dt, pixelScale) {
    this.mat.uniforms.uScale.value = pixelScale;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.heat[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= 9.8 * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.heat[i] = Math.max(0, this.life[i] / 0.6);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aHeat.needsUpdate = true;
  }
}

export class Snowfall {
  constructor(scene, count = 4000) {
    this.count = count;
    const box = new THREE.Vector3(70, 36, 70);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * box.x;
      pos[i * 3 + 1] = Math.random() * box.y;
      pos[i * 3 + 2] = Math.random() * box.z;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.geo = g;
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uScale: { value: 400 }, uLight: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.uniforms,
      vertexShader: `attribute float aSeed; uniform float uTime, uScale; uniform vec3 uCam, uBox; varying float vA;
        void main(){
          vec3 drift = vec3(sin(uTime*0.6 + aSeed*20.0)*0.8 + 0.6, -1.4 - aSeed*0.8, cos(uTime*0.4 + aSeed*12.0)*0.6) * uTime;
          vec3 p = mod(position + drift - uCam + uBox*0.5, uBox) - uBox*0.5 + uCam;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = smoothstep(0.5, 3.0, d) * smoothstep(34.0, 18.0, d);
          gl_PointSize = (0.05 + aSeed*0.05) * uScale / d;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uLight; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; gl_FragColor = vec4(vec3(uLight), smoothstep(0.5,0.0,d)*vA*0.9); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.setIntensity(0.6);
  }
  // 0 = clear sky, 1 = steady snowfall, 2 = heavy
  setIntensity(k) {
    this.intensity = k;
    this.geo.setDrawRange(0, Math.round(this.count * Math.min(1, k / 2)));
    this.points.visible = k > 0.01;
  }
  setLight(k) { this.uniforms.uLight.value = k; }
  update(dt, camPos, pixelScale) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uCam.value.copy(camPos);
    this.uniforms.uScale.value = pixelScale;
  }
}

// Board tracks: independent quads in a ring buffer, so gaps in the air come for free.
// Each quad is shaded as a shallow groove: dark floor, the rim facing the sun lit.
export class Tracks {
  constructor(scene, max = 2200) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.alpha = new Float32Array(max * 4);
    this.light = new Float32Array(max * 4);
    const across = new Float32Array(max * 4);
    const idx = [];
    for (let i = 0; i < max; i++) {
      const a = i * 4;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      across.set([-1, 1, -1, 1], a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLight', new THREE.BufferAttribute(this.light, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uShade: { value: new THREE.Vector3(0.55, 0.64, 0.8) }, uLight: { value: 1 } }]),
      vertexShader: `attribute float aAlpha; attribute float aLight; attribute float aAcross; varying float vA; varying float vL; varying float vX;
        #include <fog_pars_vertex>
        void main(){ vA = aAlpha; vL = aLight; vX = aAcross; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `varying float vA; varying float vL; varying float vX; uniform vec3 uShade; uniform float uLight;
        #include <fog_pars_fragment>
        void main(){
          float t = vX;
          float floorDark = 1.0 - t * t;
          // groove walls: the one facing the sun brightens, the other falls into shade
          float wall = t * vL;
          vec3 col = mix(uShade, vec3(1.0), clamp(0.45 + wall * 0.55, 0.0, 1.0));
          float a = vA * (0.14 + 0.24 * floorDark + 0.18 * abs(wall));
          gl_FragColor = vec4(col * uLight, a);
        #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.next = 0;
    this.last = null;
    this.lastL = new THREE.Vector3(); this.lastR = new THREE.Vector3();
    this.sunDir = new THREE.Vector3(0, 1, 0);
  }

  setEnv(env, sunDir) {
    this.mat.uniforms.uShade.value.copy(shadeColor(env)).multiplyScalar(0.8);
    this.sunDir.copy(sunDir);
  }

  setLight(k, shade) { this.mat.uniforms.uLight.value = k; if (shade) this.mat.uniforms.uShade.value.copy(shade).multiplyScalar(0.66); }

  reset() {
    this.alpha.fill(0);
    this.last = null;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  // p: board contact point, side: unit vector across the board, w: half width
  add(p, side, w, strength = 1) {
    const l = new THREE.Vector3().copy(p).addScaledVector(side, -w);
    const r = new THREE.Vector3().copy(p).addScaledVector(side, w);
    l.y += 0.02; r.y += 0.02;
    if (this.last && this.last.distanceTo(p) < 0.35) return;
    if (this.last && this.last.distanceTo(p) < 2.5) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const k = i * 12;
      this.pos.set([this.lastL.x, this.lastL.y, this.lastL.z, this.lastR.x, this.lastR.y, this.lastR.z, l.x, l.y, l.z, r.x, r.y, r.z], k);
      this.alpha.fill(strength, i * 4, i * 4 + 4);
      // a wall facing the sun is the one on the far side of it
      this.light.fill(-Math.max(-1, Math.min(1, side.dot(this.sunDir) * 2.5)), i * 4, i * 4 + 4);
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.geo.attributes.aLight.needsUpdate = true;
    }
    this.last = (this.last || new THREE.Vector3()).copy(p);
    this.lastL.copy(l); this.lastR.copy(r);
  }

  breakLine() { this.last = null; }
}

// Wind streaks: thin lines hanging in the air around the camera; at speed they stretch
// along the direction of travel and sell the sense of pace.
export class WindLines {
  constructor(scene, count = 140) {
    this.count = count;
    this.pts = new Float32Array(count * 3);
    this.pos = new Float32Array(count * 6);
    this.alpha = new Float32Array(count * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0), vA * uOpacity); }',
    });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.ready = false;
  }
  spawn(i, cam, ahead) {
    // somewhere in a box in front of and around the camera, never right in the lens
    const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 6;
    this.pts[i * 3] = cam.x + ahead.x * (4 + Math.random() * 26) + Math.cos(a) * r;
    this.pts[i * 3 + 1] = cam.y + ahead.y * 10 + Math.sin(a) * r * 0.6 - 0.5;
    this.pts[i * 3 + 2] = cam.z + ahead.z * (4 + Math.random() * 26) + Math.sin(a) * r;
  }
  update(dt, cam, vel, light = 1) {
    const sp = vel.length();
    const k = Math.min(1, Math.max(0, (sp - 13) / 12));
    this.mat.uniforms.uOpacity.value = k * 0.32 * light;
    this.lines.visible = k > 0.01;
    if (!this.lines.visible) { this.ready = false; return; }
    const ahead = vel.clone().normalize();
    if (!this.ready) { for (let i = 0; i < this.count; i++) this.spawn(i, cam, ahead); this.ready = true; }
    const len = 0.02 * sp + 0.2;
    for (let i = 0; i < this.count; i++) {
      const dx = this.pts[i * 3] - cam.x, dy = this.pts[i * 3 + 1] - cam.y, dz = this.pts[i * 3 + 2] - cam.z;
      // passed behind the camera or drifted too far: respawn ahead
      if (dx * ahead.x + dy * ahead.y + dz * ahead.z < 0.5 || dx * dx + dy * dy + dz * dz > 1600) this.spawn(i, cam, ahead);
      const x = this.pts[i * 3], y = this.pts[i * 3 + 1], z = this.pts[i * 3 + 2];
      this.pos.set([x, y, z, x + ahead.x * len, y + ahead.y * len, z + ahead.z * len], i * 6);
      this.alpha[i * 2] = 0; this.alpha[i * 2 + 1] = 0.6 + (i % 5) * 0.08;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

// Soft contact shadow under the board: grounds the rider even outside the shadow map
// and shrinks and fades as they get air.
export class ContactShadow {
  constructor(scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(20,32,60,0.55)'); g.addColorStop(0.5, 'rgba(20,32,60,0.25)'); g.addColorStop(1, 'rgba(20,32,60,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.n = new THREE.Vector3();
  }
  update(course, pos, heading, standing) {
    const gy = course.heightAt(pos.x, pos.z);
    const h = Math.max(0, pos.y - gy);
    const fade = Math.max(0, 1 - h / 5);
    course.normalAt(pos.x, pos.z, this.n);
    this.mesh.position.set(pos.x, gy + 0.03, pos.z);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.n);
    this.mesh.rotateZ(heading);
    const s = 1 + h * 0.15;
    this.mesh.scale.set((standing ? 0.9 : 0.85) * s, (standing ? 0.9 : 2.0) * s, 1);
    this.mesh.material.opacity = fade;
    this.mesh.visible = fade > 0.02;
  }
}
