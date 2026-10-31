/**
 * The chart review's picture (docs/TRAINING.md section 6, milestone 2): a recorded run drawn
 * on the training harbour's chart (the planning chart's own painter: the land, the quay, the
 * marks), its track coloured by speed, pins at its events (steps, faults, touches, lines),
 * the other attempt at the same exercise beside it in grey, the boat where she was at the
 * moment being looked at, a time bar, and that moment's numbers. Worked from the menu's
 * Training tab (trainingMenu.ts); one canvas: on the desktop shown as it is, in VR as one
 * textured panel in front of you (one draw call).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { PlanChartPainter, type ChartView } from '../voyage/planChart';
import { BLOCKS } from '../world/archipelago';
import { KN } from './exercises';
import { sampleAt, sampleCount, sampleHeading, type Run } from './recording';
import { clock, eventAt, frameRuns, reviewNumbers, speedColour } from './review';

const W = 1280;
const H = 800;
/** The time bar's strip along the foot, and the numbers' column on the right (px). */
const BAR = 70;
const SIDE = 330;
const INK = '#14202a';
const PIN: Record<string, string> = { step: '#2d6fd0', fault: '#d8321f', touch: '#f08a1c', line: '#7a4fc0', horn: '#3a8a8a', start: '#14202a', result: '#14202a' };

export class ReviewPanel {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  /** The VR panel (1.5 m across). */
  readonly mesh: THREE.Mesh;
  /** The desktop's: the canvas in a box at the side of the screen. */
  private readonly box = document.createElement('div');
  private readonly g: CanvasRenderingContext2D;
  private readonly painter = new PlanChartPainter();
  private run: Run | null = null;
  private other: Run | null = null;
  private view: ChartView | null = null;
  /** The moment looked at (s into the run), playing or not, and how fast. */
  t = 0;
  playing = false;
  rate: number = CONFIG.training.review.playRates[0];
  private drawn = '';
  private sinceDraw = Infinity;

