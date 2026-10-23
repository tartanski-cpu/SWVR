/**
 * The deckhouse run on aft of the wheelhouse (owner, Oct 2026, on the stern trawler: "the option
 * to extend the deck house further aft of the wheelhouse ... ladders or stairs to get you up there
 * if it's high"; design.dhAft), up to 2.5 m high ("high enough to go over the bridge"): its top a
 * deck the wheelhouse's aft door opens onto, a rail round it, a ladder down its aft face to the
 * working deck; the trawl gear kept aft of it. And her raised foredeck can come back further.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, SCALES, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { deckhouseLadderZone } from '../../src/vessel/deckhouse';
import { vesselWalkArea } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const ST = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Stern trawler'));
const trawler = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[ST].defaults, hull: ST, dhLength: 1, dhHeight: 2.5, dhWidth: 0.5, dhRake: 0, dhNarrow: 0, dhAft: 4, ...more });

describe('a deckhouse run on aft of the wheelhouse', () => {
  it('travels as a link or file; flush with the house is as before', () => {
    expect(DEFAULT_DESIGN.dhAft).toBe(0);
    expect(shortCode(trawler())).toBeNull();
    expect(readDesign(designToken(trawler()))).toMatchObject({ design: trawler(), warnings: [] });
    const flush = buildDesign(trawler({ dhAft: 0 })).hull.layout;
    expect(flush.deckhouse!.houseAft).toBeUndefined();
    expect(flush.deckhouse!.z1).toBeCloseTo(flush.wheelhouse!.aft - 0.02, 3);
  });

  it('2 m aft of the house, 2.5 m high: walked, its ladder down the aft face, the door onto its top, the trawl gear aft of it', () => {
    const b = buildDesign(trawler());
    expect(b.warnings).toEqual([]);
    const { deckhouse: dh, wheelhouse: wh } = b.hull.layout;
    expect(dh!.houseAft).toBeCloseTo(wh!.aft, 3);
    expect(dh!.z1).toBeCloseTo(wh!.aft + SCALES.dhAft(4) - 0.02, 3);
    expect(dh!.walk!.ladder).toMatchObject({ face: 'aft', x: 0 });
    // The door's steps (if any) stand on its top, not the deck.
    for (const s of wh!.steps ?? []) expect(s.y).toBeGreaterThan(dh!.top);
    expect(wh!.floorY).toBeGreaterThanOrEqual(dh!.top);
    // The trawl gear aft of it and its ladder.
    const lad = deckhouseLadderZone(dh!)!;
    for (const id of ['aFrame', 'netDrum', 'trawlWinches']) {
      const s = b.hull.sockets.find((k) => k.id === id);
      expect(s, id).toBeDefined();
      expect(s!.transform.position[2], id).toBeGreaterThan(lad.z1);
    }
  });

  it('is walked: out of the aft door onto its top, down its ladder to the working deck', () => {
    useDesign(trawler());
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    const def = VESSEL_DEFS.design;
    const dh = def.layout.deckhouse!;
    const wh = def.layout.wheelhouse!;
    const walk = vesselWalkArea(def, def.layout, []);
    // On its top, a stride aft of the house's door.
    const zTop = (wh.aft + dh.z1) / 2;
    expect(walk.walkable(0, zTop, dh.top)).toBe(true);
    // Not on the deck under it.
    expect(walk.walkable(0, zTop, dh.top - 2.5)).toBe(false);
    // Its ladder: from the deck at its foot to its top.
    const lad = deckhouseLadderZone(dh)!;
    const l = walk.ladderAt(0, (lad.z0 + lad.z1) / 2)!;
    expect(l.top).toBe(dh.top);
    expect(l.top - l.bottom).toBeGreaterThan(2.4);
  });

  it('stops short of leaving her no working deck; needs a deckhouse; not with one only as wide as the house', () => {
    const far = useDesign(trawler({ dhAft: 12, length: 0 }));
    expect(far.warnings.join(' ')).toMatch(/too little working deck/);
    const def = VESSEL_DEFS.design;
    expect(def.layout.deckhouse!.z1).toBeLessThan(def.hull.stations[0].z - 3.9);
    expect(buildDesign(trawler({ dhLength: 0 })).warnings.join(' ')).toMatch(/only run on aft/);
    const narrow = buildDesign(trawler({ dhNarrow: 1 }));
    expect(narrow.warnings.join(' ')).toMatch(/only forward of it/);
    expect(narrow.hull.layout.deckhouse!.houseAft).toBeUndefined();
  });
});

describe('the stern trawler: a longer raised foredeck', () => {
  it('reaches back to 15 m from the bow on the slider, and builds there (run on past the house)', () => {
    expect(SCALES.fcLength(29)).toBe(15);
    for (const fcLength of [16, 22, 29]) {
      const b = buildDesign(trawler({ dhLength: 0, dhAft: 0, fcLength }));
      expect(b.hull.layout.deckSteps?.length, `fcLength ${fcLength}`).toBeGreaterThan(0);
    }
  });
});
