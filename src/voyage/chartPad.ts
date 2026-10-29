import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import type { HandFrame } from '../controls/InteractionSystem';
import type { Handedness } from '../player/xrInput';
import { centreChartOn, chartToWorld, nextLine, panChart, PlanChartPainter, toolIntent, wholeChartView, zoomChartAt, type ChartTool, type ChartView } from './planChart';

/**
 * A planning chart on a surface (owner, 28-29 Oct 2026: the planning chart "in your hands, on
 * the boat's chart table and on the quay", each player's own view; voyage/planChart.ts): one
 * canvas with the chart over a strip of keys along its foot, worked by a pointer on it. The
 * chart board in your hand (player/chartBoard.ts), the quay's planning table and its stand
 * (voyage/planTable.ts), the chart table's PLAN sheet (vessel/view/chartTable.ts) and the
 * chartplotter's PLAN mode (nav/chartPlotter.ts) each have one; how its picture is shown and
 * how a pointer reaches it is theirs.
 *
 *   the pointer   where it falls on the canvas (pixels), and whether its button is held:
 *     pressed and let go without moving: on the chart, the tool there (a point, or the
 *              nearest off); on a key, that key
 *     held and moved: the chart moves with it (the spot pressed stays under it)
 *     zoom (a thumbstick, the mouse wheel): in or out about where it falls
 *   the keys      any of WAY STOP LOOK DEL | UNDO CLEAR | BOAT ALL | − + | ✕
 *
 * Its view is this page's alone, so nothing about it is sent; a point put on it is the
 * `plan` intent, everyone's. Redrawn only when what's on it changes, at most every `redrawS`.
 */
export type PadKey = ChartTool | 'undo' | 'clear' | 'boat' | 'all' | 'out' | 'in' | 'close';

export interface ChartPadHost {
  world(): WorldState;
  /** Your boat (drawn yellow; BOAT centres on her), or ''. */
  ownBoatId(): string;
  /** A plan action to the host (the `plan` env intent). */
  send(ref: string, args?: number[]): void;
}

export interface ChartPadOptions {
  /** The canvas's width (px) and its width over its height. */
  px: number;
  aspect: number;
  /** The keys' strip along the foot: its share of the height, and the keys on it, left to right. */
  toolbarShare: number;
  keys: PadKey[];
  /** At most one redraw this often (s). */
  redrawS: number;
  /** ✕: put it away (the board's). */
  onClose?: () => void;
}

const KEY_TEXT: Record<PadKey, string> = { way: 'WAY', stop: 'STOP', look: 'LOOK', remove: 'DEL', undo: 'UNDO', clear: 'CLEAR', boat: 'BOAT', all: 'ALL', out: '−', in: '+', close: '✕' };
const KEY_HOVER: Record<PadKey, string> = {
  way: 'Waypoint: press the chart to put one',
  stop: 'Stop: press the chart to put one (it takes the nearest harbour’s name)',
  look: 'Look at: press on something (a castle, a hill, a wreck, a light)',
  remove: 'Remove: press by a point to take it off',
  undo: 'Undo: the last point off',
  clear: 'Clear the plan (press twice)',
  boat: 'Your boat in the middle',
  all: 'The whole map',
  out: 'Zoom out',
  in: 'Zoom in',
  close: 'Put the chart away',
};
const TOOL_WORDS: Record<ChartTool, string> = { way: 'a waypoint', stop: 'a stop', look: 'a thing to look at', remove: 'take a point off' };

export class ChartPad {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  readonly W: number;
  readonly H: number;
  /** The chart's part of the canvas (the top); the keys are below it. */
  readonly chartH: number;
  private readonly g: CanvasRenderingContext2D;
  private readonly painter = new PlanChartPainter();
  private readonly keys: PadKey[];
  private view: ChartView | null = null;
  private tool: ChartTool = 'way';
  private pointer: [number, number] | null = null;
  private press: { px: number; py: number; moved: boolean } | null = null;
  private wasDown = false;
  private clearArmed = 0;
  private shown = '';
  private since = Infinity;

