// Post-processing: MSAA HDR render -> bloom on real highlights only (sun, ice glints,
// sparks, lenses) -> tone mapping -> light grade (contrast, cool shadows / warm highlights,
// soft vignette) and a short "punch" on clean landings. Off in performance mode.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1.06 },
    uSaturation: { value: 1.06 },
    uVignette: { value: 0.22 },
    uPunch: { value: 0 },
    uShadowTint: { value: new THREE.Vector3(0.97, 1.0, 1.05) },
    uLightTint: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uContrast, uSaturation, uVignette, uPunch; uniform vec3 uShadowTint, uLightTint; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // split toning: shadows a touch cool, highlights a touch warm
      c *= mix(uShadowTint, uLightTint, smoothstep(0.15, 0.85, l));
      // contrast around mid grey, saturation (both lifted briefly by a landing punch)
      c = (c - 0.5) * (uContrast + uPunch * 0.06) + 0.5;
      l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation + uPunch * 0.25);
      // soft vignette, a little stronger during the punch
      vec2 q = vUv - 0.5;
      c *= 1.0 - (uVignette + uPunch * 0.12) * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.55, 1.35);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  let enabled = true, punch = 0;
  return {
    setEnabled(on) { enabled = on; },
    setSize(w, h, ratio) { composer.setPixelRatio(ratio); composer.setSize(w, h); },
    punch(k = 1) { punch = Math.max(punch, k); },
    render(dt) {
      punch = Math.max(0, punch - dt * 2.2);
      grade.uniforms.uPunch.value = punch;
      if (enabled) composer.render(dt);
      else renderer.render(scene, camera);
    },
  };
}
