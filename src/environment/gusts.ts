/**
 * Katabatic gusts (the regions brief, the Fjord): cold air pouring off the mountains onto
 * the water in a sudden squall, in weather that is otherwise light. Nothing warns you but
 * the water itself: a dark, ruffled patch racing across it a few seconds ahead.
 *
 * What is modelled: one gust at a time, on one of the region's gust zones (GustZoneDef: a
 * circle, the bearing it blows from, its peak). Its strength rises over CONFIG.gusts.rise s,
 * holds with a flutter, and dies away over `fall` s; across the zone it is full in the
 * middle and fades out over the outer `edge` of the radius. The wind there is the
 * weather's own wind plus the gust (vector sum), so the boat's windage, the drift of
 * things in the water, the wind sock and the wind noise all feel it (weather.ts
 * windVector with a position). Not modelled: the gust's own short, steep chop (the sea
 * state stays the region's); the sudden heel and the shove to leeward are the fight.
 *
 * The host decides (stepGusts, on the region the home boat is in, by its weather
 * profile's `katabatic`): every `every` s a gust falls, more often than not on the zone
 * nearest the home boat (CONFIG.gusts.nearBias) - a gust a mile away teaches nothing. It
 * waits while the weather's own wind is over `maxBaseWind` (in a gale the mountains'
 * gusts are lost in it). The state is plain data in WeatherState, so crew compute the same
 * wind from the snapshot. Random choices are a hash of a counter (host and replays agree).
 */
import { CONFIG } from '../config';
import { GUSTS, type GustZoneDef, type RegionDef } from '../world/archipelago';
import type { EnvironmentState } from './environmentState';

export interface GustState {
  /** The zone it's falling on (its id), or null between gusts. */
  zone: string | null;
  /** When it began and when it ends (world time, s); its peak (m/s). */
  at: number;
  until: number;
  peak: number;
  /** When the next one falls (world time, s). */
  nextAt: number;
  /** Its strength now (0..1 of its peak; the host sets it each tick), and the look of it on the water (`lead` s ahead). */
  s: number;
  look: number;
  /** Counts the random draws. */
  n: number;
}

function hash01(n: number): number {
  const s = Math.sin(n * 41.719 + 9.13) * 43758.5453;
  return s - Math.floor(s);
}
const between = (g: GustState, [a, b]: [number, number]) => a + (b - a) * hash01(++g.n);

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** The zone a gust state names, if any. */
export function gustZone(g: GustState | undefined): GustZoneDef | undefined {
  return g?.zone ? GUSTS.find((z) => z.id === g.zone) : undefined;
}

/**
 * How strong the gust is at `time` (0..1 of its peak): rising, holding with a flutter,
 * dying away. `lead` s earlier for the look of it (the patch on the water runs ahead).
 */
export function gustEnvelope(g: GustState | undefined, time: number, lead = 0): number {
  if (!g?.zone) return 0;
  const c = CONFIG.gusts;
  const t = time + lead;
  if (t < g.at || t > g.until) return 0;
  const up = smooth((t - g.at) / c.rise);
  const down = smooth((g.until - t) / c.fall);
  // The flutter: gusts come in pulses (two slow sines; the same on every machine).
  const flutter = 1 - c.flutter * (0.5 + 0.5 * Math.sin(t * 1.3) * Math.sin(t * 0.47 + 1.1));
  return Math.min(up, down) * flutter;
}

/** Across the zone: 1 in the middle, fading to 0 over the outer `edge` of its radius. */
export function gustSpread(z: GustZoneDef, x: number, zz: number): number {
  const d = Math.hypot(x - z.x, zz - z.z);
  if (d >= z.r) return 0;
  return 1 - smooth((d - z.r * (1 - CONFIG.gusts.edge)) / (z.r * CONFIG.gusts.edge));
}

/**
 * The gust's wind at (x, z) now (m/s, world x, z: the way it blows), added to `out`.
 * Nothing outside the zone or between gusts.
 */
export function addGust(env: EnvironmentState, x: number, z: number, out: { x: number; z: number }): void {
  const g = env.weather?.gust;
  const zone = gustZone(g);
  if (!zone || !g!.s) return;
  const s = g!.s * gustSpread(zone, x, z);
  if (s <= 0) return;
  const to = ((zone.fromDeg + 180) * Math.PI) / 180;
  out.x += Math.sin(to) * g!.peak * s; // east
  out.z += -Math.cos(to) * g!.peak * s; // north is -z
}

/** Start a gust on `zone` now, lasting `last` s (the director, or the debug menu's "Gust now"). */
export function startGust(g: GustState, zone: GustZoneDef, time: number, last: number, strength = 1): void {
  g.zone = zone.id;
  g.at = time;
  g.until = time + last;
  g.peak = zone.peakMs * strength;
}

/**
 * Advance the gusts (host): end the one blowing, let the next fall when it's due.
 * @param region the region the home boat is in (its gust zones and weather profile)
 * @param bx, bz where the home boat is
 */
export function stepGusts(env: EnvironmentState, time: number, region: RegionDef | undefined, bx: number, bz: number): void {
  const w = env.weather;
  if (!w) return;
  const k = region?.weather?.katabatic;
  const zones = region?.gusts ?? [];
  const g = (w.gust ??= { zone: null, at: 0, until: 0, peak: 0, nextAt: time + CONFIG.gusts.firstAfter, n: 11, s: 0, look: 0 });
  if (g.zone && time > g.until) g.zone = null;
  g.s = gustEnvelope(g, time);
  g.look = gustEnvelope(g, time, CONFIG.gusts.lead);
  if (g.zone) return;
  if (!k || !zones.length) {
    // No mountains here: the clock waits, so the first gust falls a while after you arrive.
    g.nextAt = Math.max(g.nextAt, time + CONFIG.gusts.firstAfter);
    return;
  }
  if (time < g.nextAt) return;
  if (w.now.wind > CONFIG.gusts.maxBaseWind) {
    g.nextAt = time + 30;
    return;
  }
  // Mostly the zone nearest the home boat; otherwise any of the region's.
  let zone = zones[Math.floor(hash01(++g.n) * zones.length) % zones.length];
  if (hash01(++g.n) < CONFIG.gusts.nearBias) zone = zones.reduce((a, b) => (Math.hypot(b.x - bx, b.z - bz) - b.r < Math.hypot(a.x - bx, a.z - bz) - a.r ? b : a));
  startGust(g, zone, time, between(g, k.last), 0.75 + 0.25 * hash01(++g.n));
  g.nextAt = g.until + between(g, k.every);
  g.look = gustEnvelope(g, time, CONFIG.gusts.lead);
}

/** Debug ("Gust now"): a gust on the zone nearest (x, z), anywhere in the world. */
export function gustNow(env: EnvironmentState, time: number, x: number, z: number): GustZoneDef | null {
  const w = env.weather;
  if (!w || !GUSTS.length) return null;
  const g = (w.gust ??= { zone: null, at: 0, until: 0, peak: 0, nextAt: time + CONFIG.gusts.firstAfter, n: 11, s: 0, look: 0 });
  const zone = GUSTS.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a));
  startGust(g, zone, time, CONFIG.gusts.debugLast);
  g.nextAt = Math.max(g.nextAt, g.until + 60);
  return zone;
}
