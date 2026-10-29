/**
 * Fish farm service (owner, 29 Oct 2026: "go ahead with fish farm service first, everything
 * should be possible single player but better with crew"). Plain shared state (WorldState.aqua),
 * stepped by the host like the transfers and the salvage.
 *
 * A salmon farm (FarmDef with a feed barge, `port`: the Tarsk farm in the Sounds, the Kvass
 * farm in the Fjord) is a site:
 *
 *   the silo   the feed on its barge (kg, up to `siloKg`), eaten down by the fish all the time
 *              (`eatKgPerS`). Empty, the fish go hungry (and feed then pays more).
 *   feed call  under `callBelow` of a silo the farm calls on the VHF for feed. While it calls,
 *              the cargo screens make feed for it: at a harbour that makes feed (Garbh Pier's
 *              sacks, Ytterbrygga's pellets), Crates are feed sacks bound for the farm (by hand:
 *              many trips, a job for a crew); at any harbour with a cargo quay, Crane lifts are
 *              500 kg feed bags for it (one person and a deck crane). Set down on the barge (by
 *              hand, the crane, or the menu's Unload), feed goes into the silo and is paid by
 *              the kilo. The call ends when the silo's back over `fullAt`.
 *   harvest    now and then (`harvest.every`) the farm calls for a harvest run: so many boxes of
 *              salmon to a harbour. Ordered at the barge's cargo screen, the boxes are bound
 *              there. Each box keeps fresh `freshS` s on ice and then pays less, down to
 *              `staleFactor`; all of the run landed in time pays `bonus` as well.
 *
 * Off unless the game switches it on (createAqua(true)); tests raise calls by hand.
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { earn, money, portName } from '../career/career';
import { sayRadio } from '../rescue/rescue';
import { FARMS, PORTS, type PortDef } from '../world/archipelago';
import type { FarmDef } from '../world/defs';
import type { CargoItem } from '../cargo/cargo';

export interface FarmCall {
  kind: 'feed' | 'harvest';
  /** When it was made (world time, s). */
  at: number;
  /** Harvest: the harbour the salmon goes to, how many boxes, how many landed so far, and when it's due (world time). */
  to?: string;
  boxes?: number;
  landed?: number;
  due?: number;
}

export interface FarmSite {
  /**
   * Feed in the barge's silo (kg) at `feedAt` (world time): it's eaten down from there
   * (feedNow). Kept as a level and a time, not ticked down, so the state only changes when
   * something happens (it's in every crew snapshot).
   */
  feedKg: number;
  feedAt: number;
  /** The silo's run dry (told once). */
  hungry: boolean;
  call: FarmCall | null;
  /** The last call made (world time; -1e9 before the first, JSON has no infinity): calls come at least `callGapS` apart. */
  lastCallAt: number;
  /** When the next harvest call comes (world time). */
  harvestAt: number;
}

export interface AquaState {
  /** Calls come by themselves (the game); tests raise them by hand. */
  spawn: boolean;
  /** Each farm by its feed barge's port id. */
  sites: Record<string, FarmSite>;
}

/** The farms with a feed barge in this world: each one and its barge's port. */
export const FARM_SITES: { farm: FarmDef; port: PortDef }[] = FARMS.flatMap((farm) => {
  const port = farm.port ? PORTS.find((p) => p.id === farm.port) : undefined;
  return port ? [{ farm, port }] : [];
});

/** A farm's feed barge port, if this port is one. */
export function farmAt(portId: string | null | undefined): { farm: FarmDef; port: PortDef } | null {
  return FARM_SITES.find((s) => s.port.id === portId) ?? null;
}

/** A deterministic 0..1 from a string (a farm's own starting fill). */
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function createAqua(spawn: boolean): AquaState {
  const a = CONFIG.aqua;
  const sites: Record<string, FarmSite> = {};
  for (const { port } of FARM_SITES) {
    const fill = a.startFill[0] + (a.startFill[1] - a.startFill[0]) * hashOf(port.id);
    sites[port.id] = { feedKg: a.siloKg * fill, feedAt: 0, hungry: false, call: null, lastCallAt: -1e9, harvestAt: a.harvest.first + hashOf(port.id + 'h') * a.harvest.every[0] };
  }
  return { spawn, sites };
}

/** The feed in a farm's silo now (kg): its level when last topped up, less what the fish have eaten since. */
export function feedNow(world: WorldState, site: FarmSite): number {
  return Math.max(0, site.feedKg - CONFIG.aqua.eatKgPerS * Math.max(0, world.time - site.feedAt));
}

/** Set a farm's silo to this much feed now (kg). */
export function setFeed(world: WorldState, site: FarmSite, kg: number): void {
  site.feedKg = Math.max(0, Math.min(CONFIG.aqua.siloKg, kg));
  site.feedAt = world.time;
}

