/**
 * The logbook lying open on the chart table. Both pages are one canvas texture, redrawn
 * only when the log, the page shown or the hover changes.
 *
 *   left page   the voyages' entries in a handwriting font, newest at the end; ◀ ▶ at the
 *               foot to read back through earlier voyages (the page shown is per player).
 *   right page  the new entry: tick a type, then the values you read off the boat (fuel
 *               gauge); time, position and port fill in when it's signed. Touch "Sign"
 *               and the pen comes out of its holder and signs; the entry moves across.
 *
 * VR: point either controller at the book and pull the trigger on a box - or pick the pen
 * up out of its holder (grip) and touch the box with its tip, signing included. Desktop:
 * click.
 * At night the book can't be read without the chart table lamp (the page goes dark and
 * clicks just say so).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { EntityId } from '../core/ids';
import type { WorldState } from '../core/world';
import type { Handedness } from '../player/xrInput';
import { LOG_FIELDS, LOG_TITLES, LOG_TYPES, pendingEvent, type LogEntry, type LogState } from './log';

const CW = 1024;
const REACH = 3;
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const PRINT = 'Georgia, "Times New Roman", serif';
const INK = '#1d2a5a';
const LINES_PER_PAGE = 13;

export interface LogbookContext {
  world: WorldState;
  playerId: EntityId;
  push(control: string, ref?: string, args?: number[]): void;
  pulse(hand: Handedness, intensity: number, ms: number): void;
  /** Light enough to read (daylight, or the chart table lamp)? */
  canRead(): boolean;
  notify(text: string): void;
  /** Little paper sounds: a tick, the signature scribble, a page turned. */
  sound(kind: 'tick' | 'sign' | 'page'): void;
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  act: (ctx: LogbookContext) => void;
}

/** One line on the left page. */
interface Line {
  text: string;
  kind: 'voyage' | 'head' | 'body' | 'sign';
  tick?: boolean;
}

export class LogbookView {
  readonly root = new THREE.Group();
  readonly rayLine: THREE.Line;
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly pageMat: THREE.MeshBasicMaterial;
  private readonly ch: number;
  private readonly pageZ: number;
  private regions: Region[] = [];
  private hover: string | null = null;
  private signature = '';
  /** Left page shown, counted back from the newest (0 = the latest page). */
  private back = 0;
  private readonly pen: THREE.Mesh;
  private readonly penHome: THREE.Vector3;
  private penAnim = -1;
  private readonly penTo = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();
  private readonly lray = new THREE.Ray();
  private readonly hitP = new THREE.Vector3();
  private lightKey = -1;
  /** The hand holding the pen (VR), and the box its tip last touched (one press per touch). */
  private penHand: Handedness | null = null;
  private penTouched: string | null = null;
  private readonly bq = new THREE.Quaternion();

