/**
 * Level of detail by distance to the nearest player (multi-boat M4, docs/MULTI_BOAT.md).
 * The owner's rule: boats near you move exactly in the waves; far ones are simulated
 * cheaply. Each boat's level (`VesselState.lod`, set by the host each tick, so crew get it
 * in the snapshot):
 *
 *   near   within CONFIG.lod.near m of a player (or a player is aboard): every physics
 *          station, every tick, as always;
 *   mid    within CONFIG.lod.mid m: every second station (their weights carried over, so
 *          her displacement is the same), every tick;
 *   far    beyond: CONFIG.lod.farStations stations, and, when nothing holds her (not moored,
 *          not touching, not on a slip or a crane, not towed or towing), stepped every
 *          other tick at twice the step.
 *
 * Only the other players' boats get a level (boats with a wheelhouse that aren't the game's
 * home boat): the home boat, the tows, the skiff and the traffic are simulated as they always
 * were, wherever the players are (`lodApplies`).
 *
 * The views (App.ts) use the viewer's own distance for what's drawn: wake and spray only
 * within `mid`, smoke within `near`, a wheelhouse's small parts only with the eye in it.
 */
import { CONFIG } from '../config';
import { physicsStations, type HullForm, type Station } from '../vessel/hullForm';
import { hasWheelhouse, VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import type { WorldState } from './world';

export type VesselLod = 'near' | 'mid' | 'far';

/** How far (m) the nearest player is from a boat: a player aboard her is at 0; one aboard another boat is where that boat is. */
export function nearestPlayerDistance(world: WorldState, v: VesselState): number {
  let best = Infinity;
  for (const p of Object.values(world.players)) {
    if (p.aboardVesselId === v.id) return 0;
    const at = p.aboardVesselId ? world.vessels[p.aboardVesselId]?.position : p.position;
    if (!at) continue;
    const d = Math.hypot(at[0] - v.position[0], at[2] - v.position[2]);
    if (d < best) best = d;
  }
  return best;
}

/** Does a boat get a level at all: another player's boat (a wheelhouse, not the home boat, not a tow or a tender)? */
export function lodApplies(world: WorldState, v: VesselState): boolean {
  if (v.id === world.homeVesselId || v.tender) return false;
  const def = VESSEL_DEFS[v.defId];
  return !!def && hasWheelhouse(def) && !def.tow;
}

export function vesselLod(world: WorldState, v: VesselState): VesselLod {
  if (!lodApplies(world, v)) return 'near';
  const d = nearestPlayerDistance(world, v);
  return d <= CONFIG.lod.near ? 'near' : d <= CONFIG.lod.mid ? 'mid' : 'far';
}

const REDUCED = new WeakMap<HullForm, Map<number, Station[]>>();

/**
 * `count` of a hull's physics stations spread along her, each carrying the integration
 * weight of the stations it stands for (so Σ weight, her displacement and her trim come
 * out the same to first order). Built once per hull and count.
 */
export function reducedStations(hull: HullForm, count: number): Station[] {
  const full = physicsStations(hull);
  if (count >= full.length) return full;
  let byCount = REDUCED.get(hull);
  if (!byCount) REDUCED.set(hull, (byCount = new Map()));
  let out = byCount.get(count);
  if (out) return out;
  // The chosen stations: evenly spaced by index, the ends always in.
  const picks = Array.from({ length: count }, (_, i) => Math.round((i * (full.length - 1)) / (count - 1)));
  out = picks.map((i) => ({ ...full[i], weight: 0 }));
  // Each full station's weight goes to the nearest chosen one.
  for (let i = 0; i < full.length; i++) {
    let k = 0;
    for (let j = 1; j < picks.length; j++) if (Math.abs(picks[j] - i) < Math.abs(picks[k] - i)) k = j;
    out[k].weight += full[i].weight;
  }
  byCount.set(count, out);
  return out;
}

/** The stations a boat is floated on at a level. */
export function lodStations(hull: HullForm, lod: VesselLod): Station[] {
  const full = physicsStations(hull);
  if (lod === 'near') return full;
  if (lod === 'mid') return reducedStations(hull, Math.max(CONFIG.lod.farStations, Math.ceil(full.length / 2)));
  return reducedStations(hull, CONFIG.lod.farStations);
}

/** Is she held by anything (moored, touching, on a slip or a crane, towed or towing)? Then she's stepped every tick whatever her level. */
export function heldInPlace(world: WorldState, v: VesselState, touching: boolean): boolean {
  if (touching || v.mooring.phase !== 'free' || v.slip || (v.tender && v.tender.phase !== 'free')) return true;
  // On a towline: towing (her own) or towed (any boat's on her).
  const lines = world.tow?.lines ?? {};
  return !!lines[v.id] || Object.values(lines).some((l) => l.target === `v:${v.id}`);
}
