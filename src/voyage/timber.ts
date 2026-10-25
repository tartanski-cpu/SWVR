/**
 * The timber run, Workboat World's side (owner's spec, 23 Oct 2026; docs/metaverse-contract.md;
 * the handoff itself: voyage/metaverse.ts): anchor in the marked bay, go ashore to the timber
 * camp (the Timber game), and come back to find the logs you cut on the beach, to tow off one
 * at a time and sell at the timber merchant.
 *
 *   The hotspot    `HotspotWatch`: the anchor let go and set there, under `maxSpeedKn`,
 *                  inside the site's radius, held `holdS` s: then straight to the timber camp
 *                  (owner: seamless, no prompt).
 *   The logs       on the beach (owner, 25 Oct 2026: no barge; `logsFromCamp`): the camp's
 *                  logs laid side by side at the head of the bay, each pointing out to sea,
 *                  as salvage logs (salvage/salvage.ts) marked `timber`: a line on one (the
 *                  hook, or Make fast), pull it off the beach, tow it across. Afloat and slow
 *                  by the merchant's quay for CONFIG.tow.deliverTime s, it's bought
 *                  (`stepTimberLogs`) for `logPrice` (owner, 25 Oct 2026: £2,000 a log; up
 *                  to £10,000 for really big ones, once the camp sends sizes), through
 *                  career.ts earn, as a salvage log is paid. Kept with the Voyage save.
 *   The log barge  (until 25 Oct 2026; a barge saved before then still comes back and sells)
 *                  the towable work barge (CONFIG.vessels.barge, 9 m) with logs stacked on her
 *                  deck (voyage/timberView.ts), `world.timber.barges[id].logs`. The logs are
 *                  point masses on her deck (`logKg` each, cargo/cargo.ts payloadOf), so a full
 *                  barge sits deeper and tows heavier: more resistance, more to stop and turn.
 *                  She's towed, cast off and made fast like any tow (tow/tow.ts).
 *   The merchant   at a harbour's berth (`merchants`): the barge brought within `sellRangeM` of
 *                  its quay, the boat stopped, and the sale is offered: logs × `logPrice`.
 *                  Sold, the barge is gone and the money is paid in.
 *
 * Plain JSON in the world, as everything the host decides; no page or scene here.
 */
import { CONFIG } from '../config';
import { earn, post, createCareer, money } from '../career/career';
import type { WorldState } from '../core/world';
import type { EntityId } from '../core/ids';
import { makeFastNow } from '../tow/tow';
import { createVesselState } from '../vessel/vesselState';
import { placeVessel } from '../vessel/vesselControl';
import type { VesselState } from '../vessel/vesselState';
import { berthWithId } from '../world/berths';
import { groundHeight } from '../world/terrain';
import { latLonOf, SITES, worldOf, type MetaverseSite } from './metaverse';
import { createSalvageState, type SalvageLog } from '../salvage/salvage';
import { sayRadio } from '../rescue/rescue';

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
 * The way back from the camp: its logs laid on the beach (see the header). From the
 * contract's beach point, the way out to sea is toward the site's hotspot (the bay). Along the
 * shore, square to that, a log every `beachSpacingM` either side of the point in turn; each
 * where the ground, going down to the water, is first under `beachMaxAboveM` (but still above
 * the sea: beached, not afloat). How many were laid (spots can run out on a short beach).
 */
export function logsFromCamp(world: WorldState, site: MetaverseSite, logs: number): number {
  const c = CONFIG.voyage.timber;
  const want = clampLogs(logs);
  const beach = worldOf(site.mapId, site.beach.lat, site.beach.lon);
  const bay = hotspotAt(site);
  if (!want || !beach || !bay) return 0;
  let sx = bay.x - beach.x;
  let sz = bay.z - beach.z;
  const n = Math.hypot(sx, sz) || 1;
  sx /= n;
  sz /= n;
  const s = (world.salvage ??= createSalvageState());
  let laid = 0;
  for (let k = 0; laid < want && k < want * 3 + 20; k++) {
    // 0, +1, -1, +2, -2... spacings along the shore.
    const along = (k % 2 ? (k + 1) / 2 : -k / 2) * c.beachSpacingM;
    const ax = beach.x - sz * along;
    const az = beach.z + sx * along;
    // From well up the beach, down toward the water.
    for (let d = -30; d <= 60; d += 0.5) {
      const x = ax + sx * d;
      const z = az + sz * d;
      const g = groundHeight(x, z);
      if (g >= c.beachMaxAboveM) continue;
      if (g > 0.05) {
        s.logs.push({ id: `tlog${++s.seq}`, x, z, yaw: Math.atan2(sx, sz), len: c.logLength, afloat: false, vel: [0, 0], at: world.time, inPort: 0, timber: true, mass: c.logKg });
        laid++;
      }
      break;
    }
  }
  return laid;
}

/**
 * The camp's logs sold: afloat, slow, by a timber merchant's quay (within `sellRangeM` plus
 * half the log) for CONFIG.tow.deliverTime s; the line comes off and it's paid `logPrice`
 * (earn 'log', so with the harbour's reputation and buyer factor, and any log contract there).
 * (Washed-up salvage sells at any harbour instead: salvage/salvage.ts.)
 */
