/**
 * Parametric boats P2b, second stop: the saloon's own, lower roof (a step in the roofline at
 * the wheelhouse's aft end, the raised pilothouse look), and the roof's top in a second colour
 * (the eyebrow). The saloon's windows come down with its roof; it never goes so low its
 * headroom is under the doorway's or its windows too shallow; what's hung from the roof in
 * the saloon hangs from its own.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS, ROOF_TOPS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { vesselWalkArea } from '../../src/vessel/layout';
import { houseFloorAt, houseRoofAt, VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });
/** The workboat, her wheelhouse floor raised a step, a 2.8 m saloon two steps down under a roof two steps lower. */
const WB = type(2, { floor: 4, saloon: 4, saloonFloor: 2, saloonRoof: 2 });

describe("the saloon's own roof", () => {
  it('is in her code (version 25), with the roof top, both ways; a design without them reads as before', () => {
    const d = { ...WB, roofTop: 3 };
    expect(decodeDesign(encodeDesign(d))).toEqual({ design: d });
    const plain = type(2, { saloon: 4, saloonFloor: 2 });
    expect(encodeDesign({ ...plain, saloonRoof: 0, roofTop: 0 })).toBe(encodeDesign(plain));
  });

  it('two steps lower: its underside 0.4 m below the wheelhouse’s, aft of the step at the wheelhouse’s aft end', () => {
    const plain = buildDesign(type(2, { floor: 4, saloon: 4, saloonFloor: 2 })).hull.layout.wheelhouse!;
    const wh = buildDesign(WB).hull.layout.wheelhouse!;
    expect(plain.saloonRoof).toBeUndefined();
    expect(wh.saloonRoof!.y).toBeCloseTo(wh.roofY - 0.4, 3);
    // The step is where the treads down to the saloon begin.
    expect(wh.saloonRoof!.z).toBeCloseTo(wh.levels![0].z0, 2);
    expect(houseRoofAt(wh, wh.saloonRoof!.z - 0.1)).toBe(wh.roofY);
    expect(houseRoofAt(wh, wh.aft - 0.1)).toBe(wh.saloonRoof!.y);
    // Floor and roof both two steps down: the saloon keeps the wheelhouse's headroom.
    expect(houseRoofAt(wh, wh.aft) - houseFloorAt(wh, wh.aft)).toBeCloseTo(wh.roofY - wh.floorY, 3);
    // A little lighter: its side walls are shorter.
    expect(buildDesign(WB).weights.massKg).toBeLessThan(buildDesign(type(2, { floor: 4, saloon: 4, saloonFloor: 2 })).weights.massKg);
  });

  it('never so low its headroom is under the doorway’s: with a level floor and little headroom it stays up, and says so', () => {
    const b = buildDesign(type(2, { headroom: 0, saloon: 4, saloonFloor: 0, saloonRoof: 3 }));
    const wh = b.hull.layout.wheelhouse!;
    expect(wh.saloonRoof).toBeUndefined();
    expect(b.warnings.some((w) => w.includes("saloon's roof"))).toBe(true);
    // Room for one step lower with a step down in its floor.
    const c = buildDesign(type(2, { headroom: 0, saloon: 4, saloonFloor: 1, saloonRoof: 3 })).hull.layout.wheelhouse!;
    const head = houseRoofAt(c, c.aft) - houseFloorAt(c, c.aft);
    expect(head).toBeGreaterThanOrEqual(c.doorHeight + 0.1 - 1e-6);
  });

  it('is walked as the house it is: the saloon roof solid where it is, open above it, the window band lower', () => {
    useDesign(WB);
    const def = VESSEL_DEFS.design;
    const wh = def.layout.wheelhouse!;
    const area = vesselWalkArea(def, def.layout, []);
    const salZ = (wh.levels![1].z0 + wh.aft) / 2;
    const sr = wh.saloonRoof!;
    const t = def.layout.roof!.thickness;
    expect(area.insideSolid(0, sr.y + t / 2, salZ)).toBe(true); // in the saloon's roof
    expect(area.insideSolid(0, sr.y - 0.3, salZ)).toBe(false); // standing room under it
    expect(area.insideSolid(0, sr.y + t + 0.1, salZ)).toBe(false); // above it, outside
    expect(area.insideSolid(0, sr.y + t / 2, sr.z - 0.3)).toBe(false); // the wheelhouse's still high there
    // In the side wall: the saloon's window band is open up to under its roof, the wall above it solid.
    const x = wh.halfWidth - wh.wall / 2;
    expect(area.insideSolid(x, sr.y - 0.2, salZ)).toBe(false);
    expect(area.insideSolid(x, sr.y - 0.2, sr.z - 0.6)).toBe(false); // the wheelhouse's band goes higher
  });

  it('hangs the pull-down whiteboard from the saloon’s roof', () => {
    const b = buildDesign({ ...WB, controls: 1 });
    const wh = b.hull.layout.wheelhouse!;
    const board = b.hull.sockets.find((s) => s.id === 'whiteboard')!.transform.position;
    expect(board[1]).toBeCloseTo(wh.saloonRoof!.y, 3);
  });

  it('is drawn: the house tops out at the saloon roof aft of the step, the wheelhouse’s higher forward', () => {
    useDesign(WB);
    const def = VESSEL_DEFS.design;
    const wh = def.layout.wheelhouse!;
    const t = def.layout.roof!.thickness;
    const house = buildVesselMeshParts(def.hull, def.layout, def.exhaust?.position, def.livery).house!;
    const pos = house.geometry.getAttribute('position');
    let aftTop = -Infinity;
    let fwdTop = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (Math.abs(v.x) > wh.halfWidth + def.layout.roof!.overhang + 0.01) continue; // the house and its roof's overhang
      // Aft of the wheelhouse roof's overhang past the step: only the saloon's; forward of the step: the wheelhouse's.
      if (v.z > wh.saloonRoof!.z + def.layout.roof!.overhang + 0.05) aftTop = Math.max(aftTop, v.y);
      else if (v.z < wh.saloonRoof!.z - 0.1) fwdTop = Math.max(fwdTop, v.y);
    }
    expect(aftTop).toBeCloseTo(wh.saloonRoof!.y + t, 2);
    expect(fwdTop).toBeCloseTo(wh.roofY + t, 2);
  });

  it('every hull type takes one, floating level and stable', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      const b = useDesign(type(hull, { saloon: 3, saloonFloor: 3, saloonRoof: 3 }));
      const h = uprightHydrostatics(VESSEL_DEFS.design);
      expect(Math.abs(h.sinkage), `hull ${hull}`).toBeLessThan(0.02);
      expect(h.gmt, `hull ${hull}`).toBeGreaterThan(0.5);
      const wh = b.hull.layout.wheelhouse!;
      if (wh.saloonRoof) expect(wh.saloonRoof.y).toBeLessThan(wh.roofY);
    }
  });
});

