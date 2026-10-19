/**
 * Hull protection (owner): a Shipyard design's fenders, rubbing strake or tyres. Its codes
 * (old ones unchanged), what each puts on her, and that each keeps a quay off her plating.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { assembleView } from '../../src/modular/assemble';
import { flattenMounts, validateRecipe } from '../../src/modular/recipe';
import { mergeParts } from '../../src/render/geometryUtils';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, GUARDS, placeValue, type ShipDesign } from '../../src/shipyard/design';
import { hullPlan } from '../../src/vessel/layout';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { placeVessel } from '../../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { BERTHS } from '../../src/world/archipelago';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);

const BASE: ShipDesign = { ...DEFAULT_DESIGN, guard: 0 };
// (In steel: near the weight these knocks were tuned on.)
const WORKBOAT: ShipDesign = { ...BASE, hull: 2, ...DESIGN_HULLS[2].defaults, material: 1 };
const mounted = () => flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted;
const modulesOf = () => mounted().map((m) => m.def.id);

describe('hull protection: codes', () => {
  it('none keeps the code as it was; each choice adds two or three characters and reads back, with a deckhouse and placed gear too', () => {
    expect(encodeDesign(BASE).replace(/-/g, '')).toHaveLength(17);
    for (let guard = 1; guard < GUARDS.length; guard++) {
      const d = { ...BASE, guard };
      const code = encodeDesign(d);
      expect(code.replace(/-/g, '').length).toBeGreaterThan(17);
      expect(code.replace(/-/g, '').length).toBeLessThanOrEqual(20);
      expect(decodeDesign(code)).toEqual({ design: d });
      const more = { ...d, dhLength: 3, dhHeight: 2, dhWidth: 1, dhRake: 1, deckCrane: 2, craneAt: placeValue('craneAt', -1, 2.5, 1) };
      expect(decodeDesign(encodeDesign(more))).toEqual({ design: more });
    }
    // The page starts with the crew's fenders.
    expect(DEFAULT_DESIGN.guard).toBe(1);
  });
});

describe('hull protection: what each puts on her', () => {
  it('every hull takes every choice: a valid recipe, level on her lines, no warnings', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (let guard = 0; guard < GUARDS.length; guard++) {
        const boat = useDesign({ ...BASE, hull, ...DESIGN_HULLS[hull].defaults, guard });
        expect(validateRecipe(RECIPES.design, LIBRARY), `${hull}/${guard}`).toEqual([]);
        expect(boat.warnings, `${hull}/${guard}`).toEqual([]);
        const h = uprightHydrostatics(VESSEL_DEFS.design);
        expect(Math.abs(h.sinkage), `${hull}/${guard} sinkage`).toBeLessThan(0.02);
        expect(Math.abs(h.lcgMinusLcb), `${hull}/${guard} trim`).toBeLessThan(0.02);
        const mods = modulesOf();
        expect(mods.includes('deck.fenders'), `${hull}/${guard} fenders`).toBe(guard === 1 || guard === 4);
        expect(mods.includes('hull.guard'), `${hull}/${guard} side guard`).toBe(guard >= 2);
        expect(!!gearOf({ defId: 'design' }, 'fenders')).toBe(guard === 1 || guard === 4);
        expect(gearOf({ defId: 'design' }, 'sideGuard')?.kind ?? null).toBe(guard === 2 || guard === 4 ? 'strake' : guard === 3 ? 'tyres' : null);
      }
  });

  it('the fenders: a basket on deck, three a side hanging just outside her; their points outboard of her deck edge', () => {
    useDesign({ ...WORKBOAT, guard: 1 });
    const def = VESSEL_DEFS.design;
    const plan = hullPlan(def);
    const basket = mounted().find((m) => m.def.id === 'deck.fenders')!.config as { z: number[]; basket: [number, number] };
    expect(basket.z).toHaveLength(3);
    const [bx, bz] = basket.basket;
    expect(Math.abs(bx)).toBeLessThan(plan.halfBeam(bz) - 0.2); // on deck, inside the bulwark
    expect(bz).toBeGreaterThan(def.layout.wheelhouse!.aft); // aft of the house
    const probes = gearOf({ defId: 'design' }, 'fenders')!.probes;
    expect(probes).toHaveLength(6);
    for (const [x, y, z] of probes) {
      expect(Math.abs(x)).toBeGreaterThan(plan.halfBeam(z) + 0.2);
      expect(y).toBeLessThan(plan.deckY(z));
      expect(y).toBeGreaterThan(0); // above her waterline
    }
  });

  it('the strake runs all round, just proud of her sheer; the tyres hang in a close row along her sides, one on her stem', () => {
    useDesign({ ...WORKBOAT, guard: 2 });
    const plan = hullPlan(VESSEL_DEFS.design);
    const strake = gearOf({ defId: 'design' }, 'sideGuard')!.probes;
    expect(strake.some(([, , z]) => z > plan.transom)).toBe(true); // across the transom
    // On the corner of her deck edge, its face just proud of it.
    for (const [x, y, z] of strake.filter(([, , z]) => z < plan.transom)) {
      expect(Math.abs(x) - plan.halfBeam(z)).toBeCloseTo(CONFIG.modules.hullGuard.strake.radius, 6);
      expect(plan.deckY(z) - y).toBeCloseTo(CONFIG.modules.hullGuard.strake.drop, 6);
    }
    useDesign({ ...WORKBOAT, guard: 3 });
    const probes = gearOf({ defId: 'design' }, 'sideGuard')!.probes;
    // One on her stem, facing forward (for pushing), the rest along her sides.
    const bow = probes.filter(([x]) => x === 0);
    expect(bow).toHaveLength(1);
    expect(bow[0][2]).toBeCloseTo(plan.stem - CONFIG.modules.hullGuard.tyres.thickness, 6);
    const tyres = probes.filter(([x]) => x !== 0);
    // A close row: one tyre's width and a little apart, all but touching.
    expect(CONFIG.modules.hullGuard.tyres.spacing).toBeLessThan(2 * CONFIG.modules.hullGuard.tyres.radius + 0.05);
    expect(tyres.length).toBeGreaterThanOrEqual(12);
    const widest = Math.max(...tyres.map(([, , z]) => plan.halfBeam(z)));
    // Hanging against her deck edge, their faces a tyre's thickness out from it.
    for (const [x, , z] of tyres) {
      expect(Math.abs(x) - plan.halfBeam(z)).toBeCloseTo(CONFIG.modules.hullGuard.tyres.thickness, 6);
      expect(plan.halfBeam(z)).toBeGreaterThanOrEqual(CONFIG.modules.hullGuard.tyres.minBeam * widest - 1e-9);
    }
  });

  it('price, weight and drag: fenders the cheapest; the tyres a little more drag; the strake and tyres add their weight', () => {
    const none = useDesign({ ...WORKBOAT, guard: 0 });
    const ff = VESSEL_DEFS.design.resistance.formFactor;
    const fenders = useDesign({ ...WORKBOAT, guard: 1 });
    const strake = useDesign({ ...WORKBOAT, guard: 2 });
    const tyres = useDesign({ ...WORKBOAT, guard: 3 });
    expect(VESSEL_DEFS.design.resistance.formFactor).toBeCloseTo(ff + CONFIG.modules.hullGuard.tyres.formFactorAdd, 9);
    const both = useDesign({ ...WORKBOAT, guard: 4 });
    expect(fenders.figures.price).toBeGreaterThanOrEqual(none.figures.price);
    expect(strake.figures.price).toBeGreaterThan(fenders.figures.price);
    expect(tyres.figures.price).toBeGreaterThan(fenders.figures.price);
    expect(both.figures.price).toBeGreaterThanOrEqual(strake.figures.price);
    // (She floats at what she weighs: the strake and the tyres are weight; the crew's fenders too light to count.)
    expect(fenders.figures.massT).toBe(none.figures.massT);
    for (const b of [strake, tyres, both]) expect(b.figures.massT).toBeGreaterThan(none.figures.massT);
    // Her CG moves toward the tyres' height (as built: her parts' weights and heights).
    const tyreY = tyres.weights.items.find((it) => it.name === 'Hull protection')!.y;
    expect(Math.sign(tyres.weights.cgY - none.weights.cgY)).toBe(Math.sign(tyreY - none.weights.cgY));
  });

  it('draws them with her fixed parts: no draw calls of their own', () => {
    for (const guard of [2, 3]) {
      useDesign({ ...WORKBOAT, guard });
      const view = assembleView(RECIPES.design, VESSEL_DEFS.design, LIBRARY);
      const m = view.modules.find((x) => x.id === 'hull.guard')!;
      expect(m).toBeDefined();
      let meshes = 0;
      m.root.traverse((o) => void ((o as { isMesh?: boolean }).isMesh && meshes++));
      expect(meshes).toBe(0);
      expect(view.staticParts.length).toBeGreaterThan(0);
      // They merge with the rest of her fixed parts (as the boat's view bakes them).
      expect(mergeParts(view.staticParts)).not.toBeNull();
    }
  });
});

describe('hull protection: alongside', { timeout: 120000 }, () => {
  /** She's driven sideways into Calder Haven's quay face at `speed` m/s; the hull damage it does. */
  function sideOn(design: ShipDesign, speed: number, fendersOut = false): number {
    useDesign(design);
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    const DT = 1 / 60;
    const run = (s: number) => {
      for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
    };
    const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
    // Bow north, her starboard side toward the quay face (east), a little over a metre off.
    placeVessel(v, berth.x - 1.2, 0, berth.z, 0);
    if (fendersOut) stepWorld(world, [{ playerId: 'player-1', targetId: v.id, control: 'fenders', value: 1 } as Intent], DT);
    run(2);
    v.damage = 0;
    v.linearVelocity = [speed, 0, 0];
    v.angularVelocity = [0, 0, 0];
    run(4);
    return v.damage!;
  }

  it('a hard knock alongside: tyres and fenders take most of it, the strake some; fenders left in board do nothing', () => {
    const none = sideOn({ ...WORKBOAT, guard: 0 }, 2.2);
    const fendersIn = sideOn({ ...WORKBOAT, guard: 1 }, 2.2);
    const fendersOut = sideOn({ ...WORKBOAT, guard: 1 }, 2.2, true);
    const strake = sideOn({ ...WORKBOAT, guard: 2 }, 2.2);
    const tyres = sideOn({ ...WORKBOAT, guard: 3 }, 2.2);
    expect(none).toBeGreaterThan(0.05);
    expect(fendersIn).toBeCloseTo(none, 6);
    expect(strake).toBeLessThan(0.5 * none);
    expect(strake).toBeGreaterThan(0);
    expect(tyres).toBeLessThan(0.5 * strake);
    expect(fendersOut).toBeLessThan(0.15 * none);
  });

  it('coming alongside gently (0.5 m/s) does nothing to any of them', () => {
    for (const guard of [0, 2, 3]) expect(sideOn({ ...WORKBOAT, guard }, 0.5)).toBe(0);
    expect(sideOn({ ...WORKBOAT, guard: 1 }, 0.5, true)).toBe(0);
  });
});
