/**
 * The timber run, Workboat World's side (owner's spec, 23 Oct 2026; docs/metaverse-contract.md;
 * the handoff itself: voyage/metaverse.ts): anchor in the marked bay, go ashore to the timber
 * camp (the Timber game), and come back to a barge of logs on your towline to sell at the
 * timber merchant.
 *
 *   The hotspot    `HotspotWatch`: the anchor let go and set there, under `maxSpeedKn`,
 *                  inside the site's radius, held `holdS` s: then straight to the timber camp
 *                  (owner: seamless, no prompt).
 *   The log barge  the towable work barge (CONFIG.vessels.barge, 9 m) with logs stacked on her
 *                  deck (voyage/timberView.ts), `world.timber.barges[id].logs`. The logs are
 *                  point masses on her deck (`logKg` each, cargo/cargo.ts payloadOf), so a full
 *                  barge sits deeper and tows heavier: more resistance, more to stop and turn.
 *                  She's towed, cast off and made fast like any tow (tow/tow.ts).
 *   The merchant   at a harbour's berth (`merchants`): the barge brought within `sellRangeM` of
 *                  its quay, the boat stopped, and the sale is offered: logs × `pricePerLog`.
 *                  Sold, the barge is gone and the money is paid in.
 *
 * Plain JSON in the world, as everything the host decides; no page or scene here.
 */
import { CONFIG } from '../config';
import { post, createCareer, money } from '../career/career';
import type { WorldState } from '../core/world';
import type { EntityId } from '../core/ids';
import { makeFastNow } from '../tow/tow';
import { createVesselState } from '../vessel/vesselState';
import { placeVessel } from '../vessel/vesselControl';
import type { VesselState } from '../vessel/vesselState';
import { berthWithId } from '../world/berths';
import { groundHeight } from '../world/terrain';
import { latLonOf, SITES, worldOf, type MetaverseSite } from './metaverse';

/** The log barges in the world: each a towable barge's vessel id, with her load. */
export interface TimberState {
  barges: Record<EntityId, { logs: number }>;
  seq: number;
}

/** The kind of vessel a log barge is: the towable work barge. */
export const LOG_BARGE_DEF = 'barge';

/** A load as the contract sends it, kept within what a barge carries. */
export function clampLogs(logs: number): number {
  return Math.max(0, Math.min(CONFIG.voyage.timber.maxLogs, Math.floor(Number.isFinite(logs) ? logs : 0)));
}

/** A log barge into the world at (x, z), heading `headingDeg`, with this many logs: her id. */
export function spawnLogBarge(world: WorldState, x: number, z: number, headingDeg: number, logs: number): EntityId {
  const t = (world.timber ??= { barges: {}, seq: 0 });
  const id = `logbarge-${++t.seq}-${Math.floor(world.time)}`;
  const s = createVesselState(id, LOG_BARGE_DEF);
  placeVessel(s, x, 0, z, headingDeg);
  world.vessels[id] = s;
  t.barges[id] = { logs: clampLogs(logs) };
  return id;
}

/** The logs on her deck as point masses (vessel axes), for the physics: one per log, in its tier. */
export function logPayload(world: WorldState, vesselId: EntityId): { mass: number; pos: [number, number, number] }[] {
  const b = world.timber?.barges[vesselId];
  if (!b || !b.logs) return [];
  const c = CONFIG.voyage.timber;
  const tiers = Math.ceil(b.logs / c.logsPerTier);
  // All of it at the stack's middle height: the hull's own CG is low, the deck 0.5 m up.
  return [{ mass: b.logs * c.logKg, pos: [0, CONFIG.vessels.barge.hull.deckYAft + (tiers * c.logDiameter) / 2, 0] }];
}

/**
 * The way back from the camp with a barge: she lies at the site's barge spawn, on the boat's
 * towline. A boat anchored further off than the line reaches (she can be anywhere inside the
 * hotspot) gets the barge brought in along the line toward her, so it can still be made fast.
 */
