/**
 * The desktop fly camera (J) flies inside the rig; the body must not settle onto the floor
 * under the camera (the owner, Oct 2026: flown over the harbour, it sank to the seabed's
 * wading level). With `noFloor` the locomotion leaves the height alone.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Locomotion, type LocomotionInput } from '../src/player/locomotion';
import { createPlayerState } from '../src/player/playerState';
import type { WalkArea } from '../src/vessel/layout';

describe('the desktop fly camera over the water', () => {
  // A quay 1.6 m up, and 0.2 m of wading floor everywhere else (the harbour).
  const area: WalkArea = {
    floorsAt: (x) => [x < 5 ? 1.6 : 0.2],
    walkable: () => true,
    ladderAt: () => null,
    insideSolid: () => false,
  };
  const frame = new THREE.Object3D();
  const input = (p: { position: number[] }, headX: number, noFloor: boolean): LocomotionInput => ({
    dt: 1 / 60,
    frame,
    area,
    head: new THREE.Vector3(headX, p.position[1] + 8, p.position[2]),
    headForward: new THREE.Vector3(0, 0, -1),
    grabbing: { left: null, right: null },
    moveStick: [0, 0],
    turnStick: 0,
    desktopDelta: null,
    fly: false,
    noFloor,
  });

  it('walking, the body settles to the floor under the head; with the camera flying, it keeps its height', () => {
    const walking = createPlayerState('p', 'test');
    walking.position = [0, 1.6, 0];
    const loco = new Locomotion();
    for (let i = 0; i < 120; i++) loco.update(walking, input(walking, 40, false)); // the head 40 m out over the water
    expect(walking.position[1]).toBeCloseTo(0.2, 1);
    const flying = createPlayerState('q', 'test');
    flying.position = [0, 1.6, 0];
    const loco2 = new Locomotion();
    for (let i = 0; i < 120; i++) loco2.update(flying, input(flying, 40, true));
    expect(flying.position[1]).toBe(1.6);
  });
});
