// Keyboard input with per-frame edge detection, merged with the touch controls (touch.js
// writes into Input.touch; the stick gives an analog steer).
const GRAB_KEYS = { KeyJ: 'indy', KeyK: 'mute', KeyL: 'melon', KeyU: 'nose', KeyI: 'stalefish', KeyO: 'tail', KeyB: 'method', KeyN: 'japan' };
const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.grabOrder = [];
    this.touch = null;
    target.addEventListener('keydown', (e) => {
      if (BLOCK.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (GRAB_KEYS[e.code]) this.grabOrder.push(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
      this.grabOrder = this.grabOrder.filter((c) => c !== e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.grabOrder = []; });
  }

  has(...codes) { return codes.some((c) => this.down.has(c)); }
  wasPressed(...codes) { return codes.some((c) => this.pressed.has(c)); }

  // Snapshot for this frame; call endFrame() afterwards to clear edges.
  // The air keys are cork7's: A/D spin, W/S flip, ← / → roll, ↑ over the top.
  state() {
    const left = this.has('KeyA'), right = this.has('KeyD');
    const g = this.grabOrder[this.grabOrder.length - 1];
    const t = this.touch;
    return {
      steer: (left ? 1 : 0) - (right ? 1 : 0) || (t ? t.steer : 0),
      up: this.has('KeyW') || !!t?.up,
      down: this.has('KeyS') || !!t?.down,
      jumpHeld: this.has('Space') || !!t?.jump,
      jumpReleased: this.released.has('Space') || !!t?.jumpReleased,
      // Q / E: tail / nose press (butters on snow, presses on rails)
      nose: this.has('KeyE') || !!t?.nose,
      tail: this.has('KeyQ') || !!t?.tail,
      // ← / →: roll in the air (touch: TAIL / NOSE)
      roll: (this.has('ArrowLeft') ? 1 : 0) - (this.has('ArrowRight') ? 1 : 0) || (t ? (t.tail ? 1 : 0) - (t.nose ? 1 : 0) : 0),
      // ↑: with a spin and a flip off the lip, the feet go over the head (rodeo, misty)
      over: this.has('ArrowUp') || !!t?.over,
      grab: g ? GRAB_KEYS[g] : t?.grab ?? null,
    };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    if (this.touch) this.touch.jumpReleased = false;
  }
}

export const IDLE_INPUT = { steer: 0, up: false, down: false, jumpHeld: false, jumpReleased: false, nose: false, tail: false, roll: 0, over: false, grab: null };
