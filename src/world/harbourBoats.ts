/**
 * Harbour boats (the settlements brief, Part C): boats lying in a coast map's harbours, so
 * a harbour looks used. Plain data and pure functions, the same on every player's machine
 * (worked out from the map and the shared wind and clock, nothing sent over the network).
 *
 *   alongside  a share of the berths along the pontoons and quays (CONFIG.harbourBoats
 *              pontoonShare, quayShare), picked by each berth's id; none near a named berth
 *              (cargo, fuel, the start: `namedClear`), so those stay free for you
 *   moored     on each of the map's moorings (the pipeline's boats stage: the map's own
 *              mooring buoys, else a mooring field laid in each harbour's sheltered water)
 *   anchored   in the anchorages, lying to her chain
 *   kinds      by the region's mix (its theme: creel boats and yachts in the West Highlands,
 *              caiques in the Aegean), one hull colour each from its palette
 *
 * A boat on a mooring or at anchor swings to the wind: her bow to it, her middle downwind
 * of the buoy (or anchor) by half her length and the pennant (or the chain's scope); a
 * slow yaw about that lie (`wanderDeg`, `wanderPeriod`); in light airs (below `calmWind`)
 * she lies more and more to her own whim, as boats do when the tide holds them.
 *
 * Solid: each boat is a box (her length and beam, the bow tapered; from her keel to her
 * deck) that a hull's points bump off like a fendered pier (vessel/physics/contacts.ts).
 * Only boats within `stepReach` of a vessel are posed each tick (stepHarbourBoats). One
 * alongside whose berth a vessel is made fast in (a saved game moored there) steps aside:
 * she isn't there until the vessel leaves.
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { BERTHS } from './archipelago';
import { allBerths } from './berths';
import type { BerthDef, HarbourBoatKind, RegionDef } from './defs';
import type { BlockHit } from './geography';
import { GridIndex } from './gridIndex';
import { REGIONS } from './regions';

export interface HarbourBoat {
  index: number;
  kind: HarbourBoatKind;
  how: 'alongside' | 'moored' | 'anchored';
  colour: number;
  /** Alongside: where she lies, and her heading (rad: 0 north, clockwise). Else her buoy or anchor (heading unused). */
  x: number;
  z: number;
  heading: number;
  /** Moored or anchored: her middle's distance from the buoy or anchor (m), her lie in a calm (rad), her yaw's phase. */
  r: number;
  calm: number;
  phase: number;
  /** Alongside: the berth she's in. */
  berthId?: string;
  /** Her own 0-1, for the drawing's small differences. */
  seed: number;
}

/** A boat's pose: where her middle is and her heading (rad, 0 north, clockwise). */
export interface HarbourBoatPose {
  x: number;
  z: number;
  heading: number;
}

