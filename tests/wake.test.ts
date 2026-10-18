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

const internals = (w: WakeTrail) => w as unknown as { order: number[]; stripStart: Uint8Array; mesh: THREE.Mesh; jet: Float32Array };
/** The workboat's propeller and length; no planing. */
const BOAT = { propD: 1.0, length: 12 };
/** The jet and planing values of the last point laid. */
const lastJet = (w: WakeTrail) => {
  const it = internals(w);
  const v = it.order[it.order.length - 1] * 9;
  return { jet: it.jet[v * 2], planing: it.jet[v * 2 + 1] };
};

describe('wake trail', () => {
  it('lays a point every ~1.2 m under way and draws quads between them', () => {
    const w = new WakeTrail({}, 5.8, BOAT);
    run(w, 4, 20000, 6); // 24 m
    const n = internals(w).order.length;
    expect(n).toBeGreaterThan(17);
    expect(n).toBeLessThan(23);
    // 8 quads across per segment, 6 indices each.
    expect(w.mesh.geometry.drawRange.count).toBe((n - 1) * 8 * 6);
  });

  it('stopped with no thrust nothing is laid; under way it is', () => {
    const w = new WakeTrail({}, 5.8, BOAT);
    run(w, 0, 0, 5);
    expect(internals(w).order.length).toBe(0);
    run(w, 4, 0, 3, 5);
    expect(internals(w).order.length).toBeGreaterThan(5);
  });

  it('the prop churning at rest still lays foam (by time), and a teleport breaks the strip', () => {
    const w = new WakeTrail({}, 5.8, BOAT);
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

  it("the prop's jet: fast through the water at rest at full thrust (momentum theory), slower under way, forward going astern", () => {
    const rest = new WakeTrail({}, 5.8, BOAT);
    run(rest, 0, 40000, 2);
    const u0 = lastJet(rest).jet;
    // u = sqrt(2T / (rho A)), A = pi/4 for a 1 m propeller: about 7.9 m/s.
    expect(u0).toBeCloseTo(Math.sqrt((2 * 40000) / (1025 * (Math.PI / 4))), 1);
    const underWay = new WakeTrail({}, 5.8, BOAT);
    run(underWay, 5, 40000, 2);
    expect(lastJet(underWay).jet).toBeGreaterThan(0);
    expect(lastJet(underWay).jet).toBeLessThan(u0 * 0.7);
    const astern = new WakeTrail({}, 5.8, BOAT);
    run(astern, 0, -20000, 2);
    expect(lastJet(astern).jet).toBeLessThan(0);
    expect(lastJet(rest).planing).toBe(0);
  });

  it('a planing hull flat out: planing, her wash full whatever the thrust', () => {
    const w = new WakeTrail({}, 5.8, { propD: 0.6, length: 9, planing: { fnStart: 0.3, fnFull: 0.7 } });
    run(w, 10, 0, 2); // Fn 1.06
    const it = internals(w);
    const v = it.order[it.order.length - 1] * 9;
    expect(lastJet(w).planing).toBe(1);
    const params = (w as unknown as { params: Float32Array }).params;
    expect(params[v * 3 + 1]).toBeCloseTo(0.85, 6); // the wash
  });
});
