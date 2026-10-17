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
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import { visibilityAt, windVector } from '../environment/weather';
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
  sighted: boolean;
  /** Last time it sounded its fog signal (s, world time). */
  hornAt: number;
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

/** Is the straight track from (x, z) along `course` for `len` m in deep water? */
function clearTrack(x: number, z: number, course: number, len: number): boolean {
  for (let d = 0; d <= len; d += 100) {
    if (groundHeight(x + Math.sin(course) * d, z - Math.cos(course) * d) > -8) return false;
  }
  return true;
}

/**
 * A new ship crossing ahead of the boat at (bx, bz) heading `hdg` (rad): its closest point
 * of approach `pass` m off to one side, `spawnDist` before that along its track.
 */
export function spawnShip(world: WorldState, t: TrafficState, v: VesselState, near = false): Ship | null {
  const c = CONFIG.traffic;
  const [bx, , bz] = v.position;
  const [qx, qy, qz, qw] = v.orientation;
  const hdg = Math.atan2(-(2 * (qx * qz + qw * qy)), (1 - 2 * (qx * qx + qy * qy)));
  for (let tries = 0; tries < 12; tries++) {
    const n = (t.seq += 1);
    const type = SHIP_TYPES[Math.floor(hash01(n) * SHIP_TYPES.length) % SHIP_TYPES.length];
    const st = c.ships[type];
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
    if (!clearTrack(sx, sz, course, back * 2)) continue;
    const ship: Ship = { id: `ship${n}`, type, name: st.names[Math.floor(hash01(n + 0.7) * st.names.length) % st.names.length], x: sx, z: sz, course, speed: st.speed, sighted: false, hornAt: world.time - hash01(n + 0.8) * 120 };
    t.ships.push(ship);
    return ship;
  }
  return null;
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
  for (const s of t.ships) {
    s.x += Math.sin(s.course) * s.speed * dt;
    s.z -= Math.cos(s.course) * s.speed * dt;
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
  // Gone: far off and opening.
  t.ships = t.ships.filter((s) => {
    const d = Math.hypot(s.x - bx, s.z - bz);
    const opening = (s.x - bx) * Math.sin(s.course) - (s.z - bz) * Math.cos(s.course) > 0;
    return !(d > c.despawn && opening) && d < c.despawn * 1.6;
  });
  // Debris drifts downwind (like everything in the water), and is left behind.
  const w = windVector(world.environment, { x: 0, z: 0 });
  for (const d of t.debris) {
    d.x += (CONFIG.rescue.drift[0] + w.x * CONFIG.weather.driftPerWind) * dt;
    d.z += (CONFIG.rescue.drift[1] + w.z * CONFIG.weather.driftPerWind) * dt;
  }
  t.debris = t.debris.filter((d) => Math.hypot(d.x - bx, d.z - bz) < c.despawn);
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

