/**
 * Driving the harbour tug from the desktop's keys and a game controller (player/aziHelm.ts;
 * owner, 27 Oct 2026): the keys work a drive at the levers' rates, power stops at idle, the
 * turn clicks into its notches and on through them; a stick points and pushes; the glance.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { AZI_HELM_CODES, glanceYaw, pointAndPush, stepDriveKeys } from '../src/player/aziHelm';

describe('the azimuth helm, desktop and controller', () => {
  it('keys: W more power at the levers\' rate, S less, never below idle (astern is twisting the drive round)', () => {
    let s = { turn: 0, angle: 0, power: 0 };
    for (let i = 0; i < 60; i++) s = stepDriveKeys(s.turn, s.power, { power: 1, twist: 0 }, 1 / 60);
    expect(s.power).toBeCloseTo(0.5, 2);
    for (let i = 0; i < 180; i++) s = stepDriveKeys(s.turn, s.power, { power: -1, twist: 0 }, 1 / 60);
    expect(s.power).toBe(0);
  });

  it('keys: D twists it to starboard at 90° a second, clicking into 3 o\'clock and on through; round to astern', () => {
    let s = { turn: 0, angle: 0, power: 0 };
    const seen = new Set<number>();
    for (let i = 0; i < 120; i++) {
      s = stepDriveKeys(s.turn, s.power, { power: 0, twist: 1 }, 1 / 60);
      seen.add(Math.round(s.angle));
    }
    expect(seen.has(90)).toBe(true);
    expect(Math.abs(s.angle)).toBe(180);
    // A to port from ahead: negative.
    const a = stepDriveKeys(0, 0, { power: 0, twist: -1 }, 0.5);
    expect(a.angle).toBeCloseTo(-45, 0);
  });

  it('a stick points and pushes: up ahead, right to starboard, back astern; how far is the power; let go is null', () => {
    expect(pointAndPush(0, -1)).toEqual({ angle: 0, power: 1 });
    expect(pointAndPush(0.5, 0)?.angle).toBe(90);
    expect(pointAndPush(0.5, 0)?.power).toBeCloseTo(0.5);
    expect(Math.abs(pointAndPush(0, 0.8)!.angle)).toBe(180);
    // Just off ahead: the notch holds it ahead.
    expect(pointAndPush(0.05, -1)!.angle).toBe(0);
    expect(pointAndPush(0.7, -0.7)!.angle).toBeCloseTo(45, 0);
    expect(pointAndPush(0, 0)).toBeNull();
  });

  it('the glance: Q over the port shoulder, E over the starboard, both or Tab aft', () => {
    const g = (CONFIG.aziHelm.glanceDeg * Math.PI) / 180;
    expect(glanceYaw(false, false, false)).toBe(0);
    expect(glanceYaw(true, false, false)).toBeCloseTo(g);
    expect(glanceYaw(false, true, false)).toBeCloseTo(-g);
    expect(glanceYaw(true, true, false)).toBeCloseTo(Math.PI);
    expect(glanceYaw(false, false, true)).toBeCloseTo(Math.PI);
    // Its keys, taken from their usual jobs at that helm.
    for (const k of ['KeyW', 'ArrowUp', 'KeyX', 'KeyT', 'KeyQ', 'KeyE', 'Tab']) expect(AZI_HELM_CODES).toContain(k);
  });
});