  /**
   * @param w, h  the open book's size (m)
   */
  constructor(
    private readonly w: number,
    private readonly h: number,
  ) {
    this.root.name = 'logbook';
    // Cover and the block of pages, one mesh; the pages' face is the canvas.
    const t = 0.012;
    this.pageZ = t + 0.012;
    // (The cover and page blocks are baked into the chart table's mesh.)
    this.ch = Math.round((CW * h) / w);
    this.canvas.width = CW;
    this.canvas.height = this.ch;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.pageMat = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    const page = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.pageMat);
    page.position.z = this.pageZ + 0.0005;
    page.name = 'logbookPages';
    this.root.add(page);
    // The pen, lying on the table beside the book (right of the right page) until someone signs.
    this.pen = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.004, 0.14, 8).rotateX(Math.PI / 2).translate(0, 0, 0.07), new THREE.MeshLambertMaterial({ color: 0x14213d }));
    this.penHome = new THREE.Vector3(w / 2 + 0.025, -0.06, 0.006);
    this.restPen();
    this.root.add(this.pen);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.rayLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fd6ff }));
    this.rayLine.visible = false;
    this.rayLine.frustumCulled = false;
  }

  /** Where a ray meets the pages, in canvas pixels (or null). */
  private hit(ray: THREE.Ray): { x: number; y: number; point: THREE.Vector3 } | null {
    this.root.updateWorldMatrix(true, false);
    this.inv.copy(this.root.matrixWorld).invert();
    this.lray.copy(ray).applyMatrix4(this.inv);
    const o = this.lray.origin;
    const d = this.lray.direction;
    if (d.z >= -1e-4 || o.z <= this.pageZ) return null; // from above only
    const t = (this.pageZ - o.z) / d.z;
    const p = this.lray.at(t, this.hitP);
    if (p.distanceTo(o) > REACH) return null;
    const x = (p.x / this.w + 0.5) * CW;
    const y = (0.5 - p.y / this.h) * this.ch;
    if (x < 0 || x > CW || y < 0 || y > this.ch) return null;
    return { x, y, point: this.hitP.applyMatrix4(this.root.matrixWorld) };
  }

  /** How far along this ray the pages are (m), or null if it misses them (VR: the nearer of book and whiteboard wins). */
  rayDistance(ray: THREE.Ray): number | null {
    const hit = this.hit(ray);
    return hit ? hit.point.distanceTo(ray.origin) : null;
  }

  private regionAt(x: number, y: number): Region | null {
    return this.regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ?? null;
  }

  private press(ctx: LogbookContext, r: Region | null): void {
    if (!r) return;
    if (!ctx.canRead()) {
      ctx.notify('Too dark to read the log: switch on the chart table lamp');
      return;
    }
    r.act(ctx);
  }

  /**
   * The pen in hand: it follows the hand (tip ~10 cm ahead of the grip); touching a box on
   * the page with the tip presses it, once per touch. Let go and it goes back in its holder.
   */
  private holdPen(ctx: LogbookContext, f: HandFrame, hd: Handedness): void {
    if (!f.tracked || !f.gripDown) {
      this.penHand = null;
      this.penTouched = null;
      this.restPen();
      ctx.pulse(hd, 0.3, 20);
      return;
    }
    const grip = this.hitP.copy(f.grip).applyMatrix4(this.inv);
    this.root.getWorldQuaternion(this.bq).invert();
    const q = f.quat ? this.bq.multiply(f.quat) : this.bq.identity();
    const tip = grip.add(new THREE.Vector3(0, -0.01, -0.1).applyQuaternion(q));
    // On the paper: from just above it to well through it (pushing a virtual pen into a
    // page you can't feel easily overshoots by several centimetres).
    const above = tip.z - this.pageZ;
    if (above < 0.008 && above > -0.15) {
      tip.z = this.pageZ + 0.0008; // the tip rests on the paper
      const r = this.regionAt((tip.x / this.w + 0.5) * CW, (0.5 - tip.y / this.h) * this.ch);
      if (r && r.label !== this.penTouched) {
        this.penTouched = r.label;
        ctx.pulse(hd, 0.5, 30);
        this.press(ctx, r);
      }
      this.hover = r?.label ?? null;
    } else this.penTouched = null;
    this.pen.position.copy(tip);
    this.pen.quaternion.copy(q);
  }

  /** VR: the pen in hand, or either hand's ray and trigger. Returns the hands on the book. */
  updateXR(ctx: LogbookContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    this.hover = null;
    this.rayLine.visible = false;
    this.root.updateWorldMatrix(true, false);
    this.inv.copy(this.root.matrixWorld).invert();
    if (this.penHand) {
      used[this.penHand] = true;
      this.holdPen(ctx, hands[this.penHand], this.penHand);
      if (!this.penHand) return used; // just put it down
    }
    // Pick the pen up: grip close to it.
    for (const hd of ['right', 'left'] as const) {
      const f = hands[hd];
      if (this.penHand || !f.tracked || busy[hd] || !f.gripPressed || this.penAnim >= 0) continue;
      if (this.hitP.copy(f.grip).applyMatrix4(this.inv).distanceTo(this.pen.position) < 0.09) {
        this.penHand = hd;
        used[hd] = true;
        ctx.pulse(hd, 0.5, 30);
        return used;
      }
    }
    for (const hd of ['right', 'left'] as const) {
      const f = hands[hd];
      if (!f.tracked || busy[hd] || hd === this.penHand) continue;
      const hit = this.hit(f.ray);
      if (!hit) continue;
      used[hd] = true;
      this.showRay(f.ray.origin, hit.point);
      const r = this.regionAt(hit.x, hit.y);
      this.hover = r?.label ?? null;
      if (f.triggerPressed && r) {
        ctx.pulse(hd, 0.4, 25);
        this.press(ctx, r);
      }
      break;
    }
    return used;
  }

  /** Desktop: the reticle label, or null if not on the book. */
  label(ctx: LogbookContext, ray: THREE.Ray | null): string | null {
    const hit = ray ? this.hit(ray) : null;
    if (!hit) {
      this.hover = null;
      return null;
    }
    const r = this.regionAt(hit.x, hit.y);
    this.hover = r?.label ?? null;
    if (!ctx.canRead()) return 'logbook\ntoo dark to read: switch on the chart table lamp';
    return r ? `logbook\n${r.label}` : 'logbook';
  }

  /** Desktop click: true if the book took it. */
  click(ctx: LogbookContext, ray: THREE.Ray | null): boolean {
    const hit = ray ? this.hit(ray) : null;
    if (!hit) return false;
    this.press(ctx, this.regionAt(hit.x, hit.y));
    return true;
  }

  /**
   * Redraw when needed; animate the pen. `light` is the page brightness (0..1).
   */
  update(world: WorldState, playerId: EntityId, light: number, dt: number): void {
    const log = world.log;
    const lk = Math.round(light * 50);
    if (lk !== this.lightKey) {
      this.lightKey = lk;
      this.pageMat.color.setScalar(light);
    }
    const d = log?.draft;
    const sig = `${log?.seq ?? 0}|${this.back}|${this.hover}|${d && d.by !== playerId && world.time - d.touched >= CONFIG.log.draftIdle ? 'idle' : ''}`;
    if (sig !== this.signature) {
      this.signature = sig;
      this.draw(log ?? null, world, playerId);
    }
    this.animatePen(dt);
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  private draw(log: LogState | null, world: WorldState, playerId: EntityId): void {
    const g = this.g;
    this.regions = [];
    const H = this.ch;
    // Paper, the gutter's shadow, ruled lines.
    g.fillStyle = '#f4eedb';
    g.fillRect(0, 0, CW, H);
    const grd = g.createLinearGradient(CW / 2 - 40, 0, CW / 2 + 40, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.5, 'rgba(60,40,10,0.28)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(CW / 2 - 40, 0, 80, H);
    g.strokeStyle = 'rgba(80, 120, 170, 0.25)';
    g.lineWidth = 1;
    for (let y = 92; y < H - 50; y += 40) {
      g.beginPath();
      g.moveTo(24, y);
      g.lineTo(CW / 2 - 24, y);
      g.moveTo(CW / 2 + 24, y);
      g.lineTo(CW - 24, y);
      g.stroke();
    }
    this.drawLeft(log);
    this.drawRight(log, world, playerId);
    this.texture.needsUpdate = true;
  }

  private button(x: number, y: number, w: number, h: number, label: string, act: Region['act'], text?: string, opts: { box?: boolean; ticked?: boolean; font?: string } = {}): void {
    const g = this.g;
    const hot = this.hover === label;
    if (hot) {
      g.fillStyle = 'rgba(42, 111, 208, 0.14)';
      g.fillRect(x - 4, y - 4, w + 8, h + 8);
    }
    if (opts.box !== false) {
      g.strokeStyle = hot ? '#2a6fd0' : '#3a3a3a';
      g.lineWidth = 2;
      g.strokeRect(x, y, h, h);
      if (opts.ticked) {
        g.strokeStyle = INK;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x + 5, y + h * 0.55);
        g.lineTo(x + h * 0.42, y + h - 6);
        g.lineTo(x + h + 6, y - 4);
        g.stroke();
      }
    }
    if (text) {
      g.fillStyle = '#222';
      g.font = opts.font ?? `24px ${PRINT}`;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillText(text, opts.box === false ? x : x + h + 12, y + h / 2);
    }
    this.regions.push({ x: x - 4, y: y - 4, w: w + 8, h: h + 8, label, act });
  }

  private drawLeft(log: LogState | null): void {
    const g = this.g;
    const lines = this.lines(log);
    const pages = Math.max(1, Math.ceil(lines.length / LINES_PER_PAGE));
    this.back = Math.min(this.back, pages - 1);
    const page = pages - 1 - this.back;
    g.fillStyle = '#5a3a1a';
    g.font = `bold 26px ${PRINT}`;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText("SHIP'S LOG", 34, 52);
    g.font = `18px ${PRINT}`;
    g.textAlign = 'right';
    g.fillText(`page ${page + 1} of ${pages}`, CW / 2 - 34, 52);
    if (!lines.length) {
      g.fillStyle = '#8a8070';
      g.font = `italic 22px ${PRINT}`;
      g.textAlign = 'left';
      g.fillText('No entries yet.', 40, 126);
      g.fillText('Write the first one on the right.', 40, 166);
    }
    lines.slice(page * LINES_PER_PAGE, (page + 1) * LINES_PER_PAGE).forEach((l, i) => {
      const y = 86 + i * 40;
      g.textAlign = 'left';
      if (l.kind === 'voyage') {
        g.fillStyle = '#5a3a1a';
        g.font = `bold italic 22px ${PRINT}`;
        g.fillText(l.text, 36, y);
        return;
      }
      g.fillStyle = INK;
      g.font = l.kind === 'head' ? `bold 23px ${HAND}` : l.kind === 'sign' ? `italic 20px ${HAND}` : `21px ${HAND}`;
      g.fillText(l.text, l.kind === 'head' ? 36 : 56, y, CW / 2 - 100);
      if (l.tick !== undefined) {
        const tw = Math.min(g.measureText(l.text).width, CW / 2 - 100);
        g.fillStyle = l.tick ? '#2a8a3a' : '#a02a1a';
        g.font = `bold 22px ${PRINT}`;
        g.fillText(l.tick ? '✓' : '✗', 64 + tw, y);
      }
    });
    // Page turning.
    const y = this.ch - 52;
    if (page > 0) this.button(40, y, 70, 36, '◀ earlier page', (c) => this.turn(c, 1), '◀', { box: false, font: `bold 30px ${PRINT}` });
    if (this.back > 0) this.button(CW / 2 - 110, y, 70, 36, 'later page ▶', (c) => this.turn(c, -1), '▶', { box: false, font: `bold 30px ${PRINT}` });
  }

  private turn(ctx: LogbookContext, d: number): void {
    this.back = Math.max(0, this.back + d);
    this.signature = '';
    ctx.sound('page');
  }

  /** The entries as lines of handwriting, voyage by voyage. */
  private lines(log: LogState | null): Line[] {
    const out: Line[] = [];
    for (const v of log?.voyages ?? []) {
      out.push({ text: `Voyage ${v.id}${v.closed ? '' : ' (under way)'}`, kind: 'voyage' });
      for (const e of v.entries) out.push(...entryLines(e));
    }
    return out;
  }

  private drawRight(log: LogState | null, world: WorldState, playerId: EntityId): void {
    const g = this.g;
    const X = CW / 2 + 40;
    const d = log?.draft ?? null;
    const mine = !!d && (d.by === playerId || world.time - d.touched >= CONFIG.log.draftIdle);
    g.fillStyle = '#5a3a1a';
    g.font = `bold 26px ${PRINT}`;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText('NEW ENTRY', X, 52);
    if (!d) {
      g.fillStyle = '#5a5040';
      g.font = `italic 20px ${PRINT}`;
      g.fillText('Tick what happened:', X, 100);
      LOG_TYPES.forEach((type, i) => {
        const ev = log ? pendingEvent(log, type) : undefined;
        const due = ev ? `  (due${ev.port ? `: ${ev.port}` : ''})` : '';
        this.button(X, 118 + i * 50, 380, 32, `write a ${LOG_TITLES[type].toLowerCase()} entry`, (c) => {
          c.push('logBegin', undefined, [i]);
          c.sound('tick');
        }, `${LOG_TITLES[type]}${due}`, { font: `bold 24px ${PRINT}` });
      });
      g.fillStyle = '#8a8070';
      g.font = `italic 18px ${PRINT}`;
      g.fillText('Time, position and port fill in when you sign.', X, this.ch - 60);
      return;
    }
    // The entry being written.
    g.fillStyle = INK;
    g.font = `bold 26px ${HAND}`;
    g.fillText(LOG_TITLES[d.type], X, 100);
    const ev = log ? pendingEvent(log, d.type) : undefined;
    g.fillStyle = '#5a5040';
    g.font = `20px ${PRINT}`;
    g.fillText(`Time and position: on signing${ev?.port ? `   Port: ${ev.port}` : ''}`, X, 136, CW - X - 30);
    let y = 168;
    const right = CW - 30;
    for (const f of LOG_FIELDS[d.type]) {
      g.fillStyle = '#3a3226';
      g.font = `20px ${PRINT}`;
      g.textBaseline = 'alphabetic';
      g.fillText(f.label, X, y);
      y += 12;
      // Options as tick boxes, wrapping onto more rows as needed.
      let x = X;
      g.font = `bold 22px ${PRINT}`;
      f.options.forEach((opt, j) => {
        const w = 30 + 12 + g.measureText(opt).width;
        if (x + w > right) {
          x = X;
          y += 42;
        }
        const label = `${f.label.split(' (')[0].toLowerCase()}: ${opt}`;
        if (mine) {
          this.button(x, y, w, 30, label, (c) => {
            c.push('logPick', f.key, [j]);
            c.sound('tick');
          }, opt, { ticked: d.values[f.key] === opt, font: `bold 22px ${PRINT}` });
        } else {
          g.fillStyle = d.values[f.key] === opt ? INK : '#9a9080';
          g.font = `bold 22px ${PRINT}`;
          g.textBaseline = 'middle';
          g.fillText(opt, x + 4, y + 15);
        }
        x += w + 14;
      });
      y += 66;
    }
    g.fillStyle = '#3a3226';
    g.font = `20px ${PRINT}`;
    g.textBaseline = 'alphabetic';
    const ev2 = log ? pendingEvent(log, d.type) : undefined;
    if (ev2?.summary) {
      g.fillStyle = INK;
      g.font = `20px ${HAND}`;
      wrapChars(ev2.summary, 40)
        .slice(0, 6)
        .forEach((l, i) => g.fillText(l, X, y + 4 + i * 28));
    } else g.fillText('Remarks: ______________________', X, y + 4);
    const complete = LOG_FIELDS[d.type].every((f) => d.values[f.key]);
    const sy = this.ch - 130;
    if (!mine) {
      g.fillStyle = '#8a3a1a';
      g.font = `italic 22px ${PRINT}`;
      g.fillText(`Being written by ${d.byName || 'a crewmate'}…`, X, sy + 40);
      return;
    }
    // Signature box: the pen comes out to sign.
    g.strokeStyle = complete ? '#2a6fd0' : '#b0a890';
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    g.strokeRect(X, sy, 300, 64);
    g.setLineDash([]);
    if (complete) {
      this.button(X, sy, 300, 64, 'sign the entry', (c) => this.sign(c, X + 150, sy + 32), undefined, { box: false });
      g.fillStyle = '#2a6fd0';
      g.font = `bold 24px ${PRINT}`;
      g.fillText('✍ Sign here', X + 80, sy + 40);
    } else {
      g.fillStyle = '#9a9080';
      g.font = `italic 20px ${PRINT}`;
      g.fillText('Fill in the values to sign', X + 30, sy + 40);
    }
    this.button(X + 330, sy + 18, 120, 30, 'cancel this entry', (c) => c.push('logCancel'), 'Cancel', { box: false, font: `italic 22px ${PRINT}` });
  }

  private sign(ctx: LogbookContext, px: number, py: number): void {
    ctx.push('logSign');
    ctx.sound('sign');
    this.back = 0;
    if (this.penHand) return; // signed with the pen in hand: no need to fly it over
    // The pen: out of the holder to the signature box, a scribble, and back.
    this.penTo.set((px / CW - 0.5) * this.w, (0.5 - py / this.ch) * this.h, this.pageZ + 0.004);
    this.penAnim = 0;
  }

  /** The pen at rest: lying along the edge of the book, tip toward the top of the page. */
  private restPen(): void {
    this.pen.position.copy(this.penHome);
    this.pen.rotation.set(Math.PI / 2, 0, 0);
  }

  private animatePen(dt: number): void {
    if (this.penAnim < 0) return;
    this.penAnim += dt;
    const t = this.penAnim;
    const T = 1.2;
    const p = this.pen.position;
    if (t < 0.3) p.lerpVectors(this.penHome, this.penTo, smooth(t / 0.3)).setZ(p.z + Math.sin((t / 0.3) * Math.PI) * 0.05);
    else if (t < 0.85) p.copy(this.penTo).add(new THREE.Vector3(Math.sin(t * 40) * 0.02 + (t - 0.575) * 0.12, Math.sin(t * 23) * 0.006, 0));
    else if (t < T) p.lerpVectors(this.penTo, this.penHome, smooth((t - 0.85) / (T - 0.85)));
    else {
      this.restPen();
      this.penAnim = -1;
      return;
    }
    this.pen.rotation.set(0.5, -0.1, 0);
  }

  private showRay(from: THREE.Vector3, to: THREE.Vector3): void {
    const pos = this.rayLine.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    this.rayLine.visible = true;
  }
}

