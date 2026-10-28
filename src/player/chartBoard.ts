import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import type { HandFrame } from '../controls/InteractionSystem';
import { centreChartOn, chartToWorld, nextLine, panChart, PlanChartPainter, toolIntent, wholeChartView, zoomChartAt, type ChartTool, type ChartView } from '../voyage/planChart';
import type { Handedness } from './xrInput';

/**
 * The planning chart on a board in your left hand, VR (owner, 28 Oct 2026: "a chart board you
 * carry"; voyage/planChart.ts). The Voyage tab's Open the chart puts it there; its ✕ key (or the
 * menu again) puts it away. It's yours alone, as your view of the chart is; the plan on it is
 * everyone's.
 *
 *   held     it rides with your left hand, a little up and ahead of it, turned to face you
 *            (so it reads square on however the hand's turned). That hand is busy while it's out.
 *   pointing your right hand's pointer on it: a small cross where it falls.
 *     trigger, pressed and let go: on the chart, the tool there (a point, or the nearest off);
 *              on a key along its foot, that key
 *     trigger, held and dragged: the chart moves with the pointer
 *     thumbstick forward / back: zoom in / out about where you're pointing
 *   keys     WAY STOP LOOK DEL | UNDO CLEAR | BOAT ALL | − + | ✕
 *
 * One mesh and one canvas, redrawn only when what's on it changes (at most every
 * `board.redrawS`), and only while it's out.
 */
type Key = { text: string; act: () => void; lit?: () => boolean };

