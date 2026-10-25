/**
 * Crew transfer to wind farms, stop 1 (owner, Oct 2026): the bow fender (modules/bowFender, a
 * Shipyard choice, standard on the catamaran) and the Holm Rig wind farm's turbines (world/
 * windFarm.ts), solid to a boat, each with a boat landing a crew boat pushes her fender against
 * and holds on with her engine.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../src/boats/sims';
import { LIBRARY, RECIPES } from '../src/boats/library';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { assembleView } from '../src/modular/assemble';
import { validateRecipe } from '../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../src/shipyard/design';
import { hullPlan } from '../src/vessel/layout';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { BLOCKS, FISHING_GROUNDS, POTTING_GROUNDS, WIND_FARMS } from '../src/world/archipelago';
import { blockContact, type BlockHit } from '../src/world/geography';
import { groundHeight } from '../src/world/terrain';
import { landingAxis, landingFace } from '../src/world/windFarm';
import { WindFarmView } from '../src/world/view/windFarmView';
import { startEngine } from './helpers/engine';
import { fakeCanvas } from './modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const hullOf = (name: string) => DESIGN_HULLS.findIndex((h) => h.name.startsWith(name));
const type = (name: string, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hullOf(name)].defaults, hull: hullOf(name), ...more });
const hasFender = () => RECIPES.design.modules.some((m) => m.module === 'hull.bow-fender');

describe('the bow fender', () => {
  it('the catamaran comes with one; any pointed bow can have one; not a push bow (its knees do it); not in the code', () => {
    useDesign(type('Fast catamaran'));
    expect(hasFender()).toBe(true);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    for (const name of ['Pilot', 'Gillnet', 'Landing', 'Stern trawler']) {
      const d = type(name, { bowFender: 1 });
      const b = useDesign(d);
      expect(b.warnings, name).toEqual([]);
      expect(hasFender(), name).toBe(true);
      expect(validateRecipe(RECIPES.design, LIBRARY), name).toEqual([]);
      useDesign(type(name, { bowFender: 0 }));
      expect(hasFender(), name).toBe(false);
    }
    useDesign(type('Small tug', { bowFender: 1 }));
    expect(hasFender()).toBe(false);
    expect(RECIPES.design.modules.some((m) => m.module === 'hull.push-fender')).toBe(true);
    expect(() => encodeDesign(type('Pilot', { bowFender: 1 }))).toThrow(/link or file/);
  });

  it('stands plumb, forward of her stem, its face the first of her to meet something ahead; weighed and priced; drawn with her (no draw call of its own)', () => {
    for (const name of ['Fast catamaran', 'Pilot']) {
      useDesign(type(name, { bowFender: 1 }));
      const plan = hullPlan(VESSEL_DEFS.design);
      const probes = gearOf({ defId: 'design' }, 'pushFender')!.probes;
      expect(probes.length).toBe(CONFIG.modules.bowFender.across * CONFIG.modules.bowFender.up);
      for (const [, y, z] of probes) {
        expect(z, name).toBeCloseTo(plan.stem - CONFIG.modules.bowFender.thickness, 2);
        expect(y, name).toBeGreaterThan(0.3);
      }
      const view = assembleView(RECIPES.design, VESSEL_DEFS.design, LIBRARY);
      let meshes = 0;
      view.modules.find((m) => m.id === 'hull.bow-fender')!.root.traverse((o) => void ((o as { isMesh?: boolean }).isMesh && meshes++));
      expect(meshes).toBe(0);
    }
    const plain = buildDesign(type('Pilot', { bowFender: 0 }));
    const fitted = buildDesign(type('Pilot', { bowFender: 1 }));
    expect(fitted.figures.price - plain.figures.price).toBeGreaterThanOrEqual(CONFIG.shipyard.bowFenderPrice);
    expect(fitted.figures.massT).toBeGreaterThan(plain.figures.massT);
    // The catamaran's spans her bridge deck's front; a monohull's is narrower.
    useDesign(type('Fast catamaran'));
    const cat = gearOf({ defId: 'design' }, 'pushFender')!.probes;
    useDesign(type('Pilot', { bowFender: 1 }));
    const mono = gearOf({ defId: 'design' }, 'pushFender')!.probes;
    const span = (ps: typeof cat) => Math.max(...ps.map((p) => p[0])) - Math.min(...ps.map((p) => p[0]));
    expect(span(cat)).toBeGreaterThan(span(mono));
  });
});

describe('the Holm Rig wind farm', () => {
  const farm = WIND_FARMS.find((f) => f.name.startsWith('Holm Rig'))!;
  const hit: BlockHit = { depth: 0, nx: 0, ny: 0, nz: 0, fendered: false };

  it('three turbines in deep open water, clear of the fishing grounds; each solid, its landing standing out toward the crew boat; none to tie up at', () => {
    expect(farm.turbines).toHaveLength(3);
    for (const t of farm.turbines) {
      expect(groundHeight(t.x, t.z)).toBeLessThan(-20);
      for (const g of FISHING_GROUNDS) expect(Math.hypot(t.x - g.x, t.z - g.z), g.name).toBeGreaterThan(g.radius + 100);
      for (const g of POTTING_GROUNDS) expect(Math.hypot(t.x - g.x, t.z - g.z), g.id).toBeGreaterThan(g.radius + 100);
      // Solid at its middle, and at its landing's tubes; open water beyond them.
      expect(blockContact(t.x, 1, t.z, hit)).toBe(true);
      const f = landingFace(t);
      const { ax, az } = landingAxis(t.landingDeg);
      expect(blockContact(f.x - ax * 0.05, 1.5, f.z - az * 0.05, hit)).toBe(true);
      // Its face pushes back out along the landing's bearing.
      expect(hit.nx * ax + hit.nz * az).toBeGreaterThan(0.99);
      expect(blockContact(f.x + ax * 0.3, 1.5, f.z + az * 0.3, hit)).toBe(false);
    }
    expect(BLOCKS.filter((b) => b.farm && Math.hypot(b.x - farm.turbines[0].x, b.z - farm.turbines[0].z) < 10)).toHaveLength(2);
  });

  it('drawn in four draw calls for the whole farm', () => {
    const v = new WindFarmView(WIND_FARMS);
    let meshes = 0;
    v.root.traverse((o) => {
      if ((o as { isMesh?: boolean; isPoints?: boolean }).isMesh || (o as { isPoints?: boolean }).isPoints) meshes++;
    });
    expect(meshes).toBe(4);
  });

  it('pushing on the landing: the catamaran held on it with a little throttle, her fender on the tubes, not sliding off, no damage', { timeout: 120000 }, () => {
    useDesign(type('Fast catamaran'));
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    const t = farm.turbines[0];
    const f = landingFace(t);
    const { ax, az } = landingAxis(t.landingDeg);
    const plan = hullPlan(VESSEL_DEFS.design);
    // Bow toward the landing (heading the opposite of its bearing), her fender 2 m off its face.
    const heading = (t.landingDeg + 180) % 360;
    const off = -(plan.stem - CONFIG.modules.bowFender.thickness) + 2;
    placeVessel(v, f.x + ax * off, 0, f.z + az * off, heading);
    startEngine(world, v);
    const DT = 1 / 60;
    v.damage = 0;
    const lever = (value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'lever', value } as Intent], DT);
    lever(0.25);
    let push = 0;
    const along = () => (v.position[0] - t.x) * ax + (v.position[2] - t.z) * az;
    const across = () => -(v.position[0] - t.x) * az + (v.position[2] - t.z) * ax;
    const start = { across: across() };
    for (let i = 0; i < 20 / DT; i++) {
      stepWorld(world, [], DT);
      // (On her fender: the guards' force, not her hull's.)
      if (i > 15 / DT) push = Math.max(push, v.contact.guardForce ?? 0);
      expect(v.contact.force, 'her hull never touches').toBe(0);
    }
    // Still on the landing at the end (her bow at the tubes' face), pushing, barely moved across it, unharmed.
    expect(push).toBeGreaterThan(5000);
    expect(along()).toBeLessThan(f.out - plan.stem + CONFIG.modules.bowFender.thickness + 0.5);
    expect(Math.abs(across() - start.across)).toBeLessThan(0.6);
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2])).toBeLessThan(0.15);
    expect(v.damage ?? 0).toBe(0);
  });
});
