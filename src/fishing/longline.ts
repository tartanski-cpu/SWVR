/**
 * Longlining (owner, 29 Oct 2026: "go ahead with longlining ... I'd like a variety of fish and
 * fish sizes coming up so you know how good your catch is"). Plain shared state
 * (WorldState.longline), stepped by the host; CONFIG.longline.
 *
 *   tubs      a tub of baited line (cargo kind 'Line tub'), ordered at a harbour's cargo screen
 *   shooting  let go over the side while she's under way (cargo.ts cargoPlace in the sea): its
 *             first dan buoy goes in there, and the groundline pays out behind her as she steams,
 *             a hook every `hookSpacingM`, along the track her stern makes. All out at
 *             `lengthM`, the far dan buoy goes in; stopped a while, it goes in where she is.
 *             How well it's shot (straight, at a good speed) is how well it fishes.
 *   soaking   it fishes from the bottom: ready after `soakReady`, best at `soakBest`
 *   hauling   hook either dan buoy with the boat hook, bring it aboard over her gunwale, and
 *             haul the line in hand over hand. The line comes in from where its next stretch
 *             lies on the bottom: keep her moving up along it. Too far off and it won't come;
 *             much too far (driven away, the wrong way) and it parts: the rest stays down, to be
 *             hauled from its other buoy.
 *   the catch every hook that comes up has a fish on it or not, seeded (the same for everyone):
 *             a species from the ground's mix and a weight (most small, a few big). The line
 *             stops with a fish at the rail until it's taken off: into a fish box on her deck,
 *             or, under its species' smallest size, back over the side.
 *   selling   the boxes landed at any harbour's goods stack (or Unload): paid by the kilo, by
 *             species (cargo.ts retire, `longlineBoxValue`)
 *
 * Intents (targetId: the vessel; ref: the line):
 *   llHook   args [end]       the dan buoy at that end on your boat hook
 *   llTow    args [x, z]      the hooked buoy drawn toward your hook tip (within its scope)
 *   llAboard                  the hooked buoy over the gunwale: the line leads in there
 *   llHaul   value m          line hauled in (stops at a fish)
 *   llTake                    the fish at the rail taken off (boxed, or back if undersize)
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { aboard, deckHeightAt, footprint, type CargoItem } from '../cargo/cargo';
import { deckSpot } from '../cargo/deck';
import { holdsHook } from '../rescue/recovery';
import { fromHull, leadFor, outsideHull, toWorldPt } from '../potting/potting';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { hullPlan } from '../vessel/layout';
import type { VesselState } from '../vessel/vesselState';
import { FISHING_GROUNDS } from '../world/archipelago';
import { groundHeight } from '../world/terrain';

/** A fish off a hook: its species and weight (kg). */
export interface LineFish {
  species: string;
  kg: number;
}

export interface Longline {
  id: string;
  /** The boat that shot it. */
  owner: string;
  /** Its groundline on the bottom, from end 0's dan buoy to end 1's (world x, z), every ~10 m. */
  track: [number, number][];
  /** Its hooks, `hookSpacingM` apart from end 0 (by index: the hook's place, which stays the same when it parts). */
  hooks: number;
  /** The first hook still on it from end 0 and the last (it's hauled, or parts, from either end). */
  hookFrom: number;
  hookTo: number;
  /** When it was all out (world time, s); how well it was shot (0..1). */
  shotAt: number;
  quality: number;
  /** Each end's dan buoy (world x, z), or null (that end parted off: no buoy there). */
  buoys: [[number, number] | null, [number, number] | null];
  /**
   * Hauling:
   *   hooked  its buoy at `end` on someone's boat hook (`by`)
   *   line    that buoy's aboard `vessel`: the line leads in at `lead` (vessel axes); `fish`:
   *           a fish at the rail, waiting to be taken off
   */
  haul?: { by: string; phase: 'hooked' | 'line'; end: 0 | 1; vessel?: string; lead?: Vec3; fish?: LineFish | null; landed?: LineFish[] };
}

/** A line being shot: from where its first buoy went in, paid out as she goes. */
export interface Shooting {
  line: string;
  vessel: string;
  track: [number, number][];
  paid: number;
  last: [number, number];
  /** Seconds she's been stopped; her speed summed (for the mean). */
  stopped: number;
  speedSum: number;
  ticks: number;
}

/** A line's haul finished (all in, or parted): what came up, for the crew to read. */
export interface HaulDone {
  line: string;
  vessel: string;
  at: number;
  fish: LineFish[];
  parted?: boolean;
}

