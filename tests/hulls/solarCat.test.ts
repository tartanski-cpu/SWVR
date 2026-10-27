/**
 * The solar catamaran (owner, Oct 2026: a one-off to try solar and battery power, from renders
 * and a scale model of a 16 m solar power cat being built of foam and plywood; our own lines
 * of her size and type). Hull only for now. Her weight is the Shipyard's estimate for a foam
 * and plywood hull of her lines (16 kg/m2 of hull, 9 of house, against aluminium's 35 and 18:
 * about 4.8 t of structure) with her electric outfit in place of a diesel's (two motors and
 * pods 0.3 t, a 100 kWh battery 0.7 t, about 70 m2 of solar panels 0.8 t, her long house):
 * about 10.7 t, so she's drawn to float at that. Redrawn after a design review: her wet deck
 * 1.0 m up, a wave-piercer's centre bow, flare and freeboard forward, a moderate V under
 * near-upright sides (a fifth less wetted surface than her first deep V).
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
const area = (poly: [number, number][], s: number) => submergedSection(poly, poly.map(([, y]) => s - y), { area: 0, cx: 0, cy: 0, maxDepth: 0 }).area;

describe('the solar catamaran (hull study)', () => {
  it('16 x 5.2 m, two very slim hulls 0.54 m wide at the waterline, her wet deck 1.0 m up', () => {
    expect(study.loa).toBeCloseTo(16, 6);
    expect(study.beam).toBeCloseTo(5.2, 3);
    const hullWl = study.beamWl - design.catamaran!.spacing;
    expect(hullWl).toBeGreaterThan(0.52);
    expect(hullWl).toBeLessThan(0.56);
    expect(study.lwl / hullWl).toBeGreaterThan(25);
    expect(design.catamaran!.tunnel).toBeGreaterThanOrEqual(1.0);
  });

  it('floats at her estimated weight, light foam and plywood: about 10.7 t, under 0.9 m draught', () => {
    expect(study.displacementT).toBeGreaterThan(10.4);
    expect(study.displacementT).toBeLessThan(11.0);
    expect(study.draught).toBeLessThan(0.9);
    // Stiff: her hulls far apart for their size.
    expect(study.km).toBeGreaterThan(6);
  });

  it('her centre bow: clear of the water in calm (its keel 0.5 m up), its buoyancy there when her bows pierce a wave', () => {
    const fwd = form.stations.filter((s) => s.polygon.length === 13);
    expect(fwd).toHaveLength(form.stations.length);
    // Its keel (the polygon's middle point) at the lowest 0.5 m over her waterline.
    const keels = form.stations.map((s) => s.polygon[6][1]);
    expect(Math.min(...keels)).toBeGreaterThan(0.45);
    expect(Math.min(...keels)).toBeLessThan(design.catamaran!.tunnel - 0.3);
    // Forward, a wave up to her wet deck finds it: more buoyancy than her two hulls alone.
    const bow = [...form.stations].sort((a, b) => a.z - b.z)[3];
    const flat = bow.polygon.map(([x, y], k) => [x, k === 6 ? bow.polygon[5][1] : y] as [number, number]);
    const s = design.catamaran!.tunnel;
    expect(area(bow.polygon as [number, number][], s)).toBeGreaterThan(area(flat, s) + 0.1);
    // In calm water it adds nothing.
    expect(area(bow.polygon as [number, number][], 0)).toBeCloseTo(area(flat, 0), 9);
  });

  it('in the game: her hulls float her lines\' volume on little wetted surface, very easily driven (about 7 kn on 10 kW)', () => {
    let vol = 0;
    for (const st of form.stations) vol += area(st.polygon as [number, number][], 0) * st.weight;
    expect(Math.abs(vol - study.volume) / study.volume).toBeLessThan(0.05);
    // A fifth less than her first lines' deep V (73.6 m2).
    expect(wettedSurfaceAtDWL(form)).toBeLessThan(60);
    const wet = form.stations.filter((st) => st.polygon.some(([, y]) => y < 0)).map((st) => st.z);
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
    expect(top(10)).toBeGreaterThan(6.5);
    expect(top(10)).toBeLessThan(7.5);
    expect(top(2)).toBeGreaterThan(3.5);
  });
});
