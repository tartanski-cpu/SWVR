/**
 * A load on the deck crane's hook is drawn smoothly between the simulation's ticks, as the
 * crane draws its own hook (cargo/cargoView.ts; owner, Oct 2026: "the crane is now smooth, but
 * when you lift cargo from the side, it jerks"). At 60 ticks a second drawn at the Quest's 90
 * frames, a load drawn straight from the ticks stands still one frame in three.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { useDesign } from '../src/boats/sims';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { craneStateOf, cranesOf } from '../src/cargo/craneHook';
import { CargoView } from '../src/cargo/cargoView';

describe('a load on the crane hook, drawn', () => {
  it('moves every frame while the crane slews, not in steps with the ticks', () => {
    useDesign({ ...DEFAULT_DESIGN, deckCrane: 1 });
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    const path = cranesOf(v)[0].path;
    const s = craneStateOf(v, path)!;
    s.luff = 20;
    for (const id of Object.keys(world.cargo)) delete world.cargo[id]; // (only ours drawn)
    world.cargo.c1 = { id: 'c1', kind: 0, mass: 50, from: 'calder', to: 'brannock', at: { hook: v.id, crane: path } };
    s.hooked = 'c1';
    const view = new CargoView();
    // Her root at the origin: her axes are the world's.
    const roots = new Map<string, THREE.Object3D>([[v.id, new THREE.Group()]]);
    const boxes = (view as unknown as { boxes: THREE.InstancedMesh }).boxes;
    const m = new THREE.Matrix4();
    const at = new THREE.Vector3();
    const prev = new THREE.Vector3();
    const steps: number[] = [];
    let ticks = 0;
    for (let f = 0; f < 180; f++) {
      // The simulation's ticks (60 a second) as they fall between the frames (90 a second).
      const due = Math.floor(((f + 1) / 90) * 60);
      for (; ticks < due; ticks++) s.slew += 0.5;
      view.update(world, roots, () => null, null, undefined, 1 / 90);
      boxes.getMatrixAt(0, m);
      at.setFromMatrixPosition(m);
      if (f > 60) steps.push(at.distanceTo(prev)); // (settled: a second in)
      prev.copy(at);
    }
    const least = Math.min(...steps);
    const most = Math.max(...steps);
    expect(least).toBeGreaterThan(0);
    // Even: no frame stands still while the next leaps (drawn straight from the ticks: 0 and 2x).
    expect(least / most).toBeGreaterThan(0.6);
  });
});
