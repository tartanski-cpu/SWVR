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
}

export type MenuRow = { heading: string } | { label: string; buttons: MenuButton[] };

interface Placed {
  btn: MenuButton;
  x: number;
  y: number;
  w: number;
  h: number;
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
  text: '#f2f5f5',
  value: '#ffd27a',
};

export class MenuPanel {
  readonly mesh: THREE.Mesh;
  /** World size of the quad (m). */
  readonly width: number;
  readonly height: number;
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly placed: Placed[] = [];
  private readonly headings: { text: string; y: number }[] = [];
  private readonly labels: { text: string; y: number }[] = [];
  private hover: MenuButton | null = null;
  private signature = '';
  private readonly raycaster = new THREE.Raycaster();
  private readonly local = new THREE.Vector3();

  constructor(rows: MenuRow[], widthM: number) {
    let y = PAD;
    for (const row of rows) {
      if ('heading' in row) {
        this.headings.push({ text: row.heading, y });
        y += HEAD_H;
        continue;
      }
      this.labels.push({ text: row.label, y });
      const x0 = row.label ? LABEL_W : PAD;
      const total = row.buttons.reduce((s, b) => s + (b.weight ?? 1), 0);
      const span = W - PAD - x0 - GAP * (row.buttons.length - 1);
      let x = x0;
      for (const btn of row.buttons) {
        const w = (span * (btn.weight ?? 1)) / total;
        this.placed.push({ btn, x, y: y + 4, w, h: ROW_H - 8 });
        x += w + GAP;
      }
      y += ROW_H;
    }
    const H = Math.ceil(y + PAD);
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
    const sig = this.placed.map((p) => `${text(p.btn)}|${p.btn.active?.() ? 1 : 0}|${p.btn === this.hover ? 1 : 0}`).join(';');
    if (!force && sig === this.signature) return;
    this.signature = sig;
    this.draw();
  }

  private buttonAt(px: number, py: number): MenuButton | null {
    for (const p of this.placed) {
      if (p.btn.press && px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) return p.btn;
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

    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = 'bold 24px system-ui, sans-serif';
    g.fillStyle = COLORS.heading;
    for (const h of this.headings) g.fillText(h.text.toUpperCase(), PAD + 4, h.y + HEAD_H / 2 + 4);
    g.font = '23px system-ui, sans-serif';
    g.fillStyle = COLORS.label;
    for (const l of this.labels) if (l.text) g.fillText(l.text, PAD + 4, l.y + ROW_H / 2, LABEL_W - PAD - 10);

    g.textAlign = 'center';
    for (const p of this.placed) {
      const hover = p.btn === this.hover;
      const active = p.btn.active?.() ?? false;
      if (p.btn.press) {
        g.fillStyle = active ? (hover ? COLORS.activeHover : COLORS.active) : hover ? COLORS.buttonHover : COLORS.button;
        roundRect(g, p.x, p.y, p.w, p.h, 10);
        g.fill();
        g.fillStyle = COLORS.text;
        g.font = `${active ? 'bold ' : ''}24px system-ui, sans-serif`;
      } else {
        g.fillStyle = COLORS.value;
        g.font = 'bold 26px ui-monospace, Menlo, Consolas, monospace';
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