export interface LonglineState {
  seq: number;
  lines: Longline[];
  shooting: Shooting[];
  done: HaulDone[];
}

const HAUL_INTENTS = new Set(['llHook', 'llTow', 'llAboard', 'llHaul', 'llTake']);

export function isLonglineIntent(control: string): boolean {
  return HAUL_INTENTS.has(control);
}

/** Is this item a line tub? */
export function isTub(item: { kind: number }): boolean {
  return CONFIG.cargo.kinds[item.kind]?.name === 'Line tub';
}

/** Tubs, lines shooting and lines in the water: how many are in play. */
export function linesInPlay(world: WorldState): number {
  const tubs = Object.values(world.cargo).filter(isTub).length;
  return tubs + (world.longline?.lines.length ?? 0) + (world.longline?.shooting.length ?? 0);
}

/** A deterministic 0..1 from a string. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

const state = (world: WorldState): LonglineState => (world.longline ??= { seq: 0, lines: [], shooting: [], done: [] });

/** Her stern's middle in the world (where a line pays out). */
function sternAt(v: VesselState): THREE.Vector3 {
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  return toWorldPt(v, [0, 0, plan.transom]);
}

/**
 * A tub let go over the side (cargo.ts: set down in the sea) by a player aboard a vessel: the
 * line starts shooting there. Returns true if it did (the tub is used: its line's in the water).
 */
export function startShooting(world: WorldState, item: CargoItem, x: number, z: number, vessel: VesselState | undefined): boolean {
  if (!isTub(item) || !vessel) return false;
  const s = state(world);
  delete world.cargo[item.id];
  const id = `line-${++s.seq}`;
  s.shooting.push({ line: id, vessel: vessel.id, track: [[x, z]], paid: 0, last: [x, z], stopped: 0, speedSum: 0, ticks: 0 });
  return true;
}

/** The length of a track (m). */
function trackLength(track: readonly [number, number][]): number {
  let L = 0;
  for (let i = 1; i < track.length; i++) L += Math.hypot(track[i][0] - track[i - 1][0], track[i][1] - track[i - 1][1]);
  return L;
}

/** The point at `d` m along a track from its start (world x, z). */
export function alongTrack(track: readonly [number, number][], d: number): [number, number] {
  let left = Math.max(0, d);
  for (let i = 1; i < track.length; i++) {
    const [x0, z0] = track[i - 1];
    const [x1, z1] = track[i];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (left <= L || i === track.length - 1) {
      const t = L > 0 ? Math.min(1, left / L) : 0;
      return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
    }
    left -= L;
  }
  return track[track.length - 1];
}

/** A hook's place along the line (m from end 0). */
export function hookAt(i: number): number {
  return (i + 0.5) * CONFIG.longline.hookSpacingM;
}

/** The fishing ground a line mostly lies on, if any. */
function groundOf(line: Longline) {
  const L = trackLength(line.track);
  const [x, z] = alongTrack(line.track, L / 2);
  return FISHING_GROUNDS.find((g) => Math.hypot(x - g.x, z - g.z) <= g.radius) ?? null;
}

/** How well a line fishes for its soak: half as well before it's ready, then up to its best. */
export function soakOf(world: WorldState, line: Longline): number {
  const c = CONFIG.longline;
  const t = Math.max(0, world.time - line.shotAt);
  if (t < c.soakReady) return 0.5 * (t / c.soakReady);
  return 0.5 + 0.5 * Math.min(1, (t - c.soakReady) / (c.soakBest - c.soakReady));
}

/**
 * What's on hook `i` when it comes up (seeded by the line and the hook: the same for everyone),
 * or null: a bare hook. Its species from the ground's mix (its own fish boosted), its weight
 * between the species' smallest and largest, most of them small.
 */
export function fishOnHook(world: WorldState, line: Longline, i: number): LineFish | null {
  const c = CONFIG.longline;
  const ground = groundOf(line);
  const rate = c.hookRate * (ground ? ground.richness : c.offGround) * soakOf(world, line) * line.quality;
  const seed = `${line.id}:${i}`;
  if (hash01(seed) >= rate) return null;
  const own = ground?.species ? c.groundSpecies[ground.species] : undefined;
  // The ground's own fish boosted (and on the mix even if it's not in it elsewhere: the mackerel).
  const weights = c.species.map((s) => (s.name === own ? Math.max(s.w, 1) * c.groundBoost : s.w));
  // Off a ground the dogfish have it more to themselves.
  if (!ground) weights.forEach((_, k) => c.species[k].name === 'Dogfish' && (weights[k] *= 2));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = hash01(seed + 's') * total;
  let k = 0;
  while (k < weights.length - 1 && r >= weights[k]) r -= weights[k++];
  const sp = c.species[k];
  const kg = sp.kg[0] + (sp.kg[1] - sp.kg[0]) * Math.pow(hash01(seed + 'k'), c.sizeSkew);
  return { species: sp.name, kg: Math.round(kg * 100) / 100 };
}

