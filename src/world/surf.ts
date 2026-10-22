/**
 * Surf on the shore (the coast extras plan, C5; the owner: "surf, if the wave's height over a
 * certain height ... and your engine's off"). Where it breaks near you, how big, and what on:
 * read by the surf sound (audio/surfAudio.ts). It reads the ground, the shore map and the
 * waves, nothing else (SurfListener keeps the last look round, to spread it over frames).
 *
 * What's modelled:
 *   - The surf line: waves break roughly where the water is shallower than 1.3 times their
 *     height (the breaker depth index, about 0.78 the other way round). Looking out from you
 *     along `rays` bearings to `radii`, the first place the ground crosses that depth (from
 *     deep to shallow afloat; from shore to sea on land) is that bearing's surf.
 *   - Its height: the open sea's significant height times the shelter there (the waves'
 *     amplitudes added up just seaward of the line, against the open sea's: a bay behind a
 *     headland stays quiet). Nothing below `minHs`, full at `fullHs` (m).
 *   - Which way the shore faces: a shore the waves run onto at full; one with its back to
 *     them `lee` of that (waves bend round onto every shore, but less).
 *   - Distance: full within `near` m, nothing beyond `hearRange`.
 *   - What it breaks on (the shore map, C3): rock and cliff boom, shingle rattles back on the
 *     backwash, sand washes long and soft; each kind's mix of the three in `kinds`.
 * CONFIG.surf.
 */
import { CONFIG } from '../config';
import { localSeaAt, significantWaveHeight, type PreparedWave, type WaveComponent } from '../ocean/waves';
import { shoreAt, type ShoreKind } from './coastShore';
import { groundHeight } from './terrain';

export interface SurfHere {
  /** How loud, 0-1 (before the engine and the wheelhouse). */
  level: number;
  /** Where it's heard from (the bearings' surf weighted by loudness; world m). */
  x: number;
  z: number;
  /** How far off the loudest stretch is (m). */
  distance: number;
  /** The mix: boom (low thump), wash (the broken water running up), hiss (spray and backwash rattle). */
  boom: number;
  wash: number;
  hiss: number;
  /** The breakers' period (s): the biggest wave's. */
  period: number;
  /** The surf's height at the loudest stretch (m). */
  height: number;
}

/** The quiet answer (and the out-parameter's start). */
export function noSurf(out: SurfHere = {} as SurfHere): SurfHere {
  return Object.assign(out, { level: 0, x: 0, z: 0, distance: Infinity, boom: 0, wash: 0, hiss: 0, period: 8, height: 0 });
}

const sea = { amp: 0, dirX: 0, dirZ: 0 };

/** One bearing's surf: how loud, where, how far, how high, on what. */
interface RaySurf {
  loud: number;
  x: number;
  z: number;
  d: number;
  height: number;
  kind: ShoreKind;
}

/** The sea's state for a look round: its height, where waves that size break, the open sea's amplitudes. */
interface Look {
  hs: number;
  breakDepth: number;
  openAmp: number;
  startShallow: boolean;
  afloat: boolean;
}

function look(x: number, z: number, components: readonly WaveComponent[], waves: readonly PreparedWave[]): Look | null {
  // The open sea's (the overfalls' chop is only in a running race, not on the shore).
  const hs = significantWaveHeight(components.filter((w) => !w.chop));
  if (hs < CONFIG.surf.minHs || !waves.length) return null;
  const openAmp = waves.reduce((s, w, i) => s + (components[i]?.chop ? 0 : w.amplitude), 0);
  if (openAmp <= 0) return null;
  // Waves of this height break in water shallower than this.
  const breakDepth = Math.max(0.5, 1.3 * hs);
  const g = groundHeight(x, z);
  return { hs, breakDepth, openAmp, startShallow: g > -breakDepth, afloat: g < 0 };
}

