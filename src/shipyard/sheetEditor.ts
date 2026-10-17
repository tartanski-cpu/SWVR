/**
 * The sketch sheet (notes.ts `sheet` and `ink`): a snapshot of the 3D view to draw on with a
 * pen, like marking up a screenshot (owner: draw on top of 2D, not in 3D space). Freehand,
 * for talking a change over ("the house too far forward", an arrow, a circle round the
 * crane); decisions then go on her as pins (pinGear.ts).
 *
 * Everyone in the session sees the strokes as they're added (each stroke is a note of its
 * own). Strokes are kept in the sheet's own 0..1 coordinates, so they sit on the picture
 * whatever size the sheet is shown at. Page code: this draws and takes input; the page
 * says what's on the sheet and stores what's drawn (callbacks).
 */
import type { Ink, Sheet } from './notes';

export interface SheetHost {
  sheet(id: string): Sheet | undefined;
  ink(id: string): Ink[];
  /** Who's drawing: their name and colour, for new strokes. */
  author(): { by: string; colour: string };
  addInk(sheet: string, pts: [number, number][]): void;
  dropInk(id: string): void;
}

export class SheetEditor {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly img = new Image();
  private open: string | null = null;
  private stroke: [number, number][] | null = null;

  constructor(private readonly host: SheetHost) {
    this.root = document.createElement('div');
    this.root.id = 'sheetEditor';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="sheetBox">
      <div class="sheetHead"><b class="sheetTitle"></b>
        <button class="undoInk">Undo my last stroke</button><button class="clearInk">Clear mine</button>
        <button class="closeSheet">Done</button></div>
      <div class="sheetHint"></div>
      <div class="sheetArea"><canvas></canvas></div>
    </div>`;
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.g = this.canvas.getContext('2d')!;
    this.img.onload = () => this.draw();
    this.q('.undoInk').onclick = () => {
      const mine = this.host.ink(this.open ?? '').filter((i) => i.by === this.host.author().by);
      const last = mine[mine.length - 1];
      if (last) this.host.dropInk(last.id);
    };
    this.q('.clearInk').onclick = () => {
      for (const i of this.host.ink(this.open ?? '')) if (i.by === this.host.author().by) this.host.dropInk(i.id);
    };
    this.q('.closeSheet').onclick = () => this.close();
    this.root.addEventListener('pointerdown', (e) => e.target === this.root && this.close());
    window.addEventListener('resize', () => this.isOpen && this.fit());
    // Drawing.
    this.canvas.addEventListener('pointerdown', (e) => {
      this.stroke = [this.at(e)];
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.stroke) return;
      const p = this.at(e);
      const last = this.stroke[this.stroke.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.003 || this.stroke.length >= 400) return;
      this.stroke.push(p);
      this.draw();
    });
    this.canvas.addEventListener('pointerup', () => {
      const s = this.stroke;
      this.stroke = null;
      if (s && s.length >= 2 && this.open) this.host.addInk(this.open, s);
      this.draw();
    });
  }

  private q(sel: string): HTMLElement {
    return this.root.querySelector<HTMLElement>(sel)!;
  }

  get isOpen(): boolean {
    return !!this.open;
  }
  get current(): string | null {
    return this.open;
  }

  show(id: string): void {
    const s = this.host.sheet(id);
    if (!s) return;
    this.open = id;
    this.root.hidden = false;
    this.q('.sheetTitle').textContent = s.title || 'Sketch';
    this.q('.sheetHint').textContent = `Taken by ${s.by}: draw on it to talk it over; everyone in the session sees it. Agreed on something? Put a pin on her (📍 Pin) with the equipment you want there.`;
    this.img.src = s.image;
    this.fit();
  }

  close(): void {
    this.open = null;
    this.root.hidden = true;
  }

  /** The sheet's notes changed (someone drew, or it went): redraw, or close if it's gone. */
  refresh(): void {
    if (!this.open) return;
    if (!this.host.sheet(this.open)) return this.close();
    this.draw();
  }

  /** Size the canvas to the window, keeping the sheet's shape. */
  private fit(): void {
    const s = this.host.sheet(this.open ?? '');
    if (!s) return;
    const maxW = Math.min(1100, window.innerWidth - 60);
    const maxH = Math.min(680, window.innerHeight - 220);
    let w = maxW;
    let h = w / s.aspect;
    if (h > maxH) [h, w] = [maxH, maxH * s.aspect];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${Math.round(w)}px`;
    this.canvas.style.height = `${Math.round(h)}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.draw();
  }

  private at(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  private draw(): void {
    const s = this.host.sheet(this.open ?? '');
    if (!s) return;
    const { width: W, height: H } = this.canvas;
    const g = this.g;
    g.clearRect(0, 0, W, H);
    if (this.img.complete) g.drawImage(this.img, 0, 0, W, H);
    const lw = Math.max(2, W / 400);
    const line = (pts: [number, number][], colour: string, dashed = false) => {
      g.strokeStyle = colour;
      g.lineWidth = lw;
      g.lineCap = g.lineJoin = 'round';
      g.setLineDash(dashed ? [lw * 3, lw * 2] : []);
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
      g.stroke();
    };
    for (const i of this.host.ink(s.id)) line(i.pts, i.colour);
    if (this.stroke) line(this.stroke, this.host.author().colour);
    g.setLineDash([]);
  }
}