/**
 * Where a fish on the hook hangs at the rail, from the lead (m): swung up with its mouth `up` above
 * the gunwale and `out` outboard of it, its body down the topsides, so you see it over the rail and
 * reach it there. (The drawing and the hands both use it: the fish you see is the one you grip.)
 */
export const FISH_HANG = { out: 0.2, up: 0.3 };

/** A fish's species entry. */
export function speciesOf(name: string) {
  return CONFIG.longline.species.find((s) => s.name === name);
}

/**
 * How good a fish is, in a word: undersize under its species' smallest to keep; else by where its
 * weight lies between that and the largest it comes.
 */
export function sizeWord(f: LineFish): 'undersize' | 'small' | 'fair' | 'good' | 'big' {
  const sp = speciesOf(f.species);
  if (!sp) return 'fair';
  if (f.kg < sp.minKg) return 'undersize';
  const lo = Math.max(sp.minKg, sp.kg[0]);
  const t = (f.kg - lo) / Math.max(0.01, sp.kg[1] - lo);
  return t < 0.15 ? 'small' : t < 0.4 ? 'fair' : t < 0.7 ? 'good' : 'big';
}

/** What a box of longline fish fetches (£, before the port's factors): each fish's kilos at its species' price. */
export function longlineBoxValue(item: CargoItem): number {
  return (item.fish ?? []).reduce((v, f) => v + f.kg * (speciesOf(f.species)?.price ?? 1), 0);
}

/** The finished line from a shooting, its far dan buoy in at (x, z). Null if too short to fish. */
function finishShooting(world: WorldState, sh: Shooting, v: VesselState | undefined, x: number, z: number): Longline | null {
  const c = CONFIG.longline;
  const s = state(world);
  s.shooting = s.shooting.filter((o) => o !== sh);
  const track = [...sh.track, [x, z] as [number, number]];
  const L = trackLength(track);
  if (L < c.minM) return null;
  const [a, b] = [track[0], track[track.length - 1]];
  const straight = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(1, L);
  const speed = sh.ticks ? sh.speedSum / sh.ticks : 0;
  const [lo, hi] = c.goodSpeed;
  const speedFactor = speed < lo ? c.worstSpeedFactor + (1 - c.worstSpeedFactor) * (speed / lo) : speed > hi ? Math.max(c.worstSpeedFactor, 1 - (speed - hi) * 0.15) : 1;
  const hooks = Math.floor(Math.min(L, c.lengthM) / c.hookSpacingM);
  const line: Longline = {
    id: sh.line,
    owner: v?.id ?? sh.vessel,
    track,
    hooks,
    hookFrom: 0,
    hookTo: hooks - 1,
    shotAt: world.time,
    quality: Math.max(0.1, straight * straight * speedFactor),
    buoys: [a, b],
  };
  s.lines.push(line);
  return line;
}

/** Each tick (host): lines paying out as their boats steam; lines aboard parting if she's driven off them. */
export function stepLongline(world: WorldState, dt: number): void {
  const s = world.longline;
  if (!s) return;
  const c = CONFIG.longline;
  for (const sh of [...s.shooting]) {
    const v = world.vessels[sh.vessel];
    if (!v) {
      finishShooting(world, sh, v, sh.last[0], sh.last[1]);
      continue;
    }
    const st = sternAt(v);
    const speed = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]);
    const step = Math.hypot(st.x - sh.last[0], st.z - sh.last[1]);
    sh.paid += step;
    sh.last = [st.x, st.z];
    sh.speedSum += speed;
    sh.ticks += 1;
    const lastPt = sh.track[sh.track.length - 1];
    if (Math.hypot(st.x - lastPt[0], st.z - lastPt[1]) >= 10) sh.track.push([st.x, st.z]);
    sh.stopped = speed < c.stopSpeed ? sh.stopped + dt : 0;
    if (sh.paid >= c.lengthM || sh.stopped >= c.stopS) finishShooting(world, sh, v, st.x, st.z);
  }
  // A line aboard: driven off it, it parts.
  for (const line of [...s.lines]) {
    const h = line.haul;
    if (h?.phase !== 'line') continue;
    const v = world.vessels[h.vessel ?? ''];
    if (!v) {
      line.haul = undefined;
      continue;
    }
    const off = offTheLine(line, v);
    if (off > depthAt(line) + c.partM) part(world, line, v);
  }
}

