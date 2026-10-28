/**
 * Submerged part of one hull section.
 *
 * Each polygon vertex carries its depth below the local water surface (positive =
 * submerged). Depth varies linearly along each edge (the section is rigid and the water
 * surface is treated as linear across the section), so clipping is exact Sutherland-Hodgman
 * against the waterline, keeping the depth >= 0 side.
 */
export interface SubmergedSection {
  /** Submerged area (m^2), in the section plane. */
  area: number;
  /** Centroid of the submerged area, section-plane coordinates (x, y). */
  cx: number;
  cy: number;
  /** Largest depth of any vertex below the surface (m), i.e. local draft; 0 if dry. */
  maxDepth: number;
}

const clipped: [number, number][] = [];

export function submergedSection(
  polygon: readonly (readonly [number, number])[],
  depths: readonly number[],
  out: SubmergedSection,
): SubmergedSection {
  clipped.length = 0;
  let maxDepth = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = polygon[i];
    const b = polygon[j];
    const da = depths[i];
    const db = depths[j];
    if (da > maxDepth) maxDepth = da;
    if (da >= 0) clipped.push([a[0], a[1]]);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      clipped.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }

  // Shoelace area and centroid.
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  let x0b = Infinity;
  let x1b = -Infinity;
  let y0b = Infinity;
  let y1b = -Infinity;
  for (let i = 0; i < clipped.length; i++) {
    const [x0, y0] = clipped[i];
    const [x1, y1] = clipped[(i + 1) % clipped.length];
    if (x0 < x0b) x0b = x0;
    if (x0 > x1b) x1b = x0;
    if (y0 < y0b) y0b = y0;
    if (y0 > y1b) y1b = y0;
    const cross = x0 * y1 - x1 * y0;
    a2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  out.maxDepth = maxDepth;
  if (Math.abs(a2) < 1e-9) {
    out.area = 0;
    out.cx = 0;
    out.cy = 0;
    return out;
  }
  out.area = Math.abs(a2) / 2;
  // A centroid lies within its piece's bounds. (A near-zero sliver, its area cancelling where
  // its moments don't, put one hundreds of metres off a heeled catamaran in a steep sea, and
  // its lateral drag there spun her up in a tick: kept in its bounds, it does nothing.)
  out.cx = Math.min(x1b, Math.max(x0b, cx / (3 * a2)));
  out.cy = Math.min(y1b, Math.max(y0b, cy / (3 * a2)));
  return out;
}
