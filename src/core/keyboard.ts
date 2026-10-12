import { KEYS, type KeyAction } from './keybindings';

/**
 * Polled keyboard state keyed by `KeyboardEvent.code` (physical key position).
 * Prefer the action-based helpers (`action`, `actionPressed`) so bindings stay in
 * keybindings.ts. Call `endFrame()` once per rendered frame after all consumers have read it.
 */
export class Keyboard {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // Stop F1 (browser help) and F3 (find) from triggering browser actions.
      if (e.code === 'F1' || e.code === 'F3') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    // Releasing focus must not leave keys stuck down.
    target.addEventListener('blur', () => this.down.clear());
  }

  /** True while any key bound to the action is held. */
  action(name: KeyAction): boolean {
    return KEYS[name].codes.some((c) => this.down.has(c));
  }

  /** True only on the frame a key bound to the action went down. */
  actionPressed(name: KeyAction): boolean {
    return KEYS[name].codes.some((c) => this.pressed.has(c));
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