/** The water's depth under a line's next stretch (m). */
function depthAt(line: Longline): number {
  const [x, z] = nextStretch(line);
  return Math.max(2, -groundHeight(x, z));
}

/** Where the line's next stretch lies on the bottom: the next hook's place from the end being hauled (world x, z). */
export function nextStretch(line: Longline): [number, number] {
  const end = line.haul?.end ?? 0;
  const i = end === 0 ? line.hookFrom : line.hookTo;
  return alongTrack(line.track, hookAt(Math.max(0, Math.min(line.hooks - 1, i))));
}

/** How far (m, level) her lead is from the line's next stretch. */
export function offTheLine(line: Longline, v: VesselState): number {
  const lead = line.haul?.lead;
  if (!lead) return 0;
  const p = toWorldPt(v, lead);
  const [x, z] = nextStretch(line);
  return Math.hypot(p.x - x, p.z - z);
}

/** The line parts: what's hauled is aboard, the rest stays down with its other buoy. */
function part(world: WorldState, line: Longline, v: VesselState): void {
  const h = line.haul!;
  state(world).done.push({ line: line.id, vessel: v.id, at: world.time, fish: h.landed ?? [], parted: true });
  line.buoys[h.end] = null;
  line.haul = undefined;
  if (!line.buoys[0] && !line.buoys[1]) state(world).lines = state(world).lines.filter((l) => l !== line);
  trimDone(world);
}

/** Keep the last few hauls' reports. */
function trimDone(world: WorldState): void {
  const s = state(world);
  if (s.done.length > 8) s.done.splice(0, s.done.length - 8);
}

/** A fish taken off into a fish box on her deck by the lead (a box with room, else a new one). False if there's no room for a box. */
function boxFish(world: WorldState, v: VesselState, lead: Vec3, f: LineFish): boolean {
  const c = CONFIG.longline;
  const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === 'Fish box');
  const box = aboard(world, v.id).find((o) => o.from === 'line' && (o.fish ?? []).reduce((m, x) => m + x.kg, 0) + f.kg <= c.boxKg);
  if (box) {
    box.fish!.push(f);
    box.mass = CONFIG.cargo.kinds[kind].mass + box.fish!.reduce((m, x) => m + x.kg, 0);
    return true;
  }
  const at = deckNear(world, v, kind, lead);
  if (!at) return false;
  const id = `cargo-${++world.cargoSeq}`;
  world.cargo[id] = { id, kind, mass: CONFIG.cargo.kinds[kind].mass + f.kg, from: 'line', to: 'any', species: f.species, fish: [f], at };
  return true;
}

/** A free place on her deck for a new item of `kind`, inboard of the lead toward her middle (null: no room). */
function deckNear(world: WorldState, v: VesselState, kind: number, lead: Vec3): CargoItem['at'] | null {
  const others = aboard(world, v.id).map((o) => {
    const at = o.at as Extract<CargoItem['at'], { vessel: string }>;
    const fp = footprint(o);
    return { x: at.pos[0], z: at.pos[2], r: Math.max(fp.hx, fp.hz) };
  });
  const k = CONFIG.cargo.kinds[kind];
  const spot = deckSpot(v.defId, { hx: k.size[0] / 2, hz: k.size[2] / 2 }, lead[0] * 0.4, lead[2], others);
  return spot ? { vessel: v.id, pos: [spot.x, deckHeightAt(v.defId, spot.z), spot.z], yaw: 0, vel: [0, 0], lashed: false } : null;
}

/**
 * The line's last hook in from the end being hauled: it's all aboard, coiled back into its tub on
 * her deck by the lead, to shoot again (no room on deck: in by the lead all the same, on top of
 * what's there, rather than lose it).
 */
function lineAboard(world: WorldState, line: Longline, v: VesselState): void {
  const s = state(world);
  s.done.push({ line: line.id, vessel: v.id, at: world.time, fish: line.haul?.landed ?? [] });
  s.lines = s.lines.filter((l) => l !== line);
  trimDone(world);
  const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === 'Line tub');
  const lead = line.haul?.lead ?? [0, 0, 0];
  const at = deckNear(world, v, kind, lead) ?? { vessel: v.id, pos: [lead[0] * 0.4, deckHeightAt(v.defId, lead[2]), lead[2]], yaw: 0, vel: [0, 0], lashed: false };
  const id = `cargo-${++world.cargoSeq}`;
  world.cargo[id] = { id, kind, mass: CONFIG.cargo.kinds[kind].mass, from: 'tubs', to: 'none', at };
}

