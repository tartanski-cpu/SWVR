/**
 * The EFFICIENCY screen's arithmetic (owner, 27 Oct 2026: "an efficiency instrument ... litres
 * per nautical mile, so that basically we can find the sweet spot"; CONFIG.efficiency). Pure:
 * the screen (instruments.ts) reads her state and draws what this works out.
 *
 *   litres a mile   her engines' fuel flow (L/h, both engines on a twin) over her speed
 *                   through the water (kn): what each mile costs at this speed;
 *   range           the fuel she has left over that: how far she'd go at this speed;
 *   sweet spot      her litres a mile against her speed, gathered as she's driven: a bin every
 *                   `binKn`, each the running mean of her steady readings there; the lowest is
 *                   her sweet spot (a displacement boat's climbs steeply past her hull speed; a
 *                   planing boat's has a hump before she gets onto the plane).
 * Each player's screen gathers its own (it's what the screen saw, not the boat's state).
 */
import { CONFIG } from '../config';

/** What a boat's screen has gathered. */
export interface EfficiencyLog {
  /** Litres a mile in each speed bin (NaN: not yet seen). */
  bins: Float64Array;
  /** When it last took a reading (s) and the speed then (kn). */
  lastS: number;
  lastKn: number;
  /** Bumped on every reading taken, so the screen knows to redraw. */
  version: number;
}

export function newEfficiencyLog(): EfficiencyLog {
  const c = CONFIG.efficiency;
  return { bins: new Float64Array(Math.ceil(c.maxKn / c.binKn)).fill(NaN), lastS: -Infinity, lastKn: 0, version: 0 };
}

/** Litres a mile at this fuel flow (L/h) and speed (kn); null when she's barely moving. */
export function litresPerNm(flowLph: number, knots: number): number | null {
  return knots >= CONFIG.efficiency.minKn ? flowLph / knots : null;
}

/** How far her fuel takes her at this many litres a mile (nm); null without a reading. */
export function rangeNm(fuelL: number, lpnm: number | null): number | null {
  return lpnm && lpnm > 0 ? fuelL / lpnm : null;
}

/** Take a reading if it's time and she's steady (`nowS` seconds, any clock); true if taken. */
export function record(log: EfficiencyLog, nowS: number, knots: number, flowLph: number): boolean {
  const c = CONFIG.efficiency;
  if (nowS - log.lastS < c.sampleS) return false;
  const steady = Math.abs(knots - log.lastKn) < c.steadyKn;
  log.lastS = nowS;
  log.lastKn = knots;
  const l = litresPerNm(flowLph, knots);
  if (!steady || l === null || flowLph <= 0) return false;
  const i = Math.floor(knots / c.binKn);
  if (i < 0 || i >= log.bins.length) return false;
  const was = log.bins[i];
  log.bins[i] = Number.isNaN(was) ? l : was + c.blend * (l - was);
  log.version++;
  return true;
}

/** Her sweet spot so far: the bin with the fewest litres a mile (its middle's speed), or null. */
export function sweetSpot(log: EfficiencyLog): { knots: number; lpnm: number } | null {
  let best: { knots: number; lpnm: number } | null = null;
  log.bins.forEach((v, i) => {
    if (!Number.isNaN(v) && (!best || v < best.lpnm)) best = { knots: (i + 0.5) * CONFIG.efficiency.binKn, lpnm: v };
  });
  return best;
}
