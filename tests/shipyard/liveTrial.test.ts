// Live sea trials (owner, Oct 2026): the game's physics run on her as designed, in front of
// you: a drop, a roll decay, and the inclining experiment, each reading off what it shows.
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { useDesign } from '../../src/boats/sims';
import { LiveTrial, stabilityOf } from '../../src/shipyard/liveTrial';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
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

  it('GZ and GM from the physics\' own buoyancy (owner: the roll and the inclining "should show the GZ and GM")', () => {
    // Held at its steady heel, her righting moment balances the weight's: GZ = w·d / Δ.
    const t = run(new LiveTrial('incline'));
    const def = VESSEL_DEFS.design;
    const heel = t.samples[t.samples.length - 1].heelDeg;
    const st = stabilityOf(t.debug.get(t.v.id)!, def.cg, heel)!;
    expect(st.gzM).toBeGreaterThan(0);
    expect(st.gzM).toBeCloseTo((t.weightKg * t.shiftM) / def.mass, 2);
    // Its metacentre over G by about her GM (GZ / sin φ).
    const gm = st.gzM / Math.sin((Math.abs(heel) * Math.PI) / 180);
    expect(st.m![1] - def.cg[1]).toBeCloseTo(gm, 0);
    // Heeled 45° and let go: still righting (the starting workboat's deck edge is under by
    // then, so less than at 25°), B out to her low side.
    const r = new LiveTrial('roll');
    r.advance(1 / 60);
    const big = stabilityOf(r.debug.get(r.v.id)!, def.cg, r.samples[r.samples.length - 1].heelDeg)!;
    expect(big.gzM).toBeGreaterThan(0.05);
    expect(big.b[0]).toBeGreaterThan(def.cg[0] + 0.3);
  });
});
