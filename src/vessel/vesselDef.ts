import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';
import { buildHullForm, type HullForm } from './hullForm';

/**
 * Shape of a vessel's config block. Every vessel type in CONFIG.vessels uses this
 * structure, so adding a boat = adding a config block + one line in VESSEL_DEFS.
 */
export type VesselConfig = typeof CONFIG.vessels.workboat;

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
  damping: VesselConfig['damping'];
  /** Volume (m^3) displaced at equilibrium; used to scale added mass by immersion. */
  designVolume: number;
  /** Wetted surface (m^2) at the DWL, from the stations. */
  wettedSurface: number;
  resistance: VesselConfig['resistance'];
  engine: VesselConfig['engine'];
  propeller: VesselConfig['propeller'];
  rudder: VesselConfig['rudder'];
  /** Where players stand after boarding (vessel axes). */
  boardingSpot: Vec3;
  /** Debug spawn / drop test placement. */
  spawn: VesselConfig['spawn'];
  /** Deck layout: wheelhouse, bulwarks, walkable margins. */
  layout: VesselConfig['layout'];
  bridge: VesselConfig['bridge'];
  navLights: VesselConfig['navLights'];
  exhaust: VesselConfig['exhaust'];
  anchor: VesselConfig['anchor'];
  cargo: VesselConfig['cargo'];
  cabinLight: VesselConfig['cabinLight'];
  spotlight: VesselConfig['spotlight'];
  mooring: VesselConfig['mooring'];
}

/** Wetted surface at the DWL: submerged girth of each station times its spacing. */
function wettedSurfaceAtDWL(hull: HullForm): number {
  let s = 0;
  for (const st of hull.stations) {
    let girth = 0;
    const p = st.polygon;
    // Hull edges only (skip the deck edge, last -> first).
    for (let i = 0; i < p.length - 1; i++) {
      let [x0, y0] = p[i];
      let [x1, y1] = p[i + 1];
      if (y0 > 0 && y1 > 0) continue;
      // Clip the segment to y <= 0.
      if (y0 > 0) [x0, y0] = [x0 + ((x1 - x0) * (0 - y0)) / (y1 - y0), 0];
      if (y1 > 0) [x1, y1] = [x1 + ((x0 - x1) * (0 - y1)) / (y0 - y1), 0];
      girth += Math.hypot(x1 - x0, y1 - y0);
    }
    s += girth * st.weight;
  }
  return s;
}

export function fromConfig(id: string, c: VesselConfig): VesselDef {
  const m = c.mass;
  const hull = buildHullForm(c.hull);
  return {
    id,
    hull,
    mass: m,
    cg: c.cg,
    inertia: [m * c.gyradius.pitch ** 2, m * c.gyradius.yaw ** 2, m * c.gyradius.roll ** 2],
    addedLinear: [c.addedMass.sway, c.addedMass.heave, c.addedMass.surge],
    addedAngular: [c.addedMass.pitch, c.addedMass.yaw, c.addedMass.roll],
    damping: c.damping,
    designVolume: m / CONFIG.ocean.density,
    wettedSurface: wettedSurfaceAtDWL(hull),
    resistance: c.resistance,
    engine: c.engine,
    propeller: c.propeller,
    rudder: c.rudder,
    boardingSpot: c.boardingSpot,
    spawn: c.spawn,
    layout: c.layout,
    bridge: c.bridge,
    navLights: c.navLights,
    exhaust: c.exhaust,
    anchor: c.anchor,
    cargo: c.cargo,
    cabinLight: c.cabinLight,
    spotlight: c.spotlight,
    mooring: c.mooring,
  };
}

/** Registry of vessel types. To add a boat: add a config block, then a line here. */
export const VESSEL_DEFS: Record<string, VesselDef> = {
  workboat: fromConfig('workboat', CONFIG.vessels.workboat),
};