export function bargeFromCamp(world: WorldState, site: MetaverseSite, boat: VesselState, logs: number): EntityId | null {
  const at = worldOf(site.mapId, site.bargeSpawn.lat, site.bargeSpawn.lon);
  if (!at) return null;
  const [bx, , bz] = boat.position;
  const d = Math.hypot(at.x - bx, at.z - bz);
  const reach = CONFIG.voyage.timber.bargeOffM;
  const k = d > reach ? reach / d : 1;
  const x = bx + (at.x - bx) * k;
  const z = bz + (at.z - bz) * k;
  // Her bow toward the boat, so the line leads off it.
  const heading = ((Math.atan2(bx - x, -(bz - z)) * 180) / Math.PI + 360) % 360;
  const id = spawnLogBarge(world, x, z, heading, logs);
  // A line she had out (an earlier barge) is let go: this one comes aboard on it.
  if (world.tow?.lines) delete world.tow.lines[boat.id];
  makeFastNow(world, boat.id, id);
  return id;
}

/** The world position of a site's hotspot centre on its map, or null. */
export function hotspotAt(site: MetaverseSite): { x: number; z: number } | null {
  return worldOf(site.mapId, site.lat, site.lon);
}

/** The sites on this map. */
export function sitesOn(mapId: string | null): MetaverseSite[] {
  return mapId ? SITES.filter((s) => s.mapId === mapId) : [];
}

/** Her speed over the ground (knots). */
export const speedKn = (v: VesselState): number => (Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) * 3600) / 1852;

/**
 * Watching for the boat anchored in a hotspot: each frame, her state in, and the site to go
 * ashore at out (owner, 23 Oct 2026: seamless, no prompt: anchor there and you're taken to
 * the timber camp). It goes once the anchor has been let go and set there (not one that was
 * already set as the page loaded: back from the camp she lies anchored in the bay, and must
 * not go straight back), with her still and inside the radius for `holdS`.
 */
export class HotspotWatch {
  private held = 0;
  private site: MetaverseSite | null = null;
  /** Seen her not anchored in a hotspot since the start: an anchor set in one now counts. */
  private armed = false;

  /** The site to go ashore at now, or null. */
  update(v: VesselState | undefined, sites: readonly MetaverseSite[], dt: number, allowed = true): MetaverseSite | null {
    const c = CONFIG.voyage.timber;
    const inside = v
      ? sites.find((s) => {
          const at = hotspotAt(s);
          return at && Math.hypot(v.position[0] - at.x, v.position[2] - at.z) <= s.radiusM;
        })
      : undefined;
    if (v && (!inside || v.anchor.phase !== 'set')) this.armed = true;
    const ok = !!v && !!inside && allowed && this.armed && v.anchor.phase === 'set' && speedKn(v) < c.maxSpeedKn;
    this.held = ok ? this.held + dt : 0;
    this.site = ok && this.held >= c.holdS ? inside! : null;
    return this.site;
  }

  get offered(): MetaverseSite | null {
    return this.site;
  }
}

/** A timber merchant: at a harbour berth on a map (`CONFIG.voyage.timber.merchants`). */
export interface Merchant {
  mapId: string;
  berthId: string;
  name: string;
}

export function merchantsOn(mapId: string | null): Merchant[] {
  return mapId ? CONFIG.voyage.timber.merchants.filter((m) => m.mapId === mapId) : [];
}

/**
 * A sale on offer: a log barge within `sellRangeM` of a merchant's quay (its berth), and the
 * boat towing or tending her stopped. The barge, its merchant and the money.
 */
