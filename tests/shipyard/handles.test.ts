/**
 * Handles on the 3D view (owner, Oct 2026: drag her shape instead of sliders): handles.ts.
 */
import { describe, expect, it } from 'vitest';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { ALL_FIELDS, DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';

const stepsOf = (k: keyof ShipDesign) => ALL_FIELDS.find((f) => f.key === k)!.steps;
import { alongAxis, HANDLES, nearestStep, type V3 } from '../../src/shipyard/handles';

const netter: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[1].defaults, hull: 1 };

describe('handles', () => {
  it('reads how far along its line the pointer is, from a ray at any angle', () => {
    // The line along -z through the origin; a ray coming down at z = -3 from above and to the side.
    expect(alongAxis([0, 0, 0], [0, 0, -1], [5, 5, -3], [-1, -1, 0])).toBeCloseTo(3, 6);
    // Looking straight along the line: nothing to read.
    expect(alongAxis([0, 0, 0], [0, 0, -1], [0, 0, 5], [0, 0, -1])).toBeNull();
  });

  it('snaps to the nearest step worked out, and says when the pointer is past the end', () => {
    const anchors: (V3 | undefined)[] = [[0, 0, 0], [0, 0, -0.5], undefined, [0, 0, -1.5]];
    expect(nearestStep(anchors, [0, 0, 0], [0, 0, -1], 0.6)).toEqual({ step: 1, atLimit: false });
    expect(nearestStep(anchors, [0, 0, 0], [0, 0, -1], 1.2)!.step).toBe(3);
    const all: V3[] = [[0, 0, 0], [0, 0, -0.5], [0, 0, -1]];
    expect(nearestStep(all, [0, 0, 0], [0, 0, -1], 3)).toEqual({ step: 2, atLimit: true });
  });

  it('her length handle sits at her stem head and goes forward as she lengthens', () => {
    const len = HANDLES.find((h) => h.key === 'length')!;
    const a = len.anchor(buildDesign({ ...netter, length: 4 }));
    const b = len.anchor(buildDesign({ ...netter, length: 12 }));
    expect(b[2]).toBeLessThan(a[2] - 0.5);
    expect(a[0]).toBe(0);
    const from = len.dimension!.from(buildDesign({ ...netter, length: 12 }));
    expect(b[2] - from[2]).toBeCloseTo(-buildDesign({ ...netter, length: 12 }).figures.lengthM, 0);
  });

  it('the bow rake handle, where her stem meets her waterline, goes aft as she is raked (her stem head stays)', () => {
    const bow = HANDLES.find((h) => h.key === 'bow')!;
    const len = HANDLES.find((h) => h.key === 'length')!;
    const plumb = buildDesign({ ...netter, bow: 0 });
    const raked = buildDesign({ ...netter, bow: 4 });
    expect(bow.anchor(raked)[2]).toBeGreaterThan(bow.anchor(plumb)[2] + 0.5);
    expect(len.anchor(raked)[2]).toBeCloseTo(len.anchor(plumb)[2], 1);
  });

  it('every Hull step handle moves its own way along its line, from its lowest step to its highest, on every type it shows for', () => {
    const along = (p: V3, axis: V3) => p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2];
    for (const [hull, t] of DESIGN_HULLS.entries()) {
      if (t.retired) continue;
      // (Not a one-off, the harbour tug: her hull is fixed, the page shows her no handles.)
      if (t.fixed) continue;
      const base: ShipDesign = { ...DEFAULT_DESIGN, ...t.defaults, hull, fcLength: t.raisedForedeck ? 4 : 0 };
      for (const h of HANDLES.filter((x) => x.step === 'hull')) {
        if (h.applies && !h.applies(base)) continue;
        const lo = h.key === 'fcLength' ? 1 : 0;
        const hi = stepsOf(h.key) - 1;
        const a = h.anchor(buildDesign({ ...base, [h.key]: lo }));
        const b = h.anchor(buildDesign({ ...base, [h.key]: hi }));
        expect(along(b, h.axis), `${t.name.split(':')[0]}: ${h.label}`).toBeGreaterThan(along(a, h.axis) + 0.05);
      }
    }
  }, 120000);

  it('the bow rake handle is left off where her bow has no rake to choose, and the foredeck height without a raised foredeck', () => {
    const bow = HANDLES.find((h) => h.key === 'bow')!;
    const fcH = HANDLES.find((h) => h.key === 'fcHeight')!;
    for (const [hull, t] of DESIGN_HULLS.entries()) {
      const d: ShipDesign = { ...DEFAULT_DESIGN, ...t.defaults, hull };
      expect(bow.applies!(d)).toBe(!t.pushBow && !t.landingBow);
      expect(fcH.applies!({ ...d, fcLength: 0 })).toBe(false);
    }
  });
});
