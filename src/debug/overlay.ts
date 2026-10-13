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

export class DebugOverlay {
  visible = CONFIG.debug.overlayVisibleAtStart;
  readonly vrPanel: THREE.Mesh;

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
    else this.dom.textContent = this.lines.join('\n');
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
    this.texture.needsUpdate = true;
  }
}

function formatHours(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
