// Touch controls for phones and tablets, shown during a run on touch screens:
// - left half: a floating thumb stick (appears where the thumb lands). Sideways = carve,
//   or spin in the air (analog: a little = slow, all the way = full speed); up = tuck /
//   front flip, down = brake / backflip; diagonals in the air give corks, mistys, rodeos.
// - right: POP (hold to load, release to jump), a grab pad (press it and slide toward the
//   grab you want, the name shows on the pad), TAIL / NOSE (butters, presses, rolls).
// - top: pause.
// Everything feeds the same input state as the keyboard (Input.touch).
import { grabName } from './tricks.js';

const DEAD = 0.16; // stick dead zone (fraction of its radius)
const FLIP = 0.55; // how far up/down the stick must go for tuck/flip/brake
// grab pad directions (screen angle, 0 = right, counter-clockwise) -> grab key
const PAD = [
  ['mute', 0], ['japan', 45], ['nose', 90], ['method', 135],
  ['melon', 180], ['stalefish', 225], ['tail', 270], ['indy', 315],
];

export const isTouchDevice = () => (typeof window !== 'undefined') && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0);

export class TouchControls {
  constructor(input, { onPause, gear = () => 'board' } = {}) {
    this.input = input;
    this.gear = gear;
    input.touch = { steer: 0, up: false, down: false, jump: false, jumpReleased: false, nose: false, tail: false, grab: null };
    const el = document.createElement('div');
    el.className = 'touch';
    el.hidden = true;
    el.innerHTML = `
      <div class="t-stickzone" aria-label="Steuern und Drehen"><div class="t-stick"><i class="t-knob"></i></div></div>
      <button class="t-btn t-pop" aria-label="Pop: halten zum Laden, loslassen zum Springen"><b>POP</b></button>
      <button class="t-btn t-grab" aria-label="Grab: drücken und in Richtung des Grabs ziehen"><b>GRAB</b><small></small></button>
      <button class="t-btn t-small t-tail" aria-label="Tail Press oder Roll"><b>TAIL</b></button>
      <button class="t-btn t-small t-nose" aria-label="Nose Press oder Roll"><b>NOSE</b></button>
      <button class="t-pause" aria-label="Pause">II</button>`;
    document.body.appendChild(el);
    this.el = el;
    const $ = (s) => el.querySelector(s);
    this.zone = $('.t-stickzone'); this.stick = $('.t-stick'); this.knob = $('.t-knob');
    this.grabLabel = $('.t-grab small');

    // ---- stick: follows the thumb wherever it lands in the left half
    let stickId = null, cx = 0, cy = 0;
    const R = () => this.stick.offsetWidth / 2 || 70;
    const moveStick = (x, y) => {
      const r = R();
      let dx = (x - cx) / r, dy = (y - cy) / r;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.knob.style.transform = `translate(${dx * r}px, ${dy * r}px)`;
      const ax = Math.abs(dx) < DEAD ? 0 : Math.sign(dx) * (Math.abs(dx) - DEAD) / (1 - DEAD);
      const t = input.touch;
      t.steer = -ax; // stick right = steer right (Input: left is +1)
      t.up = dy < -FLIP; t.down = dy > FLIP;
    };
    const resetStick = () => {
      stickId = null;
      Object.assign(input.touch, { steer: 0, up: false, down: false });
      this.knob.style.transform = '';
      this.stick.classList.remove('on');
      this.stick.style.left = ''; this.stick.style.top = '';
    };
    this.zone.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return;
      stickId = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      const box = this.zone.getBoundingClientRect();
      cx = e.clientX; cy = e.clientY;
      this.stick.style.left = `${cx - box.left}px`; this.stick.style.top = `${cy - box.top}px`;
      this.stick.classList.add('on');
      moveStick(e.clientX, e.clientY);
      e.preventDefault();
    });
    this.zone.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e.clientX, e.clientY); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) this.zone.addEventListener(ev, (e) => { if (e.pointerId === stickId) resetStick(); });

    // ---- hold buttons (multi-touch: each tracks its own pointer)
    const hold = (btn, down, up) => {
      let id = null;
      btn.addEventListener('pointerdown', (e) => { if (id !== null) return; id = e.pointerId; btn.setPointerCapture(id); btn.classList.add('on'); down(e); e.preventDefault(); });
      const end = (e) => { if (e.pointerId !== id) return; id = null; btn.classList.remove('on'); up(e); };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, end);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      return (e) => e.pointerId === id;
    };
    hold($('.t-pop'), () => { input.touch.jump = true; }, () => { input.touch.jump = false; input.touch.jumpReleased = true; });
    hold($('.t-tail'), () => { input.touch.tail = true; }, () => { input.touch.tail = false; });
    hold($('.t-nose'), () => { input.touch.nose = true; }, () => { input.touch.nose = false; });

    // ---- grab pad: press = the default grab, slide toward another one to switch
    const grabBtn = $('.t-grab');
    let gx = 0, gy = 0;
    const pick = (x, y) => {
      const dx = x - gx, dy = gy - y;
      let key = 'indy';
      if (Math.hypot(dx, dy) > grabBtn.offsetWidth * 0.22) {
        const ang = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        key = PAD.reduce((best, [k, a]) => { const d = Math.min(Math.abs(ang - a), 360 - Math.abs(ang - a)); return d < best[1] ? [k, d] : best; }, ['indy', 999])[0];
      }
      input.touch.grab = key;
      this.grabLabel.textContent = grabName(key, this.gear());
    };
    const isGrab = hold(grabBtn, (e) => { const b = grabBtn.getBoundingClientRect(); gx = b.left + b.width / 2; gy = b.top + b.height / 2; pick(e.clientX, e.clientY); },
      () => { input.touch.grab = null; this.grabLabel.textContent = ''; });
    grabBtn.addEventListener('pointermove', (e) => { if (isGrab(e)) pick(e.clientX, e.clientY); });

    $('.t-pause').addEventListener('click', () => onPause?.());
  }

  setVisible(on) {
    this.el.hidden = !on;
    if (!on) {
      Object.assign(this.input.touch, { steer: 0, up: false, down: false, jump: false, jumpReleased: false, nose: false, tail: false, grab: null });
      this.el.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
      this.knob.style.transform = '';
    }
  }
}
