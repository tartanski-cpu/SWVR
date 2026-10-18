/**
 * Pencil marks on the paper chart: a list of strokes in CHART coordinates (world metres,
 * x east, z south), so they line up with real places and a route plotted on the table is
 * a route on the sea. Kept small on purpose: points thinned and rounded, a hard cap.
 *
 * Not in WorldState (too big for the 20 Hz snapshots): every peer keeps its own copy and
 * they stay in step by applying the same small ops (net: the host relays them; a joiner
 * gets the whole set in its welcome). The host / solo player saves them in the browser.
 *
 *   start  a new stroke with its first point(s)        add    more points on its end
 *   set    replace a stroke's points (straight lines while dragging)
 *   erase  rub out points within r of (x, z); strokes split where they're cut
 *   clear  every pencil mark (the pot markers stay: they're magnets, lifted off by hand)
 *   token  a pot marker (a little crab magnet, numbered) put on the chart or moved
 *   untoken  a pot marker taken off the chart
 */
import { CONFIG } from '../config';

export interface Stroke {
  id: string;
  /** Flat [x0, z0, x1, z1, ...] in world metres. */
  pts: number[];
}

/** A pot marker on the chart (potting: the crew marks where they shot their pots). */
export interface ChartToken {
  id: string;
  x: number;
  z: number;
  /** The number on it (the crew's pot number). */
  n: number;
}

/** At most this many pot markers on the chart. */
export const MAX_TOKENS = 40;

export interface ChartMarks {
  strokes: Stroke[];
  /** Pot markers (absent in marks saved before them). */
  tokens?: ChartToken[];
  /** Counts changes (views redraw, the host saves). */
  seq: number;
}

export type ChartOp =
  | { k: 'start'; id: string; pts: number[] }
  | { k: 'add'; id: string; pts: number[] }
  | { k: 'set'; id: string; pts: number[] }
  | { k: 'erase'; x: number; z: number; r: number }
  | { k: 'clear' }
  | { k: 'token'; id: string; x: number; z: number; n: number }
  | { k: 'untoken'; id: string };

export function createMarks(): ChartMarks {
  return { strokes: [], tokens: [], seq: 0 };
}

const q = (v: number) => Math.round(v / CONFIG.chartMarks.quantM) * CONFIG.chartMarks.quantM;
const clean = (pts: unknown): number[] => (Array.isArray(pts) ? pts.filter((v) => typeof v === 'number' && Number.isFinite(v)).map(q) : []);

/** A rectangle in chart coordinates (a sheet's bounds). */
export interface ChartRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * The part of the segment (x0, z0)-(x1, z1) inside `r`, or null if none. Liang-Barsky
 * clipping: each edge of the rectangle trims the segment's parameter range [t0, t1]. The
 * marks are in world metres and a sheet shows only its own patch of sea, so a stroke that
 * runs off the sheet is drawn up to the paper's edge and no further; a stroke on another
 * sheet's sea is not drawn at all.
 */
export function clipSegment(x0: number, z0: number, x1: number, z1: number, r: ChartRect): [number, number, number, number] | null {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let t0 = 0;
  let t1 = 1;
  // p: how fast the segment heads out through an edge; q: how far inside that edge it starts.
  const edges: [number, number][] = [
    [-dx, x0 - r.x0],
    [dx, r.x1 - x0],
    [-dz, z0 - r.z0],
    [dz, r.z1 - z0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null; // parallel to this edge and outside it
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [x0 + t0 * dx, z0 + t0 * dz, x0 + t1 * dx, z0 + t1 * dz];
}

export function pointCount(m: ChartMarks): number {
  return m.strokes.reduce((n, s) => n + s.pts.length / 2, 0);
}

/** Apply one op (from this player or relayed by the host). Bad ops are ignored. */
export function applyChartOp(m: ChartMarks, op: ChartOp): void {
  switch (op.k) {
    case 'start': {
      const pts = clean(op.pts);
      if (typeof op.id !== 'string' || pts.length < 2 || m.strokes.some((s) => s.id === op.id)) return;
      m.strokes.push({ id: op.id, pts: pts.slice(0, pts.length - (pts.length % 2)) });
      break;
    }
    case 'add':
    case 'set': {
      const s = m.strokes.find((x) => x.id === op.id);
      const pts = clean(op.pts);
      if (!s || pts.length % 2) return;
      if (op.k === 'add') s.pts.push(...pts);
      else if (pts.length >= 2) s.pts = pts;
      break;
    }
    case 'erase': {
      if (![op.x, op.z, op.r].every(Number.isFinite)) return;
      const r2 = op.r * op.r;
      const out: Stroke[] = [];
      for (const s of m.strokes) {
        // Split the stroke into the runs of points that survive.
        let run: number[] = [];
        let part = 0;
        let cut = false;
        const flush = () => {
          if (run.length >= 4) out.push({ id: part === 0 && !cut ? s.id : `${s.id}~${part}`, pts: run });
          if (run.length) part += 1;
          run = [];
        };
        for (let i = 0; i < s.pts.length; i += 2) {
          const dx = s.pts[i] - op.x;
          const dz = s.pts[i + 1] - op.z;
          if (dx * dx + dz * dz <= r2) {
            cut = true;
            flush();
          } else run.push(s.pts[i], s.pts[i + 1]);
        }
        if (!cut) {
          out.push(s); // untouched
          continue;
        }
        flush();
      }
      m.strokes = out;
      break;
    }
    case 'clear':
      m.strokes = [];
      break;
    case 'token': {
      if (typeof op.id !== 'string' || ![op.x, op.z, op.n].every(Number.isFinite)) return;
      const t = (m.tokens ??= []);
      const old = t.find((k) => k.id === op.id);
      if (old) {
        old.x = q(op.x);
        old.z = q(op.z);
      } else if (t.length < MAX_TOKENS) t.push({ id: op.id, x: q(op.x), z: q(op.z), n: Math.max(1, Math.min(99, Math.round(op.n))) });
      else return;
      break;
    }
    case 'untoken':
      if (!m.tokens?.some((k) => k.id === op.id)) return;
      m.tokens = m.tokens.filter((k) => k.id !== op.id);
      break;
    default:
      return;
  }
  // Over the cap: the oldest marks go.
  let n = pointCount(m);
  while (n > CONFIG.chartMarks.maxPoints && m.strokes.length > 1) n -= m.strokes.shift()!.pts.length / 2;
  m.seq += 1;
}

/** A saved set of marks (from localStorage), checked: anything malformed is dropped. */
export function parseMarks(raw: string | null): ChartMarks | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { strokes?: unknown; tokens?: unknown };
    if (!Array.isArray(o.strokes)) return null;
    const m = createMarks();
    for (const s of o.strokes as Stroke[]) if (s && typeof s.id === 'string') applyChartOp(m, { k: 'start', id: s.id, pts: s.pts });
    if (Array.isArray(o.tokens)) for (const t of o.tokens as ChartToken[]) if (t) applyChartOp(m, { k: 'token', id: t.id, x: t.x, z: t.z, n: t.n });
    m.seq = 0;
    return m;
  } catch {
    return null;
  }
}

export function serializeMarks(m: ChartMarks): string {
  return JSON.stringify({ strokes: m.strokes, tokens: m.tokens ?? [] });
}
