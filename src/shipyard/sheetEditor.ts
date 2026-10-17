/**
 * The sketch sheet (notes.ts `sheet` and `ink`): a flat picture you draw on with a pen,
 * like marking up a screenshot (owner: draw on top of 2D, not in 3D space).
 *
 * Two kinds:
 *   a snapshot  a picture of the 3D view as it was when the sheet was made, to mark up
 *               ("the house too far forward", an arrow, a circle round the crane);
 *   a grid      squared paper, 1 m squares, with her waterline, for a first sketch of her
 *               profile: a hull pen and a house pen, then "Suggest a boat" (sketchFit.ts).
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
  addInk(sheet: string, pts: [number, number][], tag?: 'hull' | 'house'): void;
  dropInk(id: string): void;
  /** A grid sheet's "Suggest a boat". */
  suggest(sheet: Sheet): void;
}

/** The pens on a grid sheet (fixed colours: they say which part of her it is). */
const PEN = { hull: '#1f4e79', house: '#c0551f' } as const;

export class SheetEditor {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly img = new Image();
  private open: string | null = null;
  private pen: 'hull' | 'house' = 'hull';
  private stroke: [number, number][] | null = null;
  private readonly result: HTMLElement;

  constructor(private readonly host: SheetHost) {
    this.root = document.createElement('div');
    this.root.id = 'sheetEditor';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="sheetBox">
      <div class="sheetHead"><b class="sheetTitle"></b>
        <span class="pens"><button data-pen="hull" class="pen on">Hull pen</button><button data-pen="house" class="pen">House pen</button></span>
        <button class="undoInk">Undo my last stroke</button><button class="clearInk">Clear mine</button>
        <button class="suggestBtn primary">Suggest a boat</button>
        <button class="closeSheet">Done</button></div>
      <div class="sheetHint"></div>
      <div class="sheetArea"><canvas></canvas></div>
      <div class="sheetResult" hidden></div>
    </div>`;
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.g = this.canvas.getContext('2d')!;
    this.result = this.root.querySelector('.sheetResult')!;
    this.img.onload = () => this.draw();
    this.root.querySelectorAll<HTMLButtonElement>('.pen').forEach((b) => {
      b.onclick = () => {
        this.pen = b.dataset.pen as 'hull' | 'house';
        this.root.querySelectorAll('.pen').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    this.q('.undoInk').onclick = () => {
      const mine = this.host.ink(this.open ?? '').filter((i) => i.by === this.host.author().by);
      const last = mine[mine.length - 1];
      if (last) this.host.dropInk(last.id);
    };
    this.q('.clearInk').onclick = () => {
      for (const i of this.host.ink(this.open ?? '')) if (i.by === this.host.author().by) this.host.dropInk(i.id);
    };
    this.q('.suggestBtn').onclick = () => {
      const s = this.host.sheet(this.open ?? '');
      if (s) this.host.suggest(s);
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
      if (s && s.length >= 2 && this.open) this.host.addInk(this.open, s, this.isGrid ? this.pen : undefined);
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
  private get isGrid(): boolean {
    return !this.host.sheet(this.open ?? '')?.image;
  }

  show(id: string): void {
    const s = this.host.sheet(id);
    if (!s) return;
    this.open = id;
    this.root.hidden = false;
    this.result.hidden = true;
    this.q('.sheetTitle').textContent = s.title || 'Sketch';
    const grid = !s.image;
    this.q('.pens').hidden = !grid;
    this.q('.suggestBtn').hidden = !grid;
    this.q('.sheetHint').textContent = grid
      ? 'Draw her side, bow to the right: her hull with the hull pen (deck edge, stem, bottom, transom), her wheelhouse with the house pen. 1 m squares; the blue line is the waterline. Then Suggest a boat.'
      : `Drawn by ${s.by}: mark it up with your pen. Everyone in the session sees it.`;
    if (s.image) this.img.src = s.image;
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

  /** The suggestion's words, and a button to take it. */
  showResult(html: string, use: () => void): void {
    this.result.hidden = false;
    this.result.innerHTML = `${html}<div class="tools"><button class="primary useIt">Use this boat</button></div>`;
    this.result.querySelector<HTMLElement>('.useIt')!.onclick = () => {
      use();
      this.close();
    };
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
    if (s.image) {
      if (this.img.complete) g.drawImage(this.img, 0, 0, W, H);
    } else if (s.grid) this.drawGrid(s.grid, W, H);
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
    for (const i of this.host.ink(s.id)) line(i.pts, i.tag ? PEN[i.tag] : i.colour);
    if (this.stroke) line(this.stroke, this.isGrid ? PEN[this.pen] : this.host.author().colour);
    g.setLineDash([]);
  }

  /** Squared paper: 1 m squares, every 5 m bolder, the waterline in blue, a metre scale. */
  private drawGrid(grid: NonNullable<Sheet['grid']>, W: number, H: number): void {
    const g = this.g;
    g.fillStyle = '#fbfcfd';
    g.fillRect(0, 0, W, H);
    const px = W / grid.wM;
    for (let m = 0; m <= grid.wM; m++) {
      g.strokeStyle = m % 5 ? '#e3e9ee' : '#c4d0d8';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(m * px, 0);
      g.lineTo(m * px, H);
      g.stroke();
    }
    for (let m = 0; m <= grid.hM; m++) {
      const y = H - m * (H / grid.hM);
      g.strokeStyle = m % 5 ? '#e3e9ee' : '#c4d0d8';
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    const wl = H - grid.waterY * (H / grid.hM);
    g.strokeStyle = '#3d8fd1';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, wl);
    g.lineTo(W, wl);
    g.stroke();
    g.fillStyle = '#3d8fd1';
    g.font = `${Math.round(H / 32)}px system-ui, sans-serif`;
    g.fillText('waterline', 8, wl - 6);
    g.fillStyle = '#8a9aa4';
    for (let m = 0; m <= grid.wM; m += 5) g.fillText(`${m} m`, m * px + 4, H - 6);
    g.fillText('bow →', W - 60, 18);
  }
}
