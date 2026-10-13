import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WakeTrail } from '../src/vessel/view/wakeTrail';
import { createVesselState } from '../src/vessel/vesselState';

/** A boat root moving north (-Z) at `speed`, sampled every `dt`. */
function run(trail: WakeTrail, speed: number, thrust: number, seconds: number, start = 0, root = new THREE.Object3D()) {
  const s = createVesselState('v', 'workboat');
  s.linearVelocity = [0, 0, -speed];
  s.thrust = thrust;
  const dt = 1 / 30;
  let t = start;
  for (; t < start + seconds; t += dt) {
    root.position.z -= speed * dt;
    root.updateMatrixWorld(true);
    trail.update(s, root, [], t);
  }
  return { t, root, s };
}

const internals = (w: WakeTrail) => w as unknown as { order: number[]; stripStart: Uint8Array; mesh: THREE.Mesh };

describe('wake trail', () => {
  it('lays a point every ~1.2 m under way and draws quads between them', () => {
    const w = new WakeTrail({}, 5.8);
    run(w, 4, 20000, 6); // 24 m
    const n = internals(w).order.length;
    expect(n).toBeGreaterThan(17);
    expect(n).toBeLessThan(23);
    // 8 quads across per segment, 6 indices each.
    expect(w.mesh.geometry.drawRange.count).toBe((n - 1) * 8 * 6);
  });

  it('stopped with no thrust nothing is laid; under way it is', () => {
    const w = new WakeTrail({}, 5.8);
    run(w, 0, 0, 5);
    expect(internals(w).order.length).toBe(0);
    run(w, 4, 0, 3, 5);
    expect(internals(w).order.length).toBeGreaterThan(5);
  });

  it('the prop churning at rest still lays foam (by time), and a teleport breaks the strip', () => {
    const w = new WakeTrail({}, 5.8);
    const { t, root } = run(w, 0, 20000, 3);
    expect(internals(w).order.length).toBeGreaterThan(5);
    const before = internals(w).order.length;
    root.position.set(500, 0, 500);
    run(w, 4, 20000, 2, t, root);
    const it = internals(w);
    const first = it.order[before];
    expect(it.stripStart[first]).toBe(1); // not joined across the jump
    // Segments: every consecutive pair except the one into the break.
    expect(w.mesh.geometry.drawRange.count).toBe((it.order.length - 2) * 8 * 6);
  });
});
