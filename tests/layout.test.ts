import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Locomotion, type LocomotionInput } from '../src/player/locomotion';
import { createPlayerState } from '../src/player/playerState';
import { vesselWalkArea } from '../src/vessel/layout';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const def = VESSEL_DEFS.workboat;
const area = vesselWalkArea(def, def.layout);
const L = def.layout;
const wh = L.wheelhouse;
const roofTop = wh.roofY + L.roof.thickness;
const DECK_AFT = 1.0; // deck height around the aft deck (sheer ~0.95-1.05)

describe('vessel walk area (multi-level)', () => {
  it('the boarding spot (helm) is walkable on the wheelhouse floor', () => {
    const [x, y, z] = def.boardingSpot;
    expect(area.walkable(x, z, y)).toBe(true);
    expect(area.floorsAt(x, z)).toContain(wh.floorY);
  });

  it('decks are walkable at deck level; walls, console and outboard are not', () => {
    expect(area.walkable(0, 4, DECK_AFT)).toBe(true); // aft deck
    expect(area.walkable(1.75, 0, 1.1)).toBe(true); // starboard side deck
    expect(area.walkable(0, -3.5, 1.25)).toBe(true); // foredeck
    expect(area.walkable(wh.halfWidth - 0.04, 0, wh.floorY)).toBe(false); // in a wall
    expect(area.walkable(0, wh.front + 0.2, wh.floorY)).toBe(false); // in the console
    expect(area.walkable(2.5, 2, 1.0)).toBe(false); // over the side
  });

  it('the wheelhouse roof is a separate level: walkable at roof height, not from the floor below', () => {
    expect(area.walkable(0.6, -1.0, roofTop)).toBe(true);
    expect(area.walkable(0.6, -1.0, wh.floorY)).toBe(true); // the floor inside, below it
    expect(area.walkable(1.0, 2.8, roofTop)).toBe(false); // nothing up there over the aft deck
    expect(area.floorsAt(0.6, -0.5).sort()).toEqual([wh.floorY, roofTop].sort());
  });

  it('a ladder joins the aft deck to the roof', () => {
    const lad = area.ladderAt(L.ladder.x, wh.aft + 0.25);
    expect(lad).not.toBeNull();
    expect(lad!.top).toBeCloseTo(roofTop, 6);
    expect(lad!.bottom).toBeGreaterThan(0.9);
    expect(lad!.bottom).toBeLessThan(1.1);
  });

  it('head inside a wall is solid, but the window band and doorway are open', () => {
    const wallX = wh.halfWidth - wh.wall / 2;
    expect(area.insideSolid(wallX, wh.floorY + 0.5, 0)).toBe(true);
    expect(area.insideSolid(wallX, wh.floorY + (wh.windowSill + wh.windowHead) / 2, 0)).toBe(false);
    expect(area.insideSolid(0, wh.floorY + 1.6, wh.aft - wh.wall / 2)).toBe(false); // doorway
    expect(area.insideSolid(0, roofTop + 1.6, 0)).toBe(false); // standing on the roof
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
  const run = (loco: Locomotion, p: ReturnType<typeof createPlayerState>, seconds: number, extra: (i: number) => Partial<LocomotionInput>) => {
    for (let i = 0; i < 60 * seconds; i++) loco.update(p, input(p, extra(i)));
  };

  it('walks from the aft deck through the doorway to the helm, stepping up the sill', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, DECK_AFT, 4.5];
    const loco = new Locomotion();
    run(loco, p, 8, () => ({ moveStick: [0, 1] }));
    expect(p.position[2]).toBeLessThan(wh.aft - 1);
    expect(p.position[1]).toBeCloseTo(wh.floorY, 2);
  });

  it('cannot walk through the side wall', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, wh.floorY, 0];
    const loco = new Locomotion();
    run(loco, p, 4, () => ({ moveStick: [1, 0] }));
    expect(p.position[0]).toBeLessThan(wh.halfWidth - wh.wall);
  });

  it('grab-the-world: pulling the hand back moves the player forward; vertical pulls do nothing off a ladder', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, DECK_AFT, 4.5];
    const loco = new Locomotion();
    run(loco, p, 1, () => ({})); // settle on the deck
    const y0 = p.position[1];
    const hand = new THREE.Vector3(0.3, 2.0, 4.0);
    loco.update(p, input(p, { grabbing: { left: null, right: hand.clone() } }));
    loco.update(p, input(p, { grabbing: { left: null, right: hand.clone().add(new THREE.Vector3(0, -0.5, 0.5)) } }));
    expect(p.position[2]).toBeCloseTo(4.0, 5);
    expect(p.position[1]).toBeCloseTo(y0, 2);
  });

  it('climbs the ladder hand over hand to the roof, steps onto it, and stays up there', () => {
    const p = createPlayerState('p', 'test');
    p.position = [L.ladder.x, DECK_AFT, wh.aft + 0.3];
    const loco = new Locomotion();
    run(loco, p, 1, () => ({})); // standing at the foot of the ladder
    // Hand-over-hand: grab high, pull down 0.4 m, release, repeat.
    for (let rung = 0; rung < 8; rung++) {
      const hand = new THREE.Vector3(L.ladder.x, p.position[1] + 1.8, wh.aft + 0.1);
      loco.update(p, input(p, { grabbing: { left: null, right: hand.clone() } }));
      for (let k = 1; k <= 10; k++) {
        loco.update(p, input(p, { grabbing: { left: null, right: hand.clone().add(new THREE.Vector3(0, -0.04 * k, 0)) } }));
      }
      loco.update(p, input(p, {})); // let go: you hang on the ladder
    }
    expect(p.position[1]).toBeCloseTo(roofTop, 2);
    // Step forward off the ladder onto the roof.
    run(loco, p, 2, () => ({ moveStick: [0, 1] }));
    expect(p.position[2]).toBeLessThan(wh.aft);
    expect(p.position[1]).toBeCloseTo(roofTop, 2);
    expect(area.walkable(p.position[0], p.position[2], p.position[1])).toBe(true);
  });

  it('snap turn rotates about the head by the configured step', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, DECK_AFT, 4.5];
    const loco = new Locomotion();
    loco.update(p, input(p, { turnStick: 1 }));
    expect(p.yaw).toBeCloseTo((-30 * Math.PI) / 180, 6);
    expect(p.position[0]).toBeCloseTo(0, 6);
  });
});