  constructor(private readonly world: () => WorldState) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, (1.5 * H) / W), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.mesh.visible = false;
    this.mesh.name = 'training-review';
    const s = this.box.style;
    s.cssText = 'position:fixed;left:12px;bottom:12px;width:min(46vw,720px);border:2px solid #14202a;border-radius:6px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.45);z-index:20;display:none;background:#14202a';
    this.canvas.style.cssText = 'display:block;width:100%;height:auto;cursor:pointer';
    this.box.appendChild(this.canvas);
    document.body.appendChild(this.box);
    // Desktop: click or drag along the time bar to go to that moment; a click on the chart plays or pauses.
    let dragging = false;
    const at = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      const [px, py] = at(e);
      if (py >= H - BAR) {
        dragging = true;
        this.canvas.setPointerCapture(e.pointerId);
        this.seekToBar(px);
      } else if (px < W - SIDE && this.run) this.playing = !this.playing;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (dragging) this.seekToBar(at(e)[0]);
    });
    this.canvas.addEventListener('pointerup', () => (dragging = false));
  }

  /** The time bar's ends (canvas px). */
  private static readonly BAR_X0 = 90;
  private static readonly BAR_X1 = W - 30;

  private seekToBar(px: number): void {
    if (!this.run) return;
    this.playing = false;
    const k = (px - ReviewPanel.BAR_X0) / (ReviewPanel.BAR_X1 - ReviewPanel.BAR_X0);
    this.seek(k * this.run.header.duration);
  }

  /** The career map's sharp coast needs the world view's terrains (as the planning chart). */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.painter.setLandSource(source);
  }

  get open(): boolean {
    return !!this.run;
  }

  get current(): Run | null {
    return this.run;
  }

  /** Look at `run` (`other`: the other attempt, drawn grey), from its start; in VR in front of you, on the desktop at the side. */
  show(run: Run, other: Run | null, inXR: boolean, camera: THREE.Camera, parent: THREE.Object3D): void {
    this.run = run;
    this.other = other;
    this.view = frameRuns(other ? [run, other] : [run], W - SIDE, H - BAR);
    this.t = 0;
    this.playing = false;
    this.drawn = '';
    if (inXR) {
      // 1.3 m ahead at eye height, turned to face you, carried with you as the menu is.
      const eye = camera.getWorldPosition(new THREE.Vector3());
      const dir = camera.getWorldDirection(new THREE.Vector3());
      dir.y = 0;
      dir.normalize();
      // (Placed in world terms with no parent, then handed to the rig keeping where it is.)
      this.mesh.removeFromParent();
      this.mesh.position.copy(eye).addScaledVector(dir, 1.3);
      this.mesh.lookAt(eye.x, this.mesh.position.y, eye.z);
      this.mesh.updateMatrixWorld();
      parent.attach(this.mesh);
      this.mesh.visible = true;
      this.box.style.display = 'none';
    } else {
      this.mesh.visible = false;
      this.box.style.display = 'block';
    }
  }

  close(): void {
    this.run = null;
    this.other = null;
    this.playing = false;
    this.mesh.visible = false;
    this.box.style.display = 'none';
  }

  /** To `t` s (kept within the run). */
  seek(t: number): void {
    if (!this.run) return;
    this.t = Math.max(0, Math.min(this.run.header.duration, t));
  }

  /** Each frame: play on, and draw again when something changed (at most CONFIG.training.review's few times a second while playing). */
  update(dt: number): void {
    if (!this.run) return;
    if (this.playing) {
      this.seek(this.t + dt * this.rate);
      if (this.t >= this.run.header.duration) this.playing = false;
    }
    this.sinceDraw += dt;
    const key = `${this.run.header.id}|${this.other?.header.id ?? ''}|${this.t.toFixed(1)}`;
    if (key === this.drawn || (this.playing && this.sinceDraw < 1 / 12)) return;
    this.drawn = key;
    this.sinceDraw = 0;
    this.paint();
    this.texture.needsUpdate = true;
  }

  private paint(): void {
    const g = this.g;
    const run = this.run!;
    const v = this.view!;
    const cw = W - SIDE;
    const ch = H - BAR;
    const ui = 1.4;
    // The chart: the harbour as the planning chart draws it, without anyone's boat or plan on it.
    g.save();
    g.beginPath();
    g.rect(0, 0, cw, ch);
    g.clip();
    const bare = { ...this.world(), vessels: {}, plan: undefined } as WorldState;
    // (Still outlining some of the coast: drawn again next frame.)
    const pending = this.painter.paint(g, cw, ch, bare, v, ui, '', null, false);
    if (pending) this.drawn = '';
    const mpp = v.span / cw;
    const toPx = (x: number, z: number): [number, number] => [cw / 2 + (x - v.cx) / mpp, ch / 2 + (z - v.cz) / mpp];
    // The quays, piers and jetties (the planning chart leaves them out; here they're what she's judged against).
    g.fillStyle = '#a7a59c';
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    for (const b of BLOCKS) {
      if (b.farm) continue;
      const yaw = (b.yawDeg * Math.PI) / 180;
      // Block-local across (lx) and along (lz) to world, as world/berths.ts places them.
      const corner = (lx: number, lz: number) => toPx(b.x + lx * Math.cos(yaw) - lz * Math.sin(yaw), b.z + lx * Math.sin(yaw) + lz * Math.cos(yaw));
      const pts = [corner(-b.halfWidth, -b.halfLength), corner(b.halfWidth, -b.halfLength), corner(b.halfWidth, b.halfLength), corner(-b.halfWidth, b.halfLength)];
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
      g.fill();
      g.stroke();
    }
    const track = (r: Run, grey: boolean) => {
      const n = sampleCount(r);
      const w = r.header.fields.length;
      // (The other attempt wide and pale underneath, so it shows where the two run together.)
      g.lineWidth = grey ? 11 : 5;
      g.lineCap = 'round';
      for (let i = 1; i < n; i++) {
        const [ax, ay] = toPx(r.samples[(i - 1) * w + 1], r.samples[(i - 1) * w + 3]);
        const [bx, by] = toPx(r.samples[i * w + 1], r.samples[i * w + 3]);
        g.strokeStyle = grey ? 'rgba(90,100,110,0.35)' : speedColour(Math.hypot(r.samples[i * w + 8], r.samples[i * w + 10]) / KN);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
    };
    if (this.other) track(this.other, true);
    track(run, false);
    // The pins: each event where she was.
    for (const e of run.events) {
      if (e.kind === 'radio' || e.kind === 'horn') continue;
      const [px, py] = toPx(e.x, e.z);
      g.fillStyle = PIN[e.kind] ?? INK;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.beginPath();
      if (e.kind === 'fault') g.arc(px, py, e.weight === 3 ? 11 : 8, 0, Math.PI * 2);
      else if (e.kind === 'result' || e.kind === 'start') g.rect(px - 7, py - 7, 14, 14);
      else g.arc(px, py, 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (e.kind === 'fault') {
        g.fillStyle = '#ffffff';
        g.font = 'bold 12px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(e.weight === 3 ? '✕' : String(e.weight ?? ''), px, py + 0.5);
        g.textAlign = 'left';
      }
    }
    // The boat where she was at this moment, to scale where the chart is close enough.
    const s = sampleAt(run, this.t);
    const [bx, by] = toPx(s.x, s.z);
    const len = Math.max(16, 10 / mpp);
    g.save();
    g.translate(bx, by);
    g.rotate((sampleHeading(s) * Math.PI) / 180);
    g.fillStyle = '#ffc21a';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -len / 2);
    g.lineTo(len * 0.24, -len * 0.15);
    g.lineTo(len * 0.22, len / 2);
    g.lineTo(-len * 0.22, len / 2);
    g.lineTo(-len * 0.24, -len * 0.15);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.restore();

    // The side column: the run, its verdict, this moment's numbers, the event here.
    g.fillStyle = '#f4f3ee';
    g.fillRect(cw, 0, SIDE, ch);
    g.fillStyle = INK;
    g.textBaseline = 'alphabetic';
    let y = 40;
    g.font = 'bold 26px system-ui, sans-serif';
    g.fillText(run.header.name, cw + 18, y, SIDE - 30);
    y += 28;
    g.font = '17px system-ui, sans-serif';
    g.fillStyle = '#56616b';
    g.fillText(`Attempt ${run.header.attempt} · ${run.header.date.slice(0, 16).replace('T', ' ')}`, cw + 18, y, SIDE - 30);
    y += 34;
    const verdict = run.header.passed === null ? 'NO VERDICT' : run.header.passed ? 'PASSED' : 'TRY AGAIN';
    g.fillStyle = run.header.passed === null ? '#56616b' : run.header.passed ? '#2e7d4f' : '#b5361b';
    g.font = 'bold 28px system-ui, sans-serif';
    g.fillText(verdict, cw + 18, y);
    y += 24;
    g.font = '16px system-ui, sans-serif';
    g.fillStyle = INK;
    y = wrap(g, run.header.reason, cw + 18, y, SIDE - 36, 20) + 14;
    g.strokeStyle = '#d3d2c8';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cw + 18, y);
    g.lineTo(W - 18, y);
    g.stroke();
    y += 30;
    for (const [k, val] of reviewNumbers(run, this.t)) {
      g.font = '16px system-ui, sans-serif';
      g.fillStyle = '#56616b';
      g.fillText(k, cw + 18, y);
      g.font = 'bold 18px ui-monospace, Menlo, Consolas, monospace';
      g.fillStyle = INK;
      g.textAlign = 'right';
      g.fillText(val, W - 18, y);
      g.textAlign = 'left';
      y += 28;
    }
    const e = eventAt(run, this.t);
    if (e && this.t - e.t < 6) {
      y += 8;
      g.fillStyle = PIN[e.kind] ?? INK;
      g.font = 'bold 16px system-ui, sans-serif';
      y = wrap(g, `${clock(e.t)}  ${e.text}`, cw + 18, y, SIDE - 36, 20);
    }
    if (this.other) {
      g.fillStyle = '#56616b';
      g.font = '14px system-ui, sans-serif';
      wrap(g, `Grey: attempt ${this.other.header.attempt} (${this.other.header.passed === null ? 'no verdict' : this.other.header.passed ? 'passed' : 'try again'})`, cw + 18, ch - 24, SIDE - 36, 18);
    }

    // The time bar: the run's length, its events as ticks, this moment.
    g.fillStyle = '#14202a';
    g.fillRect(0, ch, W, BAR);
    const x0 = ReviewPanel.BAR_X0;
    const x1 = ReviewPanel.BAR_X1;
    const dur = Math.max(1, run.header.duration);
    const tx = (t: number) => x0 + ((x1 - x0) * t) / dur;
    g.fillStyle = '#3a4a58';
    g.fillRect(x0, ch + 30, x1 - x0, 8);
    g.fillStyle = '#ffc21a';
    g.fillRect(x0, ch + 30, tx(this.t) - x0, 8);
    for (const ev of run.events) {
      if (ev.kind === 'radio') continue;
      g.fillStyle = PIN[ev.kind] === INK ? '#e2e6e8' : (PIN[ev.kind] ?? '#e2e6e8');
      g.fillRect(tx(ev.t) - 2, ch + 18, 4, 32);
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(tx(this.t), ch + 34, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e2e6e8';
    g.font = 'bold 18px ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = 'middle';
    g.fillText(clock(this.t), 18, ch + 35);
    g.font = '13px system-ui, sans-serif';
    g.fillStyle = '#9aa7b0';
    g.fillText(this.playing ? `playing ×${this.rate}` : 'paused', x0, ch + 58);
    // The speed key.
    const kx = x1 - 300;
    for (let i = 0; i <= 30; i++) {
      g.fillStyle = speedColour((i / 30) * CONFIG.training.review.fastKn);
      g.fillRect(kx + i * 6, ch + 52, 6, 8);
    }
    g.fillStyle = '#9aa7b0';
    g.fillText('0', kx - 14, ch + 57);
    g.fillText(`${CONFIG.training.review.fastKn}+ kn`, kx + 192, ch + 57);
  }
}

/** Text wrapped to `width` px from (x, y); returns the y after its last line. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lh: number): number {
  let line = '';
  for (const word of text.split(' ')) {
    const tryLine = line ? `${line} ${word}` : word;
    if (g.measureText(tryLine).width > width && line) {
      g.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = tryLine;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}
