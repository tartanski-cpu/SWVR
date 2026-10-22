/**
 * The motion coupling slider runs evenly (owner, Oct 2026: "I don't notice any difference
 * between 0 and 90, and when I go to 100 it's locked"): in a steady roll, how far the boat
 * moves past your view falls steadily from all of it at 0 % to none at 100 %, with no step
 * at the top.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MotionDecoupler } from '../src/player/comfort';

/** In an 8 deg, 5 s roll: how far the deck rolls past the view (deg), once settled. */
function past(c: number): number {
  const d = new MotionDecoupler();
  d.coupling = c;
  const q = new THREE.Quaternion();
  const out = new THREE.Quaternion();
  const e = new THREE.Euler();
  let max = 0;
  const dt = 1 / 72;
  for (let i = 0; i < 72 * 30; i++) {
    const t = i * dt;
    q.setFromEuler(new THREE.Euler(0, 0, ((8 * Math.PI) / 180) * Math.sin((2 * Math.PI * t) / 5), 'YXZ'));
    d.update(dt, q, 1, out);
    if (t < 15) continue;
    e.setFromQuaternion(out, 'YXZ');
    max = Math.max(max, Math.abs(e.z));
  }
  return (max * 180) / Math.PI;
}

describe('the motion coupling slider', () => {
  it('runs evenly: about (1 - coupling) of the roll moves past you, falling at every step, nothing at 100 %', () => {
    const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(past);
    for (let i = 1; i < steps.length; i++) expect(steps[i], `${i * 10} %`).toBeLessThan(steps[i - 1]);
    for (const [i, s] of steps.entries()) expect(Math.abs(s - 8 * (1 - i / 10)), `${i * 10} %`).toBeLessThan(1.3);
    // No cliff at the top: 90 % is already nearly rigid.
    expect(steps[9]).toBeLessThan(1);
    expect(steps[10]).toBe(0);
  });
});
