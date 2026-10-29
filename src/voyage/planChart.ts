/**
 * The planning chart (owner, 28 Oct 2026: "the goal is for multiplayer or for a single person to
 * plan a route where they've got control over the map so they can zoom in and out"; then
 * "step 1, own view each, career too"): the crew's voyage plan (voyage/plan.ts, shared, the
 * host's) on a chart each player zooms and pans for themselves, in Voyage and in the career.
 * Shown full-screen on the desktop (ui/planChartPanel.ts) and on a chart board held in the hand
 * in VR (player/chartBoard.ts); both draw with this.
 *
 *   the view    each player's own (`ChartView`: its centre and the sea across it), kept on the
 *               map; zoomed about a point (the mouse, the pointer) so what's under it stays put,
 *               and panned by dragging. Nothing about it is sent: only the plan is shared.
 *   the chart   the chartplotter's own land (nav/landLayer.ts: the coast sharp at any zoom), the
 *               ports and their names, the place names by rank as on the plotter, wrecks and
 *               marks, every player's boat (yours yellow), and the plan's route over it all;
 *               a scale bar and a north arrow.
 *   the plan    a press on the chart with a tool sends the `plan` intent (add:way, add:stop,
 *               add:look, remove), as the quay's table does, so every chart shows it.
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { boatOwnerName, playerBoats } from '../core/launch';
import { LandLayer } from '../nav/landLayer';
import { MARKS, PLACES, PORTS, WRECKS } from '../world/archipelago';
import { REGIONS } from '../world/regions';
import { lookSights, lookReach, lookTarget, nextPoint, pointLabel, type PlanKind } from './plan';

/** What a press on the chart does: put a point of a kind, or take the nearest off. */
export type ChartTool = PlanKind | 'remove';

/** A player's own view of the chart: its centre (m) and the sea across its width (m). */
export interface ChartView {
  cx: number;
  cz: number;
  span: number;
}

const C = () => CONFIG.voyage.plan;

/** The whole world the chart can show: every region's box together. */
export function chartBounds(): { x0: number; x1: number; z0: number; z1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const r of REGIONS) {
    x0 = Math.min(x0, r.bounds.x0);
    x1 = Math.max(x1, r.bounds.x1);
    z0 = Math.min(z0, r.bounds.z0);
    z1 = Math.max(z1, r.bounds.z1);
  }
  return Number.isFinite(x0) ? { x0, x1, z0, z1 } : { x0: -5000, x1: 5000, z0: -5000, z1: 5000 };
}

/** The whole map in a chart `aspect` (width / height) wide. */
export function wholeChartView(aspect: number): ChartView {
  const b = chartBounds();
  return { cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2, span: Math.max(b.x1 - b.x0, (b.z1 - b.z0) * aspect) };
}

/** A view kept on the map: no closer in than `minSpan`, no further out than the whole map, its centre on the map. */
export function clampChartView(v: ChartView, aspect: number): ChartView {
  const b = chartBounds();
  const w = wholeChartView(aspect);
  const span = Math.max(C().chart.minSpan, Math.min(w.span, v.span));
  return { span, cx: Math.max(b.x0, Math.min(b.x1, v.cx)), cz: Math.max(b.z0, Math.min(b.z1, v.cz)) };
}

/** Where on the map a chart pixel is: (px, py) on a chart W x H showing `v`. */
export function chartToWorld(v: ChartView, W: number, H: number, px: number, py: number): [number, number] {
  const mpp = v.span / W;
  return [v.cx + (px - W / 2) * mpp, v.cz + (py - H / 2) * mpp];
}

/** Zoomed by `factor` (> 1 in) about the chart pixel (px, py): what's under it stays under it. */
export function zoomChartAt(v: ChartView, W: number, H: number, px: number, py: number, factor: number): ChartView {
  const [x, z] = chartToWorld(v, W, H, px, py);
  const span = v.span / factor;
  const mpp = span / W;
  return clampChartView({ span, cx: x - (px - W / 2) * mpp, cz: z - (py - H / 2) * mpp }, W / H);
}

/** Panned: the chart dragged (dx, dy) pixels (the map moves with the drag). */
export function panChart(v: ChartView, W: number, H: number, dx: number, dy: number): ChartView {
  const mpp = v.span / W;
  return clampChartView({ ...v, cx: v.cx - dx * mpp, cz: v.cz - dy * mpp }, W / H);
}

/** Centred on a point (your boat), as close in as `span` (or as it is). */
export function centreChartOn(v: ChartView, W: number, H: number, x: number, z: number, span = v.span): ChartView {
  return clampChartView({ cx: x, cz: z, span }, W / H);
}

