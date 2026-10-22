/**
 * The voyage plan (owner, Oct 2026: "a large map table with a chart laid out ... that you can
 * cooperatively plan on ... you look at the map, you plan a little route, where you're going
 * to stop, what you're going to look at, and then you jump in your boats and you go").
 *
 * Plain data in WorldState (`world.plan`), so the crew share it through the snapshots and
 * the host decides: everyone works the planning table on the quay (voyage/planTable.ts),
 * which sends the env intent `plan` (ref: what to do, args: where on the chart):
 *
 *   add:way / add:stop / add:look  a point at (x, z): a waypoint, a stop, a thing to look at;
 *                  a stop takes the nearest harbour's name, a look the nearest named castle,
 *                  monument, tower, hill, wreck or light (else the nearest town)
 *   remove         the point nearest (x, z) within r
 *   undo / clear   the last point off / every point off
 *   zoom / out / whole   the table's view (shared: one table, one chart on it): zoomed in
 *                  on (x, z), out, or the whole map
 *   goto           the player put ashore at the start, by the table
 *
 * Afloat, the plan's next point is every boat's: the chartplotter draws the route and steers
 * for it (nav/chartPlotter.ts), and when any player's boat comes within its reach
 * (CONFIG.voyage.plan.reach) it's reached: a note to everyone, and the next one comes up.
 * The host saves the plan for each map in the browser (savePlanText / parsePlan).
 */
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { playerBoats } from '../core/launch';
import { sheetById } from '../nav/chartSheets';
import { placeAshore } from '../player/playerControl';
import { PORTS } from '../world/archipelago';
import { REGIONS } from '../world/regions';

export type PlanKind = 'way' | 'stop' | 'look';

export interface PlanPoint {
  x: number;
  z: number;
  kind: PlanKind;
  /** What it is: a harbour's or a landmark's name, or none (a plain waypoint). */
  name: string;
}

/** The table's view: its centre and the sea across it (m); the depth is that over the table's aspect. */
export interface PlanView {
  cx: number;
  cz: number;
  span: number;
}

export interface VoyagePlan {
  points: PlanPoint[];
  /** The next point to make for (points.length: the voyage is done). */
  next: number;
  view: PlanView;
  /** The last news (a point reached), for the pages to show once: its text and the world time. */
  note?: { text: string; t: number };
  /** Counts changes (the table redraws its route, the host saves). */
  seq: number;
}

const C = () => CONFIG.voyage.plan;
/** The table top's aspect (width / depth). */
export const planAspect = () => C().table.width / C().table.depth;

/** The whole map on the table: the map's chart sheet, fitted to the table's shape. */
export function wholeView(): PlanView {
  const b = sheetById(REGIONS[0]?.id ?? 'home').bounds;
  const w = b.x1 - b.x0;
  const h = b.z1 - b.z0;
  return { cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2, span: Math.max(w, h * planAspect()) };
}

/** The sea the table shows for a view: x0..x1, z0..z1 (m). */
export function viewBounds(v: PlanView): { x0: number; x1: number; z0: number; z1: number } {
  const d = v.span / planAspect();
  return { x0: v.cx - v.span / 2, x1: v.cx + v.span / 2, z0: v.cz - d / 2, z1: v.cz + d / 2 };
}

export function createPlan(): VoyagePlan {
  return { points: [], next: 0, view: wholeView(), seq: 0 };
}

/** Keep a zoomed-in view on the map (its centre within the whole map's chart). */
function clampView(v: PlanView): PlanView {
  const w = wholeView();
  const span = Math.max(C().minSpan, Math.min(w.span, v.span));
  const half = (w.span - span) / 2;
  const halfD = (w.span - span) / planAspect() / 2;
  return { span, cx: Math.max(w.cx - half, Math.min(w.cx + half, v.cx)), cz: Math.max(w.cz - halfD, Math.min(w.cz + halfD, v.cz)) };
}

/** Everything on the map with a name worth looking at, and where. */
function sights(): { name: string; x: number; z: number }[] {
  const out: { name: string; x: number; z: number }[] = [];
  for (const r of REGIONS) {
    for (const s of r.skyline ?? []) if (s.name) out.push(s);
    for (const l of r.landmarks) if (l.name) out.push(l);
    for (const w of r.wrecks) if (w.name) out.push(w);
    for (const l of r.lights) if (l.name && !/^Light\b/.test(l.name)) out.push(l);
  }
  return out;
}

function nearest<T extends { x: number; z: number }>(list: readonly T[], x: number, z: number, within: number): T | undefined {
  let best: T | undefined;
  let bd = within;
  for (const o of list) {
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < bd) [best, bd] = [o, d];
  }
  return best;
}

const places = () => REGIONS.flatMap((r) => r.places ?? []);

