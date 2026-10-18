import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { gearOf } from '../boats/sims';
import type { VesselState } from '../vessel/vesselState';
import { vesselToWorld } from './recovery';

/**
 * A swimmer into a turning propeller (owner request: a bloody special effect, for fun).
 * Plain geometry, used by the swimmer's own game (it moves their body):
 *
 *   turning   the inboard diesel in gear (ahead or astern) over `minRpm`;
 *   where     each shaft's propeller hub (her `propeller.position`; twin screws either side
 *             of the centreline at `twinX`), in her axes, to the world;
 *   struck    the swimmer's chest within the blades' radius + `reach` of a hub.
 *
 * Then (app/App.ts) their view goes red and black and they're put back aboard; the host is
 * told (`rescuePropStrike`), so everyone sees the red spray (propStrikeView.ts) and hears it.
 * The swimmer in the life ring shouts for neutral first (recovery.ts).
 */

/** Her propeller hubs (vessel axes) and the blades' radius, while they're turning; none otherwise. */
export function turningPropellers(v: VesselState): { hubs: [number, number, number][]; radius: number } | null {
  const d = gearOf(v, 'diesel');
  if (!d || v.engine.gear === 0 || v.engine.rpm < CONFIG.rescue.propStrike.minRpm) return null;
  const [x, y, z] = d.propeller.position;
  const hubs: [number, number, number][] = d.twin && d.twinX ? [[-d.twinX, y, z], [d.twinX, y, z]] : [[x, y, z]];
  return { hubs, radius: d.propeller.diameter / 2 };
}

const hub = new THREE.Vector3();

/** The vessel whose turning propeller this point (world: a swimmer's chest) is in, or null. */
export function struckByPropeller(world: WorldState, chest: THREE.Vector3): VesselState | null {
  for (const v of Object.values(world.vessels)) {
    const p = turningPropellers(v);
    if (!p) continue;
    for (const h of p.hubs) {
      if (vesselToWorld(v, h, hub).distanceTo(chest) < p.radius + CONFIG.rescue.propStrike.reach) return v;
    }
  }
  return null;
}