export function applyLonglineIntent(world: WorldState, intent: Intent): void {
  const s = world.longline;
  const line = s?.lines.find((l) => l.id === intent.ref);
  if (!s || !line) return;
  const c = CONFIG.longline;
  const who = intent.playerId;
  const v = world.vessels[intent.targetId];
  switch (intent.control) {
    case 'llHook': {
      const end = (intent.args?.[0] ?? 0) >= 0.5 ? 1 : 0;
      if (!line.haul && line.buoys[end] && holdsHook(world, who)) line.haul = { by: who, phase: 'hooked', end };
      break;
    }
    case 'llTow': {
      const h = line.haul;
      const b = h ? line.buoys[h.end] : null;
      const [x, z] = intent.args ?? [];
      if (!h || h.phase !== 'hooked' || h.by !== who || !b || !Number.isFinite(x) || !Number.isFinite(z)) break;
      const dx = x - b[0];
      const dz = z - b[1];
      const d = Math.hypot(dx, dz);
      const k = d > 3 ? 3 / d : 1;
      let [nx, nz] = [b[0] + dx * k, b[1] + dz * k];
      if (v) [nx, nz] = outsideHull(v, b[0], b[1], nx, nz);
      // On its buoy rope: within the depth and a bit of the anchor, at the line's end.
      const anchor = h.end === 0 ? line.track[0] : line.track[line.track.length - 1];
      const scope = Math.max(2, -groundHeight(anchor[0], anchor[1])) + c.danScopeM;
      if (Math.hypot(nx - anchor[0], nz - anchor[1]) <= scope && groundHeight(nx, nz) < -0.5) line.buoys[h.end] = [nx, nz];
      break;
    }
    case 'llAboard': {
      const h = line.haul;
      const b = h ? line.buoys[h.end] : null;
      if (!h || !v || h.phase !== 'hooked' || !b || fromHull(v, b[0], b[1]) > c.liftRange) break;
      line.haul = { by: who, phase: 'line', end: h.end, vessel: v.id, lead: leadFor(v, b[0], b[1]), fish: null, landed: [] };
      break;
    }
    case 'llHaul': {
      const h = line.haul;
      const hv = world.vessels[h?.vessel ?? ''];
      if (!h || h.phase !== 'line' || !hv || h.fish || !(intent.value > 0)) break;
      // Off the line: it won't come (bring her up along it).
      if (offTheLine(line, hv) > depthAt(line) + c.leadSlackM) break;
      // The next hook comes up (the line between hooks is a stroke or so: the pull brings the next).
      const pulls = Math.max(1, Math.round(Math.min(c.maxPull, intent.value) / c.hookSpacingM));
      for (let n = 0; n < pulls && line.hookFrom <= line.hookTo; n++) {
        const i = h.end === 0 ? line.hookFrom++ : line.hookTo--;
        const fish = fishOnHook(world, line, i);
        if (fish) {
          h.fish = fish;
          break;
        }
      }
      if (line.hookFrom > line.hookTo && !h.fish) lineAboard(world, line, hv);
      break;
    }
    case 'llTake': {
      const h = line.haul;
      const hv = world.vessels[h?.vessel ?? ''];
      if (!h || !hv || !h.fish || !h.lead) break;
      const f = h.fish;
      // Undersize: back over the side. Else into a box (no room on deck: it stays on the hook).
      if (sizeWord(f) !== 'undersize' && !boxFish(world, hv, h.lead, f)) break;
      if (sizeWord(f) !== 'undersize') (h.landed ??= []).push(f);
      h.fish = null;
      if (line.hookFrom > line.hookTo) lineAboard(world, line, hv);
      break;
    }
  }
}

/** A summary of a haul's fish for the crew: "14 fish, 31.2 kg: 6 cod (best 5.1 kg), 5 haddock...". */
export function haulSummary(fish: readonly LineFish[]): string {
  if (!fish.length) return 'nothing kept';
  const by = new Map<string, LineFish[]>();
  for (const f of fish) by.set(f.species, [...(by.get(f.species) ?? []), f]);
  const kg = fish.reduce((m, f) => m + f.kg, 0);
  const parts = [...by.entries()]
    .sort((a, b) => b[1].reduce((m, f) => m + f.kg, 0) - a[1].reduce((m, f) => m + f.kg, 0))
    .map(([sp, fs]) => `${fs.length} ${sp.toLowerCase()} (best ${Math.max(...fs.map((f) => f.kg)).toFixed(1)} kg)`);
  return `${fish.length} fish, ${kg.toFixed(1)} kg: ${parts.join(', ')}`;
}
