/**
 * Where her machinery goes in her hull, and whether it fits (owner, Oct 2026: the engines
 * stood up through the wheelhouse, the propeller and rudder sat inside the hull, and the big
 * tug diesel can't fit a shallow hull; it should give a reason for more depth).
 *
 * Read off her stations' sections (the lines-plan outline the hull is built from: keel,
 * chine, deck edge on each side), between the two stations either side of a point:
 *
 *   engine    sits as low as it can: its lower part (the sump and bearers, `SUMP_SHARE`
 *             of its width) clear of the hull bottom by `CLEAR` (plating, floors, bearers)
 *             all along its length, so with a V bottom a wide engine sits higher, and twin
 *             engines set out from the centreline sit higher still. It has to fit under the
 *             cabin floor (its hatch is in the floor): if its top comes above that, it
 *             doesn't fit, by that much, and she needs that much more depth;
 *   propeller hangs below her bottom, its tip `TIP_SHARE` of its diameter clear of the
 *             plating over it (less and it hammers the hull);
 *   rudder    from the bottom down to the propeller's lower tip, behind it.
 *
 * Plain numbers only (no drawing): build.ts checks the fit, the Shipyard's view draws it.
 */
import type { HullForm } from '../vessel/hullForm';

/**
 * Between the hull's outside bottom and the engine's lower part (m): the plating, the floors
 * (the transverse frames across her bottom) and the engine bearers it stands on.
 */
export const CLEAR = 0.2;
/** The engine's lower part (sump, bearers) as a share of its width: what has to clear the bottom. */
export const SUMP_SHARE = 0.65;
/** The propeller tip's clearance under the hull, as a share of its diameter. */
export const TIP_SHARE = 0.15;

/** Her section at `z`: the starboard half, keel to deck edge, as [x, y] points (x rising). */
export function halfSection(form: Pick<HullForm, 'stations'>, z: number): [number, number][] {
  const st = [...form.stations].sort((a, b) => a.z - b.z);
  let i = st.findIndex((s) => s.z >= z);
  if (i <= 0) i = i === 0 ? 1 : st.length - 1;
  const a = st[i - 1];
  const b = st[i];
  const t = Math.max(0, Math.min(1, (z - a.z) / (b.z - a.z || 1)));
  // Keel, chine, deck edge: the last three of the five-point section (the starboard side).
  const pick = (s: (typeof st)[number]) => s.polygon.slice(Math.floor(s.polygon.length / 2));
  const pa = pick(a);
  const pb = pick(b);
  return pa.map((p, k) => [p[0] + (pb[k][0] - p[0]) * t, p[1] + (pb[k][1] - p[1]) * t]);
}

/** The hull bottom's height under `x` off the centreline, at `z` (the deck edge's height past it). */
export function bottomAt(form: Pick<HullForm, 'stations'>, x: number, z: number): number {
  const s = halfSection(form, z);
  const ax = Math.abs(x);
  for (let k = 1; k < s.length; k++) {
    const [x0, y0] = s[k - 1];
    const [x1, y1] = s[k];
    if (ax <= x1) return x1 > x0 ? y0 + ((y1 - y0) * (ax - x0)) / (x1 - x0) : Math.min(y0, y1);
  }
  return s[s.length - 1][1];
}

export interface EngineFit {
  /** The engine's underside and top (m, boat axes), and its centre off the centreline (each of a twin). */
  bottomY: number;
  topY: number;
  x: number;
  /** Its top is under the cabin floor. */
  fits: boolean;
  /** How far its top comes above the floor (m; 0 if it fits). */
  shortM: number;
}

/**
 * Place an engine of `size` ([length, width, height], m) centred on `bedZ` along her, at
 * `x` off the centreline (a twin's), as low as the hull bottom allows; check it's under `floorY`.
 */
export function fitEngine(form: Pick<HullForm, 'stations'>, size: readonly [number, number, number], x: number, bedZ: number, floorY: number): EngineFit {
  const [L, W, H] = size;
  const half = (W * SUMP_SHARE) / 2;
  let bottom = -Infinity;
  for (let i = 0; i <= 6; i++) {
    const z = bedZ - L / 2 + (L * i) / 6;
    for (const dx of [-half, 0, half]) bottom = Math.max(bottom, bottomAt(form, x + dx, z));
  }
  const bottomY = bottom + CLEAR;
  const topY = bottomY + H;
  const shortM = Math.max(0, Math.round((topY - (floorY - 0.03)) * 100) / 100);
  return { bottomY, topY, x, fits: shortM === 0, shortM };
}

/** The propeller's centre height under her bottom at (x, z), for diameter `d`. */
export function propellerY(form: Pick<HullForm, 'stations'>, x: number, z: number, d: number): number {
  // The plating over the disc: the highest bottom across it.
  const over = Math.max(bottomAt(form, x - d / 2, z), bottomAt(form, x, z), bottomAt(form, x + d / 2, z));
  return over - d / 2 - TIP_SHARE * d;
}

/** Twin engines' centres off the centreline: a little inboard of their propellers, never closer than shoulder to shoulder. */
export function twinEngineX(twinX: number, width: number): number {
  return Math.max(width / 2 + 0.08, Math.min(twinX * 0.8, twinX - 0.1));
}
