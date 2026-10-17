/**
 * Static hydrostatics of a vessel definition, computed from the SAME station polygons the
 * simulation floats (so the numbers describe exactly what you see in the game):
 *
 *   - upright particulars at equilibrium: draft, displacement, LCB, KB, waterplane area,
 *     BMt, KMt, GMt, wetted surface;
 *   - a GZ (righting-arm) curve, at fixed trim, with the sinkage at each heel solved so that
 *     displaced volume equals the vessel's mass / rho (the classic cross-curve approach).
 *
 * Conventions: heel positive = starboard down. Vessel axes: +X starboard, +Y up, -Z forward,
 * origin amidships on the centreline at the DWL. KB/KG/KM are measured from the deepest
 * keel point.
 */
import { CONFIG } from '../config';
import { submergedSection, type SubmergedSection } from './physics/sectionClip';
import { physicsStations } from './hullForm';
import type { VesselDef } from './vesselDef';

const out: SubmergedSection = { area: 0, cx: 0, cy: 0, maxDepth: 0 };

interface Immersion {
  volume: number;
  /** Centre of buoyancy in vessel axes. */
  bx: number;
  by: number;
  bz: number;
}

/**
 * Immersed volume and centre of buoyancy for a calm water plane, given sinkage `s` (m,
 * water level relative to the DWL in vessel axes when upright) and heel `h` (rad).
 * A vessel point (x, y) is at world height Y = -x sin h + y cos h, so its depth is s - Y.
 */
function immersion(def: VesselDef, s: number, h: number): Immersion {
  const sin = Math.sin(h);
  const cos = Math.cos(h);
  let V = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const st of physicsStations(def.hull)) {
    const depths = st.polygon.map(([x, y]) => s + x * sin - y * cos);
    submergedSection(st.polygon, depths, out);
    const v = out.area * st.weight;
    V += v;
    mx += v * out.cx;
    my += v * out.cy;
    mz += v * st.z;
  }
  return V > 0 ? { volume: V, bx: mx / V, by: my / V, bz: mz / V } : { volume: 0, bx: 0, by: 0, bz: 0 };
}

/** Sinkage at which the displaced volume equals `volume`, at heel h (bisection). */
function sinkageFor(def: VesselDef, volume: number, h: number): number {
  let lo = -5;
  let hi = 5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (immersion(def, mid, h).volume > volume) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function keelY(def: VesselDef): number {
  return Math.min(...physicsStations(def.hull).flatMap((s) => s.polygon.map((p) => p[1])));
}

export interface UprightHydrostatics {
  /** Waterline height relative to the DWL at equilibrium (m, + = floats deeper than DWL). */
  sinkage: number;
  /** Draft at the deepest keel point (m). */
  draft: number;
  volume: number;
  displacementT: number;
  /** LCB, + = aft of amidships (m). */
  lcb: number;
  kb: number;
  /** Waterplane area (m^2) and longitudinal centre of flotation (+ aft). */
  awp: number;
  lcf: number;
  bmt: number;
  kmt: number;
  kg: number;
  gmt: number;
  /** Trimming tendency: LCG - LCB (m). Non-zero means she won't float level. */
  lcgMinusLcb: number;
  wettedSurface: number;
}

export function uprightHydrostatics(def: VesselDef): UprightHydrostatics {
  const rho = CONFIG.ocean.density;
  const volume = def.mass / rho;
  const s = sinkageFor(def, volume, 0);
  const b = immersion(def, s, 0);
  const keel = keelY(def);

  // Waterplane: half-breadth of each station where its polygon crosses the waterline y = s.
  let awp = 0;
  let mAwp = 0;
  let it = 0;
  for (const st of physicsStations(def.hull)) {
    let half = 0;
    const p = st.polygon;
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i];
      const [x1, y1] = p[(i + 1) % p.length];
      if ((y0 - s) * (y1 - s) <= 0 && y0 !== y1) half = Math.max(half, Math.abs(x0 + ((x1 - x0) * (s - y0)) / (y1 - y0)));
    }
    awp += 2 * half * st.weight;
    mAwp += 2 * half * st.weight * st.z;
    it += ((2 * half) ** 3 / 12) * st.weight;
  }
  const bmt = it / volume;
  const kb = b.by - keel;
  const kg = def.cg[1] - keel;
  return {
    sinkage: s,
    draft: s - keel,
    volume,
    displacementT: def.mass / 1000,
    lcb: b.bz,
    kb,
    awp,
    lcf: awp > 0 ? mAwp / awp : 0,
    bmt,
    kmt: kb + bmt,
    kg,
    gmt: kb + bmt - kg,
    lcgMinusLcb: def.cg[2] - b.bz,
    wettedSurface: def.wettedSurface,
  };
}

/** Righting arm GZ (m) at each heel angle (degrees), fixed trim, free sinkage. */
export function gzCurve(def: VesselDef, anglesDeg: number[]): { deg: number; gz: number }[] {
  const volume = def.mass / CONFIG.ocean.density;
  const [, yg] = def.cg;
  return anglesDeg.map((deg) => {
    const h = (deg * Math.PI) / 180;
    const s = sinkageFor(def, volume, h);
    const b = immersion(def, s, h);
    // Horizontal (world) positions of B and G after heeling: X = x cos h + y sin h.
    const xb = b.bx * Math.cos(h) + b.by * Math.sin(h);
    const xg = yg * Math.sin(h);
    return { deg, gz: xb - xg };
  });
}

export function formatHydrostatics(def: VesselDef): string {
  const h = uprightHydrostatics(def);
  const angles = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90];
  const gz = gzCurve(def, angles);
  const max = gz.reduce((a, b) => (b.gz > a.gz ? b : a));
  // Angle of vanishing stability: first sign change after the maximum.
  const vanish = gz.find((p) => p.deg > max.deg && p.gz <= 0);
  const f = (v: number, d = 2) => v.toFixed(d);
  return [
    `HYDROSTATICS: ${def.id} (from ${physicsStations(def.hull).length} stations, calm water)`,
    `  displacement ${f(h.displacementT, 2)} t   volume ${f(h.volume)} m3   draft ${f(h.draft)} m (sinkage ${f(h.sinkage, 3)} m vs DWL)`,
    `  LCB ${f(h.lcb)} m aft   LCF ${f(h.lcf)} m aft   LCG-LCB ${f(h.lcgMinusLcb, 3)} m ${Math.abs(h.lcgMinusLcb) > 0.05 ? '<- will trim' : '(floats level)'}`,
    `  Awp ${f(h.awp, 1)} m2   wetted surface ${f(h.wettedSurface, 1)} m2`,
    `  KB ${f(h.kb)}   BMt ${f(h.bmt)}   KMt ${f(h.kmt)}   KG ${f(h.kg)}   GMt ${f(h.gmt)} m`,
    `  GZ curve (fixed trim): ${gz.map((p) => `${p.deg}°:${f(p.gz)}`).join('  ')}`,
    `  max GZ ${f(max.gz)} m at ${max.deg}°, vanishing stability ${vanish ? `~${vanish.deg}°` : '> 90°'}`,
  ].join('\n');
}
