/**
 * The helm's camera views with a controller (owner, Oct 2026): orbit (round her, with the
 * stick, zooming) and flyby (a static camera she passes, re-placed ahead once she's by).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { HelmCamera } from '../src/player/helmCamera';

const DT = 1 / 60;
const boat = (x: number, z: number, headingDeg: number, speed = 0) => {
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-headingDeg * Math.PI) / 180);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
  return { pos: new THREE.Vector3(x, 0, z), quat, length: 12, vel: fwd.multiplyScalar(speed) };
};
const run = (hc: HelmCamera, b: ReturnType<typeof boat>, s: number, stick = { x: 0, y: 0 }) => {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let on = false;
  for (let t = 0; t < s; t += DT) on = hc.update(DT, stick, b, p, q);
  return { on, p, q, look: new THREE.Vector3(0, 0, -1).applyQuaternion(q) };
};

describe('the helm camera', () => {
  it('cycles inside, orbit, flyby; inside gives no pose', () => {
    const hc = new HelmCamera();
    expect(hc.view).toBe('inside');
    expect(run(hc, boat(0, 0, 0), 0.1).on).toBe(false);
    expect(hc.cycle()).toBe('orbit');
    expect(hc.cycle()).toBe('flyby');
    expect(hc.cycle()).toBe('inside');
  });

  it('orbit: astern of her, a couple of lengths off, looking at her; it turns with her heading; the stick swings it; the triggers zoom', () => {
    const hc = new HelmCamera();
    hc.cycle();
    const o = CONFIG.helmCamera.orbit;
    const north = run(hc, boat(0, 0, 0), 2);
    const dist = Math.max(o.minDist, o.lengths * 12);
    expect(north.p.z).toBeGreaterThan(0); // astern of a boat heading north (-z) is +z
    expect(Math.abs(north.p.x)).toBeLessThan(0.5);
    expect(north.p.length()).toBeCloseTo(dist, 0);
    expect(north.look.z).toBeLessThan(-0.5); // looking forward at her
    // The same boat heading east: the camera swings round to her west side, astern again.
    const east = run(hc, boat(0, 0, 90), 2);
    expect(east.p.x).toBeLessThan(-dist * 0.8);
    // The stick swings it round.
    const swung = run(hc, boat(0, 0, 0), 1, { x: 1, y: 0 });
    expect(Math.abs(swung.p.x)).toBeGreaterThan(3);
    // Zoom in halves the distance (held long enough), out brings it back within its limits.
    for (let t = 0; t < 3; t += DT) hc.zoomBy(1, DT);
    const near = run(hc, boat(0, 0, 0), 2);
    expect(near.p.length()).toBeLessThan(dist * 0.6);
    expect(hc.zoom).toBeGreaterThanOrEqual(o.zoomMin);
  });

  it('flyby: a static spot ahead and to one side; she passes it, then a new spot ahead, the other side', () => {
    const hc = new HelmCamera();
    hc.cycle();
    hc.cycle();
    const f = CONFIG.helmCamera.flyby;
    const b = boat(0, 0, 0, 5); // heading north at 5 m/s
    const first = run(hc, b, 0.5);
    expect(first.p.y).toBeCloseTo(f.height, 3);
    expect(-first.p.z).toBeCloseTo(f.ahead, 0);
    expect(Math.abs(first.p.x)).toBeCloseTo(f.offset, 0);
    const side = Math.sign(first.p.x);
    // She moves up past it: the camera stays put and turns to watch her.
    b.pos.set(0, 0, -f.ahead);
    const beside = run(hc, b, 0.5);
    expect(beside.p.equals(first.p)).toBe(true);
    expect(Math.sign(beside.look.x)).toBe(-side); // looking across at her
    // Well past it: a new spot ahead of her, on her other side.
    b.pos.set(0, 0, -f.ahead - f.behind - 5);
    const next = run(hc, b, 0.5);
    expect(-next.p.z).toBeCloseTo(f.ahead + f.ahead + f.behind + 5, 0);
    expect(Math.sign(next.p.x)).toBe(-side);
    // Zoom narrows the lens, within its limit.
    for (let t = 0; t < 5; t += DT) hc.zoomBy(1, DT);
    expect(hc.fovScale).toBeCloseTo(f.fovMin, 3);
  });
});
