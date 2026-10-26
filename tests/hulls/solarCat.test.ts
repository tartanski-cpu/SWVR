/**
 * The solar catamaran (owner, Oct 2026: a one-off to try solar and battery power, from renders
 * and a scale model of a 16 m solar power cat being built of foam and plywood; our own lines
 * of her size and type). Hull only for now. Her weight is the Shipyard's estimate for a foam
 * and plywood hull of her lines (16 kg/m2 of hull, 9 of house, against aluminium's 35 and 18:
 * 4.75 t of structure) with her electric outfit in place of a diesel's (two motors and pods
 * 0.3 t, a 100 kWh battery 0.7 t, about 70 m2 of solar panels 0.8 t, her long house): about
 * 10.7 t, so she's drawn to float at that.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { DESIGNS } from '../../src/hulls/designs';
import { hydrostatics, loft } from '../../src/hulls/loft';
import { catamaranHandling } from '../../src/vessel/catamaran';
import { hullFormFromDesign } from '../../src/vessel/hullForm';
import { calmWaterResistance } from '../../src/vessel/physics/propulsion';
import { submergedSection } from '../../src/vessel/physics/sectionClip';
import { VESSEL_DEFS, wettedSurfaceAtDWL, type VesselDef } from '../../src/vessel/vesselDef';

const design = DESIGNS.find((d) => d.id === 'solarCat')!;
const study = hydrostatics(loft(design));
const form = hullFormFromDesign(design);

describe('the solar catamaran (hull study)', () => {
  it('16 x 5.2 m, two very slim hulls 0.54 m wide at the waterline, a wet deck clear of the water', () => {
    expect(study.loa).toBeCloseTo(16, 6);
    expect(study.beam).toBeCloseTo(5.2, 3);
    const hullWl = study.beamWl - design.catamaran!.spacing;
    expect(hullWl).toBeGreaterThan(0.52);
    expect(hullWl).toBeLessThan(0.56);
    expect(study.lwl / hullWl).toBeGreaterThan(25);
    expect(design.catamaran!.tunnel).toBeGreaterThanOrEqual(0.7);
  });

  it('floats at her estimated weight, light foam and plywood: about 10.7 t, 1.2 m draught', () => {
    expect(study.displacementT).toBeGreaterThan(10.2);
    expect(study.displacementT).toBeLessThan(11.2);
    expect(study.draught).toBeCloseTo(1.2, 3);
    // Stiff: her hulls far apart for their size.
    expect(study.km).toBeGreaterThan(6);
  });

  it('in the game: her two hulls float her lines\' volume, and she\'s very easily driven (6-7 kn on 10 kW)', () => {
    let vol = 0;
    for (const st of form.stations) {
      const o = { area: 0, cx: 0, cy: 0, maxDepth: 0 };
      submergedSection(st.polygon, st.polygon.map(([, y]) => -y), o);
      vol += o.area * st.weight;
    }
    expect(Math.abs(vol - study.volume) / study.volume).toBeLessThan(0.05);
    const wet = form.stations.filter((s) => s.polygon.some(([, y]) => y < 0)).map((s) => s.z);
    const h = catamaranHandling(form, Math.max(...wet) - Math.min(...wet), form.params.keelY / 2);
    const def = { ...VESSEL_DEFS.landingCraft, hull: form, mass: vol * CONFIG.ocean.density, designVolume: vol, wettedSurface: wettedSurfaceAtDWL(form), resistance: h.resistance } as VesselDef;
    // Her speed (kn) where the resistance's power meets `kw` at the game's propulsive efficiency (0.55).
    const top = (kw: number) => {
      let lo = 0;
      let hi = 15;
      for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2;
        if (calmWaterResistance(def, m) * m < 0.55 * kw * 1000) lo = m;
        else hi = m;
      }
      return lo / 0.5144;
    };
    expect(top(10)).toBeGreaterThan(6);
    expect(top(10)).toBeLessThan(7.5);
    expect(top(2)).toBeGreaterThan(3);
  });
});
