/**
 * The whiteboard in the wheelhouse, drawn on one canvas texture (one draw call for all
 * the notes; redrawn only when something changes), and the hands on it:
 *
 * VR (either controller): point at the board and pull the trigger -
 *   - on empty board: write a new note there (the note keyboard opens);
 *   - on a note: drag it (hold the trigger, let go where it should go); let go off the
 *     board to take it down.
 * Desktop (reticle): click empty board to write a note (your keyboard); click a note to
 * pick it up, click again to put it down - off the board takes it down.
 */
import * as THREE from 'three';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import type { Handedness } from '../player/xrInput';
import { part } from '../render/geometryUtils';
import { NOTE_COLOURS, type Note } from './board';

const CW = 768;
/** Note size as a fraction of the board width. */
const NOTE = 0.2;
/** How far the board can be pointed at from (m). */
const REACH = 5;

export interface BoardContext {
  world: WorldState;
  push(control: string, ref: string, args?: number[]): void;
  /** Start writing a note at (x, y) on the board. */
  compose(x: number, y: number): void;
  pulse(hand: Handedness, intensity: number, ms: number): void;
}

interface Drag {
  id: string;
  hand: Handedness | 'desk';
  x: number;
  y: number;
  /** Pointing off the board: letting go takes the note down. */
  off: boolean;
}

export class BoardView {
  readonly root = new THREE.Group();
  readonly rayLine: THREE.Line;
  private readonly surface: THREE.Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly ch: number;
  private signature = '';
  private hover: string | null = null;
  private drag: Drag | null = null;
  private readonly inv = new THREE.Matrix4();
  private readonly lray = new THREE.Ray();
  private readonly hitP = new THREE.Vector3();
  /** Its frame and pen tray (root axes), to be merged with the boat's other fixed parts. */
  readonly fixedParts: THREE.BufferGeometry[];

