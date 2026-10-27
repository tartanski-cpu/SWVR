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

type Inside = { streams: { order: number[] }[]; stripStart: Uint8Array; mesh: THREE.Mesh; jet: Float32Array; perp: Float32Array; center: Float32Array; params: Float32Array };
/** The trail's insides; `order` her transom's ribbon's points. */
const internals = (w: WakeTrail) => {
  const it = w as unknown as Inside;
  return { ...it, order: it.streams[0].order };
};
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
    expect(it.params[v * 4 + 1]).toBeCloseTo(0.85, 6); // the wash
  });

  it("azimuth drives: each lays its own wash from its propeller, carried the opposite way to its push", () => {
    // Twin drives 2 m either side, legs 5 m aft; the port drive pushing to starboard (90 deg),
    // the starboard one astern (180 deg), both engines in gear at the same revs.
    const drives = { x: [-2, 2], legZ: 5, propY: -2, fwd: 0.4 };
    const w = new WakeTrail({}, 5.8, { propD: 2, length: 25, drives });
    const s = createVesselState('v', 'workboat');
    s.engine.azimuth = Math.PI / 2;
    s.engine.gear = 1;
    s.engine.rpm = 1000;
    s.engine.stbd = { ...s.engine, stbd: undefined, azimuth: Math.PI };
    s.thrust = 50000;
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    for (let t = 0; t < 2; t += 1 / 30) w.update(s, root, [], t);
    const it = w as unknown as Inside;
    // The transom keeps the Kelvin arms only: at rest, no foam there.
    expect(it.streams[0].order.length).toBe(0);
    // The way each drive's foam is carried, (-perp.z, perp.x) x jet, and where it starts.
    const carried = (i: number) => {
      const v = it.streams[i + 1].order.at(-1)! * 9;
      const j = it.jet[v * 2];
      return { x: -it.perp[v * 2 + 1] * j, z: it.perp[v * 2] * j, at: [it.center[v * 2], it.center[v * 2 + 1]], wash: it.params[v * 4 + 1] };
    };
    const port = carried(0);
    const stbd = carried(1);
    // Port drive pushing to starboard (+x): its wash goes to port (-x), from its propeller
    // 0.4 m to starboard of its leg. Each throws half her thrust (2 x the mean, shared evenly).
    expect(port.x).toBeLessThan(-5);
    expect(Math.abs(port.z)).toBeLessThan(1e-6);
    expect(port.at[0]).toBeCloseTo(-1.6, 5);
    expect(port.at[1]).toBeCloseTo(5, 5);
    expect(port.wash).toBeCloseTo(Math.min(1, 50000 / 25000), 5);
    // Starboard drive pushing astern (+z): its wash runs forward (-z), from 0.4 m aft of its leg.
    expect(stbd.z).toBeLessThan(-5);
    expect(Math.abs(stbd.x)).toBeLessThan(1e-6);
    expect(stbd.at[0]).toBeCloseTo(2, 5);
    expect(stbd.at[1]).toBeCloseTo(5.4, 5);
    // A drive out of gear throws none.
    s.engine.stbd.gear = 0;
    const w2 = new WakeTrail({}, 5.8, { propD: 2, length: 25, drives });
    for (let t = 0; t < 2; t += 1 / 30) w2.update(s, root, [], t);
    const it2 = w2 as unknown as Inside;
    expect(it2.streams[2].order.length).toBe(0);
    expect(it2.streams[1].order.length).toBeGreaterThan(3);
  });
});
