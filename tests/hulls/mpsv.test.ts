/**
 * The multipurpose offshore support vessel (owner, Oct 2026: "a much larger class of vessel",
 * a one-off for co-op missions; docs/OSV_PLAN.md, milestone 1: her hull and superstructure in
 * the hull study). Our own lines of the type: 75 x 18 m, 5.6 m draught, a round bilge, a long
 * low working deck aft, a forecastle carrying her superstructure and bridge, a helideck over it.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { DESIGNS } from '../../src/hulls/designs';
import { curveAt, hydrostatics, loft } from '../../src/hulls/loft';
import { hullFormFromDesign } from '../../src/vessel/hullForm';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { submergedSection } from '../../src/vessel/physics/sectionClip';
import { VESSEL_DEFS, wettedSurfaceAtDWL, type VesselDef } from '../../src/vessel/vesselDef';

const design = DESIGNS.find((d) => d.id === 'mpsv')!;
const lofted = loft(design);
const study = hydrostatics(lofted);
const form = hullFormFromDesign(design);

/** Her volume (m^3) and its centre's z, level at her DWL, from the game's stations. */
function immersed(): { vol: number; z: number } {
  let vol = 0;
  let mz = 0;
  for (const st of form.stations) {
    const o = { area: 0, cx: 0, cy: 0, maxDepth: 0 };
    submergedSection(st.polygon, st.polygon.map(([, y]) => -y), o);
    vol += o.area * st.weight;
    mz += o.area * st.weight * st.z;
  }
  return { vol, z: mz / vol };
}

describe('the multipurpose offshore support vessel (hull study)', () => {
  it('her size and type: 75 x 18 m, 5.6 m draught, about 5,000 t, a supply ship\'s full form', () => {
    expect(study.loa).toBeCloseTo(75, 6);
    expect(study.beam).toBeCloseTo(18, 6);
    expect(study.draught).toBeCloseTo(5.6, 6);
    // Her proportions: L/B about 4.2, B/T about 3.2, as the type's.
    expect(study.loa / study.beam).toBeGreaterThan(4);
    expect(study.beam / study.draught).toBeGreaterThan(3);
    expect(study.displacementT).toBeGreaterThan(4800);
    expect(study.displacementT).toBeLessThan(5300);
    // Full for her deck load, fine enough at her ends: block about 0.68, a full midship
    // section, a full waterplane aft for her working deck.
    expect(study.cb).toBeGreaterThan(0.64);
    expect(study.cb).toBeLessThan(0.74);
    expect(study.cwp).toBeGreaterThan(0.84);
    expect(study.cm).toBeGreaterThan(0.93);
    // Her centre of buoyancy a little aft of amidships (her full run aft).
    expect(study.lcb).toBeGreaterThan(0);
    expect(study.lcb).toBeLessThan(0.03 * study.loa);
  });

  it('stiff enough for her crane lifts: KM over 8 m, a GM about 2 m with her weight 6.5 m up', () => {
    expect(study.km).toBeGreaterThan(8);
    expect(study.km - 6.5).toBeGreaterThan(1.8);
  });

  it('a long low working deck aft (1.6 m freeboard, about 40 m of it), her forecastle a deck higher', () => {
    const fc = design.forecastle!;
    expect(curveAt(design.sheer, 0.3)).toBeCloseTo(1.6, 6);
    // Her working deck: from her transom to her forecastle's break.
    expect(fc.from * design.length).toBeGreaterThan(40);
    expect(fc.raise).toBeGreaterThan(2.5);
    // Her bottom flat amidships, rising aft to a transom just under the water (room for her
    // azimuth thrusters) and forward round her forefoot.
    expect(curveAt(design.keel, 0.5)).toBeCloseTo(-5.6, 6);
    expect(curveAt(design.keel, 0)).toBeGreaterThan(-1);
  });

  it('her superstructure on her forecastle, within her deck; the bridge on top, windows all round; a helideck over it', () => {
    const z = (t: number) => design.length / 2 - t * design.length;
    const forecastleAft = z(design.forecastle!.from);
    const houses = design.houses!;
    for (const hs of houses.slice(0, 3)) {
      // On the forecastle deck, aft of where her bow narrows past its width.
      expect(hs.z0).toBeLessThanOrEqual(forecastleAft);
      const tFront = (design.length / 2 - hs.z1) / design.length;
      expect(hs.halfWidth).toBeLessThanOrEqual(curveAt(design.halfBeam, tFront) + 0.05);
    }
    const bridge = houses[3];
    expect(bridge.panesFront).toBeGreaterThan(6);
    // Her aft bridge: a full row of windows over the working deck (cranes, DP).
    expect(bridge.panesBack).toBeGreaterThan(6);
    // Her bridge deck about 13 m over her waterline: the view over her bow and her deck.
    expect(curveAt(design.sheer, 0.75) + design.forecastle!.raise + bridge.above!).toBeGreaterThan(12);
    // The helideck: a flat platform, no windows, sitting on the bridge roof, about 21 m across.
    const heli = houses[4];
    expect(heli.panesFront + heli.panesSide + heli.panesBack).toBe(0);
    expect(heli.above! - (bridge.above! + bridge.height)).toBeGreaterThanOrEqual(0);
    expect(heli.above! - (bridge.above! + bridge.height)).toBeLessThan(0.3);
    expect(2 * heli.halfWidth).toBeGreaterThan(20);
    expect(heli.z0 - heli.z1).toBeGreaterThan(20);
  });

  it('in the game: her stations keep her lines\' volume, and she floats level on them', () => {
    const g = immersed();
    expect(Math.abs(g.vol - study.volume) / study.volume).toBeLessThan(0.03);
    const lc = VESSEL_DEFS.landingCraft;
    const mass = CONFIG.ocean.density * g.vol;
    // (Her weight 0.9 m over her waterline, 6.5 m over her keel.)
    const def = { ...lc, id: 'mpsvTest', hull: form, mass, cg: [0, 0.9, g.z], designVolume: g.vol, wettedSurface: wettedSurfaceAtDWL(form), layout: { ...lc.layout, wheelhouse: undefined } } as VesselDef;
    const h = uprightHydrostatics(def);
    expect(Math.abs(h.sinkage)).toBeLessThan(0.03);
    expect(Math.abs(h.lcgMinusLcb)).toBeLessThan(0.05);
    expect(h.gmt).toBeGreaterThan(1.5);
  });
});
