import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/core/world';

// The name tag draws on a canvas; in the test there's no DOM, so give it one that draws nothing.
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
const { AvatarsView } = await import('../src/net/avatarView');

describe('avatars', () => {
  it('the body hangs from the head: no gap, however far the head is off the feet', () => {
    const scene = new THREE.Scene();
    const view = new AvatarsView(scene);
    // A crew-mate ashore, head 25 cm to one side and 10 cm ahead of the feet (leaning, or a drifting pose).
    const world = {
      players: {
        player2: { id: 'player2', name: 'Crew', aboardVesselId: null, position: [5, 0, 5], yaw: 0, avatar: { head: [5.25, 1.6, 4.9, 0, 0, 0, 1], left: null, right: null } },
      },
    } as unknown as WorldState;
    // Settle the easing.
    for (let i = 0; i < 200; i++) view.update(world, 'player1', new Map(), 1 / 60);
    const a = (view as unknown as { avatars: Map<string, { root: THREE.Group; head: THREE.Group; body: THREE.Mesh }> }).avatars.get('player2')!;
    // Top of the torso (the unit cylinder's top, through its pose) against the head's underside.
    const top = new THREE.Vector3(0, 0.5, 0).applyMatrix4(a.body.matrix.compose(a.body.position, a.body.quaternion, a.body.scale));
    const neck = a.head.position.clone().setY(a.head.position.y - 0.13);
    expect(top.distanceTo(neck)).toBeLessThan(0.01);
    // And its foot is on the player's feet.
    const foot = new THREE.Vector3(0, -0.5, 0).applyMatrix4(a.body.matrix);
    expect(foot.length()).toBeLessThan(0.01);
  });
});