  constructor(
    private readonly w: number,
    private readonly h: number,
  ) {
    this.root.name = 'whiteboard';
    // Frame (behind and around the surface) - the board faces +z.
    const t = 0.025;
    this.fixedParts = [
      part(new THREE.BoxGeometry(w + 2 * t, h + 2 * t, 0.02).translate(0, 0, -0.012), 0x8a9096),
      part(new THREE.BoxGeometry(w * 0.5, 0.025, 0.05).translate(0, -h / 2 - t - 0.012, 0.012), 0x8a9096), // pen tray
    ];
    this.ch = Math.round((CW * h) / w);
    this.canvas.width = CW;
    this.canvas.height = this.ch;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.surface.name = 'whiteboardSurface';
    this.root.add(this.surface);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.rayLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fd6ff }));
    this.rayLine.visible = false;
    this.rayLine.frustumCulled = false;
  }

  /** Where a ray meets the board: (x, y) from the top-left (may be outside 0..1). */
  private hit(ray: THREE.Ray): { x: number; y: number; point: THREE.Vector3 } | null {
    this.root.updateWorldMatrix(true, false);
    this.inv.copy(this.root.matrixWorld).invert();
    this.lray.copy(ray).applyMatrix4(this.inv);
    if (this.lray.direction.z >= -1e-4 || this.lray.origin.z <= 0) return null; // from in front only
    const t = -this.lray.origin.z / this.lray.direction.z;
    const p = this.lray.at(t, this.hitP);
    if (p.distanceTo(this.lray.origin) > REACH) return null;
    return { x: p.x / this.w + 0.5, y: 0.5 - p.y / this.h, point: this.hitP.applyMatrix4(this.root.matrixWorld) };
  }

  /** How far along this ray the board is (m), if it hits inside it, else null. */
  rayDistance(ray: THREE.Ray): number | null {
    const hit = this.hit(ray);
    return hit && BoardView.inside(hit.x, hit.y) ? hit.point.distanceTo(ray.origin) : null;
  }

  private noteAt(world: WorldState, x: number, y: number): Note | null {
    const notes = world.board?.notes ?? [];
    const hw = NOTE / 2;
    const hh = (NOTE * this.w) / this.h / 2;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (Math.abs(n.x - x) <= hw && Math.abs(n.y - y) <= hh) return n;
    }
    return null;
  }

  private static inside(x: number, y: number): boolean {
    return x >= 0 && x <= 1 && y >= 0 && y <= 1;
  }

  /** Is this hand busy with the board (dragging a note)? */
  busy(hand: Handedness): boolean {
    return this.drag?.hand === hand;
  }

  get deskDragging(): boolean {
    return this.drag?.hand === 'desk';
  }

  private finish(ctx: BoardContext): void {
    const d = this.drag!;
    this.drag = null;
    if (d.off) ctx.push('noteDelete', d.id);
    else ctx.push('noteMove', d.id, [d.x, d.y]);
  }

  /** VR: either hand's ray and trigger. Returns the hands on the board (their trigger is ours). */
  updateXR(ctx: BoardContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    this.hover = null;
    this.rayLine.visible = false;
    if (this.drag && this.drag.hand !== 'desk') {
      const f = hands[this.drag.hand];
      used[this.drag.hand] = true;
      const hit = f.tracked ? this.hit(f.ray) : null;
      this.drag.off = !hit || !BoardView.inside(hit.x, hit.y);
      if (hit) {
        this.drag.x = hit.x;
        this.drag.y = hit.y;
        this.showRay(f.ray.origin, hit.point);
      }
      if (!f.tracked || !f.triggerDown) {
        ctx.pulse(this.drag.hand, 0.4, 30);
        this.finish(ctx);
      }
      return used;
    }
    for (const h of ['right', 'left'] as const) {
      const f = hands[h];
      if (!f.tracked || busy[h]) continue;
      const hit = this.hit(f.ray);
      if (!hit || !BoardView.inside(hit.x, hit.y)) continue;
      used[h] = true;
      this.showRay(f.ray.origin, hit.point);
      const n = this.noteAt(ctx.world, hit.x, hit.y);
      this.hover = n?.id ?? null;
      if (f.triggerPressed) {
        ctx.pulse(h, 0.5, 30);
        if (n) this.drag = { id: n.id, hand: h, x: n.x, y: n.y, off: false };
        else ctx.compose(hit.x, hit.y);
      }
      break;
    }
    return used;
  }

  /** Desktop: the reticle label (or null if it isn't on the board / carrying a note). */
  label(ctx: BoardContext, ray: THREE.Ray | null): string | null {
    this.hover = null;
    const hit = ray ? this.hit(ray) : null;
    if (this.drag?.hand === 'desk') {
      this.drag.off = !hit || !BoardView.inside(hit.x, hit.y);
      if (hit) {
        this.drag.x = hit.x;
        this.drag.y = hit.y;
      }
      return this.drag.off ? 'note\nclick here to take it down' : 'note\nclick to put it here';
    }
    if (!hit || !BoardView.inside(hit.x, hit.y)) return null;
    const n = this.noteAt(ctx.world, hit.x, hit.y);
    this.hover = n?.id ?? null;
    return n ? `note${n.by ? ` by ${n.by}` : ''}\nclick to move it (off the board to take it down)` : 'whiteboard\nclick to write a note here';
  }

  /** Desktop click: true if the board took it. */
  click(ctx: BoardContext, ray: THREE.Ray | null): boolean {
    if (this.drag?.hand === 'desk') {
      this.finish(ctx);
      return true;
    }
    const hit = ray ? this.hit(ray) : null;
    if (!hit || !BoardView.inside(hit.x, hit.y)) return false;
    const n = this.noteAt(ctx.world, hit.x, hit.y);
    if (n) this.drag = { id: n.id, hand: 'desk', x: n.x, y: n.y, off: false };
    else ctx.compose(hit.x, hit.y);
    return true;
  }

  /** Redraw if the notes, the hover or a drag changed. */
  update(world: WorldState): void {
    const b = world.board;
    // A note being dragged that someone else has taken down: stop.
    if (this.drag && !b?.notes.some((n) => n.id === this.drag!.id)) this.drag = null;
    const d = this.drag;
    const sig = `${b?.seq ?? 0}|${b?.notes.length ?? 0}|${this.hover}|${d ? `${d.id}:${d.x.toFixed(3)},${d.y.toFixed(3)},${d.off}` : ''}`;
    if (sig === this.signature) return;
    this.signature = sig;
    this.draw(b?.notes ?? []);
  }

  private draw(notes: Note[]): void {
    const g = this.g;
    g.fillStyle = '#f4f6f4';
    g.fillRect(0, 0, CW, this.ch);
    if (!notes.length) {
      g.fillStyle = '#9aa4a8';
      g.font = 'italic 28px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Point and click (VR: trigger) to add a note', CW / 2, this.ch / 2);
      g.textAlign = 'left';
    }
    const size = NOTE * CW;
    const d = this.drag;
    for (const n of notes) {
      const dragged = d?.id === n.id;
      const x = (dragged ? d.x : n.x) * CW - size / 2;
      const y = (dragged ? d.y : n.y) * this.ch - size / 2;
      g.globalAlpha = dragged && d.off ? 0.45 : 1;
      // Shadow, paper, text.
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + 4, y + 5, size, size);
      g.fillStyle = NOTE_COLOURS[n.colour] ?? NOTE_COLOURS[0];
      g.fillRect(x, y, size, size);
      if (n.id === this.hover || dragged) {
        g.strokeStyle = dragged && d.off ? '#d0402a' : '#2a6fd0';
        g.lineWidth = 4;
        g.strokeRect(x + 2, y + 2, size - 4, size - 4);
      }
      g.fillStyle = '#1d2326';
      g.font = 'bold 25px system-ui, sans-serif';
      g.textBaseline = 'top';
      wrap(g, n.text, size - 16)
        .slice(0, 5)
        .forEach((line, i) => g.fillText(line, x + 8, y + 8 + i * 28));
      if (n.by) {
        g.font = '15px system-ui, sans-serif';
        g.fillStyle = '#4a5458';
        g.fillText(`– ${n.by}`, x + 8, y + size - 22, size - 16);
      }
      g.globalAlpha = 1;
    }
    this.texture.needsUpdate = true;
  }

  private showRay(from: THREE.Vector3, to: THREE.Vector3): void {
    const pos = this.rayLine.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    this.rayLine.visible = true;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
