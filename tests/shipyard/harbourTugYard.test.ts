/**
 * The harbour tug in the Shipyard (owner, Oct 2026): a one-off, her hull (the hull study's
 * `harbourTug`, the hull modifications chat's) and superstructure fixed; her colours, the
 * wheelhouse inside and her deck gear the player's. Her fendering is her protection, with
 * contacts; she tows over her bow; her 1850 kW diesels are hers alone.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { HARBOUR_TUG, HARBOUR_TUG_DIESEL } from '../../src/shipyard/parts/catalog';

afterAll(() => useDesign(DEFAULT_DESIGN));

const tug: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[HARBOUR_TUG].defaults, hull: HARBOUR_TUG };

describe('the harbour tug in the Shipyard', () => {
  it('builds clean: her lines as drawn, floating near her 3.3 m draught, a tug’s stability, a recipe that holds', () => {
    expect(DESIGN_HULLS[HARBOUR_TUG].name).toMatch(/^Harbour tug/);
    const b = useDesign(tug);
    expect(b.warnings).toEqual([]);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    expect(b.figures.lengthM).toBeCloseTo(25, 1);
    expect(b.figures.beamM).toBeCloseTo(10.5, 1);
    expect(b.figures.draughtM).toBeGreaterThan(3.0);
    expect(b.figures.draughtM).toBeLessThan(3.4);
    expect(b.figures.gmM).toBeGreaterThan(1.5);
    expect(b.figures.gmM).toBeLessThan(2.5);
    expect(b.figures.engine).toMatch(/^Twin 1850 kW/);
  });

  it('her fixed choices (her hull, protection, engines) stay hers, whatever the design says; the rest are the player’s, her house too', () => {
    const tried = buildDesign({ ...tug, sheer: 4, length: 0, guard: 2, aFrame: 1, engine: 0, twin: 0, fishHold: 1 });
    const as = buildDesign(tug);
    expect(tried.figures).toEqual(as.figures);
    // Her colours, the inside and her deck gear do change her.
    const kitted = buildDesign({ ...tug, deckCrane: 1, searchlight: 1, fireMonitor: 1, paint: 0, interior: 1 });
    expect(kitted.figures.price).toBeGreaterThan(as.figures.price);
    expect(kitted.recipe.modules.some((m) => m.module === 'deck.crane')).toBe(true);
    // (Owner, 26 Oct 2026: her wheelhouse and deckhouse the player's.)
    const taller = buildDesign({ ...tug, headroom: 2.6, houseWidth: 0.5, dhHeight: 2.0 });
    expect(taller.figures).not.toEqual(as.figures);
  });

  it('her fendering is her protection: its points round her sides, her stern and her bow, out beyond her plating', () => {
    useDesign(tug);
    const guard = gearOf({ defId: 'design' }, 'sideGuard');
    expect(guard?.kind).toBe('strake');
    const probes = guard!.probes;
    expect(probes.length).toBeGreaterThan(60);
    const zs = probes.map((p) => p[2]);
    const b = buildDesign(tug);
    // Right round her: from near her transom (+12.5) to near her stem (-12.5), both sides.
    expect(Math.max(...zs)).toBeGreaterThan(11.5);
    expect(Math.min(...zs)).toBeLessThan(-11.5);
    expect(probes.some((p) => p[0] > 5)).toBe(true);
    expect(probes.some((p) => p[0] < -5)).toBe(true);
    // Out beyond her 10.5 m beam amidships (11.1 m over the belts).
    expect(Math.max(...probes.map((p) => Math.abs(p[0])))).toBeGreaterThan(5.4);
    expect(b.recipe.modules.some((m) => m.module === 'hull.fendering')).toBe(true);
    expect(b.recipe.modules.some((m) => m.module === 'hull.guard')).toBe(false);
  });

  it('she tows over her bow: her tow point at her stem, her winch on the foredeck facing forward, no stern roller', () => {
    const b = useDesign(tug);
    const tow = gearOf({ defId: 'design' }, 'towPoint');
    expect(tow).toBeTruthy();
    expect(tow!.point[2]).toBeLessThan(-11);
    const winch = b.hull.sockets.find((s) => s.id === 'towWinch')!;
    expect(winch.transform.position[2]).toBeLessThan(-8);
    expect(winch.transform.rotationDeg?.[1]).toBe(-180);
    expect(b.recipe.modules.some((m) => m.module === 'deck.stern-roller')).toBe(false);
  });

  it('with the stern roller she tows over her stern, from a towing hook aft of her house; no staple at her bow', () => {
    const b = useDesign({ ...tug, sternRoller: 1 });
    expect(b.warnings).toEqual([]);
    const tow = gearOf({ defId: 'design' }, 'towPoint');
    expect(tow!.point[2]).toBeGreaterThan(0);
    expect(b.recipe.modules.some((m) => m.module === 'deck.bow-staple')).toBe(false);
    expect(b.hull.sockets.find((s) => s.id === 'towWinch')!.transform.position[2]).toBeGreaterThan(0);
  });

  it('travels as a link or file, and comes back', () => {
    expect(shortCode(tug)).toBeNull();
    const back = readDesign(designToken(tug));
    expect('design' in back && back.design.hull).toBe(HARBOUR_TUG);
  });

  it('her 1850 kW diesel is hers alone: on another hull it is the 750 kW, saying so', () => {
    expect((ENGINES[HARBOUR_TUG_DIESEL] as { only?: readonly number[] }).only).toEqual([HARBOUR_TUG]);
    const b = buildDesign({ ...DEFAULT_DESIGN, engine: HARBOUR_TUG_DIESEL });
    expect(b.figures.engine).toMatch(/750 kW/);
    expect(b.warnings[0]).toMatch(/harbour tug's own/);
  });
});

describe('her stand-in drives drawn as Z-drives (owner: "like a Z in between the shaft and the thing")', () => {
  it('her engine level, the propeller and nozzle level under her stern facing ahead, no rudder', async () => {
    const { buildMachinery } = await import('../../src/shipyard/enginePreview');
    const { VESSEL_DEFS } = await import('../../src/vessel/vesselDef');
    const THREE = await import('three');
    const b = useDesign(tug);
    const g = buildMachinery({ engine: tug.engine, twin: true, form: VESSEL_DEFS.design.hull, shaft: b.shaft, twinX: 2.9, propD: b.figures.propellerM, propZ: 11, rudderZ: 11.5, nozzle: true, zDrive: true });
    const props = g.children.filter((o) => o.name === 'propeller');
    expect(props).toHaveLength(2);
    for (const p of props) expect(p.rotation.x).toBe(0);
    expect(g.children.some((o) => o.name === 'rudder')).toBe(false);
    // Each engine's holder level.
    const holders = g.children.filter((o) => o instanceof THREE.Group && o.name !== 'propeller' && o.name !== 'nozzle' && o.children.length && o.rotation.x === 0);
    expect(holders.length).toBeGreaterThanOrEqual(2);
  });
});