/** Break text into lines of at most `n` characters, at spaces. */
function wrapChars(text: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if (line && line.length + 1 + w.length > n) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** How each reading is written in the book. */
const READING: Record<string, (v: string) => string> = {
  fuel: (v) => `Fuel ${v}`,
  dir: (v) => `bearing ${v}`,
  sea: (v) => `sea ${v.toLowerCase()}`,
  vis: (v) => `vis. ${v.toLowerCase()}`,
};

/** An entry as handwritten lines: time and what; position and readings; signature. */
function entryLines(e: LogEntry): Line[] {
  const out: Line[] = [{ text: `${e.time}  ${LOG_TITLES[e.type]}${e.port ? ` - ${e.port}` : ''}`, kind: 'head' }];
  const readings = e.fields.map((f) => READING[f.key]?.(f.value) ?? f.value).join(', ');
  const checked = e.fields.filter((f) => f.correct !== undefined);
  out.push({ text: `${e.pos}${readings ? `   ${readings}` : ''}`, kind: 'body', tick: checked.length ? checked.every((f) => f.correct) : undefined });
  if (e.remarks) for (const l of wrapChars(e.remarks, 46)) out.push({ text: l, kind: 'body' });
  out.push({ text: `${e.score ? `Log accuracy ${e.score[0]}/${e.score[1]}   ` : ''}- ${e.by || 'crew'}`, kind: 'sign' });
  return out;
}
