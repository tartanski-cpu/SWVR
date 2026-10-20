/**
 * Each tow is drawn as its own model only (owner, Oct 2026: on the ship-towing mission the
 * coaster was drawn inside a barge: the barge's branch caught every look it didn't name).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTowModel } from '../src/tow/towLook';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

/** How many vertices of a model carry a colour (its merged meshes' vertex colours). */
function verticesOf(model: THREE.Object3D, hex: number): number {
  const c = new THREE.Color(hex);
  let n = 0;
  model.traverse((o) => {
    const col = (o as THREE.Mesh).geometry?.getAttribute?.('color');
    if (!col) return;
    for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - c.r) < 0.002 && Math.abs(col.getY(i) - c.g) < 0.002 && Math.abs(col.getZ(i) - c.b) < 0.002) n++;
  });
  return n;
}

describe('the tow models', () => {
  it('the coaster has no barge drawn round her', () => {
    const barge = 0x8a3a24; // the barge's rust-red hull
    expect(verticesOf(buildTowModel(VESSEL_DEFS.barge), barge)).toBeGreaterThan(0);
    expect(verticesOf(buildTowModel(VESSEL_DEFS.coaster), barge)).toBe(0);
  });
});
