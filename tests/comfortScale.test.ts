/**
 * The motion coupling slider runs evenly (owner, Oct 2026: "I don't notice any difference
 * between 0 and 90, and when I go to 100 it's locked"): in a steady roll, how far the boat
 * moves past your view falls steadily from all of it at 0 % to none at 100 %, with no step
 * at the top.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MotionDecoupler } from '../src/player/comfort';

/** How far the deck rolls past the view (deg, `rel`) and how far the view rolls (`view`) at their most, after `from` s. */
function ride(c: number, roll: (t: number) => number, from: number, to: number): { rel: number; view: number } {
  const d = new MotionDecoupler();
  d.coupling = c;
  const q = new THREE.Quaternion();
  const out = new THREE.Quaternion();
  const e = new THREE.Euler();
  let rel = 0;
  let view = 0;
  const dt = 1 / 72;
  for (let i = 0; i < 72 * to; i++) {
    const t = i * dt;
    q.setFromEuler(new THREE.Euler(0, 0, roll(t), 'YXZ'));
    d.update(dt, q, 1, out);
    if (t < from) continue;
    e.setFromQuaternion(out, 'YXZ');
    rel = Math.max(rel, Math.abs(e.z));
    e.setFromQuaternion(q.clone().multiply(out), 'YXZ');
    view = Math.max(view, Math.abs(e.z));
  }
  return { rel: (rel * 180) / Math.PI, view: (view * 180) / Math.PI };
}

const DEG = Math.PI / 180;
/** In an 8 deg, 5 s roll: how far the deck rolls past the view (deg), once settled. */
const past = (c: number) => ride(c, (t) => 8 * DEG * Math.sin((2 * Math.PI * t) / 5), 15, 30).rel;
/** A slam: a 4 deg kick over 0.15 s, back over 0.3 s; how much of it the view takes (deg). */
const slam = (c: number) => ride(c, (t) => { const s = t - 5; return s < 0 || s > 0.45 ? 0 : 4 * DEG * (s < 0.15 ? s / 0.15 : 1 - (s - 0.15) / 0.3); }, 4.9, 7).view;

describe('the motion coupling slider', () => {
  it('runs evenly: about (1 - coupling) of the roll moves past you, falling at every step, nothing at 100 %', () => {
    const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(past);
    for (let i = 1; i < steps.length; i++) expect(steps[i], `${i * 10} %`).toBeLessThan(steps[i - 1]);
    for (const [i, s] of steps.entries()) expect(Math.abs(s - 8 * (1 - i / 10)), `${i * 10} %`).toBeLessThan(1.3);
    // No cliff at the top: 90 % is already nearly rigid to the waves.
    expect(steps[9]).toBeLessThan(1.2);
    expect(steps[10]).toBe(0);
  });

  it('high up, a gentle smoothing of bumps (owner): at 90 % a sharp slam is softened by about a third, at 100 % taken whole', () => {
    expect(slam(0.9)).toBeGreaterThan(2.4);
    expect(slam(0.9)).toBeLessThan(3.2);
    expect(slam(0.7)).toBeLessThan(slam(0.9));
    expect(slam(1)).toBeCloseTo(4, 1);
  });
});
