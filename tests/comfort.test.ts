import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { MotionDecoupler } from '../src/player/comfort';

const DT = 1 / 90;
const D = Math.PI / 180;
const deckQ = (rollDeg: number, pitchDeg = 0, yawDeg = 30) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchDeg * D, yawDeg * D, rollDeg * D, 'YXZ'));

/** The player's world tilt (roll, deg) = deck orientation * carrier correction. */
function playerRoll(deck: THREE.Quaternion, c: THREE.Quaternion): number {
  const e = new THREE.Euler().setFromQuaternion(deck.clone().multiply(c), 'YXZ');
  return e.z / D;
}

/** Run a 3.5 s roll of +-15 deg and 1 m heave; return the max player roll and heave seen. */
function waves(coupling: number) {
  const dec = new MotionDecoupler();
  dec.coupling = coupling;
  const out = new THREE.Quaternion();
  let maxRoll = 0;
  let maxHeave = 0;
  let maxOffset = 0;
  for (let i = 0; i < 90 * 30; i++) {
    const t = i * DT;
    const roll = 15 * Math.sin((2 * Math.PI * t) / 3.5);
    const feet = 1.0 * Math.sin((2 * Math.PI * t) / 4.0);
    const deck = deckQ(roll);
    const off = dec.update(DT, deck, feet, out);
    if (t > 10) {
      maxRoll = Math.max(maxRoll, Math.abs(playerRoll(deck, out)));
      maxHeave = Math.max(maxHeave, Math.abs(feet + off));
      maxOffset = Math.max(maxOffset, Math.abs(off));
    }
  }
  return { maxRoll, maxHeave, maxOffset };
}

describe('motion decoupling (comfort)', () => {
  it('100 % coupling is rigid: no correction, no offset', () => {
    const w = waves(1);
    expect(w.maxRoll).toBeCloseTo(15, 0);
    expect(w.maxHeave).toBeCloseTo(1, 1);
    expect(w.maxOffset).toBe(0);
  });

  it('0 % keeps the horizon level and soaks up heave within the soft limit', () => {
    const w = waves(0);
    expect(w.maxRoll).toBeLessThan(1);
    expect(w.maxOffset).toBeLessThanOrEqual(CONFIG.comfort.maxHeaveOffset + 1e-9);
    expect(w.maxHeave).toBeLessThan(0.75);
  });

  it('50 % attenuates wave-frequency motion by more than half', () => {
    const w = waves(0.5);
    expect(w.maxRoll).toBeLessThan(7.5);
    expect(w.maxRoll).toBeGreaterThan(1);
  });

  it('a steady heel is followed (scaled by coupling), heading is never touched', () => {
    const dec = new MotionDecoupler();
    dec.coupling = 0.5;
    const out = new THREE.Quaternion();
    const deck = deckQ(10, 0, 75);
    for (let i = 0; i < 90 * 20; i++) dec.update(DT, deck, 0, out);
    expect(playerRoll(deck, out)).toBeCloseTo(5, 1);
    const e = new THREE.Euler().setFromQuaternion(deck.clone().multiply(out), 'YXZ');
    expect(e.y / D).toBeCloseTo(75, 3);
  });
});
