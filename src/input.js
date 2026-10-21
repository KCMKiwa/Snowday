// Keyboard input with per-frame edge detection.
const GRAB_KEYS = { KeyJ: 'indy', KeyK: 'mute', KeyL: 'melon', KeyU: 'nose', KeyI: 'stalefish', KeyO: 'tail' };
const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.grabOrder = [];
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
  state() {
    const left = this.has('KeyA', 'ArrowLeft'), right = this.has('KeyD', 'ArrowRight');
    const g = this.grabOrder[this.grabOrder.length - 1];
    return {
      steer: (left ? 1 : 0) - (right ? 1 : 0),
      up: this.has('KeyW', 'ArrowUp'),
      down: this.has('KeyS', 'ArrowDown'),
      jumpHeld: this.has('Space'),
      jumpReleased: this.released.has('Space'),
      grab: g ? GRAB_KEYS[g] : null,
    };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}

export const IDLE_INPUT = { steer: 0, up: false, down: false, jumpHeld: false, jumpReleased: false, grab: null };
