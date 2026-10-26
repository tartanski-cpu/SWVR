/**
 * A fish hold (owner, Oct 2026: "to have a fish hold", step 1 toward a trawler; design.fishHold):
 * an insulated hold in her hull under the open deck, its hatch in the deck on a coaming (a lid
 * you open, a button that lifts a box out), the catch going down into it in fish boxes, their
 * weight bearing on her where they stand. Fitted by shipyard/parts/hold.ts; modules/fishHold;
 * fishing/fishHold.ts.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { holdOf, holdPayload, stowInHold } from '../../src/fishing/fishHold';
import { holdSlots, type FishHoldConfig } from '../../src/modules/fishHold';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { bottomAt } from '../../src/shipyard/machinery';
import { hullPlan, vesselWalkArea } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';
import { footprintsOf } from '../../src/boats/sims';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const GILL = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Gillnetter'));
const gill = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[GILL].defaults, hull: GILL, fishHold: 1, ...more });
const box = CONFIG.cargo.kinds.find((k) => k.name === 'Fish box')!;

describe('the fish hold', () => {
  it('travels as a link or file (not in the short code); none is as before', () => {
    expect(DEFAULT_DESIGN.fishHold).toBe(0);
    expect(shortCode(gill())).toBeNull();
    expect(readDesign(designToken(gill()))).toMatchObject({ design: gill(), warnings: [] });
    const none = buildDesign(gill({ fishHold: 0 }));
    expect(none.hull.layout.fishHold).toBeUndefined();
    expect(none.recipe.modules.some((m) => m.module === 'hold.fish')).toBe(false);
  });

  it('on the gillnetter: under the working deck aft of the house, clear of the engine and the shaft, inside her hull; weighed and priced', () => {
    const b = buildDesign(gill());
    const h = b.hull.layout.fishHold!;
    expect(b.warnings).toEqual([]);
    const wh = b.hull.layout.wheelhouse!;
    expect(h.z0).toBeGreaterThan(wh.aft);
    // Clear of the engine and its space, and of the propeller and rudder aft.
    expect(h.z0).toBeGreaterThan(b.shaft.flangeZ);
    // Its floor over her bottom and the shaft.
    useDesign(gill());
    const def = VESSEL_DEFS.design;
    const plan = hullPlan(def);
    expect(h.z1).toBeLessThanOrEqual(plan.transom - CONFIG.shipyard.fishHold.aftClear + 1e-6);
    for (const z of [h.z0, h.z1]) expect(h.sole).toBeGreaterThan(bottomAt({ stations: def.hull.stations } as never, 0, z));
    // The hatch on her open deck, within the hold.
    expect(h.hatch.z0).toBeGreaterThan(h.z0);
    expect(h.hatch.z1).toBeLessThan(h.z1);
    // It holds a good few boxes, and weighs and costs something.
    const m = b.recipe.modules.find((x) => x.module === 'hold.fish')!;
    expect(holdSlots(m.config as unknown as FishHoldConfig).length).toBeGreaterThanOrEqual(30);
    expect(b.weights.items.find((it) => it.name.startsWith('Fish hold'))!.kg).toBeGreaterThan(300);
    expect(b.figures.price).toBeGreaterThan(buildDesign(gill({ fishHold: 0 })).figures.price);
  });

  it('on every hull type: fitted, or left off saying why', () => {
    DESIGN_HULLS.forEach((t, i) => {
      // (Not a one-off, the harbour tug: this choice is fixed on her.)
      if (t.fixed) return;
      const b = buildDesign({ ...DEFAULT_DESIGN, ...t.defaults, hull: i, fishHold: 1 });
      if (b.hull.layout.fishHold) expect(b.recipe.modules.some((m) => m.module === 'hold.fish')).toBe(true);
      else expect(b.warnings.join(' ')).toMatch(/No fish hold: /);
    });
  });

  it('walked round, not over: its coaming stands on the deck; the deck beside it is walked as before', () => {
    useDesign(gill());
    const def = VESSEL_DEFS.design;
    const h = def.layout.fishHold!;
    const area = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'design' }));
    const plan = hullPlan(def);
    const zc = (h.hatch.z0 + h.hatch.z1) / 2;
    expect(area.walkable(0, zc, plan.deckY(zc))).toBe(false);
    const xs = h.hatch.x1 + 0.6;
    expect(area.walkable(xs, zc, plan.deckY(zc))).toBe(true);
  });

  it('drawn: the deck is cut out over its hatch, not elsewhere', () => {
    useDesign(gill());
    const def = VESSEL_DEFS.design;
    const h = def.layout.fishHold!;
    const mesh = buildVesselMeshParts(def.hull, def.layout).hull;
    mesh.updateMatrixWorld(true);
    const zc = (h.hatch.z0 + h.hatch.z1) / 2;
    const deck = hullPlan(def).deckY(zc);
    // (Her hull is drawn to be seen from outside: down through the hole, nothing faces up until below it.)
    const hit = new THREE.Raycaster(new THREE.Vector3(0, deck + 1, zc), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
    expect(hit?.point.y ?? -Infinity).toBeLessThan(deck - 0.3);
    // Just forward of the hold, the deck is there.
    const zd = h.z0 - 0.3;
    expect(new THREE.Raycaster(new THREE.Vector3(0, hullPlan(def).deckY(zd) + 1, zd), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0].point.y).toBeCloseTo(hullPlan(def).deckY(zd), 1);
  });

  it('the catch goes down into it, its weight where it stands; a press of LIFT with the lid open brings one up onto the deck', () => {
    useDesign(gill());
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'design');
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    const hold = holdOf(v)!;
    expect(hold.slots.length).toBeGreaterThanOrEqual(30);
    for (let i = 0; i < hold.slots.length; i++) expect(stowInHold(v, 'cod')).toBe(true);
    expect(stowInHold(v, 'cod')).toBe(false); // full
    const pay = holdPayload(v);
    expect(pay.reduce((a, p) => a + p.mass, 0)).toBeCloseTo(hold.slots.length * box.mass, 6);
    // Low in her: under her deck.
    const plan = hullPlan(VESSEL_DEFS.design);
    for (const p of pay) expect(p.pos.y).toBeLessThan(plan.deckY(p.pos.z));
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control, value } as Intent], 1 / 60);
    const onDeck = () => Object.values(world.cargo).filter((c) => 'vessel' in c.at && c.at.vessel === v.id).length;
    // Lid shut: nothing comes up.
    send('holdLift', 1);
    expect(v.hold!.boxes.length).toBe(hold.slots.length);
    expect(onDeck()).toBe(0);
    // Lid open: one does, beside the hatch, its species kept.
    send('holdHatch', 1);
    send('holdLift', 1);
    expect(v.hold!.boxes.length).toBe(hold.slots.length - 1);
    expect(onDeck()).toBe(1);
    const item = Object.values(world.cargo).find((c) => 'vessel' in c.at && c.at.vessel === v.id)!;
    expect(item.species).toBe('cod');
    expect(item.from).toBe('trawl');
    expect(v.controls.holdLift).toBe(0);
  });
});
