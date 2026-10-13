export interface Controls {
  steer: number; // -1 left .. 1 right
  throttle: number;
  brake: number;
  nitro: boolean;
  punchL: boolean; // edge-triggered, cleared by consume()
  punchR: boolean;
}

const keys = new Set<string>();
const touch = { left: false, right: false, gas: false, brake: false, nitro: false };
const pending = { punchL: false, punchR: false };

const isPunchL = (c: string) => c === 'KeyZ' || c === 'KeyQ';
const isPunchR = (c: string) => c === 'KeyX' || c === 'KeyE';

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (isPunchL(e.code)) pending.punchL = true;
    if (isPunchR(e.code)) pending.punchR = true;
  }
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export function readControls(): Controls {
  const left = keys.has('ArrowLeft') || keys.has('KeyA') || touch.left;
  const right = keys.has('ArrowRight') || keys.has('KeyD') || touch.right;
  const c: Controls = {
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    throttle: keys.has('ArrowUp') || keys.has('KeyW') || touch.gas ? 1 : 0,
    brake: keys.has('ArrowDown') || keys.has('KeyS') || touch.brake ? 1 : 0,
    nitro: keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.nitro,
    punchL: pending.punchL,
    punchR: pending.punchR,
  };
  pending.punchL = false;
  pending.punchR = false;
  return c;
}

export function anyKey(): boolean {
  return keys.size > 0;
}

/** Wire an on-screen button to a touch flag. */
export function bindTouch(el: HTMLElement, name: 'left' | 'right' | 'gas' | 'brake' | 'nitro' | 'punchL' | 'punchR'): void {
  const down = (e: Event) => {
    e.preventDefault();
    if (name === 'punchL') pending.punchL = true;
    else if (name === 'punchR') pending.punchR = true;
    else touch[name] = true;
    el.classList.add('down');
  };
  const up = (e: Event) => {
    e.preventDefault();
    if (name !== 'punchL' && name !== 'punchR') touch[name] = false;
    el.classList.remove('down');
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}
