import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * FPS / frame-time / draw-call overlay.
 *
 * Frame-time lines, for profiling on the headset:
 *   FPS / avg / max   wall-clock interval between frames (what you see; capped by the display)
 *   cpu               main-thread JS time inside our frame callback, split into the fixed-step
 *                     simulation, view updates, and render() (three.js building and submitting
 *                     the draw commands - not the GPU's work)
 *   gpu               GPU time of the frame where the timer extension exists, else "n/a"
 * At 90 Hz the budget is 11.1 ms: if FPS drops while cpu is low, the GPU is the limit
 * (lower xr.framebufferScale or raise xr.foveation in config.ts); if cpu is near the
 * budget, the main thread is.
 *
 * Desktop: a DOM panel in the top-left corner. VR: a small canvas panel attached to the
 * player rig (it rides along with the player, like a clipboard held at chest height).
 */
export interface DebugStats {
  drawCalls: number;
  triangles: number;
  tick: number;
  timeOfDay: number;
  xr: string;
  /** Main-thread time (ms) this frame, by phase. */
  cpu: { sim: number; views: number; render: number };
  /** GPU time (ms) of a recent frame, or null if unavailable. */
  gpuMs: number | null;
  extra?: string;
}

/** The debug region map (regions): each region's footprint and state, and where you are. */
export interface RegionMapData {
  regions: { id: string; bounds: { x0: number; x1: number; z0: number; z1: number }; resident: boolean; building: boolean; outline: boolean }[];
  landmarks: { x: number; z: number }[];
  /** The tidal races: the zone and what it's doing now (kn, signed along its set). */
  races: { x: number; z: number; length: number; width: number; setDeg: number; kn: number }[];
  /** Katabatic gust zones: the circle, and how hard it's blowing there now (0..1; 0 between gusts). */
  gusts?: { x: number; z: number; r: number; s: number }[];
  /** The viewer (world x, z) and heading (deg, 0 north, clockwise). */
  viewer: { x: number; z: number; headingDeg: number };
}

export class DebugOverlay {
  visible = CONFIG.debug.overlayVisibleAtStart;
  readonly vrPanel: THREE.Mesh;
  private regionMap: RegionMapData | null = null;
  private readonly mapCanvas: HTMLCanvasElement;

  private readonly dom: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;

  // Frame-time statistics gathered between refreshes.
  private frames = 0;
  private sumMs = 0;
  private maxMs = 0;
  private readonly cpuSum = { sim: 0, views: 0, render: 0 };
  private cpuMax = 0;
  private sinceRefresh = 0;
  private lines: string[] = [];

  constructor() {
    this.dom = document.createElement('div');
    Object.assign(this.dom.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      font: '12px/1.35 ui-monospace, Menlo, Consolas, monospace',
      color: '#bff7c8',
      background: 'rgba(0,0,0,0.55)',
      padding: '6px 8px',
      borderRadius: '4px',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.dom);
    // The region map under the text on desktop (its own canvas); drawn into the panel in VR.
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = this.mapCanvas.height = 220;
    Object.assign(this.mapCanvas.style, { position: 'fixed', top: '150px', left: '8px', display: 'none', pointerEvents: 'none', zIndex: '10', borderRadius: '4px' } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.mapCanvas);

    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 384;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.vrPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.3),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, fog: false, depthTest: false }),
    );
    this.vrPanel.name = 'debugPanel';
    this.vrPanel.renderOrder = 999;
    this.applyVisibility(false);
  }

  toggle(): void {
    this.visible = !this.visible;
  }

  /** Show the region map (with the panel), or hide it (null). */
  setRegionMap(data: RegionMapData | null): void {
    this.regionMap = data;
  }

  private toastText = '';
  private toastUntil = 0;
  private readonly toastEl = (() => {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      top: '18%',
      left: '50%',
      transform: 'translateX(-50%)',
      font: '600 16px system-ui, sans-serif',
      color: '#fff',
      background: 'rgba(160,40,20,0.85)',
      padding: '8px 14px',
      borderRadius: '6px',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '20',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    return el;
  })();

  /** Short message shown for a few seconds (DOM on desktop, on the wrist panel in VR). */
  notify(text: string, seconds = 3): void {
    this.toastText = text;
    this.toastUntil = performance.now() + seconds * 1000;
    this.toastEl.textContent = text;
    this.sinceRefresh = 1e9; // force a panel redraw
  }

  /** Call once per rendered frame with real frame time in ms. */
  frame(frameMs: number, stats: DebugStats, inXR: boolean): void {
    this.frames++;
    this.sumMs += frameMs;
    this.maxMs = Math.max(this.maxMs, frameMs);
    const { sim, views, render } = stats.cpu;
    this.cpuSum.sim += sim;
    this.cpuSum.views += views;
    this.cpuSum.render += render;
    this.cpuMax = Math.max(this.cpuMax, sim + views + render);
    this.sinceRefresh += frameMs;
    this.applyVisibility(inXR);

    if (this.sinceRefresh < 1000 / CONFIG.debug.overlayUpdateHz) return;
    const avg = this.sumMs / this.frames;
    const n = this.frames;
    const c = this.cpuSum;
    const cpu = (c.sim + c.views + c.render) / n;
    const gpu = stats.gpuMs === null ? 'n/a' : `${stats.gpuMs.toFixed(1)} ms`;
    this.lines = [
      `FPS ${(1000 / avg).toFixed(0).padStart(3)}  avg ${avg.toFixed(1)} ms  max ${this.maxMs.toFixed(1)} ms`,
      `cpu ${cpu.toFixed(1)} ms (max ${this.cpuMax.toFixed(1)})  gpu ${gpu}`,
      `  sim ${(c.sim / n).toFixed(1)}  views ${(c.views / n).toFixed(1)}  render ${(c.render / n).toFixed(1)} ms`,
      `draws ${stats.drawCalls}  tris ${stats.triangles.toLocaleString()}`,
      `tick ${stats.tick}  time ${formatHours(stats.timeOfDay)}`,
      `XR ${stats.xr}`,
      ...(stats.extra ? stats.extra.split('\n') : []),
    ];
    this.frames = 0;
    this.sumMs = 0;
    this.maxMs = 0;
    this.cpuSum.sim = this.cpuSum.views = this.cpuSum.render = 0;
    this.cpuMax = 0;
    this.sinceRefresh = 0;

    if (!this.visible && !this.toastActive) return;
    if (inXR) this.drawPanel();
    else {
      this.dom.textContent = this.lines.join('\n');
      const mapOn = this.visible && !!this.regionMap;
      this.mapCanvas.style.display = mapOn ? 'block' : 'none';
      this.mapCanvas.style.top = `${this.dom.offsetHeight + 14}px`;
      if (mapOn) this.drawMap(this.mapCanvas.getContext('2d')!, 0, 0, this.mapCanvas.width);
    }
  }

  /**
   * The region map: footprints to scale (green: drawn in full; yellow: being built; grey:
   * its outline is in sight; dark: not drawn), landmarks as triangles, you as a dot with
   * your heading. North up.
   */
  private drawMap(ctx: CanvasRenderingContext2D, ox: number, oy: number, size: number): void {
    const d = this.regionMap;
    if (!d) return;
    ctx.fillStyle = 'rgba(10,20,30,0.85)';
    ctx.fillRect(ox, oy, size, size);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; // prettier-ignore
    for (const r of d.regions) {
      x0 = Math.min(x0, r.bounds.x0);
      x1 = Math.max(x1, r.bounds.x1);
      z0 = Math.min(z0, r.bounds.z0);
      z1 = Math.max(z1, r.bounds.z1);
    }
    x0 = Math.min(x0, d.viewer.x - 500);
    x1 = Math.max(x1, d.viewer.x + 500);
    z0 = Math.min(z0, d.viewer.z - 500);
    z1 = Math.max(z1, d.viewer.z + 500);
    const span = Math.max(x1 - x0, z1 - z0) * 1.08;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const k = size / span;
    const px = (x: number) => ox + size / 2 + (x - cx) * k;
    const pz = (z: number) => oy + size / 2 + (z - cz) * k;
    ctx.font = `${Math.round(size / 18)}px monospace`;
    ctx.textAlign = 'left';
    for (const r of d.regions) {
      const w = (r.bounds.x1 - r.bounds.x0) * k;
      const h = (r.bounds.z1 - r.bounds.z0) * k;
      ctx.fillStyle = r.resident ? 'rgba(60,160,80,0.45)' : r.building ? 'rgba(220,180,40,0.35)' : r.outline ? 'rgba(140,150,160,0.3)' : 'rgba(60,70,80,0.3)';
      ctx.fillRect(px(r.bounds.x0), pz(r.bounds.z0), w, h);
      ctx.strokeStyle = r.resident ? '#5ce07a' : r.building ? '#f0c040' : '#9aa5b0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px(r.bounds.x0), pz(r.bounds.z0), w, h);
      ctx.fillStyle = '#dfe';
      ctx.fillText(r.id, px(r.bounds.x0) + 4, pz(r.bounds.z0) + size / 18);
    }
    // Gust zones: a dashed circle, filled while a gust is blowing on it.
    for (const g of d.gusts ?? []) {
      ctx.beginPath();
      ctx.arc(px(g.x), pz(g.z), g.r * k, 0, Math.PI * 2);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = g.s > 0.05 ? '#f4f4ff' : '#8a9ab8';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
      if (g.s > 0.05) {
        ctx.fillStyle = `rgba(230,236,255,${(0.15 + 0.35 * g.s).toFixed(2)})`;
        ctx.fill();
      }
    }
    // Races: the zone's rectangle turned to its set, an arrow the way it runs, its speed.
    for (const r of d.races) {
      const a = (r.setDeg * Math.PI) / 180;
      ctx.save();
      ctx.translate(px(r.x), pz(r.z));
      ctx.rotate(a);
      const w = r.width * k;
      const h = r.length * k;
      const on = Math.abs(r.kn) > 1.5;
      ctx.fillStyle = on ? 'rgba(240,120,60,0.35)' : 'rgba(120,160,220,0.25)';
      ctx.strokeStyle = on ? '#ff9a5c' : '#9ab8e0';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      if (on) {
        const dir = r.kn >= 0 ? -1 : 1; // the set is up (north) in this frame: -y
        ctx.beginPath();
        ctx.moveTo(0, -dir * h * 0.3);
        ctx.lineTo(0, dir * h * 0.3);
        ctx.lineTo(-4, dir * h * 0.3 - dir * 6);
        ctx.moveTo(0, dir * h * 0.3);
        ctx.lineTo(4, dir * h * 0.3 - dir * 6);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = on ? '#ffb080' : '#b0c8e8';
      ctx.fillText(`${Math.abs(r.kn).toFixed(1)} kn`, px(r.x) + 6, pz(r.z) - 4);
    }
    ctx.fillStyle = '#f0e0a0';
    for (const l of d.landmarks) {
      const x = px(l.x);
      const z = pz(l.z);
      ctx.beginPath();
      ctx.moveTo(x, z - 5);
      ctx.lineTo(x - 5, z + 4);
      ctx.lineTo(x + 5, z + 4);
      ctx.closePath();
      ctx.fill();
    }
    const vx = px(d.viewer.x);
    const vz = pz(d.viewer.z);
    const a = (d.viewer.headingDeg * Math.PI) / 180;
    ctx.strokeStyle = '#ff8060';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vx, vz);
    ctx.lineTo(vx + Math.sin(a) * 14, vz - Math.cos(a) * 14);
    ctx.stroke();
    ctx.fillStyle = '#ff8060';
    ctx.beginPath();
    ctx.arc(vx, vz, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private get toastActive(): boolean {
    return performance.now() < this.toastUntil;
  }

  private applyVisibility(inXR: boolean): void {
    this.dom.style.display = this.visible && !inXR ? 'block' : 'none';
    this.vrPanel.visible = (this.visible || this.toastActive) && inXR;
    this.toastEl.style.display = this.toastActive && !inXR ? 'block' : 'none';
  }

  private drawPanel(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#bff7c8';
    ctx.font = '26px monospace';
    const lines = this.toastActive ? [`>> ${this.toastText}`, ...(this.visible ? this.lines : [])] : this.lines;
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 && this.toastActive ? '#ffb38a' : '#bff7c8';
      ctx.fillText(line, 14, 38 + i * 34);
    });
    // The region map in the panel's lower right corner (over the readout's long lines).
    if (this.visible && this.regionMap) this.drawMap(ctx, canvas.width - 190, canvas.height - 190, 180);
    this.texture.needsUpdate = true;
  }
}

function formatHours(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
