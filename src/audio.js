// Procedural sound: wind, edge carve, rail grind, landings. No audio files.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); data[i] = b * 3 + (Math.random() * 2 - 1) * 0.15; }
    this.noise = buf;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    const loop = (filterType, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
      return { f, g };
    };
    this.wind = loop('bandpass', 500, 0.7);
    this.carve = loop('highpass', 1800, 0.5);
    this.grind = loop('bandpass', 2600, 6);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 190;
    const of = ctx.createBiquadFilter(); of.type = 'bandpass'; of.frequency.value = 1400; of.Q.value = 3;
    this.grindTone = ctx.createGain(); this.grindTone.gain.value = 0;
    osc.connect(of); of.connect(this.grindTone); this.grindTone.connect(this.master);
    this.grindOsc = osc;
    osc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  update(phys, inp, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = phys.speed;
    const st = phys.state;
    const on = active ? 1 : 0;
    this.wind.g.gain.setTargetAtTime(on * Math.min(0.5, 0.04 + sp * sp * 0.0009) * (st === 'air' ? 1.3 : 1), t, 0.15);
    this.wind.f.frequency.setTargetAtTime(300 + sp * 32, t, 0.2);
    const carve = st === 'ground' ? Math.min(0.55, sp * 0.012 + Math.abs(phys.edge) * sp * 0.012 + phys.skid * 0.35) : 0;
    this.carve.g.gain.setTargetAtTime(on * carve, t, 0.06);
    this.carve.f.frequency.setTargetAtTime(1400 + phys.skid * 1500, t, 0.1);
    // steel rings, plastic hisses, concrete scrapes, bark rumbles
    const kind = st === 'grind' && phys.grind ? phys.grind.rail.kind : null;
    const tone = { rail: [3200, 0.35, 0.16, 210], box: [1500, 0.3, 0.03, 120], ledge: [900, 0.38, 0.05, 90], log: [420, 0.4, 0.0, 60] }[kind] ?? [2600, 0, 0, 190];
    const gr = kind ? tone[1] * Math.min(1, 0.4 + phys.speed * 0.08) : 0;
    this.grind.f.frequency.setTargetAtTime(tone[0] + (phys.speed || 0) * 40, t, 0.05);
    this.grind.g.gain.setTargetAtTime(on * gr, t, 0.03);
    this.grindTone.gain.setTargetAtTime(on * (kind ? tone[2] : 0), t, 0.03);
    this.grindOsc.frequency.setTargetAtTime(tone[3] + (phys.speed || 0) * 6, t, 0.05);
  }

  thud(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.25 + strength * 0.08), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.4);
  }

  chime(good = true) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = good ? [784, 1175] : [330, 247];
    notes.forEach((fq, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.07);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.35);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.4);
    });
  }
}
