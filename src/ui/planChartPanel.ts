/**
 * The planning chart on the desktop, full-screen (owner, 28 Oct 2026: "control over the map so
 * they can zoom in and out"; voyage/planChart.ts): M, or the Voyage tab's Open the chart, opens
 * it; M or Esc closes it. Your own view: the mouse wheel zooms about the pointer, a drag pans,
 * a click with a tool puts a point there (or takes the nearest off). The tools and the plan's
 * buttons along the top; the next point along the foot. Redrawn only when something on it
 * changes. The plan itself is everyone's (the `plan` intent): your view is yours alone.
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { centreChartOn, chartToWorld, nextLine, NOTHING_TO_LOOK_AT, panChart, PlanChartPainter, toolIntent, wholeChartView, zoomChartAt, type ChartTool, type ChartView } from '../voyage/planChart';

export interface PlanChartHost {
  world(): WorldState;
  /** The boat that's yours (drawn yellow, "My boat" centres on her), or ''. */
  ownBoatId(): string;
  /** A plan action to the host (the `plan` env intent). */
  send(ref: string, args?: number[]): void;
}

const TOOLS: { tool: ChartTool; text: string; tip: string }[] = [
  { tool: 'way', text: 'Waypoint', tip: 'Click on the chart to put a waypoint there' },
  { tool: 'stop', text: 'Stop', tip: 'Click to put a stop there (it takes the nearest harbour’s name)' },
  { tool: 'look', text: 'Look at', tip: 'Click on a landmark to look at on the way (a castle, a tower, a hill, a wreck, a light: the small marks on the chart); not steered for, but the crew are told when it comes in sight' },
  { tool: 'remove', text: 'Remove', tip: 'Click by a point to take it off' },
];

export class PlanChartPanel {
  private readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly foot = document.createElement('div');
  private readonly bar: HTMLDivElement;
  private readonly toolButtons = new Map<ChartTool, HTMLButtonElement>();
  private readonly clearButton: HTMLButtonElement;
  private readonly painter = new PlanChartPainter();
  private view: ChartView | null = null;
  private tool: ChartTool = 'way';
  private open = false;
  /** What was drawn last (redrawn when it changes). */
  private shown = '';
  private drag: { x: number; y: number; moved: boolean } | null = null;
  /** Clear asks to be pressed twice (it takes every point off). */
  private clearArmed = 0;

