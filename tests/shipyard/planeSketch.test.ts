// Sketching on her views (owner, Oct 2026): one sheet of glass per square-on view, beside her,
// strokes kept in hull fractions so they stay on her when she's stretched.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cleanNote } from '../../src/shipyard/notes';
import { fromPlane, isPlaneSheet, PLANE_GAP, planeAt, planeFacing, planeSheet, toPlane } from '../../src/shipyard/planeSketch';

const min = [-1.5, -0.5, -4.5];
const max = [1.5, 3, 4.5];

describe('sketch planes', () => {
  it('stand just clear of her on the side each view looks from', () => {
    expect(planeAt('side', min, max)).toBeCloseTo(1.5 + PLANE_GAP);
    expect(planeAt('port', min, max)).toBeCloseTo(-1.5 - PLANE_GAP);
    expect(planeAt('plan', min, max)).toBeCloseTo(3 + PLANE_GAP);
    expect(planeAt('bow', min, max)).toBeCloseTo(-4.5 - PLANE_GAP);
    expect(planeAt('stern', min, max)).toBeCloseTo(4.5 + PLANE_GAP);
  });

  it('keep a point as hull fractions across the view, and put it back on the glass', () => {
    const uv = toPlane('side', [2.1, 1.25, 0], min, max);
    expect(uv).toEqual([0.5, 0.5]);
    expect(fromPlane('side', uv, min, max)).toEqual([1.5 + PLANE_GAP, 1.25, 0]);
    // Stretched to twice her length, the stroke goes with her.
    expect(fromPlane('side', [0.25, 0.5], [-1.5, -0.5, -9], [1.5, 3, 9])[2]).toBeCloseTo(-4.5);
  });

  it('show only for the view being looked at square on', () => {
    expect(planeFacing(new THREE.Vector3(-1, 0, 0))).toBe('side'); // from starboard
    expect(planeFacing(new THREE.Vector3(1, 0, 0))).toBe('port'); // from port
    expect(planeFacing(new THREE.Vector3(0, -1, 0.01))).toBe('plan');
    expect(planeFacing(new THREE.Vector3(0, 0, 1))).toBe('bow'); // from ahead, looking aft
    expect(planeFacing(new THREE.Vector3(0, 0, -1))).toBe('stern');
    expect(planeFacing(new THREE.Vector3(-1, -0.6, -1))).toBeNull(); // a three-quarter view
  });

  it("a plane's strokes may run beyond her; a sheet's stay on the sheet", () => {
    expect(isPlaneSheet(planeSheet('bow'))).toBe(true);
    expect(isPlaneSheet(planeSheet('port'))).toBe(true);
    expect(isPlaneSheet('n-123')).toBe(false);
    const ink = { id: 'a', kind: 'ink', by: 'Amy', colour: '#d9622b', t: 1, pts: [[0.2, 1.8], [-0.7, 0.4]] };
    expect(cleanNote({ ...ink, sheet: '@side' })).not.toBeNull();
    expect(cleanNote({ ...ink, sheet: 'sheet-1' })).toBeNull();
  });
});
