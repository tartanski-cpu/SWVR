/**
 * Geometry the Shipyard's parts share (P4, split out of build.ts): her hydrostatics at the DWL from
 * her stations, a section's half-breadth at a height, and the like.
 */
import type { ShipDesign } from '../design';
import type { HullForm } from '../../vessel/hullForm';
import type { OverheadLayout } from '../../vessel/vesselDef';

/** A point or vector (m, vessel axes). */
export type V3 = [number, number, number];

/** A stretch of floor or deck an engine hatch could go in (build.ts: the engine space and its hatch). */
export type HatchZone = { floor: boolean; z0: number; z1: number; x0: (z: number) => number; x1: (z: number) => number };

/** buildAt's arguments, as each part of the builder gets them (P4). */
export interface BuildArgs {
  d: ShipDesign;
  code: string;
  raise: number;
  given: { massKg: number; cgY: number } | null;
  id: string;
}

/** Her displaced volume, LCB, KB and waterplane inertia at the DWL (y = 0), from her stations. */
export function atDWL(form: HullForm): { volume: number; lcb: number; kbY: number; iT: number; lwl: number } {
  let v = 0;
  let mz = 0;
  let my = 0;
  let iT = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const st of form.stations) {
    const { area, cy } = clippedBelow(st.polygon);
    v += area * st.weight;
    mz += area * st.weight * st.z;
    my += area * cy * st.weight;
    // A catamaran's waterplane is two strips, one a hull, each far out from her centreline
    // (the parallel-axis term that makes her so stiff), not one strip across her tunnel
    // (vessel/hydrostatics.ts uprightHydrostatics does the same).
    if (st.demihull) iT += catStripsInertia(st.polygon) * st.weight;
    else {
      const b = waterlineHalf(st.polygon);
      iT += ((2 * b) ** 3 / 12) * st.weight;
    }
    if (area > 1e-4) {
      zMin = Math.min(zMin, st.z);
      zMax = Math.max(zMax, st.z);
    }
  }
  return { volume: v, lcb: mz / v, kbY: my / v, iT, lwl: zMax - zMin };
}

/** Area and centroid height of a section polygon below y = 0 (Sutherland-Hodgman, shoelace). */
export function clippedBelow(poly: readonly (readonly [number, number])[]): { area: number; cy: number } {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    if (y0 <= 0) out.push([x0, y0]);
    if ((y0 <= 0) !== (y1 <= 0)) out.push([x0 + ((x1 - x0) * (0 - y0)) / (y1 - y0), 0]);
  }
  let a = 0;
  let cy = 0;
  for (let i = 0; i < out.length; i++) {
    const [x0, y0] = out[i];
    const [x1, y1] = out[(i + 1) % out.length];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cy += (y0 + y1) * c;
  }
  a /= 2;
  return Math.abs(a) < 1e-9 ? { area: 0, cy: 0 } : { area: Math.abs(a), cy: cy / (6 * a) };
}

/**
 * A station's half-breadth at height y (0 below her keel; her deck half-breadth above her
 * deck): her starboard side, its last three points (keel, chine, deck edge; a catamaran's
 * outer side, from her starboard hull's keel).
 */
export function halfBreadthAt(poly: readonly (readonly [number, number])[], y: number): number {
  const n = poly.length;
  const [[xd, yd], [xc, yc], [xk, yk]] = [poly[n - 1], poly[n - 2], poly[n - 3]];
  if (y <= yk) return 0;
  if (y >= yd) return xd;
  if (y <= yc) return xk + ((xc - xk) * (y - yk)) / Math.max(yc - yk, 1e-6);
  return xc + ((xd - xc) * (y - yc)) / Math.max(yd - yc, 1e-6);
}

/** A catamaran section's waterplane second moment about her centreline (m^3 a metre): each strip between the waterline's crossings. */
export function catStripsInertia(poly: readonly (readonly [number, number])[]): number {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    if (y0 * y1 < 0) xs.push(x0 + ((x1 - x0) * -y0) / (y1 - y0));
  }
  xs.sort((a, b) => a - b);
  let it = 0;
  for (let j = 0; j + 1 < xs.length; j += 2) it += (xs[j + 1] ** 3 - xs[j] ** 3) / 3;
  return it;
}

/** Half-breadth where a section crosses the waterline (0 if it doesn't). */
export function waterlineHalf(poly: readonly (readonly [number, number])[]): number {
  let half = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    if (y0 * y1 <= 0 && y0 !== y1) half = Math.max(half, Math.abs(x0 + ((x1 - x0) * -y0) / (y1 - y0)));
  }
  return half;
}

/** The landing craft's 150 kW torque curve, which the packages scale (same 1800 rpm rating). */
export const BASE_TORQUE: [number, number][] = [
  [0, 0], [300, 375], [600, 638], [1000, 938], [1300, 990], [1600, 908], [1800, 796], [1900, 450], [1950, 0],
];

/** A cockpit overhead's plating (m2): its roof, and its two wings (full height to the knee, the swept part about 0.4 of its box). */
export function overheadM2(o: OverheadLayout | undefined): number {
  if (!o) return 0;
  const h = o.y - o.deckY;
  return 2 * o.halfWidth * (o.z1 - o.z0) + 2 * ((o.kneeZ - o.z0) * h + 0.4 * (o.z1 - o.kneeZ) * h);
}