  constructor(
    private readonly host: ChartPadHost,
    private readonly opts: ChartPadOptions,
  ) {
    this.W = opts.px;
    this.H = Math.round(opts.px / opts.aspect);
    this.chartH = Math.round(this.H * (1 - opts.toolbarShare));
    this.keys = opts.keys;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  /** The world view's built terrains, for the career map's sharp coast. */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.painter.setLandSource(source);
  }

  /** Centred on your boat, `span` m across (the first look, or BOAT); the whole map without one. */
  centreOnBoat(span?: number): void {
    const b = this.host.world().vessels[this.host.ownBoatId()];
    const whole = wholeChartView(this.W / this.chartH);
    this.view = b ? centreChartOn(this.view ?? whole, this.W, this.chartH, b.position[0], b.position[2], span ?? this.view?.span ?? CONFIG.voyage.plan.chart.startSpan) : whole;
    this.shown = '';
  }

  /** Zoomed by `factor` (> 1 in) about the chart's middle (a − or + key, or a button beside it). */
  zoomBy(factor: number): void {
    this.view = zoomChartAt(this.v(), this.W, this.chartH, this.W / 2, this.chartH / 2, factor);
  }

  /**
   * One frame of a pointer on it.
   * @param at   where it falls (canvas pixels), or null (off it)
   * @param down its button held
   * @param zoom zoom by this about where it falls (1: none)
   * @returns whether a press acted this frame (for a click of the hand's haptics)
   */
  input(at: [number, number] | null, down: boolean, zoom = 1): boolean {
    const was = this.wasDown;
    this.wasDown = down;
    this.pointer = at;
    let acted = false;
    if (at && down && !was) this.press = { px: at[0], py: at[1], moved: false };
    const p = this.press;
    if (p && down && at && p.py < this.chartH && at[1] < this.chartH) {
      const dx = at[0] - p.px;
      const dy = at[1] - p.py;
      if (p.moved || Math.hypot(dx, dy) >= CONFIG.voyage.plan.chart.dragPx * 2 * (this.W / 1024)) {
        p.moved = true;
        this.view = panChart(this.v(), this.W, this.chartH, dx, dy);
        p.px = at[0];
        p.py = at[1];
      }
    }
    if (p && !down) {
      this.press = null;
      // (Let go off it: nothing.)
      if (!p.moved && at) {
        acted = true;
        if (p.py >= this.chartH) this.pressKey(this.keyAt(p.px));
        else {
          const v = this.v();
          const [x, z] = chartToWorld(v, this.W, this.chartH, p.px, p.py);
          const it = toolIntent(this.tool, x, z, v.span);
          this.host.send(it.ref, it.args);
        }
        this.shown = '';
      }
    }
    if (at && at[1] < this.chartH && zoom !== 1) this.view = zoomChartAt(this.v(), this.W, this.chartH, at[0], at[1], zoom);
    return acted;
  }

  /** Where on the map a point of its chart is (m: x, z). */
  worldAt(at: [number, number]): [number, number] {
    return chartToWorld(this.v(), this.W, this.chartH, at[0], at[1]);
  }

  /** What's under a point, for the desktop's reticle. */
  hoverLabel(at: [number, number]): string {
    if (at[1] >= this.chartH) {
      const k = this.keyAt(at[0]);
      return k ? KEY_HOVER[k] : '';
    }
    return `Chart: click for ${TOOL_WORDS[this.tool]} · drag to move it · wheel to zoom`;
  }

