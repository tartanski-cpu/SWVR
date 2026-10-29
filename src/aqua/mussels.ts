/**
 * Fish farm service, step 3: mussel lines (owner, 29 Oct 2026: "carry on with farm step 3").
 * A mussel farm (FarmDef kind 'lines' with a `base` harbour: the Tarsk mussel lines in Loch
 * Tarsk) calls now and then for its harvest:
 *
 *   the bags   `bags` bags of mussels hung along its lines, every `bagSpacing` m, on the floats
 *   lifting    bring her alongside a line and lift each bag aboard (40 kg: one hand), or take
 *              them with her deck crane's hook
 *   landing    set them down at the base harbour's goods stack (or menu Cargo, Unload there):
 *              `perBag` each, and `bonus` when the whole harvest's in
 *   over       not all in by `dueS`: the farm's own boat takes the rest
 *
 * One person can do it; with crew, one holds her alongside and the others lift. Plain data in
 * WorldState.aqua.mussels, stepped by the host with the fish farms (farmService.ts).
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { earn, portName } from '../career/career';
import { sayRadio } from '../rescue/rescue';
import { FARMS } from '../world/archipelago';
import type { FarmDef } from '../world/defs';
import { lineEnds } from '../world/farms';
import type { CargoItem } from '../cargo/cargo';

/** A mussel farm's harvest going: its bags (cargo ids), how many landed, when it's due. */
export interface MusselCall {
  at: number;
  bags: string[];
  landed: number;
  due: number;
}

export interface MusselSite {
  call: MusselCall | null;
  /** When the next harvest is called (world time). */
  harvestAt: number;
}

/** What a mussel bag says it came from (not a port: nothing restocks it, nothing counts it as waiting). */
export const MUSSEL_FROM = 'mussels';

/** The mussel farms with a base harbour, each by a key from its name. */
export const MUSSEL_SITES: { key: string; farm: FarmDef }[] = FARMS.filter((f) => f.kind === 'lines' && f.base).map((farm) => ({ key: farm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), farm }));

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function createMussels(): Record<string, MusselSite> {
  const m = CONFIG.aqua.mussels;
  return Object.fromEntries(MUSSEL_SITES.map(({ key }) => [key, { call: null, harvestAt: m.first + hash01(key) * m.every[0] }]));
}

/** Places for the bags along a farm's lines (world x, z), every `bagSpacing` m, short of each end's buoy. */
export function bagPlaces(farm: FarmDef): [number, number][] {
  const out: [number, number][] = [];
  const s = CONFIG.aqua.mussels.bagSpacing;
  for (const [[x0, z0], [x1, z1]] of lineEnds(farm)) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let d = s; d < L - s / 2; d += s) out.push([x0 + ((x1 - x0) * d) / L, z0 + ((z1 - z0) * d) / L]);
  }
  return out;
}

/** Raise a harvest at a mussel farm (its timer, or a test): its bags hung on the lines. */
export function raiseMussels(world: WorldState, key: string): MusselCall | null {
  const site = world.aqua?.mussels?.[key];
  const def = MUSSEL_SITES.find((s) => s.key === key);
  if (!site || !def?.farm.base) return null;
  const m = CONFIG.aqua.mussels;
  const places = bagPlaces(def.farm);
  const n = Math.min(places.length, m.bags[0] + Math.floor(hash01(`${key}${Math.round(world.time)}`) * (m.bags[1] - m.bags[0] + 1)));
  const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === 'Mussel bag');
  // Spread along the lines: every so many places, from a start that varies.
  const step = places.length / n;
  const start = hash01(`${key}s${Math.round(world.time)}`) * step;
  const bags: string[] = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = places[Math.floor(start + i * step) % places.length];
    const id = `cargo-${++world.cargoSeq}`;
    world.cargo[id] = { id, kind, mass: CONFIG.cargo.kinds[kind].mass, from: MUSSEL_FROM, to: def.farm.base, at: { ground: [x, m.lineTop, z], yaw: 0 } };
    bags.push(id);
  }
  site.call = { at: world.time, bags, landed: 0, due: world.time + m.dueS };
  sayRadio(world, 'info', `${def.farm.name}: harvest's ready. ${n} bags of mussels hung on the lines: lift them aboard and land them at ${portName(def.farm.base)}.`);
  return site.call;
}

/** Each tick (host): the mussel farms' harvests called, and ended when they're over. */
export function stepMussels(world: WorldState, spawn: boolean): void {
  const sites = world.aqua?.mussels;
  if (!sites) return;
  const m = CONFIG.aqua.mussels;
  for (const [key, site] of Object.entries(sites)) {
    const call = site.call;
    if (call && world.time > call.due) {
      // The farm's own boat takes what's left on the lines.
      for (const id of call.bags) {
        const c = world.cargo[id];
        if (c && 'ground' in c.at) delete world.cargo[id];
      }
      site.call = null;
    }
    if (spawn && !site.call && world.time >= site.harvestAt) {
      raiseMussels(world, key);
      site.harvestAt = world.time + m.every[0] + hash01(`${key}n${Math.round(world.time)}`) * (m.every[1] - m.every[0]);
    }
  }
}

/** A bag of mussels landed at its harbour (cargo.ts retire): paid, counted, the bonus when they're all in. Returns true if it was one. */
export function musselsLanded(world: WorldState, item: CargoItem, at: string): boolean {
  if (item.from !== MUSSEL_FROM || item.to !== at) return false;
  const m = CONFIG.aqua.mussels;
  earn(world, 'farm', { port: at, base: m.perBag, text: `Mussels landed at ${portName(at)}` });
  for (const [key, site] of Object.entries(world.aqua?.mussels ?? {})) {
    const call = site.call;
    if (!call?.bags.includes(item.id)) continue;
    call.landed += 1;
    if (call.landed >= call.bags.length) {
      site.call = null;
      const name = MUSSEL_SITES.find((s) => s.key === key)?.farm.name ?? 'The mussel farm';
      earn(world, 'farm', { port: at, base: m.bonus, text: `${name}: the harvest's all in` });
      sayRadio(world, 'info', `${name}: that's the harvest in. Thanks, skipper: bonus paid.`);
    }
  }
  return true;
}

/** A mussel harvest's line for the duty board and the base harbour's cargo screen. */
export function musselLine(world: WorldState, key: string): string {
  const call = world.aqua?.mussels?.[key]?.call;
  const name = MUSSEL_SITES.find((s) => s.key === key)?.farm.name ?? '';
  if (!call) return '';
  const left = Math.max(0, Math.round((call.due - world.time) / 60));
  return `${name}: ${call.landed}/${call.bags.length} bags landed, ${left} min left`;
}
