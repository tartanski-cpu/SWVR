/**
 * A second boat in the world (multi-boat M2, for testing walking between boats before the
 * launch menu of M3): the environment intent `spawnBoat` (ref: her vessel type id) puts one
 * of the fleet afloat beside the players' home boat, `CONFIG.spawn.abeam` m off on her water
 * side (away from her berth when moored), lying the same way, stopped, anchor stowed. The
 * host alone makes her (intents are the host's); crew get her in the next snapshot and
 * build her view. Only a boat with a wheelhouse (one you can take the helm of).
 */
import { CONFIG } from '../config';
import { BERTHS } from '../world/archipelago';
import { placeVessel } from '../vessel/vesselControl';
import { hasWheelhouse, VESSEL_DEFS } from '../vessel/vesselDef';
import { createVesselState } from '../vessel/vesselState';
import { hullPlan } from '../vessel/layout';
import type { Intent } from './intents';
import { homeVessel, type WorldState } from './world';

/** Her heading (rad) from her orientation, 0 north, clockwise. */
function headingOf(q: readonly number[]): number {
  const [x, y, z, w] = q;
  return Math.atan2(-(2 * (x * z + w * y)), 1 - 2 * (x * x + y * y));
}

export function applySpawnBoatIntent(world: WorldState, intent: Intent): void {
  const defId = intent.ref ?? '';
  const def = VESSEL_DEFS[defId];
  const home = homeVessel(world);
  if (!def || !hasWheelhouse(def) || def.tow || !home) return;
  const n = (world.spawned = (world.spawned ?? 0) + 1);
  const id = `boat-${n}-${Math.floor(world.time)}`;
  const s = createVesselState(id, defId);
  // Her water side: away from the berth she's moored at, else to port.
  const h = headingOf(home.orientation);
  const berth = home.mooring.phase === 'moored' ? BERTHS.find((b) => b.id === home.mooring.berthId) : undefined;
  const sideX = berth ? -berth.shoreX : -Math.cos(h);
  const sideZ = berth ? -berth.shoreZ : -Math.sin(h);
  const d = CONFIG.spawn.abeam + hullPlan(def).halfBeam(0) + hullPlan(VESSEL_DEFS[home.defId]).halfBeam(0);
  placeVessel(s, home.position[0] + sideX * d, 0, home.position[2] + sideZ * d, (h * 180) / Math.PI);
  s.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
  world.vessels[id] = s;
}