export class ChartBoard {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly painter = new PlanChartPainter();
  private readonly W: number;
  private readonly H: number;
  /** The chart's part of the picture (the top); the keys are below it. */
  private readonly chartH: number;
  private readonly keys: Key[];
  private view: ChartView | null = null;
  private tool: ChartTool = 'way';
  private out = false;
  private pointer: [number, number] | null = null;
  private press: { px: number; py: number; moved: boolean } | null = null;
  private clearArmed = 0;
  private shown = '';
  private since = Infinity;
  private readonly ray = new THREE.Raycaster();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly host: { world(): WorldState; ownBoatId(): string; send(ref: string, args?: number[]): void },
  ) {
    const b = CONFIG.voyage.plan.chart.board;
    this.W = b.px;
    this.H = Math.round(b.px * 0.75);
    this.chartH = Math.round(this.H * (1 - b.toolbarShare));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const w = b.width;
    const h = w * 0.75;
    // The board: its face (the chart), a dark frame round it and a back.
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.012).translate(0, 0, -0.007), new THREE.MeshLambertMaterial({ color: 0x2a2f33 }));
    this.root.add(frame, this.mesh);
    this.root.name = 'chartBoard';
    this.root.visible = false;
    const tool = (t: ChartTool, text: string): Key => ({ text, act: () => (this.tool = t), lit: () => this.tool === t });
    const zoomBy = (f: number) => () => (this.view = zoomChartAt(this.v(), this.W, this.chartH, this.W / 2, this.chartH / 2, f));
    this.keys = [
      tool('way', 'WAY'),
      tool('stop', 'STOP'),
      tool('look', 'LOOK'),
      tool('remove', 'DEL'),
      { text: 'UNDO', act: () => this.host.send('undo') },
      { text: 'CLEAR', act: () => this.pressClear(), lit: () => this.clearArmed > 0 },
      { text: 'BOAT', act: () => this.centreOnBoat() },
      { text: 'ALL', act: () => (this.view = wholeChartView(this.W / this.chartH)) },
      { text: '−', act: zoomBy(1 / 1.6) },
      { text: '+', act: zoomBy(1.6) },
      { text: '✕', act: () => this.putAway() },
    ];
  }

  get isOut(): boolean {
    return this.out;
  }

  /** Out into your left hand, or put away. */
  toggle(): void {
    if (this.out) this.putAway();
    else this.takeOut();
  }

  takeOut(): void {
    this.out = true;
    this.root.visible = true;
    this.shown = '';
    if (!this.view) {
      const b = this.host.world().vessels[this.host.ownBoatId()];
      this.view = b ? centreChartOn(wholeChartView(this.W / this.chartH), this.W, this.chartH, b.position[0], b.position[2], 6000) : wholeChartView(this.W / this.chartH);
    }
  }

  putAway(): void {
    this.out = false;
    this.root.visible = false;
    this.press = null;
  }

  /** The world view's built terrains, for the career map's sharp coast. */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.painter.setLandSource(source);
  }

  /**
   * Each VR frame, before the controls take the hands: placed in the left hand, worked by the
   * right hand's pointer. Returns the hands it used (the left holding it; the right while
   * pointing at it), which nothing else may use this frame.
   */
  updateXR(hands: Record<Handedness, HandFrame>, head: THREE.Vector3, dt: number, haptic: (h: Handedness, i: number, ms: number) => void): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    if (!this.out) return used;
    const L = hands.left;
    if (!L.tracked) {
      this.root.visible = false;
      return used;
    }
    this.root.visible = true;
    used.left = true;
    // In the left hand: a little up and ahead of it (its own axes), facing your head.
    const b = CONFIG.voyage.plan.chart.board;
    this.tmp.set(...b.offset);
    if (L.quat) this.tmp.applyQuaternion(L.quat);
    this.root.position.copy(L.grip).add(this.tmp);
    this.root.lookAt(head);
    this.root.updateMatrixWorld(true);

    // The right hand's pointer on it.
    const R = hands.right;
    this.pointer = null;
    if (R.tracked) {
      this.ray.ray.copy(R.ray);
      const hit = this.ray.intersectObject(this.mesh, false)[0];
      if (hit?.uv) {
        used.right = true;
        const px = hit.uv.x * this.W;
        const py = (1 - hit.uv.y) * this.H;
        this.pointer = [px, py];
        this.handleRight(R, px, py, dt, haptic);
      } else if (this.press && !R.triggerDown) this.press = null;
    }
    this.redraw(dt);
    return used;
  }

  private handleRight(R: HandFrame, px: number, py: number, dt: number, haptic: (h: Handedness, i: number, ms: number) => void): void {
    const c = CONFIG.voyage.plan.chart;
    const onChart = py < this.chartH;
    if (R.triggerPressed) this.press = { px, py, moved: false };
    const p = this.press;
    if (p && R.triggerDown && onChart && p.py < this.chartH) {
      const dx = px - p.px;
      const dy = py - p.py;
      if (p.moved || Math.hypot(dx, dy) >= c.dragPx * 2) {
        p.moved = true;
        this.view = panChart(this.v(), this.W, this.chartH, dx, dy);
        p.px = px;
        p.py = py;
      }
    }
    if (p && !R.triggerDown) {
      this.press = null;
      if (!p.moved) {
        haptic('right', 0.4, 25);
        if (p.py >= this.chartH) this.keyAt(p.px)?.act();
        else {
          const v = this.v();
          const [x, z] = chartToWorld(v, this.W, this.chartH, p.px, p.py);
          const it = toolIntent(this.tool, x, z, v.span);
          this.host.send(it.ref, it.args);
        }
        this.shown = '';
      }
    }
    // The thumbstick: forward (negative y) zooms in, about where you're pointing.
    const sy = R.stick?.[1] ?? 0;
    if (onChart && Math.abs(sy) > CONFIG.interaction.stickDeadZone) this.view = zoomChartAt(this.v(), this.W, this.chartH, px, py, c.stickZoomPerS ** (-sy * dt));
  }

  /** The key under a point along the foot. */
  private keyAt(px: number): Key | undefined {
    return this.keys[Math.floor((px / this.W) * this.keys.length)];
  }

  private redraw(dt: number): void {
    this.since += dt;
    if (this.clearArmed && performance.now() > this.clearArmed) this.clearArmed = 0;
    const world = this.host.world();
    const v = this.v();
    const mpp = v.span / this.W;
    const boats = Object.values(world.vessels).map((b) => `${Math.round(b.position[0] / mpp / 4)},${Math.round(b.position[2] / mpp / 4)}`).join(';');
    const ptr = this.pointer ? `${Math.round(this.pointer[0] / 4)},${Math.round(this.pointer[1] / 4)}` : '-';
    const key = `${v.cx.toFixed(1)} ${v.cz.toFixed(1)} ${v.span.toFixed(1)} ${world.plan?.seq ?? -1} ${boats} ${ptr} ${this.tool} ${this.clearArmed > 0}`;
    if (key === this.shown || this.since < CONFIG.voyage.plan.chart.board.redrawS) return;
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
    g.fillText(nextLine(world, this.host.ownBoatId()), 10 * ui, 13 * ui);
    // The keys.
    const kh = this.H - this.chartH;
    const kw = this.W / this.keys.length;
    g.fillStyle = '#0d1a20';
    g.fillRect(0, this.chartH, this.W, kh);
    this.keys.forEach((k, i) => {
      const x = i * kw;
      const lit = k.lit?.() ?? false;
      const hover = this.pointer && this.pointer[1] >= this.chartH && Math.floor(this.pointer[0] / kw) === i;
      g.fillStyle = lit ? (k.text === 'CLEAR' ? '#8a2020' : '#b0186a') : hover ? '#24485a' : '#14303c';
      g.fillRect(x + 3, this.chartH + 5, kw - 6, kh - 10);
      g.fillStyle = '#e8e2cc';
      g.textAlign = 'center';
      g.font = `bold ${Math.round((k.text.length > 3 ? 12 : 16) * ui)}px system-ui, sans-serif`;
      g.fillText(k.text === 'CLEAR' && this.clearArmed ? 'AGAIN' : k.text, x + kw / 2, this.chartH + kh / 2);
    });
    g.textAlign = 'left';
    this.texture.needsUpdate = true;
  }

  private v(): ChartView {
    return (this.view ??= wholeChartView(this.W / this.chartH));
  }

  private centreOnBoat(): void {
    const b = this.host.world().vessels[this.host.ownBoatId()];
    if (b) this.view = centreChartOn(this.v(), this.W, this.chartH, b.position[0], b.position[2]);
  }

  private pressClear(): void {
    if (this.clearArmed) {
      this.host.send('clear');
      this.clearArmed = 0;
    } else this.clearArmed = performance.now() + 3000;
  }
}