export function saleOffer(world: WorldState, boat: VesselState | undefined, mapId: string | null): { bargeId: EntityId; merchant: Merchant; logs: number; total: number } | null {
  const barges = world.timber?.barges;
  if (!boat || !barges || speedKn(boat) > CONFIG.voyage.timber.sellMaxSpeedKn) return null;
  const c = CONFIG.voyage.timber;
  for (const m of merchantsOn(mapId)) {
    const berth = berthWithId(m.berthId);
    if (!berth) continue;
    // The quay: the berth's tie line, half a metre in from the face.
    const qx = berth.x + berth.shoreX * berth.shoreDist;
    const qz = berth.z + berth.shoreZ * berth.shoreDist;
    for (const [id, b] of Object.entries(barges)) {
      const v = world.vessels[id];
      if (!v || !b.logs) continue;
      if (Math.hypot(v.position[0] - qx, v.position[2] - qz) <= c.sellRangeM + c.bargeHalfLengthM) return { bargeId: id, merchant: m, logs: b.logs, total: b.logs * c.pricePerLog };
    }
  }
  return null;
}

/** Sold: the barge gone, its line with her, the money paid in (the career's account, which Voyage keeps). */
export function sellBarge(world: WorldState, bargeId: EntityId, merchant: Merchant): number {
  const b = world.timber?.barges[bargeId];
  if (!b) return 0;
  const total = b.logs * CONFIG.voyage.timber.pricePerLog;
  delete world.timber!.barges[bargeId];
  delete world.vessels[bargeId];
  for (const [boat, line] of Object.entries(world.tow?.lines ?? {})) if (line.target === `v:${bargeId}`) delete world.tow!.lines[boat];
  post(world, (world.career ??= createCareer()), `${b.logs} logs sold to ${merchant.name}`, total);
  return total;
}

/** "20 logs × £12 = £240". */
export function saleText(logs: number, total: number): string {
  return `${logs} logs × ${money(CONFIG.voyage.timber.pricePerLog)} = ${money(total)}`;
}

// ── Kept with the Voyage save (app/voyagePlace.ts sits beside it) ──

export interface SavedBarge {
  x: number;
  z: number;
  headingDeg: number;
  logs: number;
  /** On this boat's towline as saved. */
  towed: boolean;
}

export const bargesKey = (mapId: string): string => `swvr.voyage.barges.${mapId}`;

/** The log barges to save: where each lies, her load, and whether she's on our line. */
export function bargesToSave(world: WorldState, boatId: EntityId, heading: (v: VesselState) => number): SavedBarge[] {
  const out: SavedBarge[] = [];
  for (const [id, b] of Object.entries(world.timber?.barges ?? {})) {
    const v = world.vessels[id];
    if (v) out.push({ x: v.position[0], z: v.position[2], headingDeg: heading(v), logs: b.logs, towed: world.tow?.lines?.[boatId]?.target === `v:${id}` });
  }
  return out;
}

/** Saved barges read back (malformed entries dropped, ones now on land dropped). */
export function parseBarges(text: string | null): SavedBarge[] {
  try {
    const list = JSON.parse(text ?? '[]') as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((b): b is SavedBarge => !!b && typeof b === 'object' && [b.x, b.z, b.headingDeg, b.logs].every((n) => Number.isFinite(n)))
      .map((b) => ({ x: b.x, z: b.z, headingDeg: b.headingDeg, logs: clampLogs(b.logs), towed: !!b.towed }));
  } catch {
    return [];
  }
}

/** Saved barges back in the world, the towed one on the boat's line again. */
export function restoreBarges(world: WorldState, saved: readonly SavedBarge[], boat: VesselState | undefined): void {
  for (const b of saved) {
    if (groundHeight(b.x, b.z) > -1) continue;
    const id = spawnLogBarge(world, b.x, b.z, b.headingDeg, b.logs);
    if (b.towed && boat) makeFastNow(world, boat.id, id);
  }
}

/** Her position as the contract gives it: lat/lon on the map, and her heading. */
export function positionFor(mapId: string, v: VesselState, headingDeg: number): { lat: number; lon: number; hdg: number } {
  const p = latLonOf(mapId, v.position[0], v.position[2]) ?? { lat: 0, lon: 0 };
  const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
  return { lat: r(p.lat, 6), lon: r(p.lon, 6), hdg: Math.round(headingDeg) };
}