/** What a Look press says where there's nothing to look at near it. */
export const NOTHING_TO_LOOK_AT = 'Nothing to look at there: press on a landmark (a castle, tower, hill, wreck or light: the small marks named on the chart)';

/**
 * The plan intent a press with `tool` at (x, z) makes, the chart showing `span` m across;
 * null for a Look with nothing to look at near it (NOTHING_TO_LOOK_AT: the host would put none).
 */
export function toolIntent(tool: ChartTool, x: number, z: number, span: number): { ref: string; args: number[] } | null {
  if (tool === 'remove') return { ref: 'remove', args: [x, z, span * C().removeShare] };
  if (tool === 'look') return lookTarget(x, z, lookReach(span)) ? { ref: 'add:look', args: [x, z, lookReach(span)] } : null;
  return { ref: `add:${tool}`, args: [x, z] };
}

/** A tidy length for the scale bar (m): 1, 2 or 5 times a power of ten, at most `m`. */
function niceDistance(m: number): number {
  const p = 10 ** Math.floor(Math.log10(m));
  return m / p >= 5 ? 5 * p : m / p >= 2 ? 2 * p : p;
}

const PLACES_BY_RANK = [...PLACES].sort((a, b) => a.rank - b.rank);
const ROUTE = '#e040a0';
const DONE = '#8a8a8a';
/** A thing to look at: teal, off the route's magenta. */
const LOOK = '#18a89a';

/** Draws the planning chart. Each chart (a player's panel, a board) has its own: the land layer keeps its pictures. */
export class PlanChartPainter {
  private readonly land = new LandLayer();

