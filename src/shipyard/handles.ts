/**
 * Handles on the 3D view (owner, Oct 2026: "move away from sliders and have interactive handles
 * that you can drag on the 3D window wherever appropriate"). Each handle sits on her at the
 * point a slider controls (her stem head for her length) and is dragged along one line (fore
 * and aft for her length); it snaps to the slider's steps, so it makes exactly what the slider
 * would.
 *
 * Where a handle sits at each step is the builder's own answer: her built at that step
 * (build.ts buildDesign, about 40 ms), and the handle's point read off her (`anchor`). So the
 * drag picks the step whose point is nearest the pointer along the handle's line, whatever the
 * slider does to her (her length scales about the middle; her beam moves both sides). The
 * page works the steps out as the pointer comes over a handle, a few at a time.
 *
 * Pure: the page draws the handles, picks them and applies the step (as the slider does).
 */
import { hullFormOf } from '../modular/hull';
import { hullPlan } from '../vessel/layout';
import type { DesignedBoat } from './build';
import type { ShipDesign } from './design';

export type V3 = [number, number, number];

export interface HandleDef {
  /** The design choice it drags (a slider's field, in its steps). */
  key: keyof ShipDesign;
  /** Its name, as its slider's. */
  label: string;
  /** The step of the flow it's shown at. */
  step: string;
  /** The line it's dragged along (boat axes, a unit vector: x to starboard, y up, z aft). */
  axis: V3;
  /** Where it sits on her, built (boat axes, m). */
  anchor(b: DesignedBoat): V3;
  /** The dimension it shows while dragged: a line from `from` to the handle (boat axes), and its name. */
  dimension?: { name: string; from(b: DesignedBoat): V3 };
}

/** Her plan as built (half-beams, deck heights, ends). */
const planOf = (b: DesignedBoat) => hullPlan({ hull: hullFormOf(b.hull.form) });

/** The handles, by step (stop 1: her length). */
export const HANDLES: HandleDef[] = [
  {
    key: 'length',
    label: 'Length',
    step: 'hull',
    axis: [0, 0, -1],
    // Her stem head: the bow end of her deck, on the centreline.
    anchor: (b) => {
      const p = planOf(b);
      return [0, p.deckY(p.stem + 0.05), p.stem];
    },
    // Overall, from her transom to her stem, along her deck.
    dimension: {
      name: 'Length overall',
      from: (b) => {
        const p = planOf(b);
        return [0, p.deckY(p.stem + 0.05), p.transom];
      },
    },
  },
];

/**
 * The point on the handle's line (through `origin` along `axis`) nearest the pointer's ray
 * (from `ray0` along `dir`): how far along the line, from `origin` (m). Null if the ray runs
 * along the line (nothing to read).
 */
export function alongAxis(origin: V3, axis: V3, ray0: V3, dir: V3): number | null {
  const w = [origin[0] - ray0[0], origin[1] - ray0[1], origin[2] - ray0[2]];
  const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const a = dot(axis, axis);
  const b = dot(axis, dir);
  const c = dot(dir, dir);
  const d = dot(axis, w);
  const e = dot(dir, w);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-9) return null;
  return (b * e - c * d) / den;
}

/**
 * The step whose handle point lies nearest `t` along the line (each point measured along
 * `axis` from `origin`); steps not worked out yet (undefined) are passed over. Also whether
 * the pointer is past the last step either way (a limit: it goes no further).
 */
export function nearestStep(anchors: (V3 | undefined)[], origin: V3, axis: V3, t: number): { step: number; atLimit: boolean } | null {
  let best = -1;
  let bestD = Infinity;
  let lo = Infinity;
  let hi = -Infinity;
  for (const [k, p] of anchors.entries()) {
    if (!p) continue;
    const s = (p[0] - origin[0]) * axis[0] + (p[1] - origin[1]) * axis[1] + (p[2] - origin[2]) * axis[2];
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
    const dd = Math.abs(s - t);
    if (dd < bestD) {
      bestD = dd;
      best = k;
    }
  }
  if (best < 0) return null;
  const all = anchors.every(Boolean);
  return { step: best, atLimit: all && (t < lo - 0.15 || t > hi + 0.15) };
}
