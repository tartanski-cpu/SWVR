import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';
import { buildHullForm, type HullForm } from './hullForm';

type WorkboatConfig = typeof CONFIG.vessels.workboat;

/**
 * Static description of a vessel type (shared by every vessel of that type).
 * Not part of WorldState: vessels reference it by `defId`.
 */
export interface VesselDef {
  id: string;
  hull: HullForm;
  mass: number;
  cg: Vec3;
  /** Principal moments of inertia about the CG in vessel axes: x = pitch, y = yaw, z = roll. */
  inertia: Vec3;
  /** Added-mass fractions in vessel axes: linear [sway (x), heave (y), surge (z)], angular [pitch, yaw, roll]. */
  addedLinear: Vec3;
  addedAngular: Vec3;
  damping: WorkboatConfig['damping'];
  /** Volume (m^3) displaced at equilibrium; used to scale added mass by immersion. */
  designVolume: number;
}

function fromConfig(id: string, c: WorkboatConfig): VesselDef {
  const m = c.mass;
  return {
    id,
    hull: buildHullForm(c.hull),
    mass: m,
    cg: c.cg,
    inertia: [m * c.gyradius.pitch ** 2, m * c.gyradius.yaw ** 2, m * c.gyradius.roll ** 2],
    addedLinear: [c.addedMass.sway, c.addedMass.heave, c.addedMass.surge],
    addedAngular: [c.addedMass.pitch, c.addedMass.yaw, c.addedMass.roll],
    damping: c.damping,
    designVolume: m / CONFIG.ocean.density,
  };
}

export const VESSEL_DEFS: Record<string, VesselDef> = {
  workboat: fromConfig('workboat', CONFIG.vessels.workboat),
};
