/**
 * The 750 kW diesel (owner, Oct 2026: "the 24-metre trawler is going to need a bigger engine
 * ... let's go for a 750 kilowatt engine based on the straight six"): the stern trawler's as
 * she comes; on her shaft under her deck; faster than the 450 kW tug diesel and a far harder
 * pull, its gearbox matched to reach its rated revs.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { buildDesign, DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, SHAFT_ONLY_ENGINES, type ShipDesign } from '../../src/shipyard/design';
import { matchGear } from '../../src/shipyard/trial';
import { runSeaTrials } from '../../src/vessel/seaTrials';

afterAll(() => useDesign(DEFAULT_DESIGN));

const TRAWLER = 5;
const BIG = 4;
const trawler = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[TRAWLER].defaults, hull: TRAWLER, ...more });

describe('the 750 kW diesel', () => {
  it('a slow-revving straight six on a shaft, the stern trawler’s as she comes, fitting under her deck', () => {
    expect(ENGINES[BIG].kw).toBe(750);
    expect(ENGINES[BIG].ratedRpm).toBe(1000);
    expect(SHAFT_ONLY_ENGINES).toContain(BIG);
    expect(trawler().engine).toBe(BIG);
    const b = useDesign(trawler());
    expect(b.figures.engineShortM).toBe(0);
    expect(b.figures.propellerM).toBeGreaterThan(1.5);
  });

  it('on the trawler: faster than the tug diesel, and a much harder pull, at its rated revs', () => {
    const trial = (engine: number) => {
      const m = matchGear(trawler({ engine }));
      useDesign(trawler({ engine, gear: m.gear }));
      return runSeaTrials('design');
    };
    const tug = trial(3);
    const big = trial(BIG);
    expect(big.topSpeedKn).toBeGreaterThan(tug.topSpeedKn + 0.8);
    expect(big.bollard.aheadKN).toBeGreaterThan(1.5 * tug.bollard.aheadKN);
    expect(big.speedTable[3].rpm).toBeGreaterThan(0.9 * ENGINES[BIG].ratedRpm);
  }, 120000);

  it('twin 750s in the small landing craft build (no crash), told she is too heavy or the engines don’t fit', () => {
    const b = useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0, engine: BIG, twin: 1 });
    expect(b.figures.engineShortM).toBeGreaterThan(0);
    expect(b.warnings.join(' ')).toMatch(/doesn.t fit|too heavy/);
  });

  it('the small tug refuses twin 750s (too much power for her: CONFIG.shipyard.maxKwPerTonne) and takes one; twin tug diesels still go in', () => {
    const tug = (engine: number, twin: number) => buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4, engine, twin });
    const twin750 = tug(BIG, 1);
    expect(twin750.warnings.join(' ')).toMatch(/too much for her.*She has one/);
    expect(twin750.figures.massT).toBeCloseTo(tug(BIG, 0).figures.massT, 3);
    expect(tug(BIG, 0).warnings.join(' ')).not.toMatch(/too much/);
    const twin450 = tug(3, 1);
    expect(twin450.warnings.join(' ')).not.toMatch(/too much/);
    expect(twin450.figures.massT).toBeGreaterThan(tug(3, 0).figures.massT + 2);
  });
});
