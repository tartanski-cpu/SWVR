/**
 * Guards on her sides (owner: a Shipyard choice): what keeps her plating off a quay.
 *
 *   fenders  the crew's fenders, hung over the side on their lines (only while they're out);
 *   strake   a solid rubber rubbing strake along her sheer, all round;
 *   tyres    lorry tyres in a close row along her sides, against her deck edge.
 *
 * Each stands proud of her hull, so each is probed at its own points: its outer face, where
 * it meets a quay before her plating does. A point there pushes back with the guard's own
 * spring and friction (CONFIG.contacts.guards; contacts.ts `guardContactAt`), and takes up
 * part of the knock before it counts as damage (`absorb`). Her hull's own points (keel,
 * chines, deck edge) stay as they were: a hard push that squeezes a guard flat still
 * reaches the plating.
 *
 * Here: where each guard's points and pieces are, in the boat's axes (x starboard, y up,
 * z aft), from her hull's shape. The modules (deck.fenders, hull.guard) give the points as
 * their gear, and draw the pieces where the points are.
 */
import { CONFIG } from '../../config';
import type { HullQueries } from '../../modular/module';

type P3 = [number, number, number];

/** Where a fender hangs when it's out: `off` m outboard of the deck edge, `drop` below it; its body's `radius`. */
export const FENDER_HANG = { off: 0.13, drop: 0.55, radius: 0.12 };

/** The fenders' outer faces, out over the side at each station `z`, both sides. */
export function fenderProbes(zs: readonly number[], hull: Pick<HullQueries, 'halfBeam' | 'deckY'>): P3[] {
  const out: P3[] = [];
  for (const side of [-1, 1]) for (const z of zs) out.push([side * (hull.halfBeam(z) + FENDER_HANG.off + FENDER_HANG.radius), hull.deckY(z) - FENDER_HANG.drop, z]);
  return out;
}

/**
 * The rubbing strake's line, starboard side, transom to stem: a point every `spacing` m at
 * its centre, on the corner of her deck edge (`drop` below the sheer: it covers the corner,
 * the first of her to meet a quay). The view sweeps its half-round along this, mirrored,
 * and across the transom (and the bow, `aroundBow`).
 */
export function strakeLine(hull: Pick<HullQueries, 'halfBeam' | 'deckY' | 'transom' | 'stem'>): P3[] {
  const c = CONFIG.modules.hullGuard.strake;
  const n = Math.max(2, Math.ceil((hull.transom - hull.stem) / c.spacing));
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const z = hull.transom + ((hull.stem - hull.transom) * i) / n;
    out.push([hull.halfBeam(z), hull.deckY(z) - c.drop, z]);
  }
  return out;
}

/** The strake's outer face to probe: along both sides, across the transom, and across a square bow if it goes round it. */
export function strakeProbes(hull: Pick<HullQueries, 'halfBeam' | 'deckY' | 'transom' | 'stem'>, aroundBow: boolean): P3[] {
  const r = CONFIG.modules.hullGuard.strake.radius;
  const line = strakeLine(hull);
  const out: P3[] = [];
  for (const side of [-1, 1]) for (const [x, y, z] of line) out.push([side * (x + r), y, z]);
  // Across an end: points `spacing` apart between her two sides, just proud of it.
  const across = ([x, y, z]: P3, dz: number) => {
    const k = Math.floor((2 * x) / CONFIG.modules.hullGuard.strake.spacing);
    for (let i = 1; i < k; i++) out.push([-x + (2 * x * i) / k, y, z + dz]);
  };
  across(line[0], r);
  if (aroundBow && line[line.length - 1][0] > 0.3) across(line[line.length - 1], -r);
  return out;
}

/** One tyre: its centre, on her starboard side (mirrored to port). */
export interface TyreSpot {
  x: number;
  y: number;
  z: number;
}

/**
 * Where the tyres hang, starboard side (mirrored to port): every `spacing` m along her from
 * just forward of the transom, as far forward as her deck is still `minBeam` of its widest
 * (not up into the fine bow): a close row, nearly touching. Each hangs plumb against her
 * deck edge, its centre `drop` below it, so it covers the corner (the widest of her, and the
 * first to meet a quay: a flared side falls away below it).
 */
export function tyreSpots(hull: Pick<HullQueries, 'halfBeam' | 'deckY' | 'transom' | 'stem'>): TyreSpot[] {
  const c = CONFIG.modules.hullGuard.tyres;
  let widest = 0;
  for (let z = hull.stem; z <= hull.transom; z += 0.25) widest = Math.max(widest, hull.halfBeam(z));
  const out: TyreSpot[] = [];
  for (let z = hull.transom - c.radius - 0.1; z > hull.stem; z -= c.spacing) {
    if (hull.halfBeam(z) < c.minBeam * widest) break;
    out.push({ x: hull.halfBeam(z) + c.thickness / 2, y: hull.deckY(z) - c.drop, z });
  }
  return out;
}

/** The tyre on her stem (a bow without a ramp, for pushing): its centre, just forward of the stem head, facing forward. */
export function bowTyre(hull: Pick<HullQueries, 'deckY' | 'stem'>): P3 {
  const c = CONFIG.modules.hullGuard.tyres;
  return [0, hull.deckY(hull.stem) - c.drop, hull.stem - c.thickness / 2];
}

/** The tyres' outer faces to probe: both sides, and the one on her stem (`bow`). */
export function tyreProbes(hull: Pick<HullQueries, 'halfBeam' | 'deckY' | 'transom' | 'stem'>, bow: boolean): P3[] {
  const half = CONFIG.modules.hullGuard.tyres.thickness / 2;
  const out: P3[] = [];
  for (const side of [-1, 1]) for (const t of tyreSpots(hull)) out.push([side * (t.x + half), t.y, t.z]);
  if (bow) {
    const [x, y, z] = bowTyre(hull);
    out.push([x, y, z - half]);
  }
  return out;
}
