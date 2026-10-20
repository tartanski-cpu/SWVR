import * as THREE from 'three';

/**
 * A flat, canvas-drawn menu panel: rows of buttons on one textured quad (one draw call).
 * It knows nothing about the game - rows are built from closures (see mainMenu.ts).
 *
 * Pointing: `hitRay` (VR pointer ray or desktop reticle) and `hitPoint` (VR fingertip
 * poke) map a world position to the button under it via the quad's local frame:
 * x right, y up, +z towards the viewer.
 */
export interface MenuButton {
  text: string | (() => string);
  /** Draw as selected / on. */
  active?: () => boolean;
  /** Omit for a read-only value box. */
  press?: () => void;
  /** Relative width within the row (default 1). */
  weight?: number;
  /** Drawn as a section tab (flat, underlined when active) rather than a raised button. */
  tab?: boolean;
}

export type MenuRow = { heading: string } | { label: string; buttons: MenuButton[] };

/** A section of a tab: its own rows, picked from a second, smaller tab bar. */
export interface MenuSection {
  name: string;
  rows: MenuRow[];
}

/** A tab of the menu: rows, or sections of rows. */
export interface MenuPage {
  name: string;
  rows?: MenuRow[];
  sections?: MenuSection[];
  /** Left out of the tab bar while this says so (e.g. Debug, until switched on in Settings). */
  hidden?: () => boolean;
}

interface Placed {
  btn: MenuButton;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  placed: Placed[];
  headings: { text: string; y: number }[];
  labels: { text: string; y: number }[];
}

const W = 640;
const PAD = 14;
const ROW_H = 54;
const HEAD_H = 40;
const LABEL_W = 206;
const GAP = 8;

const COLORS = {
  bg: 'rgba(14, 22, 26, 0.92)',
  border: '#5f8794',
  heading: '#8fd3e6',
  label: '#d9e4e6',
  button: '#2a3c44',
  buttonHover: '#3f6170',
  active: '#d18a2c',
  activeHover: '#e8a347',
  tab: '#1b2a30',
  text: '#f2f5f5',
  value: '#ffd27a',
};

/**
 * Layout: `header` rows (always shown), a tab bar of the pages not hidden, a section bar
 * when the page has sections, then the current page's (or section's) rows. The quad is as
 * tall as the tallest page, so it doesn't change size when you switch tabs.
 */
export class MenuPanel {
  readonly mesh: THREE.Mesh;
  /** World size of the quad (m). */
  readonly width: number;
  readonly height: number;
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly fixed: Layout = { placed: [], headings: [], labels: [] };
  /** Per page: one layout per section (or one for a page of plain rows), and its section bar. */
  private readonly layouts: { content: Layout[]; bar: Layout | null }[] = [];
  private readonly pages: MenuPage[];
  private page = 0;
  /** The section shown on each page (remembered when you switch tabs and back). */
  private readonly section: number[];
  private readonly tabsY: number;
  private tabs: Layout = { placed: [], headings: [], labels: [] };
  private tabsKey = '';
  private hover: MenuButton | null = null;
  private signature = '';
  private readonly raycaster = new THREE.Raycaster();
  private readonly local = new THREE.Vector3();

