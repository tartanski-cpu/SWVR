/**
 * Where a game starts, and where a player steps ashore: the quay beside a berth.
 *
 * The career starts at Calder Haven (CONFIG.start: the berth, and the spot on the quay the
 * player stands at, facing the boat). A Voyage map starts at its own berth (world/maps.ts
 * `startBerth`), and the spot ashore is worked out from that berth: on the quay a step back
 * from its face (`CONFIG.start.quayBack` m beyond the berth's `shoreDist`), facing the water
 * (the owner, Oct 2026: on the Voyage maps you were put ashore at Calder's spot, which on a
 * coast map is open water in the middle of nowhere).
 */
import { CONFIG } from '../config';
import { VOYAGE_MAP_ID } from '../mode';
import { berthWithId } from './berths';
import type { BerthDef } from './defs';
import { voyageMap } from './maps';
import { freeBerthFor } from './slots';

export interface QuaySpot {
  x: number;
  z: number;
  /** The way the player faces (deg, as PlayerState.yaw: 0 looks north, 90 west). */
  yawDeg: number;
}

/** The berth the game starts at: the Voyage map's, else the career's. */
export function startBerthId(): string {
  return voyageMap(VOYAGE_MAP_ID)?.startBerth ?? CONFIG.start.berthId;
}

/**
 * The berth a boat of type `defId` starts at. In the career, Calder Haven's basin is dredged
 * to 4.5 m: a boat that can't lie anywhere there with her draught and `CONFIG.spawn.underKeel`
 * to spare (a deep tug, a big ship) starts instead at the deep-water port (`CONFIG.start.deepPort`,
 * Brannock Pier: some 35 m alongside its T-head), at the first of its berths with room for her,
 * else its cargo berth (owner, Oct 2026). Every other boat, and a Voyage map, starts as before.
 */
export function startBerthFor(defId: string): string {
  const id = startBerthId();
  if (voyageMap(VOYAGE_MAP_ID)?.startBerth) return id;
  const port = berthWithId(id)?.portId;
  if (!port || freeBerthFor({}, port, defId)) return id;
  // A ship too long for any of its berths still lies at its cargo berth, overhanging the
  // T-head's ends in deep water, rather than aground in Calder.
  const deep = `${CONFIG.start.deepPort}-cargo`;
  return freeBerthFor({}, CONFIG.start.deepPort, defId)?.id ?? (berthWithId(deep) ? deep : id);
}

/** The spot on the quay beside a berth, a step back from its face, facing the water. */
export function quaySpotByBerth(b: BerthDef): QuaySpot {
  const back = b.shoreDist + CONFIG.start.quayBack;
  return { x: b.x + b.shoreX * back, z: b.z + b.shoreZ * back, yawDeg: (Math.atan2(b.shoreX, b.shoreZ) * 180) / Math.PI };
}

/**
 * The spot ashore for a berth (by id): Calder's is the hand-placed one (CONFIG.start.quay);
 * any other's (named, or one along a quay face) is beside its face; an unknown berth falls back to the start.
 */
export function quaySpot(berthId: string | null | undefined): QuaySpot {
  const id = berthId ?? startBerthId();
  if (id === CONFIG.start.berthId) return CONFIG.start.quay;
  // Any berth she can lie at: the named ones and those along every quay face (world/berths.ts;
  // owner, Oct 2026: stepping ashore at Wemyss Bay, alongside a face with no named berth, put
  // him on the start's quay at Rothesay).
  const b = berthWithId(id);
  return b ? quaySpotByBerth(b) : quaySpot(startBerthId() === id ? CONFIG.start.berthId : startBerthId());
}
