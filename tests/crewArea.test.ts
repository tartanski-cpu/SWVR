/**
 * The harbour tug's crew area (owner, 29 Oct 2026: "a detailed interior for the big tug's crew
 * area ... loads as a separate space"; "two decks, if you can make it work"; app/engineRoom/crew/):
 * where it fits (her deckhouse, her hull, her engine room), its rooms, and walking through it
 * from the door down the stair into every room.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { DESIGN_HULLS, HARBOUR_TUG, withFixed } from '../src/shipyard/parts/catalog';
import { designToken } from '../src/shipyard/designDoc';
import { boatType } from '../src/boats/library';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { hullPlan, STEP_HEIGHT } from '../src/vessel/layout';
import { crewAreaFor, roomFor } from '../src/app/engineRoom';
import { crewLayout, doorway, type CrewLayout } from '../src/app/engineRoom/crew/layout';
import { crewWalkArea } from '../src/app/engineRoom/crew/walk';
import { FLEET_IDS } from '../src/boats/fleet';

const typeId = (hull: number) => boatType(designToken(withFixed({ ...DEFAULT_DESIGN, ...(DESIGN_HULLS[hull].defaults ?? {}), hull })))!;
const tug = typeId(HARBOUR_TUG);
const STERN_TRAWLER = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Stern trawler'));

/** Walk (x, z) at floor y: may stand there. */
function standsAt(l: CrewLayout, x: number, y: number, z: number): boolean {
  const w = crewWalkArea(l);
  return w.walkable(x, z, y) && w.floorsAt(x, z).some((f) => Math.abs(f - y) < 0.02);
}

