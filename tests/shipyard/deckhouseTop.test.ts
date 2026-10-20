/**
 * Parametric boats P2b, fourth stop (owner): a pilothouse raised on a walkable deckhouse. The
 * deckhouse's top walked (design.dhWalk): a deck round the wheelhouse, a rail along its edge,
 * a ladder up from the main deck (on its aft face beside the house if there's room, else up
 * its front), and a side door in the wheelhouse can open onto it.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { deckhouseHalfWidth, deckhouseLadderZone } from '../../src/vessel/deckhouse';
import { vesselWalkArea } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const PILOT = 3;
const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, dhLength: 2, dhHeight: 1, dhWidth: 0, dhRake: 0, dhNarrow: 0, ...more });
// A narrower wheelhouse on a deckhouse out to her sides: a walk beside it, the ladder aft.
const wide = type(PILOT, { houseWidth: 0.7, dhWalk: 1 });

describe('the walked deckhouse top', () => {
  it('travels as a link or file (not in the short code); not walked is as before', () => {
    expect(DEFAULT_DESIGN.dhWalk).toBe(0);
    expect(shortCode(wide)).toBeNull();
    expect(readDesign(designToken(wide))).toMatchObject({ design: wide, warnings: [] });
    expect(buildDesign(type(PILOT)).hull.layout.deckhouse!.walk).toBeUndefined();
    const none = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[PILOT].defaults, hull: PILOT, dhLength: 0, dhWalk: 1 });
    expect(none.warnings.join(' ')).toMatch(/needs a deckhouse/);
  });

  it('a ladder aft beside a narrower house, up the front beside a wide one; its rail and ladder weighed and priced', () => {
    const plain = buildDesign(type(PILOT, { houseWidth: 0.7 }));
    const b = buildDesign(wide);
    const dh = b.hull.layout.deckhouse!;
    const hw = b.hull.layout.wheelhouse!.halfWidth;
    expect(b.warnings).toEqual([]);
    expect(dh.walk!.ladder.face).toBe('aft');
    expect(dh.walk!.ladder.x - dh.walk!.ladder.width / 2).toBeGreaterThan(hw);
    expect(dh.walk!.ladder.x + dh.walk!.ladder.width / 2).toBeLessThan(deckhouseHalfWidth(dh, dh.z1));
    expect(b.weights.items.find((it) => it.name === 'Deckhouse rail and ladder')!.kg).toBeGreaterThan(20);
    expect(b.figures.price).toBeGreaterThan(plain.figures.price);
    const full = buildDesign(type(PILOT, { dhWalk: 1 })).hull.layout.deckhouse!;
    expect(full.walk!.ladder.face).toBe('front');
    // A raked front: the flat top starts aft of the rake.
    const raked = buildDesign(type(PILOT, { dhWalk: 1, dhRake: 40 })).hull.layout.deckhouse!;
    expect(raked.walk!.z0).toBeGreaterThan(raked.z0 + 0.5);
  });

  it('is walked: on top round the house, up its ladder from the deck, not off its edge', () => {
    useDesign(wide);
    const def = VESSEL_DEFS.design;
    const dh = def.layout.deckhouse!;
    const wh = def.layout.wheelhouse!;
    const area = vesselWalkArea(def, def.layout, []);
    // Forward of the wheelhouse, on the centreline: the top.
    const zf = (dh.walk!.z0 + wh.front) / 2;
    expect(area.floorsAt(0, zf)).toContain(dh.top);
    expect(area.walkable(0, zf, dh.top)).toBe(true);
    // Beside the house, on the strip.
    const xs = (wh.halfWidth + deckhouseHalfWidth(dh, 0)) / 2;
    expect(area.walkable(xs, 0, dh.top)).toBe(true);
    // Not past its rail, nor inside the house's walls.
    expect(area.walkable(deckhouseHalfWidth(dh, 0) - 0.05, 0, dh.top)).toBe(false);
    expect(area.walkable(0, wh.front + 0.02, dh.top)).toBe(false);
    // The ladder: walked into from the deck, climbed from the deck to the top, its landing on top.
    const lz = deckhouseLadderZone(dh)!;
    const lx = (lz.x0 + lz.x1) / 2;
    const ladder = area.ladderAt(lx, (lz.z0 + lz.z1) / 2)!;
    expect(ladder).not.toBeNull();
    expect(ladder.top).toBeCloseTo(dh.top, 3);
    expect(ladder.bottom).toBeLessThan(dh.top - 0.8);
    expect(area.walkable(lx, dh.z1 - 0.1, dh.top)).toBe(true);
    // The deck aft of it, still walked as before.
    expect(area.walkable(lx, lz.z1 + 0.3, area.floorsAt(lx, lz.z1 + 0.3)[0])).toBe(true);
  });

  it('a side door in the wheelhouse opens onto it, and its doorway meets the top', () => {
    const b = buildDesign({ ...wide, sideDoor: 1 });
    const sd = b.hull.layout.wheelhouse!.sideDoor!;
    expect(sd).toBeDefined();
    expect(b.warnings).toEqual([]);
    useDesign({ ...wide, sideDoor: 1 });
    const def = VESSEL_DEFS.design;
    const dh = def.layout.deckhouse!;
    const wh = def.layout.wheelhouse!;
    const area = vesselWalkArea(def, def.layout, []);
    const z = (sd.z0 + sd.z1) / 2;
    // Walk out of the doorway (port) onto the top: every few centimetres outward is walkable from the last.
    let y = wh.floorY;
    for (let x = -(wh.halfWidth - 0.3); x > -(wh.halfWidth + 0.4); x -= 0.05) {
      expect(area.walkable(x, z, y)).toBe(true);
      y = Math.max(...area.floorsAt(x, z).filter((f) => f <= y + 0.4));
    }
    expect(y).toBeCloseTo(dh.top, 3);
    // Without a walked top, as before: left off.
    expect(buildDesign({ ...wide, dhWalk: 0, sideDoor: 1 }).warnings.join(' ')).toMatch(/isn’t walked/);
  });

  it('is drawn: its rail on posts round the top, and the ladder', () => {
    useDesign(wide);
    const def = VESSEL_DEFS.design;
    const dh = def.layout.deckhouse!;
    const plain = buildDesign(type(PILOT, { houseWidth: 0.7 }));
    useDesign(type(PILOT, { houseWidth: 0.7 }));
    const before = buildVesselMeshParts(VESSEL_DEFS.design.hull, VESSEL_DEFS.design.layout).house!.geometry.getAttribute('position').count;
    expect(plain.hull.layout.deckhouse!.walk).toBeUndefined();
    useDesign(wide);
    const house = buildVesselMeshParts(def.hull, def.layout).house!;
    const pos = house.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(before);
    // Something at rail height over the top, near its edge forward of the house.
    let railTop = false;
    const zf = (dh.walk!.z0 + def.layout.wheelhouse!.front) / 2;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (Math.abs(v.y - (dh.top + dh.walk!.railHeight)) < 0.05 && Math.abs(v.z - zf) < 1 && Math.abs(Math.abs(v.x) - deckhouseHalfWidth(dh, v.z)) < 0.15) railTop = true;
    }
    expect(railTop).toBe(true);
  });
});
