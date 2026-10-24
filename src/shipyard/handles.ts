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
import { DESIGN_HULLS, type DesignedBoat } from './build';
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
  /** Whether it's shown for her (unset: always); a choice her type hasn't got has none. */
  applies?(d: ShipDesign): boolean;
  /** The dimension it shows while dragged: a line from `from` to the handle (boat axes), and its name. */
  dimension?: { name: string; from(b: DesignedBoat): V3 };
}

/** Her plan as built (half-beams, deck heights, ends), and her middle (halfway along her deck). */
const planOf = (b: DesignedBoat) => {
  const p = hullPlan({ hull: hullFormOf(b.hull.form) });
  return { ...p, mid: (p.stem + p.transom) / 2 };
};
/** Her keel's height at z (the lowest point of her nearest station). */
const keelAt = (b: DesignedBoat, z: number) => {
  const st = hullFormOf(b.hull.form).stations;
  const s = st.reduce((a, c) => (Math.abs(c.z - z) < Math.abs(a.z - z) ? c : a));
  return Math.min(...s.polygon.map((q) => q[1]));
};
/** Where her stem crosses height y (her profile's forward edge there, between stations): her forefoot at her waterline. */
const stemAt = (b: DesignedBoat, y: number) => {
  const st = [...hullFormOf(b.hull.form).stations].sort((p, q) => p.z - q.z);
  const keel = (i: number) => Math.min(...st[i].polygon.map((q) => q[1]));
  for (let i = 0; i < st.length; i++) {
    if (keel(i) > y) continue;
    if (i === 0) return st[0].z;
    const t = (keel(i - 1) - y) / Math.max(keel(i - 1) - keel(i), 1e-6);
    return st[i - 1].z + t * (st[i].z - st[i - 1].z);
  }
  return st[st.length - 1].z;
};
const designHull = (d: ShipDesign) => DESIGN_HULLS[d.hull];

/**
 * The handles, by step. The Hull step's (stops 1 and 2), each where its slider shows on her:
 * her length at her stem head (forward), her bow's rake where her stem meets her waterline (aft, as
 * the rake cuts her forefoot back), her beam
 * at her starboard deck edge amidships (out), her depth on her deck amidships (up), her
 * bulwarks' top on her port quarter (up), her sheer at her starboard deck edge forward (up),
 * and her raised foredeck's break (aft) and its height (up, on it, halfway to her stem).
 */
export const HANDLES: HandleDef[] = [
  {
    key: 'length',
    label: 'Length',
    step: 'hull',
    axis: [0, 0, -1],
    // Her stem head: the bow end of her deck (her raised foredeck's, if she has one), on the centreline.
    anchor: (b) => {
      const p = planOf(b);
      return [0, p.deckY(p.stem + 0.05) + (b.deck.foredeck?.raise ?? 0), p.stem];
    },
    // Overall, from her transom to her stem, level with it.
    dimension: {
      name: 'Length overall',
      from: (b) => {
        const p = planOf(b);
        return [0, p.deckY(p.stem + 0.05) + (b.deck.foredeck?.raise ?? 0), p.transom];
      },
    },
  },
  {
    key: 'bow',
    label: 'Bow rake',
    step: 'hull',
    axis: [0, 0, 1],
    // Not on a push bow or a landing bow (no rake to choose).
    applies: (d) => !designHull(d).pushBow && !designHull(d).landingBow,
    // Her stem at her waterline: raking it keeps her stem head and cuts her forefoot back (catalog.ts bowKeel).
    // (A catamaran's: her starboard hull's.)
    anchor: (b) => [(hullFormOf(b.hull.form).catamaran?.spacing ?? 0) / 2, 0, stemAt(b, 0)],
  },
  {
    key: 'beam',
    label: 'Beam',
    step: 'hull',
    axis: [1, 0, 0],
    anchor: (b) => {
      const p = planOf(b);
      return [p.halfBeam(p.mid), p.deckY(p.mid), p.mid];
    },
    dimension: {
      name: 'Beam',
      from: (b) => {
        const p = planOf(b);
        return [-p.halfBeam(p.mid), p.deckY(p.mid), p.mid];
      },
    },
  },
  {
    key: 'depth',
    label: 'Depth',
    step: 'hull',
    axis: [0, 1, 0],
    anchor: (b) => {
      const p = planOf(b);
      return [0, p.deckY(p.mid), p.mid];
    },
    // From her keel to her deck, amidships.
    dimension: {
      name: 'Depth',
      from: (b) => {
        const p = planOf(b);
        return [0, keelAt(b, p.mid), p.mid];
      },
    },
  },
  {
    key: 'bulwark',
    label: 'Bulwarks',
    step: 'hull',
    axis: [0, 1, 0],
    // Her port bulwarks' top on her quarter, 85 % of the way aft (amidships, seen from the
    // side, it would sit over the depth handle; at 70 %, by a raised foredeck's break run aft).
    anchor: (b) => {
      const p = planOf(b);
      const z = p.stem + 0.85 * (p.transom - p.stem);
      return [-p.halfBeam(z), p.deckY(z) + b.deck.bulwarkM, z];
    },
    dimension: {
      name: 'Bulwarks',
      from: (b) => {
        const p = planOf(b);
        const z = p.stem + 0.85 * (p.transom - p.stem);
        return [-p.halfBeam(z), p.deckY(z), z];
      },
    },
  },
  {
    key: 'sheer',
    label: 'Sheer',
    step: 'hull',
    axis: [0, 1, 0],
    // Her starboard deck edge a fifth of her length aft of her stem, where the sheer rises
    // (to starboard: to port, seen from ahead, it would sit on the bulwarks' handle).
    anchor: (b) => {
      const p = planOf(b);
      const z = p.stem + 0.2 * (p.transom - p.stem);
      return [p.halfBeam(z), p.deckY(z), z];
    },
  },
  {
    key: 'fcLength',
    label: 'Raised foredeck',
    step: 'hull',
    axis: [0, 0, 1],
    applies: (d) => !!designHull(d).raisedForedeck,
    // The break, on the centreline at the raised deck; none: just aft of her stem head, on her deck.
    anchor: (b) => {
      const p = planOf(b);
      const f = b.deck.foredeck;
      if (!f) return [0, p.deckY(p.stem + 0.5), p.stem + 0.5];
      return [0, p.deckY(f.z + 0.05) + f.raise, f.z];
    },
    dimension: {
      name: 'Raised foredeck',
      from: (b) => {
        const p = planOf(b);
        const f = b.deck.foredeck;
        return [0, p.deckY((f?.z ?? p.stem) + 0.05) + (f?.raise ?? 0), p.stem];
      },
    },
  },
  {
    key: 'fcHeight',
    label: 'Its height',
    step: 'hull',
    axis: [0, 1, 0],
    applies: (d) => !!designHull(d).raisedForedeck && !!d.fcLength,
    // On the raised deck, halfway from her stem to the break, on the centreline (at the break
    // itself, seen from the side, it would sit on the break's own handle).
    anchor: (b) => {
      const p = planOf(b);
      const f = b.deck.foredeck;
      const z = ((f?.z ?? p.stem) + p.stem) / 2;
      return [0, p.deckY(z) + (f?.raise ?? 0), z];
    },
    dimension: {
      name: 'Raised foredeck',
      from: (b) => {
        const p = planOf(b);
        const z = ((b.deck.foredeck?.z ?? p.stem) + p.stem) / 2;
        return [0, p.deckY(z), z];
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
