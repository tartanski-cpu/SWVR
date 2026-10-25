/**
 * The Shipyard's findings from the review of 24 Oct 2026 (docs/REVIEW_2026-10-24.md), fixed at the
 * owner's word: a boat that would capsize is said so plainly (and the page keeps her out of the
 * game); a tow winch with no tow point is said so; a catamaran's roll trial reads.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { trialCharts } from '../../src/shipyard/trialCharts';
import { runSeaTrials } from '../../src/vessel/seaTrials';

afterAll(() => useDesign(DEFAULT_DESIGN));
const typeOf = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });

describe('review fixes', () => {
  it('a slim, deep boat that would capsize is told so plainly, first; a tender one only that she is tender', () => {
    const b = buildDesign(typeOf(3, { beam: 0, depth: 15 }));
    expect(b.figures.gmM).toBeLessThan(CONFIG.shipyard.minGM);
    expect(b.warnings[0]).toMatch(/^She would capsize/);
    expect(b.warnings.join(' ')).not.toMatch(/stability is low/);
    const ok = buildDesign(typeOf(3));
    expect(ok.figures.gmM).toBeGreaterThan(CONFIG.shipyard.minGM);
    expect(ok.warnings.join(' ')).not.toMatch(/capsize/);
  });

  it('a tow winch with no stern roller is told it has no tow point; with the roller, nothing said', () => {
    expect(buildDesign(typeOf(3, { towWinch: 1, sternRoller: 0 })).warnings.join(' ')).toMatch(/no tow point/);
    expect(buildDesign(typeOf(3, { towWinch: 1, sternRoller: 1 })).warnings.join(' ')).not.toMatch(/no tow point/);
  });

  it('the catamaran’s roll trial gives a damping, and its chart draws no NaN', () => {
    useDesign(typeOf(6));
    const t = runSeaTrials('design');
    expect(Number.isFinite(t.motions.rollDampingRatio)).toBe(true);
    expect(trialCharts(t, 12.5, { speedKn: 0, rangeNm: 0 })).not.toMatch(/NaN/);
  }, 120000);
});