  /** The world view's built terrains, for the career map's sharp coast (as the chartplotter's). */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.land.setLandSource(source);
  }

  /**
   * @param ui        how big its marks and lettering are (1: a desktop chart in CSS pixels;
   *                  more on a bigger canvas)
   * @param ownBoatId your boat (drawn yellow), or ''
   * @param pointer   where you're pointing on it (VR), drawn as a small cross; or null
   * @returns whether some of the coast in view is still being outlined: draw it again
   */
  paint(g: CanvasRenderingContext2D, W: number, H: number, world: WorldState, v: ChartView, ui: number, ownBoatId: string, pointer: [number, number] | null = null): boolean {
    const mpp = v.span / W;
    const toPx = (x: number, z: number): [number, number] => [W / 2 + (x - v.cx) / mpp, H / 2 + (z - v.cz) / mpp];
    const on = (px: number, py: number, m = 60 * ui) => px > -m && px < W + m && py > -m && py < H + m;
    const font = (px: number, style = '') => `${style}${Math.round(px * ui)}px system-ui, sans-serif`;
    g.save();
    g.fillStyle = '#10303f';
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    const pending = this.land.draw(g, W, H, v.cx, v.cz, mpp);
    g.textBaseline = 'middle';

    // Wrecks (a cross in a red ring) and marks (small diamonds in their colours).
    for (const w of WRECKS) {
      const [px, py] = toPx(w.x, w.z);
      if (!on(px, py)) continue;
      const r = 7 * ui;
      g.strokeStyle = '#ff5040';
      g.lineWidth = 2 * ui;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.moveTo(px - r * 0.6, py - r * 0.6);
      g.lineTo(px + r * 0.6, py + r * 0.6);
      g.moveTo(px + r * 0.6, py - r * 0.6);
      g.lineTo(px - r * 0.6, py + r * 0.6);
      g.stroke();
    }
    for (const m of MARKS) {
      const [px, py] = toPx(m.x, m.z);
      if (!on(px, py)) continue;
      const r = 5 * ui;
      g.fillStyle = m.kind === 'port' ? '#ff4030' : m.kind === 'stbd' ? '#30d060' : m.kind === 'isolated' ? '#ff4030' : '#ffd23a';
      g.strokeStyle = '#101010';
      g.lineWidth = 1.5 * ui;
      g.beginPath();
      g.moveTo(px, py - r);
      g.lineTo(px + r, py);
      g.lineTo(px, py + r);
      g.lineTo(px - r, py);
      g.closePath();
      g.fill();
      g.stroke();
    }

    // Ports and their names (named closer in than the plotter's widest, as it does), their boxes kept so the place names keep clear.
    const labels: [number, number, number, number][] = [];
    const span = v.span;
    g.font = font(15, 'bold ');
    for (const p of PORTS) {
      const [px, py] = toPx(p.x, p.z);
      if (!on(px, py)) continue;
      g.fillStyle = '#e8e2cc';
      g.beginPath();
      g.arc(px, py, 5 * ui, 0, Math.PI * 2);
      g.fill();
      if (span <= CONFIG.voyage.plan.chart.portNamesSpan) {
        const name = p.name.replace(' (anchorage)', '');
        const x = px + 9 * ui;
        const y = py - 11 * ui;
        g.fillText(name, x, y);
        labels.push([x, y - 9 * ui, x + g.measureText(name).width, y + 9 * ui]);
      }
    }
    // Place names by rank (CONFIG.places.plotterSpan, the plotter's: on a wider chart, as wide again), none overprinting another.
    const spans = CONFIG.places.plotterSpan;
    const wide = W / (512 * ui);
    for (const pl of PLACES_BY_RANK) {
      if (span > (spans[pl.rank - 1] ?? 0) * wide) continue;
      const [px, py] = toPx(pl.x, pl.z);
      if (!on(px, py, 100 * ui)) continue;
      const water = pl.kind === 'bay' || pl.kind === 'strait' || pl.kind === 'sea';
      const isle = pl.kind === 'island' || pl.kind === 'islet' || pl.kind === 'archipelago';
      const text = isle ? pl.name.toUpperCase() : pl.name;
      g.font = font(pl.rank <= 2 ? 15 : 13, water ? 'italic ' : isle ? 'bold ' : '');
      const w = g.measureText(text).width;
      const box: [number, number, number, number] = [px - w / 2 - 3, py - 9 * ui, px + w / 2 + 3, py + 9 * ui];
      if (labels.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      labels.push(box);
      g.textAlign = 'center';
      g.fillStyle = water ? '#8ec8e8' : isle ? '#e8e2cc' : '#c8c2ae';
      g.fillText(text, px, py);
      g.textAlign = 'left';
    }

    // The landmarks there are to look at (a Look press goes onto one): a small ring with a dot,
    // named closer in (CONFIG.voyage.plan.chart.sightNamesSpan), keeping clear of the other names.
    const C2 = CONFIG.voyage.plan.chart;
    if (span <= C2.sightsSpan) {
      for (const s of lookSights()) {
        const [px, py] = toPx(s.x, s.z);
        if (!on(px, py)) continue;
        g.strokeStyle = '#b8f0e8';
        g.fillStyle = '#b8f0e8';
        g.lineWidth = 1.5 * ui;
        g.beginPath();
        g.arc(px, py, 4.5 * ui, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(px, py, 1.5 * ui, 0, Math.PI * 2);
        g.fill();
        // (Named by its Look point instead, when it's one.)
        if (span > C2.sightNamesSpan || world.plan?.points.some((p) => p.kind === 'look' && Math.hypot(p.x - s.x, p.z - s.z) < 2)) continue;
        g.font = font(11, 'italic ');
        const w = g.measureText(s.name).width;
        const box: [number, number, number, number] = [px + 7 * ui, py - 7 * ui, px + 7 * ui + w, py + 7 * ui];
        if (labels.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
        labels.push(box);
        g.fillText(s.name, px + 7 * ui, py);
      }
    }

    // The route (waypoints and stops): joined up (legs done dashed grey), each point numbered
    // and marked by its kind, the next ringed. Things to look at aren't on it: each a teal
    // diamond on its landmark, with its number and name (grey once seen).
    const plan = world.plan;
    if (plan?.points.length) {
      const pts = plan.points;
      const route = pts.map((p, i) => ({ p, i })).filter((r) => r.p.kind !== 'look');
      const next = nextPoint(world)?.i ?? pts.length;
      g.lineWidth = 3 * ui;
      for (let k = 1; k < route.length; k++) {
        const a = route[k - 1].p;
        const b = route[k];
        const [ax, ay] = toPx(a.x, a.z);
        const [bx, by] = toPx(b.p.x, b.p.z);
        const done = b.i < plan.next;
        g.strokeStyle = done ? DONE : ROUTE;
        g.setLineDash(done ? [8 * ui, 8 * ui] : []);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
      g.setLineDash([]);
      pts.forEach((p, i) => {
        const [px, py] = toPx(p.x, p.z);
        if (!on(px, py)) return;
        const r = 8 * ui;
        const look = p.kind === 'look';
        const grey = look ? !!p.seen : i < plan.next;
        g.fillStyle = grey ? DONE : look ? LOOK : ROUTE;
        g.beginPath();
        if (p.kind === 'stop') g.rect(px - r, py - r, 2 * r, 2 * r);
        else if (look) {
          g.moveTo(px, py - r * 1.25);
          g.lineTo(px + r * 1.25, py);
          g.lineTo(px, py + r * 1.25);
          g.lineTo(px - r * 1.25, py);
          g.closePath();
        } else g.arc(px, py, r * 0.75, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.font = font(12, 'bold ');
        g.textAlign = 'center';
        g.fillText(String(i + 1), px, py + 0.5);
        g.textAlign = 'left';
        if (p.name) {
          g.fillStyle = grey ? '#c0c0c0' : look ? '#b8f0e8' : '#ffc0e4';
          g.font = font(13, 'bold ');
          g.fillText(look ? `${p.name}${p.seen ? ' (seen)' : ''}` : p.name, px + 12 * ui, py + 14 * ui);
        }
        if (i === next) {
          g.strokeStyle = '#ffffff';
          g.lineWidth = 2.5 * ui;
          g.beginPath();
          g.arc(px, py, 15 * ui, 0, Math.PI * 2);
          g.stroke();
        }
      });
    }

    // Every player's boat, an arrow the way she's heading; yours yellow, the crew's pale, with whose she is.
    for (const b of playerBoats(world)) {
      const [px, py] = toPx(b.position[0], b.position[2]);
      if (!on(px, py)) continue;
      const [bx, by, bz, bw] = b.orientation;
      const course = Math.atan2(-(2 * (bx * bz + bw * by)), 1 - 2 * (bx * bx + by * by));
      const mine = b.id === ownBoatId;
      g.save();
      g.translate(px, py);
      g.rotate(course);
      g.fillStyle = mine ? '#ffd23a' : '#9fd0ff';
      g.strokeStyle = '#101010';
      g.lineWidth = 1.5 * ui;
      g.beginPath();
      g.moveTo(0, -12 * ui);
      g.lineTo(7 * ui, 8 * ui);
      g.lineTo(-7 * ui, 8 * ui);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      g.fillStyle = mine ? '#ffd23a' : '#9fd0ff';
      g.font = font(12, 'bold ');
      g.fillText(mine ? 'YOU' : boatOwnerName(world, b).toUpperCase(), px + 11 * ui, py + 13 * ui);
    }

    // Where you're pointing (VR): a small white cross.
    if (pointer) {
      const [px, py] = pointer;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2 * ui;
      g.beginPath();
      g.moveTo(px - 10 * ui, py);
      g.lineTo(px + 10 * ui, py);
      g.moveTo(px, py - 10 * ui);
      g.lineTo(px, py + 10 * ui);
      g.stroke();
    }

    // A scale bar (bottom left) and north (top right: north is up).
    const bar = niceDistance(mpp * 160 * ui);
    const bw = bar / mpp;
    const sx = 16 * ui;
    const sy = H - 18 * ui;
    g.strokeStyle = '#e8e2cc';
    g.fillStyle = '#e8e2cc';
    g.lineWidth = 2 * ui;
    g.beginPath();
    g.moveTo(sx, sy - 6 * ui);
    g.lineTo(sx, sy);
    g.lineTo(sx + bw, sy);
    g.lineTo(sx + bw, sy - 6 * ui);
    g.stroke();
    g.font = font(13, 'bold ');
    const nm = bar / 1852;
    g.fillText(bar >= 1000 ? `${bar / 1000} km${nm >= 0.5 ? ` · ${nm.toFixed(nm >= 2 ? 0 : 1)} nm` : ''}` : `${bar} m`, sx + bw + 8 * ui, sy - 3 * ui);
    const nx = W - 26 * ui;
    const ny = 30 * ui;
    g.beginPath();
    g.moveTo(nx, ny - 14 * ui);
    g.lineTo(nx + 7 * ui, ny + 6 * ui);
    g.lineTo(nx, ny + 2 * ui);
    g.lineTo(nx - 7 * ui, ny + 6 * ui);
    g.closePath();
    g.fill();
    g.font = font(13, 'bold ');
    g.textAlign = 'center';
    g.fillText('N', nx, ny + 18 * ui);
    g.restore();
    return pending;
  }
}

/** The plan's next point as a line ("Next: Stop 2: Rothesay, 4.2 nm"), from your boat if you have one. */
export function nextLine(world: WorldState, ownBoatId: string): string {
  const n = nextPoint(world);
  if (!world.plan?.points.length) return 'No plan yet: pick Waypoint, Stop or Look at, and press on the chart.';
  if (!n) return world.plan.points.some((p) => p.kind !== 'look') ? 'The route is done: every point reached.' : 'No route yet: only things to look at (seen on the way). Put waypoints or stops.';
  const b = world.vessels[ownBoatId];
  const far = b ? ` · ${(Math.hypot(n.p.x - b.position[0], n.p.z - b.position[2]) / 1852).toFixed(1)} nm` : '';
  return `Next: ${pointLabel(n.p, n.i)}${far}`;
}
