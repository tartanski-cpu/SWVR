/**
 * A hull's shape and handling numbers from a vessel config block (modular boats M6a): the
 * game's hulls keep their tunable numbers in CONFIG.vessels (config.ts), and their hull
 * definitions take them from there.
 *
 * The config gives each boat as weighed: her whole mass, CG and radii of gyration with
 * everything aboard that's part of her (not cargo, not crew). The hull's lightship is that
 * less the modules that declare their own mass (`parts`: on the workboat, her engine and
 * batteries), so assembled from her recipe she comes out exactly as weighed.
 */
import type { HullDefinition } from '../modular/hull';
import { inertiaFromGyradius, lightshipOf, type PointMass } from '../modular/massProperties';
import type { VesselConfig } from '../vessel/vesselDef';

export type HullData = Pick<HullDefinition, 'form' | 'lightship' | 'addedMass' | 'damping' | 'resistance' | 'windage' | 'layout' | 'cargo' | 'spawn'>;

export function hullDataFrom(c: VesselConfig, parts: readonly PointMass[] = []): HullData {
  const weighed = { massKg: c.mass, cg: [...c.cg] as [number, number, number], inertia: inertiaFromGyradius(c.mass, c.gyradius) };
  return {
    form: { kind: 'chine', params: c.hull },
    lightship: lightshipOf(weighed, parts),
    addedMass: c.addedMass,
    damping: c.damping,
    resistance: c.resistance,
    windage: c.windage,
    layout: c.layout,
    cargo: c.cargo,
    spawn: c.spawn,
  };
}