  constructor(private readonly host: PlanChartHost) {
    const r = this.root;
    r.style.cssText = 'position:fixed;inset:0;z-index:10000;display:none;background:#0a1e28;font:600 14px system-ui,sans-serif;color:#e8e2cc;user-select:none;';
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:0;right:0;top:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;background:rgba(10,24,32,0.92);border-bottom:1px solid #2c4a58;';
    const title = document.createElement('span');
    title.textContent = 'PLANNING CHART';
    title.style.cssText = 'letter-spacing:0.08em;color:#ffc0e4;margin-right:8px;';
    bar.append(title);
    const button = (text: string, tip: string, press: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.title = tip;
      b.style.cssText = 'font:inherit;padding:5px 11px;border:1px solid #3c5a68;background:#14303c;color:#e8e2cc;border-radius:4px;cursor:pointer;';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        press();
      });
      bar.append(b);
      return b;
    };
    for (const t of TOOLS) this.toolButtons.set(t.tool, button(t.text, t.tip, () => this.setTool(t.tool)));
    const gap = () => bar.append(Object.assign(document.createElement('span'), { style: 'width:10px' }));
    gap();
    button('Undo', 'Take the last point off', () => this.host.send('undo'));
    this.clearButton = button('Clear', 'Take every point off (press twice)', () => this.pressClear());
    gap();
    button('My boat', 'Centre the chart on your boat', () => this.centreOnBoat());
    button('Whole map', 'Show the whole map', () => this.whole());
    button('−', 'Zoom out', () => this.zoomCentre(1 / CONFIG.voyage.plan.chart.wheelStep ** 2));
    button('+', 'Zoom in', () => this.zoomCentre(CONFIG.voyage.plan.chart.wheelStep ** 2));
    gap();
    const layers = button('Layers: on', 'The fishing grounds, the pot grounds and the dive wrecks on the chart (named as you zoom in): on or off', () => {
      this.layers = !this.layers;
      layers.textContent = `Layers: ${this.layers ? 'on' : 'off'}`;
      layers.style.background = this.layers ? '#14303c' : '#2a2f33';
      this.shown = '';
    });
    const close = button('Close (M)', 'Close the chart (M or Esc)', () => this.close());
    close.style.marginLeft = 'auto';
    this.foot.style.cssText = 'position:absolute;left:0;right:0;bottom:0;min-height:18px;padding:7px 12px;background:rgba(10,24,32,0.88);border-top:1px solid #2c4a58;';
    this.canvas.style.cssText = 'position:absolute;left:0;right:0;cursor:crosshair;';
    r.append(this.canvas, bar, this.foot);
    this.bar = bar;
    document.body.appendChild(r);
    this.g = this.canvas.getContext('2d')!;

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = CONFIG.voyage.plan.chart.wheelStep ** (-Math.sign(e.deltaY) || 0);
      const [px, py] = this.px(e);
      this.view = zoomChartAt(this.v(), this.canvas.width, this.canvas.height, px, py, f);
    }, { passive: false });
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < CONFIG.voyage.plan.chart.dragPx) return;
      d.moved = true;
      const k = devicePixelRatio;
      this.view = panChart(this.v(), this.canvas.width, this.canvas.height, dx * k, dy * k);
      d.x = e.clientX;
      d.y = e.clientY;
    });
    this.canvas.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      // A right click pans only (and has no menu); a left click that didn't drag uses the tool.
      if (!d || d.moved || e.button !== 0) return;
      const [px, py] = this.px(e);
      const v = this.v();
      const [x, z] = chartToWorld(v, this.canvas.width, this.canvas.height, px, py);
      const it = toolIntent(this.tool, x, z, v.span);
      if (it) this.host.send(it.ref, it.args);
      else this.say = { text: NOTHING_TO_LOOK_AT, until: performance.now() + 4000 };
      this.shown = '';
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (this.open && e.code === 'Escape') this.close();
    });
    window.addEventListener('resize', () => this.open && this.fit());
    this.setTool('way');
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    if (this.open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.open = true;
    this.root.style.display = 'block';
    this.fit();
    // First time: on your boat, a few miles across (else the whole map).
    if (!this.view) {
      const b = this.host.world().vessels[this.host.ownBoatId()];
      this.view = b ? centreChartOn(wholeChartView(this.aspect()), this.canvas.width, this.canvas.height, b.position[0], b.position[2], 8000) : wholeChartView(this.aspect());
    }
  }

  close(): void {
    this.open = false;
    this.root.style.display = 'none';
    this.drag = null;
  }

  /** The world view's built terrains, for the career map's sharp coast. */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.painter.setLandSource(source);
  }

  /** Each frame: redrawn if open and anything on it has changed. */
  update(): void {
    if (!this.open) return;
    const world = this.host.world();
    const own = this.host.ownBoatId();
    const v = this.v();
    // (Your boat and the crew's move: their positions to a few pixels, so it redraws as they do.)
    const mpp = v.span / this.canvas.width;
    const boats = Object.values(world.vessels).map((b) => `${Math.round(b.position[0] / mpp / 3)},${Math.round(b.position[2] / mpp / 3)}`).join(';');
    if (this.say && performance.now() > this.say.until) this.say = null;
    const key = `${v.cx.toFixed(1)} ${v.cz.toFixed(1)} ${v.span.toFixed(1)} ${this.canvas.width} ${world.plan?.seq ?? -1} ${boats} ${!!this.say}`;
    if (this.clearArmed && performance.now() > this.clearArmed) this.disarmClear();
    if (key === this.shown) return;
    this.shown = key;
    // (Coast still being outlined: drawn again next frame.)
    if (this.painter.paint(this.g, this.canvas.width, this.canvas.height, world, v, devicePixelRatio, own, null, this.layers)) this.shown = '';
    this.foot.textContent = this.say ? this.say.text : `${nextLine(world, own)}     ·     Wheel: zoom   ·   Drag: move the chart   ·   Click: ${TOOLS.find((t) => t.tool === this.tool)!.text.toLowerCase()}`;
  }

  /** The working layers on (the Layers button: fishing grounds, pot grounds, dive wrecks). */
  private layers = true;
  /** A word along the foot for a few seconds (a Look press with nothing to look at). */
  private say: { text: string; until: number } | null = null;

  private v(): ChartView {
    return (this.view ??= wholeChartView(this.aspect()));
  }

  private aspect(): number {
    return this.canvas.width / Math.max(1, this.canvas.height);
  }

  /** The canvas between the top bar and the foot, sized in device pixels. */
  private fit(): void {
    const k = devicePixelRatio;
    const top = this.bar.offsetHeight;
    const foot = this.foot.offsetHeight || 32;
    this.canvas.style.top = `${top}px`;
    this.canvas.style.height = `${Math.max(1, innerHeight - top - foot)}px`;
    this.canvas.width = Math.round(innerWidth * k);
    this.canvas.height = Math.round(Math.max(1, innerHeight - top - foot) * k);
    this.shown = '';
  }

  /** A mouse event's place on the canvas (device pixels). */
  private px(e: MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.canvas.width, ((e.clientY - r.top) / r.height) * this.canvas.height];
  }

  private setTool(tool: ChartTool): void {
    this.tool = tool;
    for (const [t, b] of this.toolButtons) {
      b.style.background = t === tool ? '#b0186a' : '#14303c';
      b.style.borderColor = t === tool ? '#e040a0' : '#3c5a68';
    }
    this.shown = '';
  }

  private zoomCentre(f: number): void {
    this.view = zoomChartAt(this.v(), this.canvas.width, this.canvas.height, this.canvas.width / 2, this.canvas.height / 2, f);
  }

  private centreOnBoat(): void {
    const b = this.host.world().vessels[this.host.ownBoatId()];
    if (b) this.view = centreChartOn(this.v(), this.canvas.width, this.canvas.height, b.position[0], b.position[2]);
  }

  private whole(): void {
    this.view = wholeChartView(this.aspect());
  }

  private pressClear(): void {
    if (this.clearArmed) {
      this.host.send('clear');
      this.disarmClear();
      return;
    }
    this.clearArmed = performance.now() + 3000;
    this.clearButton.textContent = 'Clear: press again';
    this.clearButton.style.background = '#8a2020';
  }

  private disarmClear(): void {
    this.clearArmed = 0;
    this.clearButton.textContent = 'Clear';
    this.clearButton.style.background = '#14303c';
  }
}
