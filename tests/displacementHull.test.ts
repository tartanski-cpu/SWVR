/**
 * A displacement hull's resistance (owner, Oct 2026: "respect the displacement speed where
 * possible"; vessel/displacementHull.ts). On the Shipyard's small tug, even two 750 kW
 * diesels drive her only a little past her hull speed; a planing hull's curve let them push
 * her to 18 kn. The stern trawler keeps her 10-11 kn.
 */
import { describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { DESIGN_HULLS, ENGINES } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';
import { displacementResistance } from '../src/vessel/displacementHull';
import { calmWaterResistance } from '../src/vessel/physics/propulsion';
import { VESSEL_DEFS, type VesselDef } from '../src/vessel/vesselDef';

/** Top speed (kn) where her resistance's power meets 0.55 of the engines' (the game's propulsive efficiency, from the landing craft's trial). */
function topKn(def: VesselDef, kw: number): number {
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (calmWaterResistance(def, m) * m < 0.55 * kw * 1000) lo = m;
    else hi = m;
  }
  return lo / 0.5144;
}

/** The Shipyard's boat of hull type `name` with an engine, and her definition on the displacement curve. */
function boat(name: string, engine: number, twin: number): { asBuilt: VesselDef; displacement: VesselDef; kw: number; fnKn: (fn: number) => number } {
  const hull = DESIGN_HULLS.findIndex((h) => h.name.startsWith(name));
  useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, engine, twin } as ShipDesign);
  const asBuilt = VESSEL_DEFS.design;
  const r = asBuilt.resistance;
  return {
    asBuilt,
    displacement: { ...asBuilt, resistance: displacementResistance(r.lwl, r.y) },
    kw: ENGINES[engine].kw * (twin ? 2 : 1),
    fnKn: (fn) => (fn * Math.sqrt(9.81 * r.lwl)) / 0.5144,
  };
}

describe('a displacement hull\'s resistance: a wall past her hull speed', () => {
  it('the small tug on twin 750 kW: only a little past hull speed (Fn about 0.5; the trial gives 10.4 kn), where a planing curve let her run away', () => {
    const big = ENGINES.findIndex((e) => e.kw === 750);
    const tug = boat('Small tug', big, 1);
    const kn = topKn(tug.displacement, tug.kw);
    expect(kn).toBeLessThan(tug.fnKn(0.55));
    expect(kn).toBeGreaterThan(tug.fnKn(0.4));
    expect(topKn(tug.asBuilt, tug.kw)).toBeGreaterThan(kn + 3);
  });

  it('a tug\'s ordinary engines reach about her hull speed; the trawler keeps her 10 kn', () => {
    const tugDiesel = ENGINES.findIndex((e) => e.kw === 450);
    const tug = boat('Small tug', tugDiesel, 0);
    const kn = topKn(tug.displacement, tug.kw);
    expect(kn).toBeGreaterThan(tug.fnKn(0.35));
    expect(kn).toBeLessThan(tug.fnKn(0.45));
    const trawler = boat('Stern trawler', ENGINES.findIndex((e) => e.kw === 750), 0);
    const tk = topKn(trawler.displacement, trawler.kw);
    expect(tk).toBeGreaterThan(9.5);
    expect(tk).toBeLessThan(12);
  });

  it('each step past hull speed costs ever more power', () => {
    const tug = boat('Small tug', 0, 0).displacement;
    const at = (fn: number) => calmWaterResistance(tug, fn * Math.sqrt(9.81 * tug.resistance.lwl)) / (tug.mass * 9.81);
    expect(at(0.5) - at(0.45)).toBeGreaterThan(at(0.45) - at(0.4));
    expect(at(0.6)).toBeGreaterThan(0.4);
  });
});