describe("the roof's top in a second colour (the eyebrow)", () => {
  it('drawn as a panel set in from the roof top’s edges, in its colour, on both roofs', () => {
    const colourCount = (d: ShipDesign, colour: number) => {
      const b = useDesign(d);
      const def = VESSEL_DEFS.design;
      const house = buildVesselMeshParts(def.hull, def.layout, def.exhaust?.position, def.livery).house!;
      const col = house.geometry.getAttribute('color');
      const pos = house.geometry.getAttribute('position');
      const c = new THREE.Color(colour);
      const tops: number[] = [];
      for (let i = 0; i < col.count; i++) {
        if (Math.abs(col.getX(i) - c.r) < 0.01 && Math.abs(col.getY(i) - c.g) < 0.01 && Math.abs(col.getZ(i) - c.b) < 0.01) tops.push(pos.getY(i));
      }
      return { b, tops };
    };
    const grey = ROOF_TOPS[1].colour!;
    expect(colourCount({ ...WB, roofTop: 0 }, grey).tops.length).toBe(0);
    const { b, tops } = colourCount({ ...WB, roofTop: 1 }, grey);
    const wh = b.hull.layout.wheelhouse!;
    const t = b.hull.layout.roof!.thickness;
    // Its vertices on top of each roof, and only there.
    expect(tops.length).toBeGreaterThan(0);
    for (const y of tops) expect(Math.min(Math.abs(y - (wh.roofY + t)), Math.abs(y - (wh.roofY + t + 0.02)), Math.abs(y - (wh.saloonRoof!.y + t)), Math.abs(y - (wh.saloonRoof!.y + t + 0.02)))).toBeLessThan(0.003);
    expect(tops.some((y) => Math.abs(y - (wh.saloonRoof!.y + t + 0.02)) < 0.003)).toBe(true);
    expect(CONFIG.shipyard.saloon.roofInset).toBeGreaterThan(0);
  });
});
