/**
 * The handheld VHF on your shoulder in VR (player/radioHandset.ts): you can't see it there, so
 * (owner, Oct 2026) the grab reach is generous and a free hand coming within it gets a tick in
 * the controller, once each time it arrives.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { HandFrame } from '../src/controls/InteractionSystem';
import { RadioHandset } from '../src/player/radioHandset';

const hand = (x: number, y: number, z: number, grip = false): HandFrame => ({
  tracked: true,
  grip: new THREE.Vector3(x, y, z),
  ray: new THREE.Ray(),
  gripDown: grip,
  gripPressed: grip,
  triggerDown: false,
  triggerPressed: false,
});

describe('the handheld VHF on your shoulder', () => {
  it('a tick as a free hand reaches it (once, again after it leaves); grabbed at the new reach', () => {
    const r = new RadioHandset();
    const scene = new THREE.Scene();
    const head = new THREE.Vector3(0, 1.6, 0);
    const q = new THREE.Quaternion();
    const [sx, sy, sz] = CONFIG.radio.shoulder;
    const radio = new THREE.Vector3(sx, 1.6 + sy, sz);
    const pulses: [string, number, number][] = [];
    const pulse = (h: string, i: number, ms: number) => void pulses.push([h, i, ms]);
    const far = hand(0.4, 1.0, -0.3);
    const free = { left: false, right: false };
    const step = (left: HandFrame) => r.updateXR(scene, { left, right: far }, free, head, q, pulse as never);
    step(hand(radio.x + 0.5, radio.y, radio.z));
    expect(pulses).toHaveLength(0);
    // Within the reach, 15 cm off (outside the old 10 cm): one tick, not repeated.
    const near = hand(radio.x + 0.15, radio.y, radio.z);
    step(near);
    step(near);
    expect(pulses).toEqual([['left', ...CONFIG.radio.nearPulse]]);
    // Away and back: another.
    step(hand(radio.x + 0.5, radio.y, radio.z));
    step(near);
    expect(pulses).toHaveLength(2);
    // Grip there: it's in your hand.
    step(hand(radio.x + 0.15, radio.y, radio.z, true));
    expect(r.held).toBe('left');
  });

  it('a hand already holding something gets no tick and can not take it', () => {
    const r = new RadioHandset();
    const [sx, sy, sz] = CONFIG.radio.shoulder;
    const pulses: unknown[] = [];
    r.updateXR(new THREE.Scene(), { left: hand(sx, 1.6 + sy, sz, true), right: hand(1, 1, 1) }, { left: true, right: false }, new THREE.Vector3(0, 1.6, 0), new THREE.Quaternion(), (() => void pulses.push(1)) as never);
    expect(pulses).toHaveLength(0);
    expect(r.held).toBeNull();
  });
});