/** A farm's name for the radio: its barge port's, without "(feed barge)". */
export function farmName(portId: string): string {
  return (farmAt(portId)?.farm.name ?? portName(portId)).replace(' (feed barge)', '');
}

function tonnes(kg: number): string {
  return `${(kg / 1000).toFixed(1)} t`;
}

/** The harbour a harvest goes to: one of `harvest.to` in this world, the nearest the farm first, by turns. */
function harvestPort(portId: string, n: number): string | undefined {
  const at = PORTS.find((p) => p.id === portId);
  const list = CONFIG.aqua.harvest.to.map((id) => PORTS.find((p) => p.id === id)).filter((p): p is PortDef => !!p && p.id !== portId);
  if (!at || !list.length) return undefined;
  list.sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
  // Mostly the nearest; every third run the next one along.
  return list[n % 3 === 2 && list.length > 1 ? 1 : 0].id;
}

/** Raise a call at a farm now (the game's timer, or a test). */
export function raiseFarmCall(world: WorldState, portId: string, kind: FarmCall['kind']): FarmCall | null {
  const site = world.aqua?.sites[portId];
  if (!site) return null;
  const a = CONFIG.aqua;
  const name = farmName(portId);
  if (kind === 'feed') {
    site.call = { kind, at: world.time };
    const kg = feedNow(world, site);
    sayRadio(world, 'info', `${name}, calling any workboat: the feed's down to ${tonnes(kg)} on the barge. We'll take up to ${tonnes(a.siloKg - kg)}: sacks from the feed pier, or big bags by crane from any cargo quay.`);
  } else {
    const to = harvestPort(portId, Math.round(world.time / 60));
    if (!to) return null;
    const boxes = a.harvest.boxes[0] + Math.floor(hashOf(`${portId}${Math.round(world.time)}`) * (a.harvest.boxes[1] - a.harvest.boxes[0] + 1));
    site.call = { kind, at: world.time, to, boxes, landed: 0, due: world.time + a.harvest.freshS };
    sayRadio(world, 'info', `${name}: harvest day. ${boxes} boxes of salmon on the barge for ${portName(to)}, on ice: get them there inside ${Math.round(a.harvest.freshS / 60)} minutes for the best price.`);
  }
  site.lastCallAt = world.time;
  return site.call;
}

/** Each tick (host): the fish eat, and the farms call for feed and harvest runs. */
export function stepAqua(world: WorldState): void {
  const aq = world.aqua;
  if (!aq) return;
  const a = CONFIG.aqua;
  for (const [id, site] of Object.entries(aq.sites)) {
    const feed = feedNow(world, site);
    if (feed <= 0 && !site.hungry) {
      site.hungry = true;
      if (aq.spawn) sayRadio(world, 'info', `${farmName(id)}: the silo's empty and the fish are hungry. Feed's wanted on the barge, urgently.`);
    }
    const call = site.call;
    if (call?.kind === 'feed' && feed >= a.fullAt * a.siloKg) {
      site.call = null;
      sayRadio(world, 'info', `${farmName(id)}: that's the silo full. Thanks, skipper.`);
    } else if (call?.kind === 'harvest' && call.due !== undefined && world.time > call.due + a.harvest.freshS) {
      // Long past (it's all stale by now): the run's over, landed or not.
      site.call = null;
      site.harvestAt = world.time + a.harvest.every[0];
    }
    if (!aq.spawn || site.call || world.time - site.lastCallAt < a.callGapS) continue;
    if (feed < a.callBelow * a.siloKg) raiseFarmCall(world, id, 'feed');
    else if (world.time >= site.harvestAt) {
      raiseFarmCall(world, id, 'harvest');
      site.harvestAt = world.time + a.harvest.every[0] + hashOf(`${id}${Math.round(world.time)}`) * (a.harvest.every[1] - a.harvest.every[0]);
    }
  }
}

/** Is this item feed (a sack, pellets, a bulk bag)? */
export function isFeed(item: { kind: number }): boolean {
  return CONFIG.aqua.feedKinds.includes(CONFIG.cargo.kinds[item.kind]?.name ?? '');
}

/**
 * Feed set down on a farm's barge (bound for it): into the silo, paid by the kilo it takes
 * (more while the fish are hungry; nothing for what a full silo can't take). Returns true if
 * it was (the cargo's usual pay doesn't apply).
 */
