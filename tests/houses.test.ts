/**
 * Parametric boats P2a: her houses as a list. The helm's house is `layout.wheelhouse`; more
 * houses (`layout.houses`) are walked, drawn, kept off the deck, solid in their walls and
 * shelter the deck cut beneath them, as the helm's is. Today's boats have one house and came
 * out identical (checked when P2a was built: PROGRESS.md); here a landing craft is given a
 * second house on her foredeck, which no boat has yet.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { fillerPoints } from '../src/fuel/fuelHose';
import { hullPlan, vesselWalkArea, STEP_HEIGHT } from '../src/vessel/layout';
import { housesOf, VESSEL_DEFS, type VesselDef, type WheelhouseLayout } from '../src/vessel/vesselDef';
import { buildVesselMesh, sunkenHouses } from '../src/vessel/view/hullMesh';
import { fakeCanvas } from './modular/fakes';

beforeAll(fakeCanvas);

const lc = VESSEL_DEFS.landingCraft;
const plan = hullPlan(lc);
/** A small house on her foredeck: floor `sunk` below the deck's highest under it (her deck rises forward), no console. */
function foreHouse(sunk = 0): WheelhouseLayout {
  const deck = Math.max(plan.deckY(-3.2), plan.deckY(-1.2));
  return { ...lc.layout.wheelhouse!, front: -3.2, aft: -1.2, halfWidth: 0.6, floorY: deck - sunk, roofY: deck - sunk + 2.1, consoleDepth: 0, frontRakeDeg: 0, shape: undefined, steps: undefined, sideDoor: undefined };
}
const withHouse = (h: WheelhouseLayout): VesselDef => ({ ...lc, layout: { ...lc.layout, houses: [h] } });

describe('houses as a list', () => {
  it('her houses are the helm’s first, then the others', () => {
    expect(housesOf(lc.layout)).toEqual([lc.layout.wheelhouse]);
    const def = withHouse(foreHouse());
    expect(housesOf(def.layout).map((h) => h.front)).toEqual([lc.layout.wheelhouse!.front, -3.2]);
    expect(housesOf({})).toEqual([]);
  });

  it('a second house is walked: its floor inside, out through its own door, no deck under it, its walls solid', () => {
    const h = foreHouse();
    const area = vesselWalkArea(withHouse(h), withHouse(h).layout, []);
    const deck = plan.deckY(-2.2);
    // Inside: its floor, not the deck.
    expect(area.floorsAt(0, -2.2)).toEqual([h.floorY]);
    // Beside it (between it and the deck's edge margin): the deck as before.
    const x = (h.halfWidth + lc.layout.bodyRadius + plan.halfBeam(-2.2) - lc.layout.deckEdgeMargin) / 2;
    expect(area.floorsAt(x, -2.2)).toEqual([deck]);
    // Out through its aft door, onto the deck.
    expect(area.walkable(0, h.aft - 0.05, h.floorY)).toBe(true);
    expect(area.walkable(0, h.aft + 0.3, h.floorY)).toBe(true);
    // Its side wall at chest height is solid; its window band is open; standing inside is not.
    expect(area.insideSolid(h.halfWidth - 0.02, h.floorY + 0.5, -2.2)).toBe(true);
    expect(area.insideSolid(h.halfWidth - 0.02, h.floorY + h.windowSill + 0.3, -2.2)).toBe(false);
    expect(area.insideSolid(0, h.floorY + 1.6, -2.2)).toBe(false);
    // No console: you can walk right up to its front wall.
    expect(area.walkable(0, h.front + h.wall + 0.25, h.floorY)).toBe(true);
    // The helm's house walks as before.
    const helm = lc.layout.wheelhouse!;
    expect(area.floorsAt(0, (helm.front + helm.aft) / 2 + 0.6)).toEqual(vesselWalkArea(lc, lc.layout, []).floorsAt(0, (helm.front + helm.aft) / 2 + 0.6));
    // Its roof has no ladder: not walked.
    expect(area.floorsAt(0, -2.2)).not.toContain(h.roofY + lc.layout.roof!.thickness);
    expect(STEP_HEIGHT).toBeGreaterThan(0);
  });

  it('a second house is drawn: more of her, its roof over the foredeck', () => {
    const plain = buildVesselMesh(lc.hull, lc.layout, lc.exhaust?.position, lc.livery);
    const def = withHouse(foreHouse());
    const two = buildVesselMesh(def.hull, def.layout, def.exhaust?.position, def.livery);
    const count = (m: THREE.Mesh) => m.geometry.getAttribute('position').count;
    expect(count(two)).toBeGreaterThan(count(plain) + 200);
    // Something drawn at its roof's height over the foredeck, where there was nothing.
    const hits = (m: THREE.Mesh) => {
      const p = m.geometry.getAttribute('position');
      let n = 0;
      // (A box roof has its corners only at its ends, past the walls by its overhang.)
      for (let i = 0; i < p.count; i++) if (p.getZ(i) < -0.9 && p.getZ(i) > -3.5 && Math.abs(p.getY(i) - foreHouse().roofY) < 0.12) n++;
      return n;
    };
    expect(hits(plain)).toBe(0);
    expect(hits(two)).toBeGreaterThan(8);
  });

  it('a second house sunk below the deck has the deck cut away under it', () => {
    expect(sunkenHouses(lc.hull, withHouse(foreHouse()).layout).map((c) => c.house)).toEqual(sunkenHouses(lc.hull, lc.layout).map((c) => c.house));
    const cuts = sunkenHouses(lc.hull, withHouse(foreHouse(0.4)).layout);
    const fore = cuts.find((c) => c.house === 1)!;
    expect(fore).toMatchObject({ helm: false, front: -3.2, aft: -1.2 });
    expect(fore.halfWidth(-2)).toBe(0.6);
  });

  it('the fuel fillers go aft of her aftmost house', () => {
    const aftHouse = { ...foreHouse(), front: 3.5, aft: 4.3 };
    const [, , z] = fillerPoints(withHouse(aftHouse))[0];
    expect(z).toBeGreaterThan(fillerPoints(lc)[0][2]);
  });
});
