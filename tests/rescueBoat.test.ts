/**
 * The fast rescue boat (owner, Oct 2026: "a slightly bigger one, which should be rigid
 * inflatable boat type ... a central seating position with a wheel and an outboard motor ...
 * 28 knots ... similar sea keeping to one of the smaller planing boats"; 6 m and 150 hp
 * agreed, in the Shipyard only). A 6 m RIB (CONFIG.vessels.rib, boats/ribHull.ts, rib.ts)
 * carried by a bigger skiff crane (CONFIG.vessels.rib.crane) on a big boat.
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../src/boats/library';
import { gearOf, useDesign } from '../src/boats/sims';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { validateRecipe } from '../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../src/shipyard/designDoc';
import { uprightHydrostatics } from '../src/vessel/hydrostatics';
import { launchTime } from '../src/vessel/tenderCrane';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { FLEET } from '../src/boats/fleet';
import { startEngine } from './helpers/engine';

afterAll(() => useDesign(DEFAULT_DESIGN));

const ST = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Stern trawler'));
/** The stern trawler with the rescue boat on her aft deck, crane to starboard. */
const trawler = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[ST].defaults, hull: ST, skiff: 3, rescueBoat: 1, ...more });
const DT = 1 / 60;
const kn = (v: { linearVelocity: number[] }) => Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) * 1.9438;

describe('the rescue boat', () => {
  it('her recipe holds; she floats level on her lines, about 1.4 t, stable', () => {
    expect(validateRecipe(RECIPES.rib, LIBRARY)).toEqual([]);
    const def = VESSEL_DEFS.rib;
    const h = uprightHydrostatics(def);
    expect(Math.abs(h.sinkage)).toBeLessThan(0.01);
    expect(Math.abs(h.lcgMinusLcb)).toBeLessThan(0.03);
    expect(def.mass).toBeGreaterThan(1200);
    expect(def.mass).toBeLessThan(1600);
    expect(h.gmt).toBeGreaterThan(0.5);
    expect(def.planing?.lean).toBeGreaterThan(1);
    // Her outboard: the main boats' module, one 150 hp unit (112 kW).
    const ob = gearOf({ defId: 'rib' }, 'diesel')!;
    expect(ob.engine.powerKw).toBe(112);
    expect(ob.units).toEqual([0]);
  });

  it('her tubes, console and leaning post are drawn with her fixed parts; you walk round the console', () => {
    const fp = LIBRARY.modules.get('deck.rib-console')!;
    expect(fp.view!.frame).toBe('boat');
    const ids = RECIPES.rib.modules.map((m) => m.module);
    for (const m of ['hull.tubes', 'deck.rib-console', 'console.standard', 'propulsion.outboard']) expect(ids).toContain(m);
  });

  it('in the Shipyard: on the stern trawler\'s aft deck with all her trawl gear, no warnings; heavier and dearer than the dinghy; a link or file, not a code', () => {
    const b = buildDesign(trawler());
    expect(b.warnings).toEqual([]);
    const dinghy = buildDesign(trawler({ rescueBoat: 0 }));
    expect(b.figures.price).toBeGreaterThan(dinghy.figures.price + 30_000);
    expect(b.figures.massT).toBeGreaterThan(dinghy.figures.massT + 1);
    expect(shortCode(trawler())).toBeNull();
    expect(() => encodeDesign({ ...DEFAULT_DESIGN, skiff: 1, rescueBoat: 1 })).toThrow(/link or file/);
    expect(readDesign(designToken(trawler()))).toMatchObject({ design: trawler(), warnings: [] });
    // Too big for the fishing boat, saying so.
    const small = buildDesign({ ...FLEET.find((f) => f.id === 'fishingBoat')!.design, skiff: 1, rescueBoat: 1 });
    expect(small.warnings.join(' ')).toMatch(/no room .* for the rescue boat's cradle/);
    useDesign(trawler());
    expect(gearOf({ defId: 'design' }, 'tenderCrane')!.tenderDefId).toBe('rib');
  });

  it('at sea: launched by her crane, started, about 28 knots flat out, leaning into her turns; recovered', () => {
    useDesign(trawler());
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'design', { tender: true });
    world.environment.waves = [];
    const ship = world.vessels[vesselId];
    const rib = Object.values(world.vessels).find((v) => v.defId === 'rib')!;
    expect(rib.tender?.phase).toBe('stowed');
    placeVessel(ship, 0, 0, -400, 0);
    startEngine(world, ship);
    const send = (target: string, control: string, value = 1) => stepWorld(world, [{ playerId: localPlayerId, targetId: target, control, value } as Intent], DT);
    const run = (s: number) => {
      for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
    };
    send(rib.id, 'crane');
    run(launchTime(gearOf(ship, 'tenderCrane')!) + 1);
    expect(rib.tender!.phase).toBe('free');
    // Her lines off the ship, and away from her.
    rib.tender!.painter = undefined;
    rib.tender!.sternPainter = undefined;
    placeVessel(rib, 60, 0, -400, 0);
    send(rib.id, 'engineStartStop');
    run(4);
    expect(rib.engine.phase).toBe('running');
    send(rib.id, 'lever', 1);
    run(40);
    expect(kn(rib)).toBeGreaterThan(26.5);
    expect(kn(rib)).toBeLessThan(30);
    // Hard over at speed: she leans into the turn (her top toward the inside), as a planing boat does.
    send(rib.id, 'helm', 1);
    run(3);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(...rib.orientation));
    const inside = Math.sign(rib.angularVelocity[1]) < 0 ? 1 : -1; // turning to starboard (yaw rate negative): inside is starboard
    expect(right.y * inside).toBeLessThan(0); // the inside side lower
    // Back alongside under the crane, slow, and recovered.
    send(rib.id, 'lever', 0);
    send(rib.id, 'helm', 0);
    run(15);
    const c = gearOf(ship, 'tenderCrane')!;
    const spot = new THREE.Vector3(c.outboard[0], 0, c.outboard[1]).applyQuaternion(new THREE.Quaternion(...ship.orientation)).add(new THREE.Vector3(...ship.position));
    placeVessel(rib, spot.x, 0, spot.z, 0);
    rib.linearVelocity = [...ship.linearVelocity];
    rib.angularVelocity = [0, 0, 0];
    send(rib.id, 'crane');
    run(launchTime(c) + c.alignTime + 2);
    expect(rib.tender!.phase).toBe('stowed');
  });
});
