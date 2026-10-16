import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { VESSEL_DEFS, isWorkboat } from '../src/vessel/vesselDef';
import { Searchlight } from '../src/vessel/view/searchlight';

/** The beam's direction in the world: from the lamp to its target. */
function beam(roll: number, pitch: number, yaw: number, lit = true): THREE.Vector3 {
  const { world, vesselId } = createWorld(new IdFactory());
  const v = world.vessels[vesselId];
  const def = VESSEL_DEFS[v.defId];
  if (!isWorkboat(def)) throw new Error('workboat expected');
  v.controls.spotlight = lit ? 1 : 0;
  v.controls.spotPan = 35;
  v.controls.spotTilt = -6;
  const boat = new THREE.Group();
  boat.rotation.set(pitch, yaw, roll, 'YXZ');
  const light = new Searchlight(def.spotlight);
  boat.add(light.root);
  boat.updateMatrixWorld(true);
  light.update(v.controls.spotlight > 0, v.controls.spotPan, v.controls.spotTilt, 1);
  boat.updateMatrixWorld(true);
  const a = light.light.getWorldPosition(new THREE.Vector3());
  return light.light.target.getWorldPosition(new THREE.Vector3()).sub(a).normalize();
}

describe('searchlight beam', () => {
  it('is stabilised: rolled or pitched, the beam points where it does level; turned, it turns with her', () => {
    const level = beam(0, 0, 0);
    expect(beam(0.26, 0, 0).angleTo(level)).toBeLessThan(0.01); // 15 deg roll
    expect(beam(0, 0.14, 0).angleTo(level)).toBeLessThan(0.01); // 8 deg pitch
    expect(beam(0.2, -0.1, 0).angleTo(level)).toBeLessThan(0.01);
    // A change of heading turns the beam with her.
    const turned = beam(0, 0, 0.5);
    expect(turned.angleTo(level)).toBeGreaterThan(0.45);
  });

  it('switched off, it is not stabilised (no need): it rolls with the boat', () => {
    expect(beam(0.26, 0, 0, false).angleTo(beam(0, 0, 0, false))).toBeGreaterThan(0.05);
  });
});