/** Bearing `i`'s surf from (x, z), into `out` (its `loud` 0 where there's none). */
function ray(x: number, z: number, i: number, k: Look, waves: readonly PreparedWave[], out: RaySurf): RaySurf {
  const c = CONFIG.surf;
  out.loud = 0;
  const a = (i / c.rays) * Math.PI * 2;
  const dx = Math.sin(a);
  const dz = -Math.cos(a);
  const shallow = (px: number, pz: number) => groundHeight(px, pz) > -k.breakDepth;
  // In the broken water yourself (aground, or wading): it's here.
  let d = k.startShallow && k.afloat ? 0 : -1;
  let prev = 0;
  if (d < 0)
    for (const r of c.radii) {
      if (shallow(x + dx * r, z + dz * r) !== k.startShallow) {
        d = r;
        break;
      }
      prev = r;
    }
  if (d < 0) return out;
  // The sea side and the shore side of the line along this bearing.
  const [wr, lr] = k.startShallow ? [d, prev] : [prev, d];
  const wx = x + dx * wr;
  const wz = z + dz * wr;
  const lx = x + dx * (lr + (k.startShallow ? 0 : 10));
  const lz = z + dz * (lr + (k.startShallow ? 0 : 10));
  // Its height there (the shelter), and whether the waves run onto it.
  localSeaAt(waves, wx, wz, sea);
  const height = k.hs * (sea.amp / k.openAmp);
  const big = Math.max(0, Math.min(1, (height - c.minHs) / (c.fullHs - c.minHs)));
  if (big <= 0) return out;
  const onX = lx - wx;
  const onZ = lz - wz;
  const on = Math.hypot(onX, onZ);
  const facing = on > 0 ? (sea.dirX * onX + sea.dirZ * onZ) / on : 1;
  const exposure = c.lee + (1 - c.lee) * Math.max(0, facing);
  const far = d <= c.near ? 1 : Math.max(0, 1 - (d - c.near) / (c.hearRange - c.near)) ** 1.5;
  const loud = big * exposure * far;
  if (loud <= 0.01) return out;
  return Object.assign(out, { loud, x: x + dx * d, z: z + dz * d, d, height, kind: kindAt(lx, lz) });
}

/** The bearings' surf put together: the loudest stretch, a little more for a long shore all round you. */
function combine(rays: readonly RaySurf[], components: readonly WaveComponent[], out: SurfHere): SurfHere {
  const c = CONFIG.surf;
  noSurf(out);
  let total = 0;
  let best = 0;
  let hits = 0;
  let sx = 0;
  let sz = 0;
  for (const r of rays) {
    if (r.loud <= 0) continue;
    hits++;
    total += r.loud;
    const k = c.kinds[r.kind];
    out.boom += r.loud * k.boom;
    out.wash += r.loud * k.wash;
    out.hiss += r.loud * k.hiss;
    sx += r.loud * r.x;
    sz += r.loud * r.z;
    if (r.loud > best) {
      best = r.loud;
      out.distance = r.d;
      out.height = r.height;
    }
  }
  if (!hits) return out;
  out.level = Math.min(1, best * (1 + c.spread * Math.min(1, (hits - 1) / (c.rays / 3))));
  out.x = sx / total;
  out.z = sz / total;
  out.boom /= total;
  out.wash /= total;
  out.hiss /= total;
  let biggest = components[0];
  for (const w of components) if (!w.chop && w.amplitude > (biggest?.amplitude ?? 0)) biggest = w;
  out.period = biggest?.period ?? 8;
  return out;
}

const blank = (): RaySurf => ({ loud: 0, x: 0, z: 0, d: 0, height: 0, kind: 'none' });

/** The surf heard at (x, z), given the sea's components and the prepared waves (for the shelter): every bearing at once. */
export function surfAt(x: number, z: number, components: readonly WaveComponent[], waves: readonly PreparedWave[], out: SurfHere = noSurf()): SurfHere {
  const k = look(x, z, components, waves);
  if (!k) return noSurf(out);
  const rays = Array.from({ length: CONFIG.surf.rays }, (_, i) => ray(x, z, i, k, waves, blank()));
  return combine(rays, components, out);
}

/**
 * The same, a few bearings a frame (the game's): `step` looks along the next of them from
 * where you are now and puts the latest of every bearing together, so a whole look round
 * is spread over `every` s instead of falling in one frame.
 */
export class SurfListener {
  readonly here = noSurf();
  private readonly rays = Array.from({ length: CONFIG.surf.rays }, blank);
  private next = 0;
  private owed = 0;

  step(x: number, z: number, components: readonly WaveComponent[], waves: readonly PreparedWave[], dt: number): SurfHere {
    const c = CONFIG.surf;
    const k = look(x, z, components, waves);
    if (!k) {
      for (const r of this.rays) r.loud = 0;
      return noSurf(this.here);
    }
    this.owed = Math.min(c.rays, this.owed + (c.rays * dt) / c.every);
    for (; this.owed >= 1; this.owed--) {
      ray(x, z, this.next, k, waves, this.rays[this.next]);
      this.next = (this.next + 1) % c.rays;
    }
    return combine(this.rays, components, this.here);
  }
}

/** What the shore is made of there, looking a few metres round where the map leaves it out. */
function kindAt(x: number, z: number): ShoreKind {
  const k = shoreAt(x, z);
  if (k !== 'none') return k;
  for (const [ox, oz] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
    const n = shoreAt(x + ox, z + oz);
    if (n !== 'none') return n;
  }
  return 'none';
}
