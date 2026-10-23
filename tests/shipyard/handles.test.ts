/**
 * Handles on the 3D view (owner, Oct 2026: drag her shape instead of sliders): handles.ts.
 */
import { describe, expect, it } from 'vitest';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
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
});