  /** Each frame it can be seen: drawn again if what's on it changed. */
  update(dt: number): void {
    this.since += dt;
    if (this.clearArmed && performance.now() > this.clearArmed) this.clearArmed = 0;
    const world = this.host.world();
    const v = this.v();
    const mpp = v.span / this.W;
    const boats = Object.values(world.vessels).map((b) => `${Math.round(b.position[0] / mpp / 4)},${Math.round(b.position[2] / mpp / 4)}`).join(';');
    const ptr = this.pointer ? `${Math.round(this.pointer[0] / 4)},${Math.round(this.pointer[1] / 4)}` : '-';
    const key = `${v.cx.toFixed(1)} ${v.cz.toFixed(1)} ${v.span.toFixed(1)} ${world.plan?.seq ?? -1} ${boats} ${ptr} ${this.tool} ${this.clearArmed > 0}`;
    if (key === this.shown || this.since < this.opts.redrawS) return;
    this.shown = key;
    this.since = 0;
    const g = this.g;
    const ui = this.W / 600;
    const ptrOnChart = this.pointer && this.pointer[1] < this.chartH ? this.pointer : null;
    // (Coast still being outlined: drawn again at the next chance.)
    if (this.painter.paint(g, this.W, this.chartH, world, v, ui, this.host.ownBoatId(), ptrOnChart)) this.shown = '';
    // The next point, along the chart's top (its scale bar is along its foot).
    g.fillStyle = 'rgba(10, 24, 32, 0.8)';
    g.fillRect(0, 0, this.W - 48 * ui, 26 * ui);
    g.fillStyle = '#ffc0e4';
    g.font = `bold ${Math.round(13 * ui)}px system-ui, sans-serif`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(nextLine(world, this.host.ownBoatId()), 10 * ui, 13 * ui, this.W - 64 * ui);
    // The keys.
    const kh = this.H - this.chartH;
    const kw = this.W / this.keys.length;
    const inset = Math.max(3, Math.round(kh * 0.08));
    g.fillStyle = '#0d1a20';
    g.fillRect(0, this.chartH, this.W, kh);
    this.keys.forEach((k, i) => {
      const x = i * kw;
      const lit = k === this.tool || (k === 'clear' && this.clearArmed > 0);
      const hover = this.pointer && this.pointer[1] >= this.chartH && Math.floor(this.pointer[0] / kw) === i;
      g.fillStyle = lit ? (k === 'clear' ? '#8a2020' : '#b0186a') : hover ? '#24485a' : '#14303c';
      g.fillRect(x + inset, this.chartH + inset, kw - 2 * inset, kh - 2 * inset);
      g.fillStyle = '#e8e2cc';
      g.textAlign = 'center';
      const text = k === 'clear' && this.clearArmed ? 'AGAIN' : KEY_TEXT[k];
      g.font = `bold ${Math.round(Math.min(kh * (text.length > 3 ? 0.3 : 0.42), kw * (text.length > 3 ? 0.2 : 0.4)))}px system-ui, sans-serif`;
      g.fillText(text, x + kw / 2, this.chartH + kh / 2);
    });
    g.textAlign = 'left';
    this.texture.needsUpdate = true;
  }

  /** The key under a point along the foot. */
  private keyAt(px: number): PadKey | undefined {
    return this.keys[Math.floor((px / this.W) * this.keys.length)];
  }

  private pressKey(k: PadKey | undefined): void {
    switch (k) {
      case undefined:
        return;
      case 'way':
      case 'stop':
      case 'look':
      case 'remove':
        this.tool = k;
        return;
      case 'undo':
        this.host.send('undo');
        return;
      case 'clear':
        if (this.clearArmed) {
          this.host.send('clear');
          this.clearArmed = 0;
        } else this.clearArmed = performance.now() + 3000;
        return;
      case 'boat':
        this.centreOnBoat();
        return;
      case 'all':
        this.view = wholeChartView(this.W / this.chartH);
        return;
      case 'out':
        this.zoomBy(1 / 1.6);
        return;
      case 'in':
        this.zoomBy(1.6);
        return;
      case 'close':
        this.opts.onClose?.();
        return;
    }
  }