export function feedDelivered(world: WorldState, item: CargoItem, portId: string): boolean {
  const site = world.aqua?.sites[portId];
  if (!site || !isFeed(item)) return false;
  const a = CONFIG.aqua;
  const factor = site.hungry ? a.hungryFactor : 1;
  const now = feedNow(world, site);
  const kg = Math.max(0, Math.min(item.mass, a.siloKg - now));
  setFeed(world, site, now + kg);
  site.hungry = false;
  if (kg > 0) earn(world, 'farm', { port: portId, base: kg * a.feedPerKg * factor, text: `Feed to ${farmName(portId)}: ${Math.round(kg)} kg${factor > 1 ? ' (the fish were hungry)' : ''}` });
  return true;
}

/** A box of salmon from a farm: on ice, it keeps fresh until `bestBy`. Marked as it's made at the barge. */
export function markHarvest(world: WorldState, item: CargoItem): void {
  if (farmAt(item.from) && CONFIG.cargo.kinds[item.kind]?.name === 'Salmon box') item.bestBy = world.time + CONFIG.aqua.harvest.freshS;
}

/** What a box of salmon fetches for its freshness: 1 until its best-by, then down to `staleFactor` over another `freshS`. */
export function freshFactor(world: WorldState, item: CargoItem): number {
  if (item.bestBy === undefined) return 1;
  const h = CONFIG.aqua.harvest;
  const late = Math.max(0, world.time - item.bestBy) / h.freshS;
  return Math.max(h.staleFactor, 1 - (1 - h.staleFactor) * late);
}

/** A farm's salmon landed (cargo.ts retire): counted toward its harvest call, the bonus paid when the run's all in on time. */
export function harvestLanded(world: WorldState, item: CargoItem, at: string): void {
  const site = world.aqua?.sites[item.from];
  const call = site?.call;
  if (!site || call?.kind !== 'harvest' || call.to !== at) return;
  call.landed = (call.landed ?? 0) + 1;
  if (call.landed >= (call.boxes ?? 0)) {
    const onTime = call.due === undefined || world.time <= call.due;
    site.call = null;
    if (onTime) {
      earn(world, 'farm', { port: item.from, base: CONFIG.aqua.harvest.bonus, text: `Harvest run for ${farmName(item.from)}: all landed fresh` });
      sayRadio(world, 'info', `${farmName(item.from)}: the buyer's got all ${call.boxes} boxes, fresh. ${money(CONFIG.aqua.harvest.bonus)} bonus to your account.`);
    }
  }
}

/** The farm calling for feed that's nearest a port, within `serveRangeM` (the screen there makes feed for it), or null. */
export function feedCallNear(world: WorldState, port: PortDef): string | null {
  let best: string | null = null;
  let bd = CONFIG.aqua.serveRangeM;
  for (const [id, site] of Object.entries(world.aqua?.sites ?? {})) {
    if (site.call?.kind !== 'feed' || id === port.id) continue;
    const f = farmAt(id)!.port;
    const d = Math.hypot(f.x - port.x, f.z - port.z);
    if (d < bd) [best, bd] = [id, d];
  }
  return best;
}

/** The feed kind a harbour makes for a farm's call (its products' feed kind: Garbh's sacks), or null. */
export function feedKindAt(port: PortDef): number | null {
  const name = port.economy?.products?.find((p) => CONFIG.aqua.feedKinds.includes(p));
  const i = name ? CONFIG.cargo.kinds.findIndex((k) => k.name === name) : -1;
  return i >= 0 ? i : null;
}

/** The index of the feed bag kind (crane lifts for a farm). */
export function feedBagKind(): number {
  return CONFIG.cargo.kinds.findIndex((k) => k.name === 'Feed bag');
}

/** The cargo screen's farm line at a harbour: a farm's silo and calls there, or a call this harbour can serve; '' if none. */
export function farmLine(world: WorldState, port: PortDef): string {
  const site = world.aqua?.sites[port.id];
  if (site) {
    const call = site.call;
    const silo = `Feed ${tonnes(feedNow(world, site))} of ${tonnes(CONFIG.aqua.siloKg)}${site.hungry ? ': empty, the fish are hungry' : ''}`;
    if (call?.kind === 'harvest') {
      const left = Math.max(0, Math.round(((call.due ?? world.time) - world.time) / 60));
      return `${silo}  ·  Harvest: ${call.landed ?? 0}/${call.boxes} boxes to ${portName(call.to)}, ${left} min (Crates)`;
    }
    return call?.kind === 'feed' ? `${silo}  ·  calling for feed` : silo;
  }
  const farm = feedCallNear(world, port);
  if (!farm) return '';
  const sacks = feedKindAt(port) !== null;
  const bags = !!port.cargo.berth;
  if (!sacks && !bags) return `${farmName(farm)} wants feed (from a feed pier or a cargo quay)`;
  return `${farmName(farm)} wants feed: ${[sacks && 'Crates are feed sacks', bags && 'Crane lifts are feed bags'].filter(Boolean).join(', ')}`;
}