export function stepTimberLogs(world: WorldState, dt: number): void {
  const s = world.salvage;
  if (!s?.logs.some((l) => l.timber)) return;
  const c = CONFIG.voyage.timber;
  for (const log of [...s.logs]) {
    if (!log.timber) continue;
    const m = c.merchants.find((mm) => {
      const q = quayOf(mm);
      return q && Math.hypot(log.x - q.x, log.z - q.z) <= c.sellRangeM + log.len / 2;
    });
    log.inPort = m && log.afloat && Math.hypot(log.vel[0], log.vel[1]) < CONFIG.tow.deliverSpeed ? log.inPort + dt : 0;
    if (!m || log.inPort < CONFIG.tow.deliverTime) continue;
    for (const [id, l] of Object.entries(world.tow?.lines ?? {})) if (l.target === `l:${log.id}`) delete world.tow!.lines[id];
    s.logs = s.logs.filter((l) => l !== log);
    s.sold += 1;
    const left = s.logs.filter((l) => l.timber).length;
    const career = (world.career ??= createCareer());
    const before = career.money;
    earn(world, 'log', { port: berthWithId(m.berthId)?.portId ?? '', text: `Timber log sold to ${m.name}`, base: c.logPrice });
    sayRadio(world, 'info', `${m.name[0].toUpperCase()}${m.name.slice(1)}: good timber, skipper. ${money(career.money - before)} paid.${left ? ` ${left} more on the beach.` : ''}`);
  }
}

/** A merchant's quay: its berth's tie line, half a metre in from the face (null: not on this map). */
function quayOf(m: Merchant): { x: number; z: number } | null {
  const berth = berthWithId(m.berthId);
  return berth ? { x: berth.x + berth.shoreX * berth.shoreDist, z: berth.z + berth.shoreZ * berth.shoreDist } : null;
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
    const { x: qx, z: qz } = quayOf(m)!;
    for (const [id, b] of Object.entries(barges)) {
      const v = world.vessels[id];
      if (!v || !b.logs) continue;
      if (Math.hypot(v.position[0] - qx, v.position[2] - qz) <= c.sellRangeM + c.bargeHalfLengthM) return { bargeId: id, merchant: m, logs: b.logs, total: b.logs * c.logPrice };
    }
  }
  return null;
}

/** Sold: the barge gone, its line with her, the money paid in (this session's money: Voyage doesn't save it). */
export function sellBarge(world: WorldState, bargeId: EntityId, merchant: Merchant): number {
  const b = world.timber?.barges[bargeId];
  if (!b) return 0;
  const total = b.logs * CONFIG.voyage.timber.logPrice;
  delete world.timber!.barges[bargeId];
  delete world.vessels[bargeId];
  for (const [boat, line] of Object.entries(world.tow?.lines ?? {})) if (line.target === `v:${bargeId}`) delete world.tow!.lines[boat];
  post(world, (world.career ??= createCareer()), `${b.logs} logs sold to ${merchant.name}`, total);
  return total;
}

/** "20 logs × £2,000 = £40,000" (a saved barge's sale). */
export function saleText(logs: number, total: number): string {
  return `${logs} logs × ${money(CONFIG.voyage.timber.logPrice)} = ${money(total)}`;
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

// ── The camp's logs, kept with the Voyage save (their own key: `next` shares the storage) ──

export interface SavedLog {
  x: number;
  z: number;
  yaw: number;
}

export const timberLogsKey = (mapId: string): string => `swvr.voyage.timberlogs.${mapId}`;

/** The camp's logs to save: where each lies (one on a line is saved where it is, off the line). */
export function timberLogsToSave(world: WorldState): SavedLog[] {
  return (world.salvage?.logs ?? []).filter((l) => l.timber).map((l) => ({ x: l.x, z: l.z, yaw: l.yaw }));
}

/** Saved logs read back (malformed entries dropped). */
export function parseTimberLogs(text: string | null): SavedLog[] {
  try {
    const list = JSON.parse(text ?? '[]') as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((l): l is SavedLog => !!l && typeof l === 'object' && [l.x, l.z, l.yaw].every((n) => Number.isFinite(n))).slice(0, CONFIG.voyage.timber.maxLogs * 2);
  } catch {
    return [];
  }
}

/** Saved logs back in the world, as they lay (on the beach, or afloat where they were left). */
export function restoreTimberLogs(world: WorldState, saved: readonly SavedLog[]): void {
  const s = (world.salvage ??= createSalvageState());
  const c = CONFIG.voyage.timber;
  for (const l of saved) {
    const log: SalvageLog = { id: `tlog${++s.seq}`, x: l.x, z: l.z, yaw: l.yaw, len: c.logLength, afloat: false, vel: [0, 0], at: world.time, inPort: 0, timber: true, mass: c.logKg };
    log.afloat = groundHeight(l.x, l.z) < -CONFIG.salvage.floatDepth;
    s.logs.push(log);
  }
}
