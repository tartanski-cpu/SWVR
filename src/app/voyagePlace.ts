/**
 * Voyage mode remembers where you are on each map between sessions (the owner, Oct 2026:
 * close the browser, come back to the map, and you're in the same place). Nothing else of
 * a voyage is saved.
 *
 * What's kept (`swvr.voyage.<map>` in the browser's storage): the boat's position and
 * heading, the berth she's moored at (if any), her anchor if it's set (where it lies and
 * the chain out: the timber run's way back, voyage/timber.ts, finds her anchored where she
 * was left), and whether you were aboard. Saved every
 * CONFIG.voyage.rememberEveryS s and as the page closes, alone or hosting (a crew-mate's
 * page keeps nothing: the world is the host's). Restored as the world is made: moored at
 * the berth again, lines fast, or afloat where she was, stopped, at anchor or anchor stowed; you aboard
 * or on the quay beside her. `?start` on the address starts at the map's berth again.
 */
import { CONFIG } from '../config';
import { moorAtBerth, type WorldState } from '../core/world';
import { placeAshore } from '../player/playerControl';
import { placeVessel } from '../vessel/vesselControl';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { berthWithId } from '../world/berths';
import { groundHeight } from '../world/terrain';

export interface VoyagePlace {
  x: number;
  z: number;
  headingDeg: number;
  /** Moored at this berth (else afloat, free). */
  berthId: string | null;
  /** Her anchor on the bottom (world x, z) and the chain out (m), if it was set. */
  anchor?: { x: number; z: number; rodeM: number };
  aboard: boolean;
  /** When it was saved (ms since the epoch). */
  t: number;
}

export const placeKey = (mapId: string): string => `swvr.voyage.${mapId}`;

/** Her heading (deg true) from her orientation. */
export function headingOf(v: VesselState): number {
  const [qx, qy, qz, qw] = v.orientation;
  return ((Math.atan2(-(2 * (qx * qz + qw * qy)), 1 - 2 * (qx * qx + qy * qy)) * 180) / Math.PI + 360) % 360;
}

/** The place to remember now: hers and the player's. */
export function placeOf(world: WorldState, v: VesselState, playerId: string): VoyagePlace {
  const moored = v.mooring.phase === 'moored' ? v.mooring.berthId : null;
  const a = v.anchor;
  const anchor = !moored && a.phase === 'set' ? { anchor: { x: a.x, z: a.z, rodeM: a.rodeM } } : {};
  return { x: v.position[0], z: v.position[2], headingDeg: headingOf(v), berthId: moored, ...anchor, aboard: world.players[playerId]?.aboardVesselId === v.id, t: Date.now() };
}

export function savedPlace(mapId: string, storage: Pick<Storage, 'getItem'> = localStorage): VoyagePlace | null {
  try {
    const p = JSON.parse(storage.getItem(placeKey(mapId)) ?? 'null') as VoyagePlace | null;
    return p && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.headingDeg) ? p : null;
  } catch {
    return null;
  }
}

export function rememberPlace(mapId: string, place: VoyagePlace, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(placeKey(mapId), JSON.stringify(place));
  } catch {
    // Not saved (storage full or off).
  }
}

export function forgetPlace(mapId: string, storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    storage.removeItem(placeKey(mapId));
  } catch {
    // Nothing to forget.
  }
}

/**
 * Put her and the player back where they were. A berth that's gone (the map changed) or a
 * spot now on land (the ground was rebuilt) is left alone: the map's start stays. Returns
 * whether the place was taken.
 */
export function restorePlace(world: WorldState, v: VesselState, playerId: string, place: VoyagePlace): boolean {
  const p = world.players[playerId];
  if (place.berthId) {
    const b = berthWithId(place.berthId);
    if (!b) return false;
    moorAtBerth(v, b);
  } else {
    // Afloat, free: enough water under her, stopped.
    if (groundHeight(place.x, place.z) > -CONFIG.voyage.rememberMinDepth) return false;
    placeVessel(v, place.x, 0, place.z, place.headingDeg);
    v.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
    v.controls.lever = 0;
    // Her anchor down where it was, the chain out as it was, the windlass switch on.
    const a = place.anchor;
    if (a && [a.x, a.z, a.rodeM].every(Number.isFinite) && groundHeight(a.x, a.z) < 0) {
      v.anchor = { phase: 'set', x: a.x, z: a.z, rodeM: a.rodeM, tension: 0, dragging: false };
      v.controls.anchor = 1;
    }
  }
  if (!p) return true;
  if (place.aboard) {
    p.aboardVesselId = v.id;
    p.position = [...VESSEL_DEFS[v.defId].boardingSpot];
    p.yaw = 0;
    p.mode = 'walk';
    delete p.velocity;
  } else placeAshore(p, place.berthId);
  return true;
}