  private v(): ChartView {
    if (!this.view) this.centreOnBoat();
    return this.view!;
  }
}

/**
 * A chart pad's picture on something in the world (a mesh whose UVs cover its canvas: the
 * quay table's top, the chart table's leaf, the plotter's screen), reached by a hand's ray
 * within `reach` (m) while `on()`.
 */
export interface PadFace {
  mesh: THREE.Mesh;
  pad: ChartPad;
  reach: number;
  on(): boolean;
}

/**
 * Works the chart pads' faces in the world: a VR hand's ray or the desktop's reticle on one
 * is a pointer on its pad (the board in the hand works its own: player/chartBoard.ts).
 *
 *   VR       a hand's ray on a face: the trigger presses (let go to put a point, or a key),
 *            held and moved drags the chart, the right thumbstick forward and back zooms
 *   desktop  the reticle on a face: click, drag (the view turning drags the chart under
 *            it), the mouse wheel zooms
 */
export class PadFaces {
  readonly faces: PadFace[] = [];
  private readonly ray = new THREE.Raycaster();

  /** The face a ray falls on first (within its reach) and where on its pad, or null. */
  hit(ray: THREE.Ray): { face: PadFace; at: [number, number] } | null {
    this.ray.ray.copy(ray);
    let best: { face: PadFace; at: [number, number]; d: number } | null = null;
    for (const f of this.faces) {
      if (!f.on() || !visibleUp(f.mesh)) continue;
      this.ray.far = f.reach;
      const h = this.ray.intersectObject(f.mesh, false)[0];
      if (!h?.uv || (best && h.distance >= best.d)) continue;
      best = { face: f, at: [h.uv.x * f.pad.W, (1 - h.uv.y) * f.pad.H], d: h.distance };
    }
    return best;
  }

  /**
   * Each VR frame, after the board, before the controls: the hands (not `busy`) whose ray is on a face work it.
   * Returns the hands it used, which nothing else may use this frame.
   */
  updateXR(hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>, dt: number, haptic: (h: Handedness, i: number, ms: number) => void): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    const worked = new Set<ChartPad>();
    for (const h of ['right', 'left'] as const) {
      const f = hands[h];
      if (busy[h] || !f.tracked) continue;
      const hit = this.hit(f.ray);
      if (!hit || worked.has(hit.face.pad)) continue;
      worked.add(hit.face.pad);
      used[h] = true;
      // The right thumbstick: forward (negative y) zooms in (the left one walks).
      const sy = h === 'right' ? (f.stick?.[1] ?? 0) : 0;
      const zoom = Math.abs(sy) > CONFIG.interaction.stickDeadZone ? CONFIG.voyage.plan.chart.stickZoomPerS ** (-sy * dt) : 1;
      if (hit.face.pad.input(hit.at, f.triggerDown, zoom)) haptic(h, 0.4, 25);
    }
    for (const f of this.faces) if (!worked.has(f.pad)) f.pad.input(null, false);
    return used;
  }

  /**
   * Each desktop frame, before the controls: the reticle (`ray`, null when the mouse isn't
   * captured) on a face works it. `wheel`: the wheel's notches this frame (+ toward you: out).
   */
  updateDesktop(ray: THREE.Ray | null, down: boolean, wheel: number): { label: string | null; consumed: boolean } {
    const hit = ray ? this.hit(ray) : null;
    for (const f of this.faces) if (f !== hit?.face && f.pad !== hit?.face.pad) f.pad.input(null, down);
    if (!hit) return { label: null, consumed: false };
    hit.face.pad.input(hit.at, down, wheel ? CONFIG.voyage.plan.chart.wheelStep ** -wheel : 1);
    return { label: hit.face.pad.hoverLabel(hit.at), consumed: true };
  }
}

/** Shown: it and everything it hangs from. */
function visibleUp(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}
