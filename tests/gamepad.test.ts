/**
 * Driving with a game controller at the helm (owner, Oct 2026): the left stick steers (the
 * wheel follows it, amidships when let go), the bumpers work the throttle, with a dead zone.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Keyboard } from '../src/core/keyboard';
import { KEYS } from '../src/core/keybindings';
import { deadZone, GamepadInput, PAD, PAD_KEYS, PAD_KEYS_AT_HELM, PAD_MOUSE, padHelm, padLever, type PadState } from '../src/player/gamepad';

const pad = (down: number[] = []): PadState => {
  const d: boolean[] = [];
  for (const i of down) d[i] = true;
  return { connected: true, lx: 0, ly: 0, rx: 0, ry: 0, down: d, pressed: [], released: [] };
};

describe('a game controller at the helm', () => {
  it('the dead zone: a resting stick reads nothing; past it, the rest of the travel rescaled to full', () => {
    expect(deadZone(0.1)).toBe(0);
    expect(deadZone(-CONFIG.gamepad.deadZone)).toBe(0);
    expect(deadZone(1)).toBeCloseTo(1, 9);
    expect(deadZone(-1)).toBeCloseTo(-1, 9);
    expect(deadZone(0.5)).toBeGreaterThan(0);
  });

  it('the left stick steers: the wheel follows it, gentle near the middle; let go, amidships once, then the keys have it', () => {
    let s = padHelm(1, false);
    expect(s).toEqual({ helm: 1, steering: true });
    s = padHelm(-0.5, s.steering);
    expect(s.helm!).toBeLessThan(0);
    expect(Math.abs(s.helm!)).toBeLessThan(0.5); // the curve: small moves, small helm
    s = padHelm(0, s.steering);
    expect(s).toEqual({ helm: 0, steering: false }); // let go: amidships
    s = padHelm(0, s.steering);
    expect(s.helm).toBeNull(); // left alone after that
  });

  it('the bumpers work the throttle: RB ahead, LB astern, both nothing', () => {
    expect(padLever(pad([PAD.rb]))).toBe(1);
    expect(padLever(pad([PAD.lb]))).toBe(-1);
    expect(padLever(pad([PAD.lb, PAD.rb]))).toBe(0);
    expect(padLever(pad())).toBe(0);
  });

  it('no controller (or no Gamepad API): nothing connected, all zero', () => {
    const s = new GamepadInput().poll();
    expect(s.connected).toBe(false);
    expect([s.lx, s.ly, s.rx, s.ry]).toEqual([0, 0, 0, 0]);
  });

  it("off the helm its buttons are the keys: each one bound to an action; pressed once, held, let go", () => {
    const bound = new Set(Object.values(KEYS).flatMap((k) => k.codes as readonly string[]));
    for (const code of [...Object.values(PAD_KEYS), ...Object.values(PAD_KEYS_AT_HELM)]) expect(bound.has(code!), code).toBe(true);
    // At the helm the throttle bumpers and the switch buttons don't press keys or the mouse there.
    for (const b of [PAD.lb, PAD.rb, PAD.b, PAD.y, PAD.ls, PAD.rs, PAD.up, PAD.down, PAD.left, PAD.right]) expect(PAD_KEYS_AT_HELM[b]).toBeUndefined();
    expect(PAD_MOUSE[PAD.rt]).toBe(0);
    expect(PAD_MOUSE[PAD.rs]).toBe(1); // the laser, as the right stick's click in VR
    expect(PAD_KEYS_AT_HELM[PAD.x]).toBeUndefined(); // the fire pump, at the helm
    const k = new Keyboard(new EventTarget() as unknown as Window);
    k.inject(PAD_KEYS[PAD.a]!, true);
    expect(k.actionPressed('jump')).toBe(true);
    k.endFrame();
    expect(k.actionPressed('jump')).toBe(false);
    expect(k.action('jump')).toBe(true); // held
    k.inject(PAD_KEYS[PAD.a]!, true);
    expect(k.actionPressed('jump')).toBe(false); // still the same press
    k.inject(PAD_KEYS[PAD.a]!, false);
    expect(k.action('jump')).toBe(false);
  });
});
