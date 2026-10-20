/**
 * Parametric boats P2c (owner): a cabin below. Under a Shipyard design's deckhouse forward of
 * the wheelhouse (its trunk), the deck cut away and the sole sunk into her hull for standing
 * headroom, reaching aft under the wheelhouse floor to the foot of a companionway stepping down
 * from it beside the helm, a V-berth forward (design.foreCabin; layout.cabin). Walked through
 * the general fields (extraFloors, hollows, floorHoles, deckOpening), drawn with a lining.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { deckhouseHalfWidth } from '../../src/vessel/deckhouse';
import { STEP_HEIGHT, vesselWalkArea } from '../../src/vessel/layout';
import { planHalfWidth, VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const PILOT = 3;
const cc = CONFIG.shipyard.deckhouse.cabin;
const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, dhLength: 2.5, dhHeight: 1, dhWidth: 0, dhRake: 20, dhNarrow: 0, foreCabin: 1, ...more });
const pilot = type(PILOT);

describe('the cabin below', () => {
  it('travels as a link or file (not in the short code); needs a deckhouse; none is as before', () => {
    expect(DEFAULT_DESIGN.foreCabin).toBe(0);
    expect(shortCode(pilot)).toBeNull();
    expect(readDesign(designToken(pilot))).toMatchObject({ design: pilot, warnings: [] });
    const without = buildDesign(type(PILOT, { foreCabin: 0 }));
    expect(without.hull.layout.cabin).toBeUndefined();
    expect(without.hull.layout.wheelhouse!.floorHoles).toBeUndefined();
    expect(buildDesign(type(PILOT, { dhLength: 0 })).warnings.join(' ')).toMatch(/needs a deckhouse/);
  });

  it('fitted on the pilot boat: standing headroom, inside her hull and the trunk, steps a walker can take, a berth; weighed and priced', () => {
    const b = buildDesign(pilot);
    const c = b.hull.layout.cabin!;
    const dh = b.hull.layout.deckhouse!;
    const wh = b.hull.layout.wheelhouse!;
    expect(b.warnings).toEqual([]);
    expect(c.ceiling.trunk - c.sole).toBeGreaterThanOrEqual(cc.minHeadroom);
    // Inside the trunk's walls, and the wheelhouse's under it.
    for (const [z, w] of c.plan) expect(w).toBeLessThanOrEqual((z < wh.front ? deckhouseHalfWidth(dh, z) : wh.halfWidth) - cc.wall + 1e-3);
    // The steps: from the floor to the sole, none higher than a walker's step, the opening aft of the console.
    const ys = [wh.floorY, ...c.stair.treads.map((t) => t.y), c.sole];
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1] - ys[i]).toBeLessThanOrEqual(Math.min(cc.rise, STEP_HEIGHT) + 1e-6);
    expect(c.stair.z0).toBeGreaterThan(wh.front + 0.5);
    expect(c.stair.z1).toBeLessThan(wh.aft);
    expect(c.berth).toBeDefined();
    expect(b.weights.items.find((it) => it.name.startsWith('Deckhouse: the cabin below'))!.kg).toBeGreaterThan(50);
    expect(b.figures.price).toBeGreaterThan(buildDesign(type(PILOT, { foreCabin: 0 })).figures.price);
  });

  it('left off, saying why, where it can’t go: the engine under the wheelhouse, a wheelhouse too narrow for the steps', () => {
    expect(buildDesign(type(1)).warnings.join(' ')).toMatch(/no cabin below: her engine is under the wheelhouse/);
    expect(buildDesign(type(0)).warnings.join(' ')).toMatch(/no cabin below: her wheelhouse is too narrow/);
    expect(buildDesign(type(1)).hull.layout.cabin).toBeUndefined();
  });

  it('is walked: down the companionway from the wheelhouse floor to the sole, forward to the berth; open inside, solid beyond its walls', () => {
    useDesign(pilot);
    const def = VESSEL_DEFS.design;
    const c = def.layout.cabin!;
    const wh = def.layout.wheelhouse!;
    const area = vesselWalkArea(def, def.layout, []);
    const x = (c.stair.x0 + c.stair.x1) / 2;
    // From the floor aft of the opening, forward a few centimetres at a time, down each tread.
    let y = wh.floorY;
    for (let z = c.stair.z1 + 0.3; z > c.stair.z0 + 0.1; z -= 0.04) {
      expect(area.walkable(x, z, y), `z ${z.toFixed(2)} y ${y.toFixed(2)}`).toBe(true);
      y = Math.max(...area.floorsAt(x, z).filter((f) => f <= y + STEP_HEIGHT));
    }
    expect(y).toBeCloseTo(c.sole, 3);
    // Then across to the centreline and forward along the sole to the berth.
    for (let z = c.stair.z0 + 0.1; z > (c.berth?.z1 ?? c.z0) + 0.1; z -= 0.1) expect(area.walkable(0, z, c.sole), `sole z ${z.toFixed(2)}`).toBe(true);
    // Standing room under the trunk; her hull solid just outside the lining, below the deck.
    const zt = (c.berth!.z1 + wh.front) / 2;
    expect(area.insideSolid(0, c.sole + 1.7, zt)).toBe(false);
    expect(area.insideSolid(planHalfWidth(c.plan, zt) + 0.1, c.sole + 0.3, zt)).toBe(true);
    // Not on the wheelhouse floor over the opening.
    expect(area.walkable(x, (c.stair.z0 + c.stair.z1) / 2, wh.floorY)).toBe(false);
  });

  it('is drawn: the opening in the wheelhouse floor shows the steps below; the sole and lining inside; her fenders stowed clear of the deckhouse', () => {
    useDesign(pilot);
    const def = VESSEL_DEFS.design;
    const c = def.layout.cabin!;
    const wh = def.layout.wheelhouse!;
    const mesh = buildVesselMeshParts(def.hull, def.layout).house!;
    mesh.updateMatrixWorld(true);
    // Looking straight down into the opening: the first thing hit is a tread, not the floor.
    const ray = new THREE.Raycaster(new THREE.Vector3((c.stair.x0 + c.stair.x1) / 2, wh.floorY + 1, (c.stair.z0 + c.stair.z1) / 2 + 0.05), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    expect(hit.point.y).toBeLessThan(wh.floorY - 0.15);
    // Looking forward along the cabin from its aft end: the berth or the forward bulkhead, not out through her bow.
    const fwd = new THREE.Raycaster(new THREE.Vector3(0, c.sole + 1.2, c.stair.z0), new THREE.Vector3(0, 0, -1)).intersectObject(mesh)[0];
    expect(fwd.point.z).toBeGreaterThanOrEqual(c.z0 - 0.01);
    // Looking out sideways under the trunk: the lining, not the sea.
    const zt = (c.berth!.z1 + wh.front) / 2;
    const side = new THREE.Raycaster(new THREE.Vector3(0, c.sole + 1.2, zt), new THREE.Vector3(1, 0, 0)).intersectObject(mesh)[0];
    expect(side.point.x).toBeCloseTo(planHalfWidth(c.plan, zt), 1);
    // The fenders' stations (where they're stowed by the bulwark) are clear of the full-width deckhouse.
    const dh = def.layout.deckhouse!;
    const zs = buildDesign(pilot).recipe.modules.find((m) => m.module === 'deck.fenders')?.config?.z as number[] | undefined;
    for (const z of zs ?? []) expect(z < dh.z0 - 0.2 || z > dh.z1 + 0.2, `fender at ${z}`).toBe(true);
  });
});
