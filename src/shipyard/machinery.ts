/**
 * Where her machinery goes in her hull, and whether it fits (owner, Oct 2026: the engines
 * stood up through the wheelhouse, the propeller and rudder sat inside the hull, and the big
 * tug diesel can't fit a shallow hull; it should give a reason for more depth).
 *
 * Read off her stations' sections (the lines-plan outline the hull is built from: keel,
 * chine, deck edge on each side), between the two stations either side of a point:
 *
 *   engine    on its shaft line (below), its lower part (the sump and bearers, `SUMP_SHARE`
 *             of its width) clear of the hull bottom by `CLEAR` (plating, floors, bearers)
 *             all along its length, so with a V bottom a wide engine sits higher, and twin
 *             engines set out from the centreline sit higher still. It has to fit under the
 *             cabin floor (or the deck, aft of the house): if its top comes above that, it
 *             doesn't fit, by that much, and she needs that much more depth;
 *   propeller hangs below her bottom, its tip `TIP_SHARE` of its diameter clear of the
 *             plating over it (less and it hammers the hull);
 *   rudder    from the bottom down to the propeller's lower tip, behind it.
 *
 * The engine's place along her comes from its shaft (`layShaft`, owner: "a reasonable prop
 * angle determines the position of your engine"): the shaft rises forward from the propeller
 * at a set angle (CONFIG.shipyard.shaftAngleDeg, 10°: small craft run about 8-12°), and the
 * engine, tilted to it, sits on it where it clears her bottom: as near where her weights
 * balance (owner, Oct 2026; build.ts works out where) as the shaft can reach, steeper as
 * need be up to CONFIG.shipyard.shaftAngleMaxDeg. Or, on a stern drive (`sternDriveLine`),
 * level against the transom. Her weights are carried there (build.ts).
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

/**
 * The gearbox's output flange (where the shaft starts) above the engine's underside, as a
 * share of the engine's height: a marine gearbox drops the shaft line below the crankshaft.
 */
export const FLANGE_SHARE = 0.25;

/** Her engine on its shaft line: where it sits, and whether it fits under what's over it. */
export interface ShaftLine {
  /** Off the centreline (m; each of a twin). */
  x: number;
  /** The gearbox flange: height and place along her (m). */
  flangeY: number;
  flangeZ: number;
  /** The propeller's centre height (m), under her bottom. */
  propY: number;
  /** The shaft's angle to the horizontal (deg), rising forward; the engine is tilted to it. */
  angleDeg: number;
  /** Its top, at its highest (the forward end, m). */
  topY: number;
  fits: boolean;
  /** How far its top comes above the floor or deck over it (m; 0 if it fits). */
  shortM: number;
}

/**
 * Lay the shaft and put the engine on it (owner: a reasonable shaft angle decides where the
 * engine goes). From the propeller, hung under her bottom, the shaft rises forward at
 * `angleDeg`; the engine, tilted to the same angle, sits on its end with its lower part
 * `CLEAR` over her bottom all along its length. Its top must be under what's over it there
 * (`ceilingAt`: the cabin floor under the house, the deck elsewhere), 3 cm clear.
 *
 * Where along the shaft (owner, Oct 2026: "looking for a place where the centre of gravity
 * is good longitudinally", not always far forward): with `preferZ` (where her balance wants
 * the engine's middle), the place that clears her bottom nearest it, the shaft steepened a
 * degree at a time up to `maxAngleDeg` if that's what lets it sit there, the gentlest angle
 * that does; aft of the shortest shaft (`minShaft`) it can't go. Without, as aft as it will
 * go at `angleDeg` (steeper only if it can't clear at all): the shortest shaft.
 */
export function layShaft(
  form: Pick<HullForm, 'stations'>,
  size: readonly [number, number, number],
  x: number,
  prop: { x: number; z: number; d: number },
  ceilingAt: (z: number) => number,
  angleDeg: number,
  maxAngleDeg = angleDeg,
  preferZ: number | null = null,
): ShaftLine {
  const L = size[0];
  const minShaft = Math.max(0.6, prop.d);
  const stem = Math.min(...form.stations.map((s) => s.z));
  if (preferZ === null) {
    let line = layAt(form, size, x, prop, ceilingAt, angleDeg);
    for (let a = angleDeg + 1; !line.clears && a <= maxAngleDeg; a++) line = layAt(form, size, x, prop, ceilingAt, a);
    return line.shaft;
  }
  // Every flange place, 5 cm apart from the shortest shaft forward, with the gentlest angle
  // (from `angleDeg`) at which the engine clears there; the one nearest `preferZ`.
  let best: { shaft: ShaftLine; off: number } | null = null;
  // (No further forward than her forward third, as without.)
  for (let zf = prop.z - minShaft; zf - L > stem + 0.3 * (prop.z - stem); zf -= 0.05) {
    for (let a = angleDeg; a <= maxAngleDeg; a++) {
      const at = flangeAt(form, size, x, prop, ceilingAt, a, zf);
      if (at.dip > 0.005) continue;
      // (One that fits under her floor or deck beats one that doesn't, wherever it is.)
      const off = Math.abs(zf - L / 2 - preferZ) + (at.shaft.fits ? 0 : 100);
      if (!best || off < best.off - 1e-9) best = { shaft: at.shaft, off };
      break;
    }
  }
  // (Nowhere clears: as before, as far forward as it would go.)
  return best?.shaft ?? layShaft(form, size, x, prop, ceilingAt, angleDeg, maxAngleDeg);
}