describe('the crew area', () => {
  it('the harbour tug has one, both decks: the main deck in her deckhouse, the lower deck forward of her engine room; no other boat does', () => {
    const plan = crewAreaFor(tug)!;
    expect(plan).toBeTruthy();
    const dh = VESSEL_DEFS[tug].layout.deckhouse!;
    const M = plan.main;
    expect(M.z0).toBeGreaterThan(dh.z0);
    expect(M.z1).toBeLessThan(dh.z1);
    expect(M.deckhead - M.floor).toBeGreaterThanOrEqual(2.0);
    expect(2 * M.halfWidth).toBeGreaterThan(7);
    const L = plan.lower!;
    expect(L).toBeTruthy();
    expect(L.z1).toBeLessThanOrEqual(roomFor(tug)!.z0);
    expect(L.deckhead - L.floor).toBeGreaterThanOrEqual(2.0);
    expect(L.deckhead).toBeLessThan(M.floor);
    expect(L.z1 - L.z0).toBeGreaterThan(5);
    // Its door in the house's aft face, on the deck outside, clear of the outside stair.
    expect(plan.door.z).toBeCloseTo(M.z1, 5);
    expect(Math.abs(plan.door.deck - hullPlan(VESSEL_DEFS[tug]).deckY(dh.z1 + 0.4))).toBeLessThan(0.01);
    for (const st of dh.walk?.stair ?? []) if (st.y < dh.top - 0.05) expect(Math.max(st.x0, st.x1) < plan.door.x - 0.4 || Math.min(st.x0, st.x1) > plan.door.x + 0.4).toBe(true);
    // The stern trawler (a smaller house, no deckhouse) and the fleet have none.
    expect(crewAreaFor(typeId(STERN_TRAWLER))).toBeNull();
    for (const id of FLEET_IDS) expect(crewAreaFor(id), id).toBeNull();
  });

  it('its stair joins the decks a step at a time (drawn), walked as a slope', () => {
    const l = crewLayout(crewAreaFor(tug)!);
    const ys = [l.plan.main.floor, ...l.steps.map((s) => s.y), l.plan.lower!.floor];
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1] - ys[i]).toBeLessThanOrEqual(STEP_HEIGHT - 0.1);
    for (let i = 1; i < l.steps.length; i++) expect(l.steps[i].z1).toBeCloseTo(l.steps[i - 1].z0, 5);
    // Wide enough to pass on: about a metre between its walls.
    expect(l.plan.stair!.width).toBeGreaterThanOrEqual(1.0);
  });

  it('every room has its things, and nothing stands in a wall or another thing', () => {
    const l = crewLayout(crewAreaFor(tug)!);
    for (const k of ['settee', 'table', 'tv', 'chart', 'cooker', 'sink', 'fridge', 'bootRack', 'oilskins', 'lifejackets', 'berth', 'bunk', 'desk', 'wardrobe', 'shower', 'wc', 'basin', 'washer', 'shelves'] as const) expect(l.pieces.some((p) => p.kind === k), k).toBe(true);
    for (const plate of ['MESS', 'GALLEY', 'MASTER', 'CREW', 'WC', 'LAUNDRY']) expect(doorway(l, plate), plate).toBeTruthy();
    const solid = l.pieces.filter((p) => p.solid);
    const over = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }) => a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.z0 < b.z1 - 0.01 && b.z0 < a.z1 - 0.01;
    for (const p of solid) {
      const deck = l.decks[p.deck]!;
      expect(p.x0 >= -deck.halfWidth - 0.01 && p.x1 <= deck.halfWidth + 0.01 && p.z0 >= deck.z0 - 0.01 && p.z1 <= deck.z1 + 0.01, `${p.kind} on her ${p.deck} deck`).toBe(true);
      for (const w of l.walls.filter((w) => w.deck === p.deck)) expect(over(p, w), `${p.kind} in a wall`).toBe(false);
      for (const q of solid) if (q !== p && q.deck === p.deck) expect(over(p, q), `${p.kind} in the ${q.kind}`).toBe(false);
    }
  });

  it('you walk in at the door, through the lobby, down the stair, into each cabin, the washroom and the laundry; not through walls', () => {
    const l = crewLayout(crewAreaFor(tug)!);
    const M = l.plan.main;
    const L = l.plan.lower!;
    const S = l.plan.stair!;
    const [ix, iy, iz] = l.inside;
    expect(standsAt(l, ix, iy, iz)).toBe(true);
    // Each doorway: walkable through its middle, on its deck.
    for (const d of l.doorways) {
      const y = d.deck === 'main' ? M.floor : L.floor;
      const c = (d.from + d.to) / 2;
      for (const off of [-0.3, 0.3]) expect(standsAt(l, d.along === 'x' ? c : d.at + off, y, d.along === 'x' ? d.at + off : c), `${d.plate} doorway`).toBe(true);
    }
    // The corridor from the lobby to the stair head; down the stair, a smooth slope, across its
    // whole width (owner: the handrails aren't in the way); the corridor at its foot.
    expect(standsAt(l, 0, M.floor, S.zTop + 0.3)).toBe(true);
    const w = crewWalkArea(l);
    let was = M.floor;
    for (let z = S.zTop; z >= S.zFoot - S.tread; z -= 0.05) {
      const y = Math.max(...w.floorsAt(0, z).filter((f) => f <= was + 0.05));
      expect(was - y, `a step at z ${z.toFixed(2)}`).toBeLessThan(0.05);
      for (const x of [-0.4, 0, 0.4]) expect(w.walkable(x, z, y), `on the stair at x ${x}, z ${z.toFixed(2)}`).toBe(true);
      was = y;
    }
    // And a step beyond its foot, on the lower deck's floor (the slope ends on it).
    expect(Math.max(...w.floorsAt(0, S.zFoot - S.tread - 0.05).filter((f) => f <= was + 0.05))).toBeCloseTo(L.floor, 5);
    expect(was - L.floor).toBeLessThan(0.05);
    expect(standsAt(l, 0, L.floor, S.zFoot - 0.5)).toBe(true);
    // Doorways are passed off their middle too.
    for (const d of l.doorways) {
      const y = d.deck === 'main' ? M.floor : L.floor;
      const c = (d.from + d.to) / 2;
      for (const off of [-0.25, 0.25]) expect(standsAt(l, c + off, y, d.at), `${d.plate} doorway at ${off}`).toBe(true);
    }
    // The corridor doorway into the stair passage, a hand's breadth off its middle.
    expect(standsAt(l, 0.35, M.floor, doorway(l, 'MESS')!.at)).toBe(true);
    // A partition is solid away from its doorways.
    const lobbyWall = doorway(l, 'MESS')!;
    expect(crewWalkArea(l).walkable(-M.halfWidth + 0.5, lobbyWall.at, M.floor)).toBe(false);
    // Under the main deck (the cabins): the lower deck there, not the main floor.
    expect(crewWalkArea(l).floorsAt(-2.5, S.zFoot + 1.2)).toEqual(expect.arrayContaining([M.floor, L.floor]));
    // Not under the stair on the lower deck.
    expect(crewWalkArea(l).walkable(0, (S.zFoot + S.zTop) / 2, L.floor)).toBe(false);
    // Nor through the stair's side walls from the stair.
    expect(crewWalkArea(l).walkable(0.75, (S.zFoot + S.zTop) / 2, (M.floor + L.floor) / 2)).toBe(false);
  });
});
