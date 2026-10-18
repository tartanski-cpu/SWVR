/**
 * Driving with a game controller at the helm (owner, Oct 2026): the left stick steers (the
 * wheel follows it, amidships when let go), the bumpers work the throttle, with a dead zone.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { deadZone, GamepadInput, PAD, padHelm, padLever, type PadState } from '../src/player/gamepad';

const pad = (down: number[] = []): PadState => {
  const d: boolean[] = [];
  for (const i of down) d[i] = true;
  return { connected: true, lx: 0, ly: 0, rx: 0, ry: 0, down: d, pressed: [] };
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
});
