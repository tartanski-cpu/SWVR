import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Locomotion, type LocomotionInput } from '../src/player/locomotion';
import { createPlayerState } from '../src/player/playerState';
import { vesselWalkArea } from '../src/vessel/layout';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const def = VESSEL_DEFS.workboat;
const area = vesselWalkArea(def, def.layout);
const wh = def.layout.wheelhouse;

describe('vessel walk area', () => {
  it('the boarding spot (helm) is walkable and on the wheelhouse floor', () => {
    const [x, , z] = def.boardingSpot;
    expect(area.walkable(x, z)).toBe(true);
    expect(area.floorY(x, z)).toBe(wh.floorY);
  });

  it('aft deck, side decks and foredeck are walkable; walls, console and outboard are not', () => {
    expect(area.walkable(0, 4)).toBe(true); // aft deck
    expect(area.walkable(1.75, 0)).toBe(true); // starboard side deck
    expect(area.walkable(0, -3.5)).toBe(true); // foredeck
    expect(area.walkable(wh.halfWidth - 0.04, 0)).toBe(false); // in a wall
    expect(area.walkable(0, wh.front + 0.2)).toBe(false); // in the console
    expect(area.walkable(2.5, 2)).toBe(false); // over the side
    expect(area.walkable(0.9, wh.aft)).toBe(false); // aft wall beside the door
  });

  it('head inside a wall is solid, but the window band and doorway are open', () => {
    const wallX = wh.halfWidth - wh.wall / 2;
    expect(area.insideSolid(wallX, wh.floorY + 0.5, 0)).toBe(true);
    expect(area.insideSolid(wallX, wh.floorY + (wh.windowSill + wh.windowHead) / 2, 0)).toBe(false);
    expect(area.insideSolid(0, wh.floorY + 1.6, wh.aft - wh.wall / 2)).toBe(false); // doorway
    expect(area.insideSolid(0, wh.floorY + 1.6, 0)).toBe(false); // standing in the house
  });
});

describe('locomotion', () => {
  const frame = new THREE.Object3D(); // vessel frame = world for the test
  const input = (p: { position: number[] }, extra: Partial<LocomotionInput>): LocomotionInput => ({
    dt: 1 / 60,
    frame,
    area,
    head: new THREE.Vector3(p.position[0], p.position[1] + 1.7, p.position[2]),
    headForward: new THREE.Vector3(0, 0, -1),
    grabbing: { left: null, right: null },
    moveStick: [0, 0],
    turnStick: 0,
    desktopDelta: null,
    ...extra,
  });

  it('walks from the aft deck through the doorway to the helm', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, 1.0, 4.5];
    const loco = new Locomotion();
    for (let i = 0; i < 60 * 8; i++) loco.update(p, input(p, { moveStick: [0, 1] }));
    // Stops against the console, inside the wheelhouse, on its floor.
    expect(p.position[2]).toBeLessThan(wh.aft - 1);
    expect(area.walkable(p.position[0], p.position[2])).toBe(true);
    expect(p.position[1]).toBeCloseTo(wh.floorY, 2);
  });

  it('cannot walk through the side wall', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, wh.floorY, 0];
    const loco = new Locomotion();
    for (let i = 0; i < 60 * 4; i++) loco.update(p, input(p, { moveStick: [1, 0] }));
    expect(p.position[0]).toBeLessThan(wh.halfWidth - wh.wall);
  });

  it('grab-the-world: pulling the hand back moves the player forward', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, 1.0, 4.5];
    const loco = new Locomotion();
    const hand = new THREE.Vector3(0.3, 2.0, 4.0);
    loco.update(p, input(p, { grabbing: { left: null, right: hand.clone() } })); // grab
    // Hand pulled 0.5 m back (+z) while the rig hasn't moved yet:
    loco.update(p, input(p, { grabbing: { left: null, right: hand.clone().add(new THREE.Vector3(0, 0, 0.5)) } }));
    expect(p.position[2]).toBeCloseTo(4.0, 5);
  });

  it('snap turn rotates about the head by the configured step', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, 1.0, 4.5];
    const loco = new Locomotion();
    loco.update(p, input(p, { turnStick: 1 }));
    expect(p.yaw).toBeCloseTo((-30 * Math.PI) / 180, 6);
    expect(p.position[0]).toBeCloseTo(0, 6); // head was over the feet: no displacement
  });
});
