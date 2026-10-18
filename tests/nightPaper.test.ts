// The chart, the whiteboard and the duty board at night (owner, Oct 2026: they were very
// bright at night): dimmed with the light on them, and red with the wheelhouse at night.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { paperColour } from '../src/render/nightPaper';

describe('paper at night', () => {
  it('is full white by day', () => {
    const c = paperColour({ ambient: 1, darkness: 0, cabin: 0 });
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);
  });

  it('is dim and red at night, the lamps never making it glare', () => {
    const dark = paperColour({ ambient: 0.06, darkness: 1, cabin: 0 });
    expect(dark.r).toBeLessThan(0.1);
    for (const l of [{ cabin: 2, lamp: true }, { cabin: 1, lamp: true }, { cabin: 0, lamp: true }]) {
      const c = paperColour({ ambient: 0.06, darkness: 1, ...l });
      expect(c.r).toBeLessThanOrEqual(CONFIG.nightPaper.nightMax + 1e-9);
      expect(c.r).toBeGreaterThan(dark.r);
    }
    // Under the red light the whites go red; a white cabin light keeps them nearly white.
    const red = paperColour({ ambient: 0.06, darkness: 1, cabin: 2, lamp: true });
    expect(red.g / red.r).toBeLessThan(0.4);
    const white = paperColour({ ambient: 0.06, darkness: 1, cabin: 1 });
    expect(white.g / white.r).toBeGreaterThan(0.8);
  });

  it('dims gradually through the dusk', () => {
    const at = (darkness: number, ambient: number) => paperColour({ ambient, darkness, cabin: 0 }).r;
    expect(at(0.3, 0.65)).toBeGreaterThan(at(0.6, 0.3));
    expect(at(0.6, 0.3)).toBeGreaterThan(at(1, 0.06));
  });
});
