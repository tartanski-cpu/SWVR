/**
 * Parametric boats P2b, first stop: a saloon aft of the wheelhouse (owner's plan: "a
 * pilothouse and a saloon in a row"). The house runs on aft, one house under one roof; the
 * saloon's floor level with the wheelhouse's or a step or more down, treads made between
 * them; its aft door, steps, door buttons and what's on its aft wall from the saloon's floor.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, SCALES, type ShipDesign, fromSteps } from '../../src/shipyard/design';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { vesselWalkArea, STEP_HEIGHT } from '../../src/vessel/layout';
import { houseFloorAt, VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...fromSteps(more) });
/** The workboat, her wheelhouse floor raised a step, a 2.8 m saloon two steps down. */
const WB = type(2, { floor: 4, saloon: 4, saloonFloor: 2 });

describe('a saloon aft of the wheelhouse', () => {
  it('is in her code (version 23), both ways; a design without one reads as before', () => {
    expect(decodeDesign(encodeDesign(WB))).toEqual({ design: WB });
    const plain = type(2);
    expect(encodeDesign({ ...plain, saloon: 0, saloonFloor: 0 })).toBe(encodeDesign(plain));
  });

  it('runs the house on aft by its length; the wheelhouse keeps its own', () => {
    const plain = buildDesign(type(2, { floor: 4 })).hull.layout.wheelhouse!;
    const wh = buildDesign(WB).hull.layout.wheelhouse!;
    expect(wh.aft - wh.front).toBeCloseTo(plain.aft - plain.front + SCALES.saloon(4), 2);
    expect(buildDesign(WB).weights.massKg).toBeGreaterThan(buildDesign(type(2, { floor: 4 })).weights.massKg);
  });

  it('two steps down: a tread between, the saloon 0.4 m below the wheelhouse; the door, its steps and buttons from the saloon floor', () => {
    const b = buildDesign(WB);
    const wh = b.hull.layout.wheelhouse!;
    const FA = houseFloorAt(wh, wh.aft);
    expect(wh.floorY - FA).toBeCloseTo(0.4, 3);
    expect(wh.levels).toHaveLength(2);
    expect(wh.levels![0].y).toBeCloseTo(wh.floorY - 0.2, 3);
    expect(wh.levels![1].z1).toBeCloseTo(wh.aft, 3);
    // The door's steps out to the deck start from the saloon's floor (each rise no more than a step).
    const ys = [FA, ...(wh.steps ?? []).map((s) => s.y).sort((a, c) => c - a)];
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1] - ys[i]).toBeLessThanOrEqual(0.35 + 1e-6);
    const sock = (id: string) => b.hull.sockets.find((s) => s.id === id)!.transform!.position!;
    expect(sock('doorIn')[1]).toBeCloseTo(FA + 1.1, 2);
    expect(b.hull.layout.doorButtons!.height).toBeCloseTo(1.1 - 0.4, 3);
  });

  it('is walked: the wheelhouse floor, down the tread, the saloon floor, out of its door', () => {
    useDesign(WB);
    const def = VESSEL_DEFS.design;
    const wh = def.layout.wheelhouse!;
    const area = vesselWalkArea(def, def.layout, []);
    const helmZ = wh.levels![0].z0 - 0.4;
    const treadZ = (wh.levels![0].z0 + wh.levels![0].z1) / 2;
    const salZ = (wh.levels![1].z0 + wh.aft) / 2;
    expect(area.walkable(0.3, helmZ, wh.floorY)).toBe(true);
    expect(area.walkable(0, treadZ, wh.floorY - 0.2)).toBe(true);
    expect(area.walkable(0, salZ, wh.floorY - 0.4)).toBe(true);
    expect(area.walkable(0, salZ, wh.floorY)).toBe(false); // no floor at the helm's height there
    // Each step no more than a body steps up.
    expect(0.2).toBeLessThan(STEP_HEIGHT);
    // Out through the aft doorway at the saloon's floor.
    expect(area.walkable(0, wh.aft - 0.1, wh.floorY - 0.4)).toBe(true);
  });

  it('is drawn: its floor at the saloon’s height, the treads up to the wheelhouse’s', () => {
    useDesign(WB);
    const def = VESSEL_DEFS.design;
    const wh = def.layout.wheelhouse!;
    const house = buildVesselMeshParts(def.hull, def.layout, def.exhaust?.position, def.livery).house!;
    const pos = house.geometry.getAttribute('position');
    const topsAt = (y: number, z0: number, z1: number) => {
      let n = 0;
      for (let i = 0; i < pos.count; i += 3) {
        const tri = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, i + k));
        if (tri.every((v) => Math.abs(v.y - y) < 0.005 && v.z > z0 - 0.01 && v.z < z1 + 0.01 && Math.abs(v.x) < wh.halfWidth)) n++;
      }
      return n;
    };
    const [tread, saloon] = wh.levels!;
    expect(topsAt(saloon.y, saloon.z0, saloon.z1)).toBeGreaterThan(0);
    expect(topsAt(tread.y, tread.z0, tread.z1)).toBeGreaterThan(0);
  });

  it('every hull type takes one, floating level and stable; no lower than her hull allows', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      const b = useDesign(type(hull, { saloon: 3, saloonFloor: 3 }));
      const wh = b.hull.layout.wheelhouse!;
      const h = uprightHydrostatics(VESSEL_DEFS.design);
      expect(Math.abs(h.sinkage), `hull ${hull}`).toBeLessThan(0.02);
      expect(h.gmt, `hull ${hull}`).toBeGreaterThan(0.5);
      expect(houseFloorAt(wh, wh.aft), `hull ${hull}`).toBeLessThanOrEqual(wh.floorY);
      for (const lv of wh.levels ?? []) expect(Number.isFinite(lv.y)).toBe(true);
    }
  });

  it('with a deckhouse under it, the saloon floor stays on the deckhouse', () => {
    const b = buildDesign(type(3, { dhLength: 3, floor: 3, saloon: 3, saloonFloor: 3 }));
    const wh = b.hull.layout.wheelhouse!;
    const dh = b.hull.layout.deckhouse!;
    expect(houseFloorAt(wh, wh.aft)).toBeGreaterThanOrEqual(dh.top);
    expect(b.warnings.some((w) => w.includes('saloon'))).toBe(true);
  });

  it('left off, and said, where her deck has no room for it', () => {
    const b = buildDesign(type(0, { houseLength: 15, saloon: 8 }));
    expect(b.warnings.some((w) => w.includes('saloon'))).toBe(true);
  });
});
