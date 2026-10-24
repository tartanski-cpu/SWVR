/**
 * A second boat in the world (multi-boat M2, for testing walking between boats before the
 * launch menu of M3): the environment intent `spawnBoat` (ref: her vessel type id) puts one
 * of the fleet: in Voyage, in the game's harbour, made fast (owner, Oct 2026: boats spawned
 * loose blew away): moored at a free berth her size, else at anchor off it (core/launch.ts
 * berthOrAnchor). Otherwise, or with no room for either, afloat beside the players' home boat, `CONFIG.spawn.abeam` m off
 * on her water side (away from her berth when moored), lying the same way, stopped. The
 * host alone makes her (intents are the host's); crew get her in the next snapshot and
 * build her view. Only a boat with a wheelhouse (one you can take the helm of).
 */
import { CONFIG } from '../config';
import { berthWithId } from '../world/berths';
import { placeVessel } from '../vessel/vesselControl';
import { hasWheelhouse, VESSEL_DEFS } from '../vessel/vesselDef';
import { createVesselState } from '../vessel/vesselState';
import { hullPlan } from '../vessel/layout';
import type { Intent } from './intents';
import { homeVessel, type WorldState } from './world';
import { berthOrAnchor, gameHarbour } from './launch';

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
  const port = world.voyage ? gameHarbour(world) : null;
  if (port && berthOrAnchor(world, s, port)) {
    world.vessels[id] = s;
    return;
  }
  // Her water side: away from the berth she's moored at, else to port.
  const h = headingOf(home.orientation);
  const berth = home.mooring.phase === 'moored' && home.mooring.berthId ? berthWithId(home.mooring.berthId) : undefined;
  const sideX = berth ? -berth.shoreX : -Math.cos(h);
  const sideZ = berth ? -berth.shoreZ : -Math.sin(h);
  // Her spot abeam: the first clear one outward (a second boat spawned on top of the first
  // would be two hulls in one another's space, which the contact forces don't survive).
  const room = (v: { defId: string }) => Math.abs(hullPlan(VESSEL_DEFS[v.defId]).halfBeam(0)) + CONFIG.spawn.abeam / 2;
  let d = CONFIG.spawn.abeam + hullPlan(def).halfBeam(0) + hullPlan(VESSEL_DEFS[home.defId]).halfBeam(0);
  for (let k = 0; k < 12; k++, d += 2 * room(s) + CONFIG.spawn.abeam) {
    const x = home.position[0] + sideX * d;
    const z = home.position[2] + sideZ * d;
    const clear = Object.values(world.vessels).every((o) => o.id === home.id || Math.hypot(o.position[0] - x, o.position[2] - z) > room(o) + room(s) + Math.abs(hullPlan(VESSEL_DEFS[o.defId]).stem) / 2);
    if (clear) break;
  }
  placeVessel(s, home.position[0] + sideX * d, 0, home.position[2] + sideZ * d, (h * 180) / Math.PI);
  s.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
  world.vessels[id] = s;
}
