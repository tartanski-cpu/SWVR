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

  /** Keys lent to something else for now (a keyboard-steered crane's buttons): their actions don't fire. */
  private claimed = new Set<string>();

  /** True while any key bound to the action is held. */
  action(name: KeyAction): boolean {
    return KEYS[name].codes.some((c) => this.down.has(c) && !this.claimed.has(c));
  }

  /** True only on the frame a key bound to the action went down. */
  actionPressed(name: KeyAction): boolean {
    return KEYS[name].codes.some((c) => this.pressed.has(c) && !this.claimed.has(c));
  }

  /** Lend these keys to something else (until the next claim): their usual actions don't fire. */
  claim(codes: Iterable<string>): void {
    this.claimed = new Set(codes);
  }

  /** True only on the frame this physical key went down (for whoever has claimed it). */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** True while this physical key is held (for whoever has claimed it). */
  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /**
   * A key pressed or let go by something else (a game controller's button, player/gamepad.ts):
   * as if typed, so every action bound to it works the same.
   */
  inject(code: string, down: boolean): void {
    if (down && !this.down.has(code)) {
      this.pressed.add(code);
      this.down.add(code);
    } else if (!down) this.down.delete(code);
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
