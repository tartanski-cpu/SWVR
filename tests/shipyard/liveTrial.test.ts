// Live sea trials (owner, Oct 2026): the game's physics run on her as designed, in front of
// you: a drop, a roll decay, and the inclining experiment, each reading off what it shows.
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { useDesign } from '../../src/boats/sims';
import { LiveTrial } from '../../src/shipyard/liveTrial';
import { runMotionTrials } from '../../src/vessel/seaTrials';

const run = (t: LiveTrial) => {
  while (!t.done) t.advance(0.1);
  return t;
};

describe('live sea trials', () => {
  useDesign({ ...DEFAULT_DESIGN });

  it('the drop: she falls in, plunges below her waterline, and comes back to rest', () => {
    const t = run(new LiveTrial('drop'));
    expect(t.samples[0].heaveM).toBeGreaterThan(3.9);
    expect(Math.min(...t.samples.map((s) => s.heaveM))).toBeLessThan(0);
    expect(Math.abs(t.samples[t.samples.length - 1].heaveM)).toBeLessThan(0.05);
    expect(t.result()).toMatch(/Heave period/);
  });

  it('the roll from 45°: she comes back upright, at about her small-angle roll period', () => {
    const t = run(new LiveTrial('roll'));
    expect(t.samples[0].heelDeg).toBeCloseTo(45, 0);
    expect(Math.abs(t.samples[t.samples.length - 1].heelDeg)).toBeLessThan(1);
    const m = /Roll period ([\d.]+) s/.exec(t.result() ?? '');
    expect(m).not.toBeNull();
    // A large roll swings a little slower than a small one; within a second of it.
    expect(Math.abs(Number(m![1]) - runMotionTrials('design').rollPeriod)).toBeLessThan(1);
    // The physics' own readings, as the game's debug overlay shows them.
    expect(t.debug.get(t.v.id)?.stations.length).toBeGreaterThan(5);
  });

  it('the inclining experiment finds her GM near her figure', () => {
    const t = run(new LiveTrial('incline'));
    expect(t.shift).toBe(1);
    const gm = Number(/GM = .* = ([\d.]+) m/.exec(t.result() ?? '')?.[1]);
    const figure = useDesign({ ...DEFAULT_DESIGN }).figures.gmM;
    expect(gm).toBeGreaterThan(figure * 0.75);
    expect(gm).toBeLessThan(figure * 1.35);
  });
});