/** A new point's name: a stop by its harbour, a look by its landmark (else off the nearest town); a waypoint has none. */
export function pointName(kind: PlanKind, x: number, z: number): string {
  if (kind === 'way') return '';
  if (kind === 'stop') {
    const port = nearest(PORTS, x, z, C().nameStopM);
    if (port) return port.name.replace(' (anchorage)', '');
  } else {
    const sight = nearest(sights(), x, z, C().nameLookM);
    if (sight) return sight.name;
  }
  const town = nearest(places(), x, z, Infinity);
  return town ? `off ${town.name}` : '';
}

/** "Stop 2: Rothesay", "Look 3: Toward Castle", "Waypoint 4". */
export function pointLabel(p: PlanPoint, i: number): string {
  const kind = p.kind === 'stop' ? 'Stop' : p.kind === 'look' ? 'Look' : 'Waypoint';
  return `${kind} ${i + 1}${p.name ? `: ${p.name}` : ''}`;
}

/** The next point to make for, and its number, or null (no plan, or it's done). */
export function nextPoint(world: WorldState): { p: PlanPoint; i: number } | null {
  const plan = world.plan;
  if (!plan || plan.next >= plan.points.length) return null;
  return { p: plan.points[plan.next], i: plan.next };
}

function changed(plan: VoyagePlan): void {
  plan.next = Math.min(plan.next, plan.points.length);
  plan.seq += 1;
}

/** The planning table's intents (control 'plan'; see the top of the file). */
export function applyPlanIntent(world: WorldState, intent: Intent): void {
  const plan = (world.plan ??= createPlan());
  const [x, z, r] = intent.args ?? [];
  const at = Number.isFinite(x) && Number.isFinite(z);
  const action = intent.ref ?? '';
  if (action.startsWith('add:')) {
    const kind = action.slice(4) as PlanKind;
    if (!at || !['way', 'stop', 'look'].includes(kind) || plan.points.length >= C().maxPoints) return;
    plan.points.push({ x: Math.round(x), z: Math.round(z), kind, name: pointName(kind, x, z) });
    changed(plan);
    return;
  }
  switch (action) {
    case 'remove': {
      if (!at) return;
      let best = -1;
      let bd = Number.isFinite(r) ? r : Infinity;
      plan.points.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) [best, bd] = [i, d];
      });
      if (best < 0) return;
      plan.points.splice(best, 1);
      // A point before the next one gone: the next one is one place earlier in the list.
      if (best < plan.next) plan.next -= 1;
      changed(plan);
      return;
    }
    case 'undo':
      if (!plan.points.length) return;
      plan.points.pop();
      changed(plan);
      return;
    case 'clear':
      plan.points = [];
      plan.next = 0;
      changed(plan);
      return;
    case 'zoom':
      if (!at) return;
      plan.view = clampView({ cx: x, cz: z, span: plan.view.span / 2 });
      changed(plan);
      return;
    case 'out':
      plan.view = clampView({ ...plan.view, span: plan.view.span * 2 });
      changed(plan);
      return;
    case 'whole':
      plan.view = wholeView();
      changed(plan);
      return;
    case 'goto': {
      const p = world.players[intent.playerId];
      if (p) placeAshore(p, null);
      return;
    }
  }
}

export function isPlanIntent(control: string): boolean {
  return control === 'plan';
}

/**
 * One tick: the next point reached when any player's boat comes within its reach. Then a
 * note for everyone (the pages show it once), and the next point comes up.
 */
export function stepPlan(world: WorldState): void {
  const plan = world.plan;
  const n = nextPoint(world);
  if (!plan || !n) return;
  const reach = C().reach[n.p.kind];
  const boats = playerBoats(world);
  if (!boats.some((v) => Math.hypot(v.position[0] - n.p.x, v.position[2] - n.p.z) <= reach)) return;
  plan.next += 1;
  const after = nextPoint(world);
  plan.note = { text: `${pointLabel(n.p, n.i)} reached. ${after ? `Next: ${pointLabel(after.p, after.i)}` : 'That was the last point of the plan: voyage done.'}`, t: world.time };
  plan.seq += 1;
}

/** The plan for saving (the host's, per map): its points, how far along, the table's view. */
export function savePlanText(plan: VoyagePlan): string {
  return JSON.stringify({ points: plan.points, next: plan.next, view: plan.view });
}

/** A saved plan, checked: anything malformed is dropped (null: none, or none usable). */
export function parsePlan(raw: string | null): VoyagePlan | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { points?: unknown; next?: unknown; view?: Partial<PlanView> };
    if (!Array.isArray(o.points)) return null;
    const plan = createPlan();
    for (const p of o.points as PlanPoint[]) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || !['way', 'stop', 'look'].includes(p.kind)) continue;
      if (plan.points.length >= C().maxPoints) break;
      plan.points.push({ x: p.x, z: p.z, kind: p.kind, name: typeof p.name === 'string' ? p.name.slice(0, 60) : '' });
    }
    plan.next = Number.isFinite(o.next) ? Math.max(0, Math.min(plan.points.length, Math.floor(o.next as number))) : 0;
    const v = o.view;
    if (v && [v.cx, v.cz, v.span].every(Number.isFinite)) plan.view = clampView(v as PlanView);
    return plan;
  } catch {
    return null;
  }
}