  constructor(header: MenuRow[], pages: MenuPage[], widthM: number) {
    this.pages = pages;
    this.section = pages.map(() => 0);
    const y = this.layoutRows(header, PAD, this.fixed);
    this.tabsY = y;
    const top = y + (pages.length > 1 ? ROW_H : 0);
    let bottom = top;
    pages.forEach((p, i) => {
      if (p.sections) {
        const bar: Layout = { placed: [], headings: [], labels: [] };
        const sectionRow: MenuRow = {
          label: '',
          buttons: p.sections.map((sec, k) => ({ text: sec.name, tab: true, active: () => this.section[i] === k, press: () => (this.section[i] = k) })),
        };
        const y0 = this.layoutRows([sectionRow], top, bar);
        const content = p.sections.map((sec) => {
          const l: Layout = { placed: [], headings: [], labels: [] };
          bottom = Math.max(bottom, this.layoutRows(sec.rows, y0 + 6, l));
          return l;
        });
        this.layouts.push({ content, bar });
      } else {
        const l: Layout = { placed: [], headings: [], labels: [] };
        bottom = Math.max(bottom, this.layoutRows(p.rows ?? [], top + 6, l));
        this.layouts.push({ content: [l], bar: null });
      }
    });
    const H = Math.ceil(bottom + PAD);
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.width = widthM;
    this.height = (widthM * H) / W;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, this.height),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, fog: false }),
    );
    this.mesh.name = 'menuPanel';
    this.refresh(true);
  }

  /**
   * The tab bar, laid out again whenever the set of shown pages changes (a hidden page's
   * tab drops out and the others widen). If the page you're on is hidden, go to the first.
   */
  private tabBar(): Layout {
    if (this.pages.length < 2) return this.tabs;
    const shown = this.pages.map((p, i) => (p.hidden?.() ? -1 : i)).filter((i) => i >= 0);
    const key = shown.join(',');
    if (key !== this.tabsKey) {
      this.tabsKey = key;
      this.tabs = { placed: [], headings: [], labels: [] };
      this.layoutRows([{ label: '', buttons: shown.map((i) => ({ text: this.pages[i].name, active: () => this.page === i, press: () => (this.page = i) })) }], this.tabsY, this.tabs);
    }
    if (!shown.includes(this.page)) this.page = shown[0] ?? 0;
    return this.tabs;
  }

  private layoutRows(rows: MenuRow[], y: number, out: Layout): number {
    for (const row of rows) {
      if ('heading' in row) {
        out.headings.push({ text: row.heading, y });
        y += HEAD_H;
        continue;
      }
      out.labels.push({ text: row.label, y });
      const x0 = row.label ? LABEL_W : PAD;
      const total = row.buttons.reduce((s, b) => s + (b.weight ?? 1), 0);
      const span = W - PAD - x0 - GAP * (row.buttons.length - 1);
      let x = x0;
      for (const btn of row.buttons) {
        const w = (span * (btn.weight ?? 1)) / total;
        out.placed.push({ btn, x, y: y + 4, w, h: ROW_H - 8 });
        x += w + GAP;
      }
      y += ROW_H;
    }
    return y;
  }

  /** Switch to the named tab, and section (for code and tests; players press the tabs). */
  showPage(name: string, section?: string): void {
    const i = this.pages.findIndex((p) => p.name === name);
    if (i < 0) return;
    this.page = i;
    const k = this.pages[i].sections?.findIndex((s) => s.name === section) ?? -1;
    if (k >= 0) this.section[i] = k;
  }

  /**
   * Centre of a visible button in the quad's local frame (m), or null if it isn't on the
   * current page. Used by tests to aim at buttons.
   */
  localCentreOf(btn: MenuButton): { x: number; y: number } | null {
    const p = this.visible().find((q) => q.btn === btn);
    if (!p) return null;
    return {
      x: ((p.x + p.w / 2) / W - 0.5) * this.width,
      y: (0.5 - (p.y + p.h / 2) / this.canvas.height) * this.height,
    };
  }

  /** What's on screen now: header, tab bar, section bar, content. */
  private current(): Layout[] {
    const tabs = this.tabBar();
    const l = this.layouts[this.page];
    const out = [this.fixed, tabs];
    if (l?.bar) out.push(l.bar);
    if (l) out.push(l.content[this.section[this.page]] ?? l.content[0]);
    return out;
  }

  private visible(): Placed[] {
    return this.current().flatMap((l) => l.placed);
  }

  /** Button under a world ray within `far` metres, with the hit point and distance. */
  hitRay(ray: THREE.Ray, far: number): { btn: MenuButton | null; point: THREE.Vector3; distance: number } | null {
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = far;
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    if (!hit?.uv) return null;
    return { btn: this.buttonAt(hit.uv.x * W, (1 - hit.uv.y) * this.canvas.height), point: hit.point, distance: hit.distance };
  }

  /**
   * Fingertip poke: if a world point is over the panel and within `reach` of its surface,
   * the button under it and the signed depth (m, + in front of the panel).
   */
  hitPoint(world: THREE.Vector3, reach: number): { btn: MenuButton | null; depth: number } | null {
    this.mesh.worldToLocal(this.local.copy(world));
    const { x, y, z } = this.local;
    if (Math.abs(x) > this.width / 2 || Math.abs(y) > this.height / 2 || z > reach || z < -reach) return null;
    const px = (x / this.width + 0.5) * W;
    const py = (0.5 - y / this.height) * this.canvas.height;
    return { btn: this.buttonAt(px, py), depth: z };
  }

  setHover(btn: MenuButton | null): void {
    this.hover = btn;
  }

  /** Redraw if anything shown changed (cheap check; call every frame while visible). */
  refresh(force = false): void {
    const sig = `${this.page}.${this.section[this.page]}#` + this.visible().map((p) => `${text(p.btn)}|${p.btn.active?.() ? 1 : 0}|${p.btn === this.hover ? 1 : 0}`).join(';');
    if (!force && sig === this.signature) return;
    this.signature = sig;
    this.draw();
  }

  /** The drawn canvas itself (the flat desktop menu shows it as a page element). */
  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  /** The canvas's drawn size (px). */
  get pixelSize(): { w: number; h: number } {
    return { w: this.canvas.width, h: this.canvas.height };
  }

  /** Flat menu: the button under a canvas pixel, hovered. */
  hoverAt(px: number, py: number): MenuButton | null {
    const b = this.buttonAt(px, py);
    this.setHover(b);
    this.refresh();
    return b;
  }

  private buttonAt(px: number, py: number): MenuButton | null {
    for (const p of this.visible()) {
      // A button with no text is hidden (e.g. an empty cargo row) and can't be pressed.
      if (p.btn.press && text(p.btn) !== '' && px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) return p.btn;
    }
    return null;
  }

  private draw(): void {
    const { g, canvas } = this;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = COLORS.bg;
    roundRect(g, 2, 2, canvas.width - 4, canvas.height - 4, 18);
    g.fill();
    g.strokeStyle = COLORS.border;
    g.lineWidth = 3;
    g.stroke();

    const shown = this.current();
    const headings = shown.flatMap((l) => l.headings);
    const labels = shown.flatMap((l) => l.labels);
    // The section bar sits on a darker strip, so it reads as part of the tab above it.
    const bar = this.layouts[this.page]?.bar;
    if (bar?.placed.length) {
      const y = bar.placed[0].y - 4;
      g.fillStyle = COLORS.tab;
      g.fillRect(PAD, y, W - 2 * PAD, ROW_H);
    }
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = 'bold 24px system-ui, sans-serif';
    g.fillStyle = COLORS.heading;
    for (const h of headings) g.fillText(h.text.toUpperCase(), PAD + 4, h.y + HEAD_H / 2 + 4);
    g.font = '23px system-ui, sans-serif';
    g.fillStyle = COLORS.label;
    for (const l of labels) if (l.text) g.fillText(l.text, PAD + 4, l.y + ROW_H / 2, LABEL_W - PAD - 10);

    g.textAlign = 'center';
    for (const p of this.visible()) {
      if (text(p.btn) === '') continue;
      const hover = p.btn === this.hover;
      const active = p.btn.active?.() ?? false;
      if (p.btn.tab) {
        // Section tab: flat text, underlined in the accent colour when it's the one shown.
        g.fillStyle = hover ? COLORS.buttonHover : COLORS.tab;
        roundRect(g, p.x, p.y, p.w, p.h, 8);
        g.fill();
        if (active) {
          g.fillStyle = COLORS.active;
          g.fillRect(p.x + 10, p.y + p.h - 6, p.w - 20, 4);
        }
        g.fillStyle = active ? COLORS.text : COLORS.label;
        g.font = `${active ? 'bold ' : ''}22px system-ui, sans-serif`;
      } else if (p.btn.press) {
        g.fillStyle = active ? (hover ? COLORS.activeHover : COLORS.active) : hover ? COLORS.buttonHover : COLORS.button;
        roundRect(g, p.x, p.y, p.w, p.h, 10);
        g.fill();
        g.fillStyle = COLORS.text;
        g.font = `${active ? 'bold ' : ''}24px system-ui, sans-serif`;
      } else {
        g.fillStyle = COLORS.value;
        g.font = 'bold 24px ui-monospace, Menlo, Consolas, monospace';
      }
      g.fillText(text(p.btn), p.x + p.w / 2, p.y + p.h / 2 + 1, p.w - 8);
    }
    this.texture.needsUpdate = true;
  }
}

function text(b: MenuButton): string {
  return typeof b.text === 'function' ? b.text() : b.text;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
