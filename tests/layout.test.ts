import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Locomotion, type LocomotionInput } from '../src/player/locomotion';
import { createPlayerState } from '../src/player/playerState';
import { vesselWalkArea } from '../src/vessel/layout';
import { aFrameOf } from '../src/fishing/fishing';
import { asWorkboat, VESSEL_DEFS } from '../src/vessel/vesselDef';

const def = asWorkboat(VESSEL_DEFS.workboat);
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

  it('side decks run the full length of the wheelhouse, both sides, at least 0.25 m of walkable width (owner request)', () => {
    for (const side of [-1, 1]) {
      for (let z = wh.front - 0.3; z <= wh.aft + 0.3; z += 0.1) {
        let band = 0;
        for (let x = wh.halfWidth; x < 3; x += 0.01) if (area.floorsAt(side * x, z).length) band += 0.01;
        expect(band, `side ${side} z ${z.toFixed(1)}`).toBeGreaterThan(0.25);
      }
    }
  });

  it('decks are walkable at deck level; walls, console and outboard are not', () => {
    expect(area.walkable(0, 4, DECK_AFT)).toBe(true); // aft deck
    expect(area.walkable(1.75, 0, 1.1)).toBe(true); // starboard side deck
    expect(area.walkable(-1.3, -3.0, 1.26)).toBe(true); // foredeck, beside the skiff's cradle
    expect(area.walkable(0, -3.5, 1.3)).toBe(false); // the cradle (the skiff in it)
    const tc = VESSEL_DEFS.workboat.tenderCrane!;
    expect(area.walkable(tc.column[0], tc.column[1], 1.22)).toBe(false); // the crane's column
    const casing = VESSEL_DEFS.workboat.maintenance!.casing;
    expect(area.walkable((casing.x0 + casing.x1) / 2, (casing.z0 + casing.z1) / 2, wh.floorY)).toBe(false); // the engine casing
    expect(area.insideSolid((casing.x0 + casing.x1) / 2, wh.floorY + casing.height - 0.1, (casing.z0 + casing.z1) / 2)).toBe(true);
    expect(area.walkable(0.3, 0.3, wh.floorY)).toBe(true); // the aisle beside it
    const tw = VESSEL_DEFS.workboat.towWinch!;
    expect(area.walkable(0, tw.z, DECK_AFT)).toBe(false); // the tow winch
    expect(area.walkable(tw.drumWidth / 2 + 0.1 + tw.housing.width / 2, tw.z, DECK_AFT)).toBe(false); // its gearbox housing
    const af = aFrameOf(VESSEL_DEFS.workboat)!;
    expect(area.walkable(af.x - 0.25, af.footZ, DECK_AFT)).toBe(false); // beside an A-frame foot
    expect(area.walkable(-af.x + 0.25, af.braceZ, DECK_AFT)).toBe(false); // beside a brace foot
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
    fly: false,
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

  it('cannot walk through the side wall (desktop rules)', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, wh.floorY, 0];
    const loco = new Locomotion();
    run(loco, p, 4, () => ({ moveStick: [1, 0] }));
    expect(p.position[0]).toBeLessThan(wh.halfWidth - wh.wall);
  });

  it('without fly (swimming, desktop): grab pulls move along the floor; vertical pulls do nothing off a ladder', () => {
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

  it('VR grab-the-world flies: up, down and through walls (fenced at the boat\'s edge), and the height stays', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, wh.floorY, 0];
    const loco = new Locomotion();
    run(loco, p, 1, () => ({ fly: true })); // standing in the wheelhouse
    const y0 = p.position[1];
    // Pull the hand down 0.5 m and in toward us 1.7 m sideways: up and out through the wall.
    const hand = new THREE.Vector3(1, 1.5, 0);
    loco.update(p, input(p, { fly: true, grabbing: { left: null, right: hand.clone() } }));
    loco.update(p, input(p, { fly: true, grabbing: { left: null, right: hand.clone().add(new THREE.Vector3(-1.7, -0.5, 0)) } }));
    expect(p.position[0]).toBeCloseTo(1.7, 5);
    expect(p.position[0]).toBeGreaterThan(wh.halfWidth); // through the wheelhouse wall
    expect(p.position[1]).toBeCloseTo(y0 + 0.5, 5);
    // Let go, take a fresh grab beside us and pull 3 m on out over the side: it stops at
    // the boat's edge.
    loco.update(p, input(p, { fly: true }));
    const at = new THREE.Vector3(p.position[0] + 0.5, p.position[1] + 1.5, 0);
    loco.update(p, input(p, { fly: true, grabbing: { left: null, right: at.clone() } }));
    loco.update(p, input(p, { fly: true, grabbing: { left: null, right: at.clone().add(new THREE.Vector3(-3, 0, 0)) } }));
    expect(area.inBounds!(p.position[0], p.position[2])).toBe(true);
    expect(p.position[0]).toBeGreaterThan(2.0); // right up to it (the deck edge is at 2.28 here)
    // Let go: we stay up there (no settling), and the stick glides us on, through anything.
    run(loco, p, 1, () => ({ fly: true }));
    expect(p.position[1]).toBeCloseTo(y0 + 0.5, 5);
    p.position = [0, y0 + 0.5, 0];
    run(loco, p, 0.1, () => ({ fly: true })); // put back inside: the floor has us again
    run(loco, p, 4, () => ({ fly: true, moveStick: [1, 0] }));
    expect(p.position[0]).toBeGreaterThan(wh.halfWidth); // the stick too: through the wall...
    expect(area.inBounds!(p.position[0], p.position[2])).toBe(true); // ...but not over the side
  });

  it('desktop walking stops at the deck edge, even with the camera a little off the feet', () => {
    const p = createPlayerState('p', 'test');
    p.position = [-1.6, DECK_AFT, 3.0];
    const loco = new Locomotion();
    // The camera 0.5 m outboard of the feet (beyond the edge): walking to port must still stop.
    const step = (): LocomotionInput => ({ ...input(p, { desktopDelta: { x: -0.05, z: 0 } }), head: new THREE.Vector3(p.position[0] - 0.5, p.position[1] + 1.7, p.position[2]) });
    for (let i = 0; i < 200; i++) loco.update(p, step());
    expect(area.walkable(p.position[0], p.position[2], p.position[1])).toBe(true);
    expect(p.position[0]).toBeGreaterThan(-2.1); // on deck, not walked off over the side
  });

  it('being put somewhere else ends free flight: the floor holds us again', () => {
    const p = createPlayerState('p', 'test');
    p.position = [0, wh.floorY, 0];
    const loco = new Locomotion();
    run(loco, p, 1, () => ({ fly: true }));
    const y0 = p.position[1];
    const hand = new THREE.Vector3(0, 1.5, -0.5);
    loco.update(p, input(p, { fly: true, grabbing: { left: null, right: hand.clone() } }));
    loco.update(p, input(p, { fly: true, grabbing: { left: null, right: hand.clone().add(new THREE.Vector3(0, -0.3, 0)) } }));
    run(loco, p, 0.5, () => ({ fly: true }));
    expect(p.position[1]).toBeCloseTo(y0 + 0.3, 3);
    // Teleported (the menu, boarding...) to a spot a little above the deck: it settles.
    p.position = [0, DECK_AFT + 0.2, 3.9];
    run(loco, p, 1, () => ({ fly: true }));
    expect(p.position[1]).toBeCloseTo(Math.max(...area.floorsAt(0, 3.9)), 2);
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
