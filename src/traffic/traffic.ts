/**
 * Passing ships and hazards: plain shared state (WorldState.traffic), stepped by the host.
 * No physics - ships follow straight courses at constant speed, debris drifts - and the
 * views sample the waves to bob them.
 *
 *   ships    `maxShips` of them kept about: while fewer, every `every` s (random) one is
 *            put on a course that crosses ahead of the workboat `pass` m off, starting
 *            `spawnDist` away, the whole track checked in deep water. It goes when it's
 *            `despawn` m off and opening. Each has an AIS name (the plotter shows them all,
 *            fog or not).
 *   sighted  the first time a ship comes within min(sightRange, visibility x sightVis); the
 *            lookout calls it out. Sightings are spaced `sightEvery` s apart.
 *   debris   floating debris, spawned now and then ahead of the boat, drifting downwind.
 * Random choices use a deterministic hash of a counter in the state.
 */
import { CONFIG } from '../config';
import { driftVelocity } from '../world/drift';

const driftV = { x: 0, z: 0 };
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import { visibilityAt } from '../environment/weather';
import type { VesselState } from '../vessel/vesselState';
import { PORTS } from '../world/archipelago';
import { groundHeight } from '../world/terrain';

export type ShipType = 'cargo' | 'fishing' | 'yacht';
export const SHIP_TYPES: ShipType[] = ['cargo', 'fishing', 'yacht'];
/** As a log would write the type. */
export const SHIP_NAMES: Record<ShipType, string> = { cargo: 'Cargo ship', fishing: 'Fishing boat', yacht: 'Yacht' };

export interface Ship {
  id: string;
  type: ShipType;
  name: string;
  x: number;
  z: number;
  /** Course (rad, 0 = north, clockwise) and speed (m/s). */
  course: number;
  speed: number;
  /** A course it is coming round to (rad), having found its water shoaling ahead (confined waters). */
  want?: number;
  sighted: boolean;
  /** Last time it sounded its fog signal (s, world time). */
  hornAt: number;
  /** Bound for a construction project's works (its id: career/projects.ts, guard duty) until she's met and turns away. */
  bound?: string;
}

export interface Debris {
  id: string;
  x: number;
  z: number;
}

export interface TrafficState {
  ships: Ship[];
  debris: Debris[];
  seq: number;
  nextShipAt: number;
  nextDebrisAt: number;
  /** Counts fog-signal answers (views play a horn when it changes; see hornFrom). */
  hornSeq: number;
  hornFrom: string | null;
  /** World time of the last sighting (s): sightings are spaced `sightEvery`. */
  sightAt?: number;
}

export function createTraffic(time = 0): TrafficState {
  return { ships: [], debris: [], seq: 1, nextShipAt: time + CONFIG.traffic.firstShip, nextDebrisAt: time + 120, hornSeq: 0, hornFrom: null };
}

function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const between = (r: number, [a, b]: readonly [number, number]) => a + (b - a) * r;

function workboat(world: WorldState): VesselState | undefined {
  return homeVessel(world);
}

function inHarbour(x: number, z: number): boolean {
  return PORTS.some((p) => Math.hypot(p.x - x, p.z - z) < CONFIG.rescue.harbourRadius);
}

