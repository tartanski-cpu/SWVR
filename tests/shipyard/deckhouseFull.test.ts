/**
 * A deckhouse out to her sides is a raised deck (owner, Oct 2026: "when you use the option to the
 * side, you probably don't need railings on the side, because you would kind of walk over the
 * sides"): her bulwarks rise along it, its top is walked out to them, its own rail only across
 * its front and aft edges.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { deckhouseHalfWidth } from '../../src/vessel/deckhouse';
import { hullPlan, vesselWalkArea } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const PILOT = 3;
const type = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[PILOT].defaults, hull: PILOT, dhLength: 2.5, dhHeight: 1, dhRake: 0, dhNarrow: 0, houseWidth: 0.7, ...more });

/** Her hull mesh's highest point near her deck edge at z, each side (the bulwark's top). */
const bulwarkTop = (z: number) => {
  const def = VESSEL_DEFS.design;
  const plan = hullPlan(def);
  const pos = buildVesselMeshParts(def.hull, def.layout).hull.geometry.getAttribute('position');
  let top = -Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (Math.abs(v.z - z) < 0.3 && Math.abs(Math.abs(v.x) - plan.halfBeam(v.z)) < 0.12) top = Math.max(top, v.y);
  }
  return top;
};

describe('a deckhouse out to her sides', () => {
  it('is a raised deck: her bulwark risen along it by its height; set in from her sides, as before', () => {
    useDesign(type({ dhWidth: 0.3 }));
    const dh0 = VESSEL_DEFS.design.layout.deckhouse!;
    const zMid = (dh0.z0 + dh0.z1) / 2;
    const setIn = bulwarkTop(zMid);
    expect(dh0.full).toBeUndefined();
    useDesign(type({ dhWidth: 0 }));
    const dh = VESSEL_DEFS.design.layout.deckhouse!;
    expect(dh.full).toBe(true);
    const plan = hullPlan(VESSEL_DEFS.design);
    expect(bulwarkTop(zMid) - setIn).toBeCloseTo(dh.top - plan.deckY(zMid), 1);
  });

  it('its top walked out to her bulwarks (no rail along its sides), always, where the house leaves room', () => {
    useDesign(type({ dhWidth: 0, dhWalk: 0 }));
    const def = VESSEL_DEFS.design;
    const dh = def.layout.deckhouse!;
    expect(dh.walk).toBeDefined();
    const walk = vesselWalkArea(def, def.layout, []);
    const z = (dh.walk!.z0 + def.layout.wheelhouse!.front) / 2;
    const out = deckhouseHalfWidth(dh, z) - 0.2;
    expect(walk.walkable(out, z, dh.top)).toBe(true);
    expect(walk.walkable(-out, z, dh.top)).toBe(true);
  });
});
