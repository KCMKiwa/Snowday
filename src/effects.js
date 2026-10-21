// Particle snow spray, ambient snowfall and board tracks in the snow.
import * as THREE from 'three';

export class SnowSpray {
  constructor(scene, max = 1400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.1, d) * vA; gl_FragColor = vec4(vec3(0.97,0.98,1.0), a); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.mat = mat;
    scene.add(this.points);
  }

  emit(p, baseVel, count, spread = 1.5, size = 0.18, life = 0.9) {
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
    }
  }

  update(dt, pixelScale) {
    this.mat.uniforms.uScale.value = pixelScale;
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
      this.alpha[i] = t * 0.85;
      this.size[i] *= 1 + dt * 0.9;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

export class Snowfall {
  constructor(scene, count = 2600) {
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
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uScale: { value: 400 } };
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
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; gl_FragColor = vec4(1.0,1.0,1.0, smoothstep(0.5,0.0,d)*vA*0.9); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(dt, camPos, pixelScale) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uCam.value.copy(camPos);
    this.uniforms.uScale.value = pixelScale;
  }
}

// Board tracks: independent quads in a ring buffer, so gaps in the air come for free.
export class Tracks {
  constructor(scene, max = 700) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.alpha = new Float32Array(max * 4);
    const idx = [];
    for (let i = 0; i < max; i++) { const a = i * 4; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: `attribute float aAlpha; varying float vA;
        #include <fog_pars_vertex>
        void main(){ vA = aAlpha; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `varying float vA;
        #include <fog_pars_fragment>
        void main(){ gl_FragColor = vec4(0.55,0.64,0.78, vA*0.32);
        #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.next = 0;
    this.last = null;
    this.lastL = new THREE.Vector3(); this.lastR = new THREE.Vector3();
  }

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
    if (this.last && this.last.distanceTo(p) < 0.45) return;
    if (this.last && this.last.distanceTo(p) < 2.5) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const k = i * 12;
      this.pos.set([this.lastL.x, this.lastL.y, this.lastL.z, this.lastR.x, this.lastR.y, this.lastR.z, l.x, l.y, l.z, r.x, r.y, r.z], k);
      this.alpha.fill(strength, i * 4, i * 4 + 4);
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
    }
    this.last = (this.last || new THREE.Vector3()).copy(p);
    this.lastL.copy(l); this.lastR.copy(r);
  }

  breakLine() { this.last = null; }
}
