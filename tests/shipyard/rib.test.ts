/**
 * The RIB as a Shipyard boat (owner, 31 Oct 2026: "take the existing rib ... and turn it into a
 * parametric boat that we can edit ... stretchable ... from one engine up to four ... the
 * console should be fixed so it doesn't need a wheelhouse at all ... painting options ... the
 * rubber ring could be one colour, the hull could be another colour, and the console could be
 * another colour ... an inboard, like a V8 with a Z drive, or outboards"). RIB stop 1: her hull
 * 5 to 12 m, her tubes, an open helm at her jockey console, her engines, her paint.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign } from '../../src/shipyard/designDoc';
import { RIB, TUBE_PAINTS, HOUSE_PAINTS } from '../../src/shipyard/parts/catalog';
import { hasWheelhouse, VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { vesselWalkArea } from '../../src/vessel/layout';
import { footprintsOf } from '../../src/boats/sims';
import { placeVessel } from '../../src/vessel/vesselControl';

afterAll(() => useDesign(DEFAULT_DESIGN));

const DT = 1 / 60;
const rib = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[RIB].defaults, hull: RIB, ...more });
const mods = (d: ShipDesign) => buildDesign(d).recipe.modules.map((m) => m.module);

describe('the RIB in the Shipyard', () => {
  it('as she comes: 6 m, one 150 hp outboard, about the crane RIB\'s weight, stable, no warnings, a link or file', () => {
    const b = useDesign(rib());
    expect(b.warnings).toEqual([]);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    expect(b.figures.lengthM).toBeCloseTo(6, 1);
    expect(b.figures.massT).toBeGreaterThan(1.2);
    expect(b.figures.massT).toBeLessThan(1.7);
    expect(b.figures.gmM).toBeGreaterThan(0.5);
    expect(b.figures.material).toBe('GRP');
    expect(b.figures.engine).toMatch(/^One 112 kW \(150 hp\) petrol outboard$/);
    expect(() => encodeDesign(rib())).toThrow(/link or file/);
    expect(readDesign(designToken(rib()))).toMatchObject({ design: rib(), warnings: [] });
  });

  it('stretches 5 to 12 m, her beam and tubes growing with her; clean from 6 m up', () => {
    const short = buildDesign(rib({ length: 0 }));
    const long = buildDesign(rib({ length: 15 }));
    expect(short.figures.lengthM).toBeCloseTo(5, 0);
    expect(long.figures.lengthM).toBeCloseTo(12, 1);
    expect(long.figures.beamM).toBeGreaterThan(short.figures.beamM * 1.8);
    expect(long.hull.layout.bulwarkHeight).toBeGreaterThan(short.hull.layout.bulwarkHeight * 1.3);
    for (const length of [8, 10, 12, 15]) expect(buildDesign(rib({ length })).warnings, `length ${length}`).toEqual([]);
  });

  it('no wheelhouse: an open helm at her console; her tubes, console and leaning post; the wheelhouse\'s fittings gone', () => {
    const b = useDesign(rib());
    const wh = b.hull.layout.wheelhouse!;
    expect(wh.open).toBe(true);
    // (Still a "wheelhouse" to the game's bridge, walked as her deck.)
    expect(hasWheelhouse(VESSEL_DEFS.design)).toBe(true);
    const m = mods(rib());
    for (const k of ['hull.tubes', 'deck.rib-console', 'console.standard', 'panel.breakers', 'switch.battery-master', 'light.navigation', 'propulsion.outboard']) expect(m, k).toContain(k);
    for (const k of ['radio.vhf', 'radio.fm', 'control.door-button', 'light.cabin', 'furniture.chart-table', 'furniture.duty-board', 'furniture.whiteboard']) expect(m, k).not.toContain(k);
    const helm = b.recipe.modules.find((x) => x.socket === 'helm')!;
    expect((helm.modules ?? []).map((x) => x.socket).sort()).toEqual(['key', 'navLights', 'rpm', 'speed', 'start', 'throttle', 'wheel']);
    // Her console where her helm's box is (Console step: housePos moves it).
    const c = b.recipe.modules.find((x) => x.module === 'deck.rib-console')!.config as { front: number; aft: number };
    expect(c.front).toBeCloseTo(wh.front, 2);
    const moved = buildDesign(rib({ housePos: 0.8 })).recipe.modules.find((x) => x.module === 'deck.rib-console')!.config as { front: number };
    expect(moved.front).toBeLessThan(c.front - 0.5);
  });

  it('walked as an open deck: round her console and leaning post, not through them', () => {
    const b = useDesign(rib());
    const c = b.recipe.modules.find((x) => x.module === 'deck.rib-console')!.config as { front: number; aft: number; post: { front: number; aft: number } };
    const area = vesselWalkArea(VESSEL_DEFS.design, VESSEL_DEFS.design.layout, footprintsOf({ defId: 'design' }));
    const y = VESSEL_DEFS.design.layout.wheelhouse!.floorY;
    expect(area.walkable(0, (c.front + c.aft) / 2, y)).toBe(false);
    expect(area.walkable(0, (c.aft + c.post.front) / 2, y)).toBe(true);
    expect(area.walkable(0, c.front - 0.6, y)).toBe(true);
  });

  it('her engines: one to four outboards, 150 hp or the V8; or an inboard on a stern drive under an engine box', () => {
    const four = buildDesign(rib({ length: 15, oneOutboard: 0, outboards: 3, outboardSize: 0 }));
    expect(four.warnings).toEqual([]);
    expect(four.figures.engine).toMatch(/^Four 300 kW petrol V8 outboards$/);
    const two = buildDesign(rib({ length: 11, oneOutboard: 0, outboards: 1 }));
    expect(two.figures.engine).toMatch(/^Two 112 kW/);
    const inboard = useDesign(rib({ length: 12, oneOutboard: 0, engine: 1 }));
    expect(inboard.warnings).toEqual([]);
    expect(inboard.figures.engine).toMatch(/on a stern drive$/);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    // Its box: the engine hatch standing over her deck, solid.
    const hatch = inboard.recipe.modules.find((x) => x.socket === 'engineHatch')!.config as { box?: { top: number; base: number } };
    expect(hatch.box!.top - hatch.box!.base).toBeGreaterThan(0.4);
    // Too short for one: says so, in her terms.
    expect(buildDesign(rib({ length: 4, oneOutboard: 0, engine: 0 })).warnings.join(' ')).toMatch(/engine box .* move the console forward/);
  });

  it('her paint: her hull, her console and her tubes, each her own', () => {
    const b = buildDesign(rib({ tubeColour: 2, houseColour: 5, paint: 7 }));
    expect((b.recipe.modules.find((x) => x.module === 'hull.tubes')!.config as { colour: number }).colour).toBe(TUBE_PAINTS[2]);
    expect((b.recipe.modules.find((x) => x.module === 'deck.rib-console')!.config as { colour: number }).colour).toBe(HOUSE_PAINTS[5].colour);
  });
});

describe('the RIB in the game', () => {
  it('cold at her berth, she powers up from her console (battery master, breakers), starts, and does 20-plus knots on her 150 hp', { timeout: 120000 }, () => {
    useDesign(rib());
    const { world, vesselId } = createWorld(new IdFactory(), 'design', { cold: true });
    const v = world.vessels[vesselId];
    expect(v.electrics!.master).toBe(0);
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    world.geography = 'openSea';
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
    send('quickStart', 1);
    for (let i = 0; i < 3 / DT; i++) stepWorld(world, [], DT);
    expect(v.engine.phase).toBe('running');
    send('lever', 1);
    for (let i = 0; i < 40 / DT; i++) stepWorld(world, [], DT);
    const kn = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144;
    expect(kn).toBeGreaterThan(20);
    expect(kn).toBeLessThan(32);
  });
});
