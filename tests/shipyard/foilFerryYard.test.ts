/**
 * The foiling electric ferry in the Shipyard (owner, 28 Oct 2026: a one-off, her house,
 * controls and furniture "hers to shape" as the solar cat's; a battery slider like the solar
 * cat's; the hull modifications chat's `foilFerry` lines and foils): composite; her foils in her
 * vessel definition and drawn; an electric pod at the foot of each aft strut ("the bulbs on the
 * stern foils are her motors"), a lever each; her battery's weight and range in her figures.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { BATTERY_STEPS, DEFAULT_DESIGN, NO_FURNITURE, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { FERRY_MOTOR, FOIL_FERRY } from '../../src/shipyard/parts/catalog';
import { hullCards } from '../../src/shipyard/hullCards';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { DESIGNS } from '../../src/hulls/designs';

afterAll(() => useDesign(DEFAULT_DESIGN));

const ferry: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[FOIL_FERRY].defaults, hull: FOIL_FERRY };
const study = DESIGNS.find((d) => d.id === 'foilFerry')!;

describe('the foiling ferry in the Shipyard', () => {
  it('builds clean: 12 x 4.5 m of composite, about 6.5-7.5 t, her foils about 2.5 m under her', () => {
    expect(DESIGN_HULLS[FOIL_FERRY].name).toMatch(/^Foiling electric ferry/);
    const b = useDesign(ferry);
    expect(b.warnings).toEqual([]);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    expect(b.figures.lengthM).toBeCloseTo(12, 1);
    expect(b.figures.beamM).toBeCloseTo(4.5, 1);
    expect(b.figures.material).toBe('composite');
    expect(b.figures.massT).toBeGreaterThan(6.5);
    expect(b.figures.massT).toBeLessThan(7.5);
    expect(b.figures.draughtM).toBeGreaterThan(0.55);
    expect(b.figures.draughtM).toBeLessThan(0.76);
    // (Her lines' 2.7 m at rest with her foils down, owner 28 Oct 2026; a little less, lighter.)
    expect(b.figures.foilsDraughtM).toBeGreaterThan(2.4);
    expect(b.figures.foilsDraughtM).toBeLessThan(2.8);
    expect(b.figures.engine).toMatch(/^Twin 95 kW electric pod motor/);
    const names = b.weights.items.map((i) => i.name);
    expect(names).toContain('Battery (200 kWh)');
    expect(names).toContain('Hydrofoils and their struts');
    expect(names).not.toContain('Solar roof: panels, frames, wing hinges');
  });

  it('her foils fly her: in her vessel definition, raised with her lines as she floats, drawn but for her pod’s strut', () => {
    const b = useDesign(ferry);
    const foils = VESSEL_DEFS.design.foils!;
    expect(foils).toBeTruthy();
    expect(foils.panels).toHaveLength(study.foils!.panels.length);
    // Lighter than her lines were drawn for (8.8 t with 30 aboard): she floats higher, her foils with her.
    const rise = foils.panels[0].at[1] - study.foils!.panels[0].at[1];
    expect(rise).toBeGreaterThan(0);
    expect(foils.struts[0].top - foils.struts[0].bottom).toBeCloseTo(study.foils!.struts[0].top - study.foils!.struts[0].bottom, 6);
    const drawn = b.recipe.modules.find((m) => m.module === 'hull.foils')!.config as { panels: unknown[]; struts: { podDragArea?: number }[] };
    expect(drawn.panels).toHaveLength(study.foils!.panels.length);
    // (Her aft struts are her pods', drawn by them.)
    expect(drawn.struts).toHaveLength(study.foils!.struts.length - 2);
    expect(drawn.struts.some((s) => s.podDragArea)).toBe(false);
  });

  it('a pod at the foot of each aft strut (owner: "the bulbs on the stern foils are her motors"), a lever each, rising with her foils; no rudder, no solar roof, no oil checks, no motor drawn inside', () => {
    const b = buildDesign(ferry);
    const mods = b.recipe.modules.map((m) => m.module);
    expect(mods.filter((m) => m === 'propulsion.pods')).toHaveLength(1);
    for (const m of ['control.rudder', 'deck.solar-roof', 'maintenance.dipstick', 'maintenance.oil-can']) expect(mods, m).not.toContain(m);
    const pod = b.recipe.modules.find((m) => m.module === 'propulsion.pods')!.config as { units: number[]; mount: { y: number; z: number }; strut: number; installed?: unknown; electric?: { usableKWh: number }; propeller: { diameter: number }; split?: boolean; retract?: number };
    expect(pod.units).toEqual([-1.65, 1.65]);
    expect(pod.split).toBe(true);
    expect(pod.retract).toBeCloseTo(study.foils!.retract!, 6);
    expect(b.recipe.modules.flatMap((m) => [m, ...(m.modules ?? [])]).some((m) => m.module === 'control.twin-throttle')).toBe(true);
    const strut = VESSEL_DEFS.design.foils ? buildDesign(ferry) && useDesign(ferry) && VESSEL_DEFS.design.foils.struts.find((s) => s.podDragArea)! : null;
    expect(pod.mount.z).toBeCloseTo(strut!.z, 2);
    expect(pod.mount.y).toBeCloseTo(strut!.top, 2);
    expect(pod.mount.y - pod.strut).toBeCloseTo(strut!.bottom, 2);
    expect(pod.installed).toBeUndefined();
    expect(pod.electric!.usableKWh).toBeCloseTo(180, 0);
    expect(pod.propeller.diameter).toBeCloseTo(0.6, 2);
  });

  it('her hull, foils, pods and deck fixed, whatever the design says', () => {
    const as = buildDesign(ferry);
    const tried = buildDesign({ ...ferry, length: 0, engine: 0, twin: 1, pods: 0, deckCrane: 1, gear: 9, markings: 1, foreCabin: 1, material: 1 });
    expect(tried.figures).toEqual(as.figures);
  });

  it('her wheelhouse and cabin, controls and furniture are the player’s', () => {
    const fixed = DESIGN_HULLS[FOIL_FERRY].fixed!;
    for (const k of ['housePos', 'houseLength', 'houseWidth', 'headroom', 'windowRake', 'saloon', 'controls', 'touch', 'seatAt', 'seatAt12', 'headAt', 'battery', 'paint'] as const) expect(k in fixed, k).toBe(false);
    for (const v of [{ houseLength: 3 }, { housePos: 0.7, saloon: 0 }, { windowRake: 0 }, { headroom: 2.2 }, { houseWidth: 0.8 }, { touch: 1 }, { controls: 1 }] as Partial<ShipDesign>[]) {
      const b = buildDesign({ ...ferry, ...v });
      expect(b.figures.lengthM, JSON.stringify(v)).toBeCloseTo(12, 1);
      expect(b.recipe.modules.some((m) => m.module === 'hull.foils'), JSON.stringify(v)).toBe(true);
    }
    // Her seats: twelve in rows either side of an aisle, as she comes; one taken off is one fewer.
    const b = buildDesign(ferry);
    expect(Object.entries(b.placed).filter(([k, v]) => k.startsWith('seatAt') && v).length).toBe(12);
    const less = buildDesign({ ...ferry, seatAt12: 0 });
    expect(less.recipe.modules.filter((m) => m.module === 'furniture.piece').length).toBe(b.recipe.modules.filter((m) => m.module === 'furniture.piece').length - 1);
  });

  it('two interiors to start from (owner: "1 as ferry and 1 as explorer vessel i.e sofas etc."): each builds clean, every piece where it\'s pinned', () => {
    const list = DESIGN_HULLS[FOIL_FERRY].interiors!;
    expect(list.map((i) => i.name)).toEqual(['Ferry', 'Explorer']);
    for (const it of list) {
      const b = buildDesign({ ...ferry, ...NO_FURNITURE, ...it.pins });
      expect(b.warnings, it.name).toEqual([]);
      const keys = Object.keys(it.pins);
      for (const k of keys) expect(b.placed[k as keyof typeof b.placed], `${it.name} ${k}`).toBeTruthy();
      // Nothing else aboard but the interior's pieces.
      expect(b.recipe.modules.filter((m) => m.module === 'furniture.piece').length, it.name).toBe(keys.length);
    }
    // The explorer's: sofas, a table, a galley, a berth, a head and a TV; no passenger seats.
    const exp = list[1].pins;
    for (const k of ['setteeAt', 'setteeAt2', 'messAt', 'galleyAt', 'berthAt', 'headAt', 'tvAt']) expect(k in exp, k).toBe(true);
    expect(Object.keys(exp).some((k) => k.startsWith('seatAt'))).toBe(false);
    // She comes as a ferry.
    for (const [k, v] of Object.entries(list[0].pins)) expect(ferry[k as keyof ShipDesign], k).toBe(v);
  });

  it('her battery: more is heavier and further on a charge at 25 kn on her foils', () => {
    const at = (battery: number) => buildDesign({ ...ferry, battery }).figures;
    const small = at(0);
    const big = at(BATTERY_STEPS - 1);
    expect(big.solar!.batteryKWh).toBe(200);
    expect(big.massT - small.massT).toBeCloseTo((180 * 6) / 1000, 1);
    expect(big.solar!.cruiseKn).toBe(25);
    // 200 kWh: about 100 kW at 25 kn on her deeper foils (foilFerryDrive.test.ts measures it),
    // about 1 3/4 h, 40-50 nm.
    expect(big.solar!.cruiseKw).toBeGreaterThan(92);
    expect(big.solar!.cruiseKw).toBeLessThan(112);
    expect(big.solar!.rangeNm).toBeGreaterThan(40);
    expect(big.solar!.rangeNm).toBeLessThan(50);
    expect(big.solar!.rangeNm).toBeGreaterThan(5 * small.solar!.rangeNm);
  });

  it('her motors are hers alone: on another hull they are the 150 kW, saying so', () => {
    const b = buildDesign({ ...DEFAULT_DESIGN, engine: FERRY_MOTOR });
    expect(b.figures.engine).toMatch(/150 kW/);
    expect(b.warnings[0]).toMatch(/foiling electric ferry's own/);
  });

  it('on her own card, and she travels as a link or file, her battery with her', () => {
    expect(hullCards().some((c) => c.hull === FOIL_FERRY && /Foiling electric ferry/.test(c.title))).toBe(true);
    const d = { ...ferry, battery: 12 };
    expect(shortCode(d)).toBeNull();
    const back = readDesign(designToken(d));
    expect('design' in back && back.design.battery).toBe(12);
  });
});
