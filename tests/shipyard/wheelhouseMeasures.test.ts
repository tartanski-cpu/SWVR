/**
 * The Wheelhouse step's clean-up (owner, Oct 2026): designs travel as documents now, so the
 * wheelhouse's measurements are real values (metres, degrees, fractions) on fine sliders
 * (design.ts MEASURES), not a few steps squeezed into a typed code. A design on the old steps
 * still gets a short code; any other travels as a link or file. Designs saved before (a
 * version 1 document, a version 2 project) held the code's steps and are read as such.
 */
import { describe, expect, it } from 'vitest';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, fromSteps, MEASURE_KEYS, MEASURES, SCALES, toSteps, type ShipDesign } from '../../src/shipyard/design';
import { designFromFields, designToken, docToken, isDocToken, readDesign, readDoc, shortCode } from '../../src/shipyard/designDoc';
import { cleanDoc } from '../../src/shipyard/variants';

const WB: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[2].defaults, hull: 2 };

describe('the wheelhouse’s measurements as values', () => {
  it('hold metres and degrees: the starting design’s are its old steps’ values', () => {
    expect(DEFAULT_DESIGN.houseLength).toBeCloseTo(SCALES.houseLength(2), 9);
    expect(DEFAULT_DESIGN.headroom).toBeCloseTo(2.2, 9);
    expect(DEFAULT_DESIGN.windowRake).toBe(0);
    for (const k of MEASURE_KEYS) {
      expect(DEFAULT_DESIGN[k], k).toBeGreaterThanOrEqual(MEASURES[k].min - 1e-9);
      expect(DEFAULT_DESIGN[k], k).toBeLessThanOrEqual(MEASURES[k].max + 1e-9);
    }
  });

  it('a design on the old steps keeps her short code; one between them travels as a link, value and all', () => {
    expect(shortCode(WB)).not.toBeNull();
    const fine = { ...WB, houseLength: 3.15, windowRake: 12, roofThickness: 0.14 };
    expect(toSteps(fine)).toBeNull();
    expect(shortCode(fine)).toBeNull();
    const token = designToken(fine);
    expect(isDocToken(token)).toBe(true);
    expect(readDesign(token)).toMatchObject({ design: fine, warnings: [] });
  });

  it('builds what it says: a 3.15 m wheelhouse is 3.15 m long', () => {
    const wh = buildDesign({ ...WB, houseLength: 3.15 }).hull.layout.wheelhouse!;
    expect(wh.aft - wh.front).toBeCloseTo(3.15, 2);
  });

  it('a document’s value off its range is brought onto it, and said; one in range stays as it is', () => {
    const r = designFromFields({ houseLength: 9, headroom: 2.17 });
    expect(r.design.houseLength).toBe(MEASURES.houseLength.max);
    expect(r.design.headroom).toBe(2.17);
    expect(r.warnings.join(' ')).toMatch(/houseLength.*off its range/);
    // The saloon's floor goes down in whole stairs.
    expect(designFromFields({ saloonFloor: 0.33 }).design.saloonFloor).toBeCloseTo(0.4, 9);
  });

  it('designs saved before (a version 1 document, a version 2 project) are read in the code’s steps', () => {
    const v1 = readDoc({ format: 'swvr.design', v: 1, design: { houseLength: 5, floor: 4 } });
    expect('design' in v1 && v1.design.houseLength).toBeCloseTo(SCALES.houseLength(5), 9);
    expect('design' in v1 && v1.design.floor).toBeCloseTo(0.2, 9);
    const project = cleanDoc({ v: 2, variants: [{ id: 'main', name: 'Main', design: { ...toSteps(WB)!, houseLength: 6 }, notes: [] }] })!;
    expect(project.v).toBe(3);
    expect(project.variants[0].design.houseLength).toBeCloseTo(SCALES.houseLength(6), 9);
    expect(project.variants[0].design.housePos).toBeCloseTo(WB.housePos, 9);
    // Today's, as values.
    expect(readDesign(docToken(WB))).toMatchObject({ design: WB });
    expect(fromSteps(toSteps(WB)!)).toEqual(WB);
  });
});
