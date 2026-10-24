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
import { CONFIG } from '../../src/config';
import { deckhouseHalfWidth, deckhouseLadderZone } from '../../src/vessel/deckhouse';
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
    // A steep stair across its aft face (owner: "a steep transverse stair instead"), not a ladder.
    const st = dh!.walk!.stair!;
    expect(dh!.walk!.ladder.face).toBe('stair');
    expect(deckhouseLadderZone(dh!)).toBeNull();
    const [landing, ...treads] = st;
    expect(landing.y).toBe(dh!.top);
    const half = deckhouseHalfWidth(dh!, dh!.z1);
    for (const [i, t] of treads.entries()) {
      const above = i ? treads[i - 1].y : landing.y;
      expect(above - t.y).toBeLessThanOrEqual(0.3 + 1e-6); // each a walk step (0.4 at most)
      expect(t.x0).toBeGreaterThanOrEqual(-half);
      expect(t.x1).toBeLessThanOrEqual(half);
      expect(t.z0).toBeGreaterThan(dh!.z1);
    }
    expect(treads.length).toBeGreaterThanOrEqual(7);
    // Steep: about 54 degrees.
    const pitch = (Math.atan2(0.3, CONFIG.shipyard.deckhouse.walk.stair.tread) * 180) / Math.PI;
    expect(pitch).toBeGreaterThan(50);
    // The door's steps (if any) stand on its top, not the deck.
    for (const s of wh!.steps ?? []) expect(s.y).toBeGreaterThan(dh!.top);
    expect(wh!.floorY).toBeGreaterThanOrEqual(dh!.top);
    // The trawl gear aft of it and its stair.
    const stairAft = Math.max(...st.map((t) => t.z1));
    for (const id of ['aFrame', 'netDrum', 'trawlWinches']) {
      const s = b.hull.sockets.find((k) => k.id === id);
      expect(s, id).toBeDefined();
      expect(s!.transform.position[2], id).toBeGreaterThan(stairAft);
    }
    // The life ring and a rod rack on its aft face, clear of the stair.
    const fitted = buildDesign(trawler({ lifeRing: 2, rodRack: 2 }));
    const fst = fitted.hull.layout.deckhouse!.walk!.stair!;
    const [s0, s1] = [Math.min(...fst.map((t) => t.x0)), Math.max(...fst.map((t) => t.x1))];
    for (const id of ['lifeRing', 'rodRack']) {
      const x = fitted.hull.sockets.find((k) => k.id === id)!.transform.position[0];
      expect(x < s0 || x > s1, id).toBe(true);
    }
  });

  it('is walked: out of the aft door onto its top, down its stair to the working deck, step by step', () => {
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
    // Down its stair: the landing from its top, then each tread from the one above, then the deck.
    const [landing, ...treads] = dh.walk!.stair!;
    const zs = (landing.z1 + dh.z1) / 2 + 0.1;
    const mid = (t: { x0: number; x1: number }) => (t.x0 + t.x1) / 2;
    expect(walk.walkable(mid(landing), dh.z1 - 0.3, dh.top)).toBe(true);
    expect(walk.walkable(mid(landing), zs, dh.top)).toBe(true);
    // Its treads walked as one slope (owner: "it can just be a ramp"): at each tread's middle,
    // within half a step of the tread drawn there, and rising steadily from the deck to the landing.
    let last = -Infinity;
    for (const t of [...treads].reverse()) {
      const y = walk.floorsAt(mid(t), zs).find((f) => Math.abs(f - t.y) < 0.2);
      expect(y, `tread at ${t.y}`).toBeDefined();
      expect(walk.walkable(mid(t), zs, y!)).toBe(true);
      expect(y!).toBeGreaterThan(last);
      last = y!;
    }
    // Not under it at deck height (you'd walk on under it rather than up: owner, desktop).
    const deck = def.hull.stations[0].polygon[0][1];
    expect(walk.walkable(mid(treads[1]), zs, walk.floorsAt(mid(treads[1]), zs).find((f) => f < treads[1].y - 0.2) ?? deck)).toBe(false);
    expect(walk.floorsAt(mid(treads[1]), zs).every((f) => f > treads[treads.length - 1].y - 0.4)).toBe(true);
    // Small moves up it are each well within a step (a smooth slope, nothing to catch on).
    const lowest = treads[treads.length - 1];
    for (let x = lowest.x1; x > landing.x1; x -= 0.05) {
      const here = Math.max(...walk.floorsAt(x, zs).filter((f) => f < dh.top + 0.01));
      const next = Math.max(...walk.floorsAt(x - 0.05, zs).filter((f) => f < dh.top + 0.01));
      expect(next - here).toBeLessThan(0.1);
    }
    expect(walk.ladderAt(mid(landing), zs)).toBeNull();
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