/** A small hash, 0-1, of a string or numbers (the same boat every time). */
function hash(...v: (number | string)[]): number {
  let h = 2166136261;
  for (const s of v.map(String).join('|')) h = Math.imul(h ^ s.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

function pick<T>(mix: readonly [T, number][], u: number): T {
  const total = mix.reduce((t, [, w]) => t + w, 0);
  let a = u * total;
  for (const [k, w] of mix) if ((a -= w) < 0) return k;
  return mix[mix.length - 1][0];
}

const inside = (r: RegionDef, x: number, z: number) => x >= r.bounds.x0 && x < r.bounds.x1 && z >= r.bounds.z0 && z < r.bounds.z1;

/**
 * Every harbour boat in these regions: their moorings and anchor spots, and a share of
 * `berths` (the dockable berths), clear of the `named` ones. Pure.
 */
export function buildHarbourBoats(regions: readonly RegionDef[], berths: readonly BerthDef[], named: readonly BerthDef[]): HarbourBoat[] {
  const c = CONFIG.harbourBoats;
  const out: HarbourBoat[] = [];
  const add = (b: Omit<HarbourBoat, 'index'>) => out.push({ ...b, index: out.length });
  for (const region of regions) {
    const hb = region.harbourBoats;
    if (!hb) continue;
    const st = hb.style;
    const colour = (u: number) => st.hulls[Math.floor(u * st.hulls.length) % st.hulls.length];
    for (const s of hb.spots) {
      const moored = s.kind === 'mooring';
      const kind = pick(moored ? st.moored : st.anchored, hash('kind', s.x, s.z));
      const L = c.kinds[kind].length;
      add({
        kind,
        how: moored ? 'moored' : 'anchored',
        colour: colour(hash('colour', s.x, s.z)),
        x: s.x,
        z: s.z,
        heading: 0,
        r: L / 2 + (moored ? c.pennant : Math.min(40, c.anchorScope * s.depth)),
        calm: hash('calm', s.x, s.z) * Math.PI * 2,
        phase: hash('phase', s.x, s.z) * Math.PI * 2,
        seed: hash('seed', s.x, s.z),
      });
    }
    for (const b of berths) {
      if (!inside(region, b.x, b.z)) continue;
      if (named.some((n) => Math.hypot(n.x - b.x, n.z - b.z) < c.namedClear)) continue;
      const share = b.deckY < 1 ? c.pontoonShare : c.quayShare;
      if (hash('fill', b.id) >= share) continue;
      add({
        kind: pick(st.alongside, hash('kind', b.id)),
        how: 'alongside',
        colour: colour(hash('colour', b.id)),
        x: b.x,
        z: b.z,
        heading: ((b.headingDeg + (hash('way', b.id) < 0.5 ? 0 : 180)) * Math.PI) / 180,
        r: 0,
        calm: 0,
        phase: 0,
        berthId: b.id,
        seed: hash('seed', b.id),
      });
    }
  }
  return out;
}

/**
 * Where a boat lies now: alongside, where she was put; on a mooring or at anchor, swung to
 * the wind (`windFrom` deg, `wind` m/s) at time `t` (s).
 */
export function harbourBoatPose(b: HarbourBoat, windFrom: number, wind: number, t: number, out: HarbourBoatPose): HarbourBoatPose {
  if (b.how === 'alongside') {
    out.x = b.x;
    out.z = b.z;
    out.heading = b.heading;
    return out;
  }
  const c = CONFIG.harbourBoats;
  // Her bow toward the wind, blended with her calm lie in light airs.
  const w = Math.min(1, Math.max(0, wind / c.calmWind));
  const a = (windFrom * Math.PI) / 180;
  const hx = Math.sin(a) * w + Math.sin(b.calm) * (1 - w);
  const hz = -Math.cos(a) * w - Math.cos(b.calm) * (1 - w);
  const yaw = ((c.wanderDeg * Math.PI) / 180) * Math.sin((2 * Math.PI * t) / c.wanderPeriod + b.phase);
  const heading = Math.atan2(hx, -hz) + yaw;
  // Her middle downwind of the buoy: back from it along her heading.
  out.heading = heading;
  out.x = b.x - Math.sin(heading) * b.r;
  out.z = b.z + Math.cos(heading) * b.r;
  return out;
}

/** The wind the boats lie to: the weather's (none in a world without weather). */
export function boatWind(world: WorldState): { from: number; speed: number } {
  const n = world.environment.weather?.now;
  return { from: n?.windFrom ?? 0, speed: n?.wind ?? 0 };
}

/**
 * Is a vessel lying where this boat would be? Made fast in her berth (a saved game moored
 * there), or right on her spot (within 2 m: put there, not sailed there, since her hull
 * would have stopped a boat sailing in). Then she steps aside until the vessel has gone.
 */
export function harbourBoatDisplaced(b: HarbourBoat, world: WorldState): boolean {
  if (b.how !== 'alongside') return false;
  for (const v of Object.values(world.vessels)) {
    if (v.mooring.phase !== 'free' && v.mooring.berthId === b.berthId) return true;
    if (Math.hypot(v.position[0] - b.x, v.position[2] - b.z) < 2) return true;
  }
  return false;
}

// ── The game's own (its regions and berths), built on first use ──
let all: HarbourBoat[] | null = null;
let near: GridIndex<HarbourBoat> | null = null;
let taken: Set<string> | null = null;
/** Each boat's pose this tick (posed: the tick it was last posed). */
let poses: HarbourBoatPose[] = [];
let posedAt: Int32Array = new Int32Array(0);
let tick = 0;

/** The game's harbour boats (its coast regions'). */
export function harbourBoats(): readonly HarbourBoat[] {
  if (!all) useHarbourBoats(buildHarbourBoats(REGIONS, allBerths(), BERTHS));
  return all!;
}

/** Use these boats in place of the regions' own (tests). */
export function useHarbourBoats(list: HarbourBoat[]): void {
  all = list;
  near = new GridIndex(all, (b) => {
    const reach = b.r + CONFIG.harbourBoats.kinds[b.kind].length;
    return [b.x - reach, b.z - reach, b.x + reach, b.z + reach];
  });
  taken = new Set(all.flatMap((b) => (b.berthId ? [b.berthId] : [])));
  poses = all.map(() => ({ x: 0, z: 0, heading: 0 }));
  posedAt = new Int32Array(all.length).fill(-1);
}

/** Is a harbour boat lying in this berth? (Then it isn't yours to make fast in: vessel/physics/mooring.ts.) */
export function berthTaken(id: string): boolean {
  harbourBoats();
  return taken!.has(id);
}

/** Forget them (tests, a new world). */
export function clearHarbourBoats(): void {
  all = null;
  near = null;
  taken = null;
}

/**
 * Pose the boats near any vessel for this tick's collisions (the host's simulation step,
 * core/simulation.ts). One displaced by a vessel lying in her place isn't posed: not solid.
 */
export function stepHarbourBoats(world: WorldState): void {
  const list = harbourBoats();
  tick++;
  if (!list.length) return;
  const { from, speed } = boatWind(world);
  const reach = CONFIG.harbourBoats.stepReach;
  for (const v of Object.values(world.vessels)) {
    const vx = v.position[0];
    const vz = v.position[2];
    for (const b of list) {
      if (posedAt[b.index] === tick || Math.abs(b.x - vx) > reach || Math.abs(b.z - vz) > reach) continue;
      if (harbourBoatDisplaced(b, world)) continue;
      harbourBoatPose(b, from, speed, world.time, poses[b.index]);
      posedAt[b.index] = tick;
    }
  }
}

/**
 * If world point (x, y, z) is inside a harbour boat posed this tick, the shallowest way out
 * (her side, or her end), as a fendered pier's (geography.ts blockContact).
 */
export function harbourBoatContact(x: number, y: number, z: number, out: BlockHit): boolean {
  if (!near || !all?.length) return false;
  for (const b of near.at(x, z)) if (posedAt[b.index] === tick && boatBoxContact(b.kind, poses[b.index], x, y, z, out)) return true;
  return false;
}

/**
 * Is world point (x, y, z) inside a boat of this kind lying at `p`? Her hull is a box from
 * her keel to her deck, its forward part narrowing to the stem. If so, `out` is the
 * shallowest way out: through her side, or her end. Pure.
 */
export function boatBoxContact(kind: HarbourBoatKind, p: HarbourBoatPose, x: number, y: number, z: number, out: BlockHit): boolean {
  const k = CONFIG.harbourBoats.kinds[kind];
  if (y < -k.draught || y > k.freeboard) return false;
  const fx = Math.sin(p.heading);
  const fz = -Math.cos(p.heading);
  const dx = x - p.x;
  const dz = z - p.z;
  const along = dx * fx + dz * fz;
  const across = dx * -fz + dz * fx; // to starboard
  const half = k.length / 2;
  if (Math.abs(along) >= half) return false;
  // Her beam narrows over the forward 60% of her half-length, to a fifth at the stem.
  const taper = Math.max(0, (along / half - 0.4) / 0.6);
  const hb = (k.beam / 2) * (1 - 0.8 * taper);
  if (Math.abs(across) >= hb) return false;
  const side = hb - Math.abs(across);
  const end = half - Math.abs(along);
  const s = Math.sign(across) || 1;
  const e = Math.sign(along) || 1;
  if (side < end) Object.assign(out, { depth: side, nx: -fz * s, ny: 0, nz: fx * s, fendered: true });
  else Object.assign(out, { depth: end, nx: fx * e, ny: 0, nz: fz * e, fendered: true });
  return true;
}