/** The engine with its flange at `zf` on a shaft at `angleDeg`: how far it dips under the clearance line (m; <= 0 clears), and the line. */
function flangeAt(
  form: Pick<HullForm, 'stations'>,
  size: readonly [number, number, number],
  x: number,
  prop: { x: number; z: number; d: number },
  ceilingAt: (z: number) => number,
  angleDeg: number,
  zf: number,
): { dip: number; shaft: ShaftLine } {
  const [L, W, H] = size;
  const t = Math.tan((angleDeg * Math.PI) / 180);
  const half = (W * SUMP_SHARE) / 2;
  const propY = propellerY(form, prop.x, prop.z, prop.d);
  const flangeY = propY + (prop.z - zf) * t;
  let dip = -Infinity;
  let short = -Infinity;
  for (let i = 0; i <= 6; i++) {
    const s = (L * i) / 6;
    const under = flangeY + s * t - FLANGE_SHARE * H;
    for (const dx of [-half, 0, half]) dip = Math.max(dip, bottomAt(form, x + dx, zf - s) + CLEAR - under);
    short = Math.max(short, under + H - (ceilingAt(zf - s) - 0.03));
  }
  const shortM = Math.max(0, Math.round(short * 100) / 100);
  return { dip, shaft: { x, flangeY, flangeZ: zf, propY, angleDeg, topY: flangeY + L * t + (1 - FLANGE_SHARE) * H, fits: shortM === 0, shortM } };
}

function layAt(
  form: Pick<HullForm, 'stations'>,
  size: readonly [number, number, number],
  x: number,
  prop: { x: number; z: number; d: number },
  ceilingAt: (z: number) => number,
  angleDeg: number,
): { shaft: ShaftLine; clears: boolean } {
  const L = size[0];
  const minShaft = Math.max(0.6, prop.d);
  const stem = Math.min(...form.stations.map((s) => s.z));
  let zf = prop.z - minShaft;
  let best = { zf, dip: flangeAt(form, size, x, prop, ceilingAt, angleDeg, zf).dip };
  // Forward in 5 cm steps until it clears (or the engine would run into her forward third).
  while (best.dip > 0 && zf - L > stem + 0.3 * (prop.z - stem)) {
    zf -= 0.05;
    const d = flangeAt(form, size, x, prop, ceilingAt, angleDeg, zf).dip;
    if (d < best.dip) best = { zf, dip: d };
    if (d <= 0) break;
  }
  return { shaft: flangeAt(form, size, x, prop, ceilingAt, angleDeg, best.zf).shaft, clears: best.dip <= 0.005 };
}

/**
 * A stern drive's engine (owner, Oct 2026: "so that engines can go right up the back"): level,
 * its gearbox end `inset` forward of the transom (the leg's bell housing through it), as low as
 * its lower part clears her bottom by `CLEAR` all along it. Its top must be under the deck or
 * the cabin floor over it, 3 cm clear, as on a shaft. (`propY` here: the leg's input, the
 * flange's height; the leg works out its own propeller.)
 */
export function sternDriveLine(
  form: Pick<HullForm, 'stations'>,
  size: readonly [number, number, number],
  x: number,
  transom: number,
  ceilingAt: (z: number) => number,
  inset: number,
): ShaftLine {
  const [L, W, H] = size;
  const half = (W * SUMP_SHARE) / 2;
  const zf = transom - inset;
  let under = -Infinity;
  for (let i = 0; i <= 6; i++) for (const dx of [-half, 0, half]) under = Math.max(under, bottomAt(form, x + dx, zf - (L * i) / 6) + CLEAR);
  const flangeY = under + FLANGE_SHARE * H;
  let short = -Infinity;
  for (let i = 0; i <= 6; i++) short = Math.max(short, under + H - (ceilingAt(zf - (L * i) / 6) - 0.03));
  const shortM = Math.max(0, Math.round(short * 100) / 100);
  return { x, flangeY, flangeZ: zf, propY: flangeY, angleDeg: 0, topY: under + H, fits: shortM === 0, shortM };
}
