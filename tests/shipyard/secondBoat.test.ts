/**
 * A second ship's boat (owner, 28 Oct 2026: "the ability to place the skiff and the rib. So
 * there should be a button which says place another, obviously for bigger vessels"): a big
 * boat carries two, each in her own cradle on her own crane, each crane with its own button
 * on the dash; in the game each is her own boat, launched and recovered by her own crane.
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { tenderCranesOf, useDesign } from '../../src/boats/sims';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { equipmentOf, placeGear } from '../../src/shipyard/pinGear';
import { FLEET } from '../../src/boats/fleet';
import { craneOf, launchTime } from '../../src/vessel/tenderCrane';
import { placeVessel } from '../../src/vessel/vesselControl';
import { startEngine } from '../helpers/engine';

afterAll(() => useDesign(DEFAULT_DESIGN));

const ST = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Stern trawler'));
/** The stern trawler: the rescue boat on her aft deck, crane to starboard; the dinghy beside her, crane to port. */
const trawler = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[ST].defaults, hull: ST, skiff: 3, rescueBoat: 1, skiff2: 4, rescueBoat2: 0, ...more });
const DT = 1 / 60;

describe("a second ship's boat", () => {
  it('Place another puts her where the pin is, as the first', () => {
    const eq = equipmentOf('skiff2')!;
    expect(placeGear(eq, [-1, 0, 5], { front: -2, aft: 1, halfWidth: 1.5 }, 9).patch).toEqual({ skiff2: 4 });
    expect(placeGear(eq, [1, 0, -6], { front: -2, aft: 1, halfWidth: 1.5 }, 9).patch).toEqual({ skiff2: 1 });
  });

  it('on the stern trawler: both cradles on her aft deck, no warnings; two cranes, each with its button on the dash; heavier and dearer; a link or file', () => {
    const b = buildDesign(trawler());
    expect(b.warnings).toEqual([]);
    const sockets = b.hull.sockets.filter((s) => s.id.startsWith('tenderCrane'));
    expect(sockets.map((s) => s.id)).toEqual(['tenderCrane', 'tenderCrane2']);
    // Over to each side: the rescue boat's crane to starboard, the dinghy's to port.
    expect(sockets[0].transform!.position[0]).toBeGreaterThan(0);
    expect(sockets[1].transform!.position[0]).toBeLessThan(0);
    const cranes = b.recipe.modules.filter((m) => m.module === 'deck.tender-crane');
    expect(cranes.map((m) => (m.config as { consoleLabel?: string }).consoleLabel)).toEqual(['RIB CRANE', 'SKIFF CRANE']);
    const buttons = cranes.map((m) => (m.config as { consoleButton: number[] }).consoleButton);
    expect(Math.hypot(buttons[0][0] - buttons[1][0], buttons[0][2] - buttons[1][2])).toBeGreaterThan(0.03);
    const one = buildDesign(trawler({ skiff2: 0 }));
    expect(b.figures.price).toBeGreaterThan(one.figures.price + 30_000);
    expect(b.figures.massT).toBeGreaterThan(one.figures.massT + 0.45); // (the dinghy and her crane: 0.5 t)
    expect(shortCode(trawler())).toBeNull();
    expect(() => encodeDesign({ ...DEFAULT_DESIGN, skiff: 1, skiff2: 3 })).toThrow(/link or file/);
    expect(readDesign(designToken(trawler()))).toMatchObject({ design: trawler(), warnings: [] });
    // Two of the same boat: numbered.
    const two = buildDesign(trawler({ rescueBoat: 0 }));
    expect(two.recipe.modules.filter((m) => m.module === 'deck.tender-crane').map((m) => (m.config as { consoleLabel?: string }).consoleLabel)).toEqual(['SKIFF CRANE 1', 'SKIFF CRANE 2']);
    // One boat: as before (no label of its own).
    expect(one.recipe.modules.filter((m) => m.module === 'deck.tender-crane').map((m) => (m.config as { consoleLabel?: string }).consoleLabel)).toEqual([undefined]);
  });

  it('no room on a small boat: left off, saying so; only with the first', () => {
    const small = buildDesign({ ...FLEET.find((f) => f.id === 'fishingBoat')!.design, skiff: 1, skiff2: 3, rescueBoat2: 1 });
    expect(small.hull.sockets.some((s) => s.id === 'tenderCrane2')).toBe(false);
    expect(small.warnings.join(' ')).toMatch(/no room .* for the second ship's boat's cradle/);
    expect(buildDesign(trawler({ skiff: 0 })).hull.sockets.some((s) => s.id.startsWith('tenderCrane'))).toBe(false);
  });

  it('in the game: each in her own cradle; each crane launches and recovers her own boat', () => {
    useDesign(trawler());
    expect(tenderCranesOf({ defId: 'design' }).map((c) => c.tenderDefId)).toEqual(['rib', 'skiff']);
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'design', { tender: true });
    world.environment.waves = [];
    const ship = world.vessels[vesselId];
    const rib = Object.values(world.vessels).find((v) => v.defId === 'rib')!;
    const dinghy = Object.values(world.vessels).find((v) => v.defId === 'skiff')!;
    expect(rib.tender).toMatchObject({ hostId: vesselId, phase: 'stowed' });
    expect(dinghy.tender).toMatchObject({ hostId: vesselId, crane: 1, phase: 'stowed' });
    // In two different cradles, one to each side.
    expect(Math.hypot(rib.position[0] - dinghy.position[0], rib.position[2] - dinghy.position[2])).toBeGreaterThan(1.5);
    placeVessel(ship, 0, 0, -400, 0);
    startEngine(world, ship);
    const send = (target: string, control: string, value = 1) => stepWorld(world, [{ playerId: localPlayerId, targetId: target, control, value } as Intent], DT);
    const run = (s: number) => {
      for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
    };
    const local = (v: { position: number[] }) => new THREE.Vector3(...v.position).sub(new THREE.Vector3(...ship.position)).applyQuaternion(new THREE.Quaternion(...ship.orientation).invert());
    // The dinghy's crane alone: she goes over the port side, the rescue boat stays put.
    const dc = craneOf(world, dinghy.tender!)!.crane;
    send(dinghy.id, 'crane');
    run(launchTime(dc) + 1);
    expect(dinghy.tender!.phase).toBe('free');
    expect(rib.tender!.phase).toBe('stowed');
    expect(local(dinghy).x).toBeLessThan(-2);
    // Then the rescue boat's, over the starboard side.
    const rc = craneOf(world, rib.tender!)!.crane;
    send(rib.id, 'crane');
    run(launchTime(rc) + 1);
    expect(rib.tender!.phase).toBe('free');
    expect(local(rib).x).toBeGreaterThan(2);
    // Each back under her own crane and recovered.
    for (const [boat, c] of [[dinghy, dc], [rib, rc]] as const) {
      boat.tender!.painter = undefined;
      boat.tender!.sternPainter = undefined;
      const spot = new THREE.Vector3(c.outboard[0], 0, c.outboard[1]).applyQuaternion(new THREE.Quaternion(...ship.orientation)).add(new THREE.Vector3(...ship.position));
      placeVessel(boat, spot.x, 0, spot.z, 0);
      boat.linearVelocity = [...ship.linearVelocity];
      boat.angularVelocity = [0, 0, 0];
      send(boat.id, 'crane');
      run(launchTime(c) + c.alignTime + 2);
      expect(boat.tender!.phase).toBe('stowed');
    }
    // Back in their own cradles.
    expect(local(rib).x).toBeGreaterThan(0);
    expect(local(dinghy).x).toBeLessThan(0);
  });
});
