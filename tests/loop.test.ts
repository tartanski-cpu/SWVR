import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';

describe('FixedStepLoop', () => {
  it('runs one tick per 1/60 s and carries the remainder', () => {
    const loop = new FixedStepLoop(60, 5);
    expect(loop.advance(1 / 60).ticks).toBe(1);
    const r = loop.advance(1 / 120);
    expect(r.ticks).toBe(0);
    expect(r.alpha).toBeCloseTo(0.5, 6);
    expect(loop.advance(1 / 120).ticks).toBe(1);
  });

  it('produces the right tick count at 90 Hz render rate', () => {
    const loop = new FixedStepLoop(60, 5);
    let ticks = 0;
    for (let i = 0; i < 90 * 10; i++) ticks += loop.advance(1 / 90).ticks;
    expect(ticks).toBeGreaterThanOrEqual(599);
    expect(ticks).toBeLessThanOrEqual(600);
  });

  it('drops the backlog after a stall instead of spiralling', () => {
    const loop = new FixedStepLoop(60, 5);
    expect(loop.advance(2).ticks).toBe(5);
    expect(loop.advance(0).ticks).toBe(0);
  });

  it('keeps alpha in [0, 1]', () => {
    const loop = new FixedStepLoop(60, 5);
    for (let i = 0; i < 1000; i++) {
      const { alpha } = loop.advance(Math.random() / 30);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });
});
