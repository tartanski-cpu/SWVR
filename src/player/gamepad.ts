import { CONFIG } from '../config';

/**
 * A game controller on the desktop (owner request: Xbox controller driving), read through the
 * browser's Gamepad API in its "standard" layout (an Xbox pad, and most others):
 *
 *   buttons  0 A   1 B   2 X   3 Y   4 LB   5 RB   6 LT   7 RT   8 View   9 Menu
 *            10 left stick click   11 right stick click   12-15 d-pad up, down, left, right
 *   axes     0 left stick x (right +)   1 left stick y (down +)   2 right stick x   3 right stick y
 *
 * At the helm (app/App.ts: "F: take the helm", or A): the left stick steers, RB / LB work the
 * throttle up and down, B puts it in neutral, the right stick looks round, A (or F) leaves.
 */
export interface PadState {
  connected: boolean;
  /** Sticks after the dead zone (-1..1; y is + down). */
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  /** Held this frame, and pressed since the last (edges). */
  down: boolean[];
  pressed: boolean[];
}

export const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7 } as const;

/** A stick axis with the dead zone taken out and the rest rescaled to 0..1. */
export function deadZone(v: number, dz: number = CONFIG.gamepad.deadZone): number {
  const a = Math.abs(v);
  return a <= dz ? 0 : (Math.sign(v) * (a - dz)) / (1 - dz);
}

export class GamepadInput {
  readonly state: PadState = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, down: [], pressed: [] };
  private prev: boolean[] = [];

  /** Once a frame: the first connected controller (none: all zero). */
  poll(): PadState {
    const s = this.state;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected) ?? null;
    s.connected = !!pad;
    const down = pad ? pad.buttons.map((b) => b.pressed) : [];
    s.pressed = down.map((d, i) => d && !this.prev[i]);
    s.down = down;
    this.prev = down;
    s.lx = deadZone(pad?.axes[0] ?? 0);
    s.ly = deadZone(pad?.axes[1] ?? 0);
    s.rx = deadZone(pad?.axes[2] ?? 0);
    s.ry = deadZone(pad?.axes[3] ?? 0);
    return s;
  }
}

/**
 * The helm from the left stick: the wheel follows the stick (a gentle curve, so small moves
 * are fine), back amidships when it's let go. Null: leave the helm where it is (the stick
 * centred and not just let go, so the arrow keys and the mouse still work it).
 */
export function padHelm(lx: number, wasSteering: boolean): { helm: number | null; steering: boolean } {
  if (lx !== 0) return { helm: Math.sign(lx) * Math.abs(lx) ** CONFIG.gamepad.steerCurve, steering: true };
  return { helm: wasSteering ? 0 : null, steering: false };
}

/** The throttle's direction from the bumpers: RB up (ahead), LB down (astern). */
export function padLever(s: PadState): number {
  return (s.down[PAD.rb] ? 1 : 0) - (s.down[PAD.lb] ? 1 : 0);
}
