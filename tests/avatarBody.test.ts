import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { WorldState } from '../src/core/world';
import { OUTFITS, decodeLook } from '../src/net/avatarOutfits';

// The name tag draws on a canvas; in the test there's no DOM, so give it one that draws nothing.
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
const { AvatarsView } = await import('../src/net/avatarView');

type Fig = { root: THREE.Group; head: THREE.Group; torso: THREE.Mesh; upper: THREE.Mesh[]; fore: THREE.Mesh[]; left: THREE.Mesh; right: THREE.Mesh };

/** A crew-mate posed as given, settled; returns their figure. */
function figure(avatar: object, look = 7): Fig {
  const view = new AvatarsView(new THREE.Scene());
  const world = { players: { player2: { id: 'player2', name: 'Crew', aboardVesselId: null, position: [5, 0, 5], yaw: 0, look, avatar } } } as unknown as WorldState;
  for (let i = 0; i < 300; i++) view.update(world, 'player1', new Map(), 1 / 60);
  return (view as unknown as { avatars: Map<string, Fig> }).avatars.get('player2')!;
}

/** The far end of a segment hanging down -y from its origin, through its pose. */
function end(m: THREE.Mesh, length: number): THREE.Vector3 {
  m.updateMatrix();
  return new THREE.Vector3(0, -length, 0).applyMatrix4(m.matrix);
}

describe('avatars', () => {
  it('the torso hangs from the head: no gap, however far the head is off the feet', () => {
    // Head 25 cm to one side and 10 cm ahead of the feet (leaning, or a drifting pose).
    const a = figure({ head: [5.25, 1.6, 4.9, 0, 0, 0, 1], left: null, right: null });
    const neck = a.head.position.clone().setY(a.head.position.y - CONFIG.avatar.neckDrop);
    expect(a.torso.position.distanceTo(neck)).toBeLessThan(0.01);
    // It leans back toward the feet: the waist is nearer the feet column than the neck.
    const waist = end(a.torso, CONFIG.avatar.torsoLength);
    expect(Math.hypot(waist.x, waist.z)).toBeLessThan(Math.hypot(neck.x, neck.z));
  });

  it('arms: fixed-length upper arm to the elbow, the forearm on to the hand; untracked hands hang', () => {
    const c = CONFIG.avatar;
    // Right hand reaching forward and in, within reach; left not tracked.
    const a = figure({ head: [5, 1.65, 5, 0, 0, 0, 1], left: null, right: [5.15, 1.25, 4.6] });
    const elbow = end(a.upper[1], c.upperArm);
    expect(elbow.distanceTo(a.fore[1].position)).toBeLessThan(0.005); // joined at the elbow
    expect(end(a.fore[1], c.forearm).distanceTo(a.right.position)).toBeLessThan(0.005); // reaches the hand
    expect(a.fore[1].scale.y).toBeCloseTo(1, 2); // in reach: no stretch
    expect(elbow.y).toBeLessThan(a.upper[1].position.y); // the elbow bends below the shoulder
    // The untracked left hand hangs below its shoulder, at the end of a straight-ish arm.
    expect(a.left.position.y).toBeLessThan(a.upper[0].position.y - 0.45);
  });

  it('a desktop hand metres away: the arm reaches out and the forearm stretches to it', () => {
    const a = figure({ head: [5, 1.65, 5, 0, 0, 0, 1], left: null, right: [5, 1.4, 2.5] });
    expect(a.fore[1].scale.y).toBeGreaterThan(3);
    expect(end(a.fore[1], CONFIG.avatar.forearm).distanceTo(a.right.position)).toBeLessThan(0.01);
  });

  it('looks: every outfit, skin and beard combination decodes, and builds', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 300; n++) {
      const l = decodeLook(n);
      seen.add(l.outfit.name);
      expect(l.skin).toBeGreaterThan(0);
    }
    expect(seen.size).toBe(OUTFITS.length);
    for (let n = 0; n < OUTFITS.length; n++) expect(figure({ head: [5, 1.65, 5, 0, 0, 0, 1], left: null, right: null }, n).torso.geometry.attributes.position.count).toBeGreaterThan(0);
  });
});
