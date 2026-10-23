/**
 * Drawing a mechanism smoothly between simulation ticks (mechanisms/tickSmoother.ts; owner,
 * Oct 2026: the deck crane's slew stepped). The simulation ticks at 60 Hz, the Quest draws at
 * 90: drawn straight from the latest tick, the crane moves on two frames of three. Smoothed,
 * it moves the same amount every frame.
 */
import { describe, expect, it } from 'vitest';
import { TickSmoother } from '../../src/mechanisms/tickSmoother';

const RATE = 25; // deg/s: the deck crane's slew
const TICK = 1 / 60;
const FRAME = 1 / 90;

/** Each frame's step in the drawn angle, slewing steadily for `seconds`, drawn raw or smoothed. */
function steps(smooth: boolean, seconds = 2, tick = TICK): number[] {
  const s = new TickSmoother([20]);
  let sim = 0;
  let t = 0;
  let nextTick = tick;
  let last = 0;
  const out: number[] = [];
  for (let f = 0; f < seconds / FRAME; f++) {
    t += FRAME;
    while (t >= nextTick - 1e-9) {
      sim += RATE * tick;
      nextTick += tick;
    }
    const drawn = smooth ? s.update([sim], FRAME)[0] : sim;
    if (f > 30) out.push(drawn - last); // (after it has settled)
    last = drawn;
  }
  return out;
}

describe('drawing between ticks', () => {
  it('raw: a staircase (some frames still, some a whole tick); smoothed: the same step every frame', () => {
    const raw = steps(false);
    expect(Math.min(...raw)).toBe(0);
    const smooth = steps(true);
    const perFrame = RATE * FRAME;
    for (const d of smooth) expect(Math.abs(d - perFrame)).toBeLessThan(perFrame * 0.2);
  });

  it('a crew-mate\'s snapshots, further apart (20 a second), are glided over too', () => {
    const smooth = steps(true, 3, 1 / 20);
    const perFrame = RATE * FRAME;
    const late = smooth.slice(-120);
    expect(Math.min(...late)).toBeGreaterThan(perFrame * 0.4);
  });

  it('it stops where the crane stops; a big jump is drawn at once; reset starts afresh', () => {
    const s = new TickSmoother([20]);
    s.update([0], FRAME);
    s.update([5], FRAME);
    for (let i = 0; i < 30; i++) s.update([5], FRAME);
    expect(s.update([5], FRAME)[0]).toBeCloseTo(5, 4);
    // Settled exactly, so a part at rest isn't redrawn every frame.
    for (let i = 0; i < 60; i++) s.update([5], FRAME);
    expect(s.update([5], FRAME)[0]).toBe(5);
    expect(s.update([90], FRAME)[0]).toBe(90);
    s.reset();
    expect(s.update([-40], FRAME)[0]).toBe(-40);
  });
});
