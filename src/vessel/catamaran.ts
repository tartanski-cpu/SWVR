/**
 * A catamaran's handling (owner, Oct 2026: the fast work cat; CONFIG.catamaran): the numbers
 * a boat built on a two-hull form takes for what two slim hulls do differently from one beamy
 * one. Her buoyancy, stability and contacts need nothing here: her stations already carry
 * both hulls (vessel/hullForm.ts, Station.demihull), and the physics damps each hull's heave
 * at its own centreline, which damps her roll (vessel/physics/vesselPhysics.ts).
 *
 *   resistance  slim demihulls' calm-water resistance on her own waterline length;
 *   rollGyradius  her rigid-body roll radius of gyration (m);
 *   addedRoll   her roll added inertia, as a fraction of her rigid-body roll inertia: each
 *               hull heaves against the water as she rolls, so its added mass in heave acts
 *               at half the spacing out: heaveAddedMass x mass x (spacing/2)^2 over
 *               mass x gyradius^2.
 */
import { CONFIG } from '../config';
import type { HullForm } from './hullForm';
import type { VesselConfig } from './vesselDef';

export interface CatamaranHandling {
  resistance: VesselConfig['resistance'];
  rollGyradius: number;
  addedRoll: number;
}

/**
 * Her handling from her form (`form.catamaran` must be set): her waterline length `lwl` and
 * the height her resistance acts at (`y`, mid-draught) are hers, the rest CONFIG.catamaran's.
 */
export function catamaranHandling(form: HullForm, lwl: number, resistanceY: number): CatamaranHandling {
  const cat = form.catamaran;
  if (!cat) throw new Error('catamaranHandling: not a catamaran hull form');
  const c = CONFIG.catamaran;
  const rollGyradius = c.rollGyradius * form.params.beamDeck;
  const addedRoll = (c.heaveAddedMass * (cat.spacing / 2) ** 2) / rollGyradius ** 2;
  return { resistance: { ...c.resistance, lwl, y: resistanceY }, rollGyradius, addedRoll };
}