/** Bearing from (ax, az) to (bx, bz), degrees true. */
export function bearingTo(ax: number, az: number, bx: number, bz: number): number {
  return ((Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI + 360) % 360;
}

/** Is the straight track from (x, z) along `course` for `len` m in water deeper than `depth` m (sampled every 100 m, and at its end)? */
function clearTrack(x: number, z: number, course: number, len: number, depth = 8): boolean {
  for (let d = 0; d <= len + 99; d += 100) {
    const s = Math.min(d, len);
    if (groundHeight(x + Math.sin(course) * s, z - Math.cos(course) * s) > -depth) return false;
  }
  return true;
}

/** The least water a ship of this type keeps to (CONFIG.traffic.ships[type].minDepth). */
const minDepth = (type: ShipType): number => CONFIG.traffic.ships[type].minDepth;

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * A new ship crossing ahead of the boat at (bx, bz) heading `hdg` (rad): its closest point
 * of approach `pass` m off to one side, `spawnDist` before that along its track.
 */
export function spawnShip(world: WorldState, t: TrafficState, v: VesselState, near = false): Ship | null {
  const c = CONFIG.traffic;
  const [bx, , bz] = v.position;
  const [qx, qy, qz, qw] = v.orientation;
  const hdg = Math.atan2(-(2 * (qx * qz + qw * qy)), (1 - 2 * (qx * qx + qy * qy)));
  const add = (n: number, type: ShipType, sx: number, sz: number, course: number): Ship => addShip(world, t, n, type, sx, sz, course);
  // Open water: a straight track crossing ahead of us.
  for (let tries = 0; tries < 12; tries++) {
    const n = (t.seq += 1);
    const type = SHIP_TYPES[Math.floor(hash01(n) * SHIP_TYPES.length) % SHIP_TYPES.length];
    // Closest approach point: ahead of the boat, off to one side.
    const ahead = near ? between(hash01(n + 0.1), [150, 450]) : between(hash01(n + 0.1), [300, 900]);
    const side = (hash01(n + 0.2) < 0.5 ? -1 : 1) * (near ? between(hash01(n + 0.3), [200, 450]) : between(hash01(n + 0.3), c.pass));
    const px = bx + Math.sin(hdg) * ahead + Math.cos(hdg) * side;
    const pz = bz - Math.cos(hdg) * ahead + Math.sin(hdg) * side;
    // Its course: roughly across our heading, either way.
    const course = hdg + (hash01(n + 0.4) < 0.5 ? 1 : -1) * (Math.PI / 2 + (hash01(n + 0.5) - 0.5) * 1.2);
    const back = near ? between(hash01(n + 0.6), [500, 900]) : between(hash01(n + 0.6), c.spawnDist);
    const sx = px - Math.sin(course) * back;
    const sz = pz + Math.cos(course) * back;
    if (!clearTrack(sx, sz, course, back * 2, minDepth(type))) continue;
    return add(n, type, sx, sz, course);
  }
  // Confined waters (a loch, a bay): the longest clear run found through any point round us,
  // for the type drawn, else for each type of less draught (a loch too shallow for the cargo
  // ship still has yachts).
  const n = (t.seq += 1);
  const types = [...SHIP_TYPES].sort((a, b) => minDepth(b) - minDepth(a));
  const first = Math.floor(hash01(n) * types.length) % types.length;
  for (let i = first; i < types.length; i++) {
    const run = confinedTrack(bx, bz, n + i, minDepth(types[i]), near);
    if (run) return add(n, types[i], run.x, run.z, run.course);
  }
  return null;
}

/** A new ship of `type` at (sx, sz) on `course`, its name and fog-signal clock from `n`. */
function addShip(world: WorldState, t: TrafficState, n: number, type: ShipType, sx: number, sz: number, course: number): Ship {
  const st = CONFIG.traffic.ships[type];
  const ship: Ship = { id: `ship${n}`, type, name: st.names[Math.floor(hash01(n + 0.7) * st.names.length) % st.names.length], x: sx, z: sz, course, speed: st.speed, sighted: false, hornAt: world.time - hash01(n + 0.8) * 120 };
  t.ships.push(ship);
  return ship;
}

/**
 * A ship sent for (x, z) (a construction project's works, `bound` its id: guard duty,
 * career/projects.ts): `from` m off on some bearing, on a course straight for it, with deep
 * enough water all the way in and as far again past it. Null if no clear approach was found.
 */
export function spawnShipFor(world: WorldState, x: number, z: number, from: number, bound: string): Ship | null {
  const t = (world.traffic ??= createTraffic(world.time));
  for (let tries = 0; tries < 24; tries++) {
    const n = (t.seq += 1);
    const type = SHIP_TYPES[Math.floor(hash01(n) * SHIP_TYPES.length) % SHIP_TYPES.length];
    const brg = hash01(n + 0.3) * Math.PI * 2;
    const sx = x + Math.sin(brg) * from;
    const sz = z - Math.cos(brg) * from;
    const course = wrapAngle(brg + Math.PI);
    if (!clearTrack(sx, sz, course, from * 2, minDepth(type))) continue;
    const ship = addShip(world, t, n, type, sx, sz, course);
    ship.bound = bound;
    return ship;
  }
  return null;
}

/** How far (m) the water stays deeper than `depth` from (x, z) along `course`, up to `max`, by 100 m. */
function clearRun(x: number, z: number, course: number, max: number, depth: number): number {
  let d = 0;
  while (d < max) {
    const s = Math.min(d + 100, max);
    if (groundHeight(x + Math.sin(course) * s, z - Math.cos(course) * s) > -depth) return d;
    d = s;
  }
  return d;
}

/**
 * In confined waters: of `tries` points on any bearing from the boat (CONFIG.traffic.confined:
 * `minPass` to `maxPass` m off) on any of `courses` courses, the one with the longest clear
 * run through it (its water deeper than `depth` m) that has at least `minBack` m each side;
 * the ship starts at the back end (at most `spawnDist` from the point), `minStart` m from the
 * boat at least (not in plain view) unless `near`. Null when there's none at all.
 */
export function confinedTrack(bx: number, bz: number, seed: number, depth: number, near = false): { x: number; z: number; course: number; length: number } | null {
  const c = CONFIG.traffic;
  const k = c.confined;
  let best: { x: number; z: number; course: number; length: number } | null = null;
  for (let i = 0; i < k.tries; i++) {
    const a = hash01(seed + i * 0.37 + 0.1) * Math.PI * 2;
    const r = between(hash01(seed + i * 0.37 + 0.3), [k.minPass, k.maxPass]);
    const px = bx + Math.sin(a) * r;
    const pz = bz - Math.cos(a) * r;
    if (groundHeight(px, pz) > -depth) continue;
    const c0 = hash01(seed + i * 0.37 + 0.5) * Math.PI * 2;
    for (let j = 0; j < k.courses; j++) {
      const course = wrapAngle(c0 + (j * Math.PI * 2) / k.courses);
      const back = clearRun(px, pz, course + Math.PI, c.spawnDist[1], depth);
      if (back < k.minBack) continue;
      const fwd = clearRun(px, pz, course, c.spawnDist[1], depth);
      if (fwd < k.minBack || back + fwd <= (best?.length ?? 0)) continue;
      const sx = px - Math.sin(course) * back;
      const sz = pz + Math.cos(course) * back;
      if (!near && Math.hypot(sx - bx, sz - bz) < k.minStart) continue;
      best = { x: sx, z: sz, course, length: back + fwd };
    }
  }
  return best;
}

/** Floating debris somewhere ahead of the boat, off to one side, in open water. */
export function spawnDebris(t: TrafficState, v: VesselState, near = false): Debris | null {
  const [bx, , bz] = v.position;
  for (let tries = 0; tries < 8; tries++) {
    const n = (t.seq += 1);
    const a = hash01(n) * Math.PI * 2;
    const d = near ? 120 : between(hash01(n + 0.1), [400, 900]);
    const x = bx + Math.sin(a) * d;
    const z = bz - Math.cos(a) * d;
    if (groundHeight(x, z) > -4) continue;
    const deb = { id: `debris${n}`, x, z };
    t.debris.push(deb);
    return deb;
  }
  return null;
}

export function stepTraffic(world: WorldState, dt: number): void {
  const t = (world.traffic ??= createTraffic(world.time));
  const v = workboat(world);
  if (!v) return;
  const c = CONFIG.traffic;
  const [bx, , bz] = v.position;
  const away = !inHarbour(bx, bz);
  // Keep maxShips ships about (anywhere their track is in deep water); debris out of harbour.
  // None in Training: the harbour is for practising in (docs/TRAINING.md section 4).
  if (world.training) return;
  if (world.time >= t.nextShipAt) {
    t.nextShipAt = world.time + between(hash01(t.seq + 0.9), c.every);
    if (t.ships.length < c.maxShips) spawnShip(world, t, v);
  }
  if (world.time >= t.nextDebrisAt) {
    t.nextDebrisAt = world.time + between(hash01(t.seq + 0.95), c.debrisEvery);
    if (away && t.debris.length < 2) spawnDebris(t, v);
  }
  const vis = visibilityAt(world.environment, bx, bz);
  const sight = Math.min(c.sightRange, vis * c.sightVis);
  const fog = vis < CONFIG.duties.fogVis;
  const gone = new Set<Ship>();
  for (const s of t.ships) {
    // Coming round to a new course (confined waters), at the turn rate.
    if (s.want !== undefined) {
      const diff = wrapAngle(s.want - s.course);
      const step = (c.confined.turnRate * Math.PI * dt) / 180;
      if (Math.abs(diff) <= step) {
        s.course = s.want;
        delete s.want;
      } else s.course += Math.sign(diff) * step;
    }
    s.x += Math.sin(s.course) * s.speed * dt;
    s.z -= Math.cos(s.course) * s.speed * dt;
    // Its water shoaling ahead (along the course it's coming round to, while turning): alter
    // course to the clearest turn, or go (nowhere to go).
    if (!clearTrack(s.x, s.z, s.want ?? s.course, c.confined.lookAhead, minDepth(s.type))) {
      const turn = steerClear(s);
      if (turn === null) gone.add(s);
      else if (turn !== s.want) s.want = turn;
    }
    const d = Math.hypot(s.x - bx, s.z - bz);
    // Sighted (the lookout calls it), spaced out so calls don't pile up.
    const spaced = world.time - (t.sightAt ?? -Infinity) >= c.sightEvery;
    if (!s.sighted && d < sight && spaced) {
      s.sighted = true;
      t.sightAt = world.time;
    }
    // In restricted visibility: a prolonged blast every two minutes (COLREG rule 35).
    if (fog && d < c.hornRange && world.time - s.hornAt > 120) {
      s.hornAt = world.time;
      t.hornSeq += 1;
      t.hornFrom = s.id;
    }
  }
  // Gone: far off and opening, or with nowhere left to steer.
  t.ships = t.ships.filter((s) => {
    if (gone.has(s)) return false;
    const d = Math.hypot(s.x - bx, s.z - bz);
    const opening = (s.x - bx) * Math.sin(s.course) - (s.z - bz) * Math.cos(s.course) > 0;
    return !(d > c.despawn && opening) && d < c.despawn * 1.6;
  });
  // Debris drifts like everything in the water (world/drift.ts), and is left behind.
  for (const d of t.debris) {
    const dv = driftVelocity(world.environment, d.x, d.z, driftV);
    d.x += dv.x * dt;
    d.z += dv.z * dt;
  }
  t.debris = t.debris.filter((d) => Math.hypot(d.x - bx, d.z - bz) < c.despawn);
}

/**
 * A ship with its water shoaling ahead: of a few turns (either way, then wider, then right
 * round) the one with the longest clear water along it (more than `lookAhead`, up to 4 x
 * that), or null when there's none.
 */
export function steerClear(s: Ship): number | null {
  const c = CONFIG.traffic.confined;
  const depth = minDepth(s.type);
  let best: number | null = null;
  let bestRun = c.lookAhead;
  for (const dev of [35, -35, 70, -70, 105, -105, 140, -140, 180]) {
    const course = wrapAngle(s.course + (dev * Math.PI) / 180);
    const run = clearRun(s.x, s.z, course, c.lookAhead * 4, depth);
    if (run > bestRun) [best, bestRun] = [course, run];
  }
  return best;
}

/** A prolonged blast from us in fog: the nearest ship in hearing answers with its own. */
export function answerFogSignal(world: WorldState): void {
  const t = world.traffic;
  const v = workboat(world);
  if (!t || !v) return;
  const vis = visibilityAt(world.environment, v.position[0], v.position[2]);
  if (vis >= CONFIG.duties.fogClearVis) return;
  let best: Ship | null = null;
  let bd = CONFIG.traffic.hornRange;
  for (const s of t.ships) {
    const d = Math.hypot(s.x - v.position[0], s.z - v.position[2]);
    if (d < bd) [best, bd] = [s, d];
  }
  if (!best) return;
  best.hornAt = world.time;
  t.hornSeq += 1;
  t.hornFrom = best.id;
}

/** Debug intents (targetId: environment): trafficSpawn (value 0 = ship, 1 = debris; close by). */
export function applyTrafficIntent(world: WorldState, intent: Intent): void {
  const t = (world.traffic ??= createTraffic(world.time));
  const v = workboat(world);
  if (!v) return;
  if (intent.value < 0.5) spawnShip(world, t, v, true);
  else spawnDebris(t, v, true);
}

