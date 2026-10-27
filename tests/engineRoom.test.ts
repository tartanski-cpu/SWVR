/**
 * The engine room (src/app/engineRoom/; owner, 27 Oct 2026: a detailed engine room drawn only
 * while you're below, in the same page; the harbour tug and the stern trawler first). Where
 * one fits, worked out from her own hull and engines: the tug and the trawler (and the dive
 * ship, on the trawler's hull) have one; the smaller boats keep their hatch. The room stands
 * clear of her plating, has standing headroom, takes her engines with a walkway round them,
 * and its ladder comes down beside an engine, not on it; its floor is walked round them.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { DESIGN_HULLS, HARBOUR_TUG, withFixed } from '../src/shipyard/parts/catalog';
import { designToken } from '../src/shipyard/designDoc';
import { boatType } from '../src/boats/library';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { engineRoomPlan, insideHalf } from '../src/app/engineRoom/plan';
import { roomEngines } from '../src/app/engineRoom/engines';
import { roomWalkArea } from '../src/app/engineRoom/walk';
import { tugLayout } from '../src/app/engineRoom/tug/layout';
import { alarms } from '../src/app/engineRoom/tug/panels';
import { createVesselState } from '../src/vessel/vesselState';

const typeId = (hull: number) => boatType(designToken(withFixed({ ...DEFAULT_DESIGN, ...(DESIGN_HULLS[hull].defaults ?? {}), hull })))!;
const STERN_TRAWLER = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Stern trawler'));

describe('engine rooms', () => {
  it('the harbour tug and the stern trawler have one; the smaller boats keep their hatch', () => {
    DESIGN_HULLS.forEach((_h, i) => {
      const id = typeId(i);
      const room = engineRoomPlan(VESSEL_DEFS[id], roomEngines(id));
      expect(!!room, DESIGN_HULLS[i].name).toBe(i === HARBOUR_TUG || i === STERN_TRAWLER);
    });
  });

  for (const [name, hull] of [['harbour tug', HARBOUR_TUG], ['stern trawler', STERN_TRAWLER]] as const) {
    it(`the ${name}'s: standing room, inside her plating, her engines in it with a walkway, the ladder beside them`, () => {
      const id = typeId(hull);
      const def = VESSEL_DEFS[id];
      const engines = roomEngines(id);
      const r = engineRoomPlan(def, engines)!;
      const c = CONFIG.engineRoom;
      expect(engines.length).toBe(hull === HARBOUR_TUG ? 2 : 1);
      expect(r.deckhead - r.sole).toBeGreaterThanOrEqual(c.headroomM - 1e-6);
      expect(r.z1 - r.z0).toBeGreaterThanOrEqual(c.minLengthM);
      // Inside her: at each end and the middle, her plating is outboard of the room's side at the floor.
      for (const z of [r.z0, (r.z0 + r.z1) / 2, r.z1]) expect(insideHalf(def.hull, z, r.sole + 0.02)).toBeGreaterThanOrEqual(r.halfWidth + c.liningM - 1e-6);
      for (const e of engines) expect(Math.abs(e.x) + e.size[1] / 2 + c.walkwayM).toBeLessThanOrEqual(r.halfWidth + 1e-6);
      // The ladder's foot on a walkway, clear of every engine.
      for (const e of engines) expect(Math.abs(r.ladder.x - e.x)).toBeGreaterThanOrEqual(e.size[1] / 2);
      const walk = roomWalkArea(r);
      expect(walk.walkable(r.ladder.x, r.ladder.z, r.sole)).toBe(true);
      // Its floor: walked beside an engine, not through it; nothing outside the room.
      const e = engines[0];
      const midZ = e.flangeZ - e.size[0] / 2;
      expect(walk.walkable(e.x, midZ, r.sole)).toBe(false);
      expect(walk.insideSolid(e.x, e.flangeY, midZ)).toBe(true);
      expect(walk.floorsAt(r.halfWidth + 0.5, midZ)).toEqual([]);
    });
  }

  it("the tug's in detail: an engine control room forward to port, her machinery round her engines, and a way through it all", () => {
    const id = typeId(HARBOUR_TUG);
    const r = engineRoomPlan(VESSEL_DEFS[id], roomEngines(id))!;
    // Her room's longer (a big boat's): room forward of her engines for the control room.
    expect(r.z1 - r.z0).toBeGreaterThan(9.5);
    const t = tugLayout(r)!;
    expect(t.ecr).not.toBeNull();
    expect(t.gensets).toHaveLength(2);
    expect(t.dayTanks).toHaveLength(2);
    expect(t.receivers).toHaveLength(2);
    const walk = roomWalkArea(r, t.solids);
    // Where you arrive, the ladder's foot, the aisle, through the door and into the control room.
    const at = (x: number, z: number) => walk.walkable(x, z, r.sole);
    expect(at(r.ladder.x, r.ladder.z)).toBe(true);
    expect(at(r.ladder.x, Math.max(r.z0 + 0.6, r.ladder.z - 1.2))).toBe(true);
    const ecr = t.ecr!;
    const doorZ = (ecr.door[0] + ecr.door[1]) / 2;
    for (let x = r.ladder.x; x > ecr.x0 + 0.6; x -= 0.2) expect(at(x, doorZ), `x ${x.toFixed(1)}`).toBe(true);
    // Not through its walls, nor into the switchboard or the gensets.
    expect(at(ecr.x1, ecr.door[0] - 0.3)).toBe(false);
    expect(at(ecr.x0 + 1, ecr.z0 + 0.2)).toBe(false);
    expect(at(t.gensets[0].x, (t.gensets[0].z0 + t.gensets[0].z1) / 2)).toBe(false);
  });

  it("the tug's alarm screen lists what's wrong from her state", () => {
    const v = createVesselState('v', 'workboat');
    expect(alarms(v)).toEqual([]);
    v.engine.coolantC = 101;
    v.engine.key = 1;
    v.engine.phase = 'off';
    const list = alarms(v).map((a) => a.text);
    expect(list.some((x) => /JACKET WATER TEMP HIGH/.test(x))).toBe(true);
    expect(list.some((x) => /LUB OIL PRESSURE LOW/.test(x))).toBe(true);
  });
});
