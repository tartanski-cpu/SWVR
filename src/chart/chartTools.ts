/**
 * Drawing on the paper chart: the pencil marks (drawn as thin lines lying on the chart:
 * one draw call, sharp at any distance, redrawn only when the marks change) and the hand
 * tools - pencil and eraser - with how they feel (the parallel rule was taken out at the
 * owner's request: the pencil's straight-line trigger does its job):
 *
 *   pick up   VR: grip near a tool takes it in that hand; let go and it goes back to its place.
 *   pencil    the tip within a few mm of the paper draws: the tip is locked to the paper
 *             and the line smoothed a little, so hand tremor and the boat's motion don't
 *             wobble it. Hold the trigger for a straight line from where you started.
 *   eraser    rub it on the paper to rub marks out; hold its trigger 2 s to clear the chart.
 *   desktop   aim at the chart: drag to draw (Shift: straight line), right-drag to erase.
 *   pot markers (potting): little numbered crab magnets in a tray by the pen holder. VR:
 *             grip the tray to take one (the next free number), or grip one on the chart to
 *             move it; let go over the chart and it snaps on, anywhere else and it comes
 *             off. Desktop: click the tray to take one, click the chart to put it down,
 *             click a marker to pick it up again, the tray to put it back.
 *
 * Everything here is in the chart table's frame (its root, placed by the chart-table module); marks are converted to
 * chart coordinates (world metres) by the ChartTableView. Ops go out through ctx.send,
 * which applies them here at once and shares them (chart/marks.ts).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { Handedness } from '../player/xrInput';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { ChartTableView } from '../vessel/view/chartTable';
import type { ChartMarks, ChartOp, ChartToken } from './marks';

export interface ChartToolsContext {
  marks: ChartMarks;
  playerId: string;
  /** Apply an op locally and share it. */
  send(op: ChartOp): void;
  pulse(hand: Handedness, intensity: number, ms: number): void;
  notify(text: string): void;
  /** Pencil scratch / eraser rub loudness, 0..1 (0 = silent). */
  scratch(pencil: number, rub: number): void;
}

type ToolName = 'pencil' | 'eraser';
type Holder = Handedness | 'desk' | null;

interface Tool {
  mesh: THREE.Object3D;
  home: THREE.Matrix4;
  /** Point you grab, in the tool's own frame. */
  grab: THREE.Vector3;
  held: Holder;
}

/** A stroke in progress (one per hand / the desktop). */
interface Drawing {
  id: string;
  start: { x: number; z: number };
  last: { x: number; z: number };
  pending: number[];
  straight: boolean;
  /** Smoothed tip on the table (the table's frame). */
  tip: THREE.Vector3;
  since: number;
  setDirty: boolean;
}

const GRAB_RANGE = 0.09;
/** A pot marker: a disc this radius (m on the table). */
const TOKEN_R = 0.011;

/** A pot marker in a hand (new from the tray: id null). */
interface HeldToken {
  hand: Holder;
  id: string | null;
  n: number;
  mesh: THREE.Object3D;
}
const DESK_REACH = 2.5;

export class ChartTools {
  readonly root = new THREE.Group();
  private readonly lines: THREE.LineSegments;
  private readonly lineGeo = new THREE.BufferGeometry();
  private shownSeq = -1;
  private readonly tools: Record<ToolName, Tool>;
  private strokeN = 0;
  private drawing: Drawing | null = null;
  private eraseLast: THREE.Vector3 | null = null;
  private eraseHold = 0;
  private hapticT = 0;
  private scratchLevel = 0;
  private rubLevel = 0;
  private deskTool: 'pencil' | 'eraser' | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly inv = new THREE.Matrix4();
  private readonly lray = new THREE.Ray();
  /** Pot markers: the tray, the ones on the chart, and the one in a hand. */
  private readonly tray: THREE.Mesh;
  private readonly trayAt: THREE.Vector3;
  private readonly tokens = new THREE.Group();
  private shownTokens = '';
  private heldToken: HeldToken | null = null;
  private tokenN = 0;
  private prevDown = false;
  /** Desktop: the press that placed or took a marker isn't also a pencil stroke. */
  private deskSuppress = false;
  private readonly numberTex = new Map<number, THREE.Texture>();
  private readonly tokenGeo: THREE.BufferGeometry;
  private readonly tokenMat = flatVertexColorMaterial();
  private readonly raycaster = new THREE.Raycaster();

  constructor(private readonly table: ChartTableView) {
    this.root.name = 'chartTools';
    // Marks: line segments just above the paper, a vertex colour per point (old marks fade).
    const cap = CONFIG.chartMarks.maxPoints * 2;
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    this.lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    this.lineGeo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.lines.frustumCulled = false;
    this.lines.name = 'chartMarks';
    this.root.add(this.lines);

    // The tools. Pencil and eraser point along their own -z; the pencil's tip is at the origin.
    const pencil = new THREE.Mesh(
      mergeParts([
        part(new THREE.CylinderGeometry(0.0045, 0.0045, 0.15, 6).rotateX(Math.PI / 2).translate(0, 0, 0.09), 0xe8c030),
        part(new THREE.ConeGeometry(0.0045, 0.015, 6).rotateX(-Math.PI / 2).translate(0, 0, 0.0075), 0xe8d0a8),
        part(new THREE.CylinderGeometry(0.0047, 0.0047, 0.01, 6).rotateX(Math.PI / 2).translate(0, 0, 0.17), 0xe88a9a),
      ]),
      flatVertexColorMaterial(),
    );
    const eraser = new THREE.Mesh(part(new THREE.BoxGeometry(0.025, 0.014, 0.05).translate(0, 0.007, 0), 0xe88a9a), flatVertexColorMaterial());
    const [hx, hz] = table.holderAt;
    const T = table.top;
    const home = (pos: THREE.Vector3, rot: THREE.Euler) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
    this.tools = {
      // Standing in the holder, tip down.
      pencil: { mesh: pencil, home: home(new THREE.Vector3(hx + 0.012, T + 0.02, hz + 0.008), new THREE.Euler(-Math.PI / 2 + 0.18, 0, 0)), grab: new THREE.Vector3(0, 0, 0.08), held: null },
      eraser: { mesh: eraser, home: home(new THREE.Vector3(hx + 0.07, T, hz + 0.02), new THREE.Euler(0, 0, 0)), grab: new THREE.Vector3(0, 0.007, 0), held: null },
    };
    for (const t of Object.values(this.tools)) {
      t.mesh.matrixAutoUpdate = false;
      t.mesh.matrix.copy(t.home);
      this.root.add(t.mesh);
    }
    // Pot markers: a red disc magnet with a little crab on it (claws forward).
    this.tokenGeo = mergeParts([
      part(new THREE.CylinderGeometry(TOKEN_R, TOKEN_R, 0.004, 14).translate(0, 0.002, 0), 0xc8281c),
      part(new THREE.SphereGeometry(0.0055, 8, 5).scale(1.2, 0.5, 1).translate(0, 0.0055, 0.001), 0xe86a3a),
      ...[-1, 1].map((sd) => part(new THREE.SphereGeometry(0.0028, 6, 4).scale(1, 0.6, 1.3).translate(sd * 0.0045, 0.005, -0.006), 0xe86a3a)),
    ]);
    // The tray beside the pen holder, a few markers lying in it.
    this.trayAt = new THREE.Vector3(hx + 0.15, T, hz + 0.01);
    this.tray = new THREE.Mesh(
      mergeParts([
        part(new THREE.BoxGeometry(0.075, 0.004, 0.055).translate(0, 0.002, 0), 0x5a3a20),
        ...[-1, 1].map((sd) => part(new THREE.BoxGeometry(0.075, 0.012, 0.004).translate(0, 0.006, sd * 0.0255), 0x5a3a20)),
        ...[-1, 1].map((sd) => part(new THREE.BoxGeometry(0.004, 0.012, 0.055).translate(sd * 0.0355, 0.006, 0), 0x5a3a20)),
        ...[[-0.016, -0.008], [0.004, 0.01], [0.02, -0.006]].map(([x, z]) => part(new THREE.CylinderGeometry(TOKEN_R, TOKEN_R, 0.004, 12).translate(x, 0.006, z), 0xc8281c)),
      ]),
      flatVertexColorMaterial(),
    );
    this.tray.position.copy(this.trayAt);
    this.tray.name = 'potMarkerTray';
    this.tokens.name = 'potMarkers';
    this.root.add(this.tray, this.tokens);
  }

  // ── Pot markers ──────────────────────────────────────────────────────────

  /** A marker's mesh: the crab disc and its number on a tiny label beside it. */
  private tokenMesh(n: number): THREE.Object3D {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.tokenGeo, this.tokenMat));
    let tex = this.numberTex.get(n);
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const x = c.getContext('2d')!;
      x.fillStyle = '#f4f0e2';
      x.beginPath();
      x.arc(32, 32, 30, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#1a1a1a';
      x.font = 'bold 40px system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(n), 32, 34);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.numberTex.set(n, tex);
    }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.012).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    // Beside the disc on the inboard side (+x: toward you standing at the table), upright for you.
    label.rotation.y = Math.PI / 2;
    label.position.set(TOKEN_R + 0.006, 0.0045, 0);
    g.add(label);
    return g;
  }

  /** Rebuild the markers on the chart when they change (or one is lifted off). */
  private redrawTokens(marks: ChartMarks): void {
    const list = marks.tokens ?? [];
    const key = `${marks.seq}|${this.heldToken?.id ?? ''}`;
    if (key === this.shownTokens) return;
    this.shownTokens = key;
    this.tokens.clear();
    const y = this.table.chartRect.y + 0.0004;
    for (const t of list) {
      if (t.id === this.heldToken?.id) continue;
      const m = this.tokenMesh(t.n);
      this.table.chartToTable(t.x, t.z, m.position).setY(y);
      this.tokens.add(m);
    }
  }

  /** The next free number for a new marker. */
  private nextNumber(marks: ChartMarks): number {
    const used = new Set((marks.tokens ?? []).map((t) => t.n));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  /** The marker on the chart nearest a table point, within `r` (m). */
  private tokenNear(marks: ChartMarks, at: THREE.Vector3, r: number): ChartToken | null {
    let best: ChartToken | null = null;
    let bd = r;
    for (const t of marks.tokens ?? []) {
      const p = this.table.chartToTable(t.x, t.z, this.tmp2);
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < bd) [best, bd] = [t, d];
    }
    return best;
  }

  private takeToken(marks: ChartMarks, hand: Holder, existing: ChartToken | null): void {
    const n = existing?.n ?? this.nextNumber(marks);
    const mesh = this.tokenMesh(n);
    this.root.add(mesh);
    this.heldToken = { hand, id: existing?.id ?? null, n, mesh };
  }

  /** Let the marker go at `at` (table coords): on the chart it snaps on; elsewhere it comes off. */
  private dropToken(ctx: ChartToolsContext, at: THREE.Vector3 | null): void {
    const t = this.heldToken;
    if (!t) return;
    this.heldToken = null;
    t.mesh.removeFromParent();
    const plane = this.table.chartRect.y;
    if (at && this.inChart(at) && at.y - plane < 0.08) {
      const c = this.table.tableToChart(at.x, at.z);
      const id = t.id ?? `${ctx.playerId}:pot${Date.now().toString(36)}${++this.tokenN}`;
      ctx.send({ k: 'token', id, x: c.x, z: c.z, n: t.n });
    } else if (t.id) ctx.send({ k: 'untoken', id: t.id });
    this.shownTokens = '';
  }

  // ── Marks ────────────────────────────────────────────────────────────────

  /** Rebuild the lines when the marks changed (cheap: a few thousand vertices). */
  private redraw(marks: ChartMarks): void {
    this.redrawTokens(marks);
    if (marks.seq === this.shownSeq) return;
    this.shownSeq = marks.seq;
    const pos = this.lineGeo.attributes.position as THREE.BufferAttribute;
    const col = this.lineGeo.attributes.color as THREE.BufferAttribute;
    const y = this.table.chartRect.y + 0.0012;
    const total = marks.strokes.reduce((n, s) => n + s.pts.length / 2, 0);
    // Fade the oldest marks as the cap nears ("worn by the eraser").
    const fade = Math.max(0, total / CONFIG.chartMarks.maxPoints - 0.7) / 0.3;
    let v = 0;
    let seen = 0;
    const a = this.tmp;
    const b = this.tmp2;
    for (const s of marks.strokes) {
      const n = s.pts.length / 2;
      const age = total > 0 ? 1 - (seen + n / 2) / total : 0; // 1 = oldest
      seen += n;
      const shade = 0.16 + 0.5 * fade * age;
      for (let i = 0; i + 3 < s.pts.length && v + 2 <= pos.count; i += 2) {
        this.table.chartToTable(s.pts[i], s.pts[i + 1], a).setY(y);
        this.table.chartToTable(s.pts[i + 2], s.pts[i + 3], b).setY(y);
        pos.setXYZ(v, a.x, a.y, a.z);
        pos.setXYZ(v + 1, b.x, b.y, b.z);
        col.setXYZ(v, shade, shade, shade * 1.05);
        col.setXYZ(v + 1, shade, shade, shade * 1.05);
        v += 2;
      }
    }
    this.lineGeo.setDrawRange(0, v);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  // ── Strokes ──────────────────────────────────────────────────────────────

  private inChart(p: THREE.Vector3, margin = 0): boolean {
    const r = this.table.chartRect;
    return p.x >= r.x0 - margin && p.x <= r.x1 + margin && p.z >= r.z0 - margin && p.z <= r.z1 + margin;
  }

  private penDown(ctx: ChartToolsContext, tip: THREE.Vector3, straight: boolean): void {
    const c = this.table.tableToChart(tip.x, tip.z);
    const id = `${ctx.playerId}:${Date.now().toString(36)}${++this.strokeN}`;
    this.drawing = { id, start: c, last: c, pending: [], straight, tip: tip.clone(), since: 0, setDirty: false };
    ctx.send({ k: 'start', id, pts: [c.x, c.z, c.x, c.z] });
  }

  /** Pencil on the paper at `raw` (table coords) this frame. */
  private penMove(ctx: ChartToolsContext, raw: THREE.Vector3, straight: boolean, dt: number): number {
    const d = this.drawing!;
    // Light smoothing against tremor and the boat's motion.
    d.tip.lerp(raw, Math.min(1, dt * 25));
    const p = this.tmp.copy(d.tip);
    const c =this.table.tableToChart(p.x, p.z);
    const moved = Math.hypot(c.x - d.last.x, c.z - d.last.z);
    d.since += dt;
    if (straight || d.straight) {
      d.straight = true;
      if (moved > CONFIG.chartMarks.minStepM * 0.3) {
        d.last = c;
        d.setDirty = true;
      }
      if (d.setDirty && d.since >= CONFIG.chartMarks.sendEvery) {
        ctx.send({ k: 'set', id: d.id, pts: [d.start.x, d.start.z, c.x, c.z] });
        d.since = 0;
        d.setDirty = false;
      }
    } else {
      if (moved >= CONFIG.chartMarks.minStepM) {
        d.pending.push(c.x, c.z);
        d.last = c;
      }
      if (d.pending.length && d.since >= CONFIG.chartMarks.sendEvery) this.flush(ctx);
    }
    return moved / Math.max(dt, 1e-3);
  }

  private flush(ctx: ChartToolsContext): void {
    const d = this.drawing;
    if (!d) return;
    if (d.straight) {
      if (d.setDirty) ctx.send({ k: 'set', id: d.id, pts: [d.start.x, d.start.z, d.last.x, d.last.z] });
    } else if (d.pending.length) ctx.send({ k: 'add', id: d.id, pts: d.pending });
    d.pending = [];
    d.since = 0;
    d.setDirty = false;
  }

  private penUp(ctx: ChartToolsContext): void {
    this.flush(ctx);
    this.drawing = null;
  }

  private rub(ctx: ChartToolsContext, at: THREE.Vector3): void {
    if (this.eraseLast && this.eraseLast.distanceTo(at) < 0.004) return;
    this.eraseLast = at.clone();
    const c = this.table.tableToChart(at.x, at.z);
    ctx.send({ k: 'erase', x: c.x, z: c.z, r: CONFIG.chartMarks.eraseRadius / this.table.scale });
  }

  // ── VR ───────────────────────────────────────────────────────────────────

  /** Hands that hold or pick up a tool (their grip and trigger are ours this frame). */
  updateXR(ctx: ChartToolsContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>, dt: number): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    this.redraw(ctx.marks);
    this.root.updateWorldMatrix(true, false);
    this.inv.copy(this.root.matrixWorld).invert();
    let pencilSound = 0;
    let rubSound = 0;
    for (const h of ['right', 'left'] as const) {
      const f = hands[h];
      // A pot marker in this hand: it follows the hand, just under the fingers.
      if (this.heldToken?.hand === h) {
        used[h] = true;
        const at = this.tmp.copy(f.grip).applyMatrix4(this.inv);
        if (!f.tracked || !f.gripDown) {
          this.dropToken(ctx, at.add(new THREE.Vector3(0, -0.03, 0)));
          ctx.pulse(h, 0.4, 25);
          continue;
        }
        this.heldToken.mesh.position.copy(at).add(new THREE.Vector3(0, -0.03, 0));
        continue;
      }
      const held = (Object.keys(this.tools) as ToolName[]).find((k) => this.tools[k].held === h);
      if (held) {
        used[h] = true;
        if (!f.tracked || !f.gripDown) {
          this.release(ctx, held, h);
          continue;
        }
        const s = this.holdTool(ctx, held, f, h, dt);
        pencilSound = Math.max(pencilSound, s.pencil);
        rubSound = Math.max(rubSound, s.rub);
        continue;
      }
      if (!f.tracked || busy[h] || !f.gripPressed) continue;
      // Pick up the nearest free tool within reach of the hand.
      const local = this.tmp.copy(f.grip).applyMatrix4(this.inv);
      let best: ToolName | null = null;
      let bd = GRAB_RANGE;
      for (const k of Object.keys(this.tools) as ToolName[]) {
        const t = this.tools[k];
        if (t.held) continue;
        const d = this.tmp2.copy(t.grab).applyMatrix4(t.mesh.matrix).distanceTo(local);
        if (d < bd) [best, bd] = [k, d];
      }
      if (best) {
        this.tools[best].held = h;
        ctx.pulse(h, 0.5, 30);
        used[h] = true;
        continue;
      }
      // Else a pot marker: from the tray (a new one), or one on the chart (to move it).
      if (this.heldToken) continue;
      const onChart = this.tokenNear(ctx.marks, local, 0.04);
      if (onChart && Math.abs(local.y - this.table.chartRect.y) < 0.08) {
        this.takeToken(ctx.marks, h, onChart);
        ctx.pulse(h, 0.4, 25);
        used[h] = true;
      } else if (local.distanceTo(this.trayAt) < GRAB_RANGE) {
        this.takeToken(ctx.marks, h, null);
        ctx.pulse(h, 0.4, 25);
        used[h] = true;
      }
    }
    this.sound(ctx, pencilSound, rubSound, dt);
    return used;
  }

  /** A held tool follows the hand; the pencil draws and the eraser rubs where they touch. */
  private holdTool(ctx: ChartToolsContext, name: ToolName, f: HandFrame, h: Handedness, dt: number): { pencil: number; rub: number } {
    const t = this.tools[name];
    const plane = this.table.chartRect.y;
    // The hand's pose in the table's frame.
    const hp = this.tmp.copy(f.grip).applyMatrix4(this.inv);
    this.root.getWorldQuaternion(this.q).invert();
    const hq = f.quat ? this.q.clone().multiply(f.quat) : new THREE.Quaternion();
    const out = { pencil: 0, rub: 0 };
    if (name === 'pencil') {
      // Pencil out of the fist, tip ~11 cm ahead of the grip, pointing where the hand points.
      const tip = hp.clone().add(new THREE.Vector3(0, -0.01, -0.11).applyQuaternion(hq));
      const pose = new THREE.Matrix4().compose(tip, hq, new THREE.Vector3(1, 1, 1));
      const above = tip.y - plane;
      const touching = this.inChart(tip) && above < CONFIG.chartMarks.contactMm / 1000 && above > -0.05;
      if (touching) {
        // Lock the tip onto the paper.
        pose.setPosition(tip.x, plane + 0.0008, tip.z);
        const p = new THREE.Vector3(tip.x, plane, tip.z);
        if (!this.drawing) {
          this.penDown(ctx, p, f.triggerDown);
          ctx.pulse(h, 0.3, 20);
        }
        const speed = this.penMove(ctx, p, f.triggerDown, dt);
        out.pencil = Math.min(1, speed / 400);
        this.hapticT -= dt;
        if (out.pencil > 0.05 && this.hapticT <= 0) {
          ctx.pulse(h, 0.12, 18);
          this.hapticT = 0.06;
        }
      } else if (this.drawing) this.penUp(ctx);
      t.mesh.matrix.copy(pose);
      return out;
    }
    // Eraser: held in the fingers, its face down at the paper; hold the trigger to clear.
    const at = hp.clone().add(new THREE.Vector3(0, -0.04, -0.04).applyQuaternion(hq));
    const touching = this.inChart(at, 0.01) && at.y - plane < 0.01 && at.y - plane > -0.05;
    const yaw = Math.atan2(-new THREE.Vector3(0, 0, -1).applyQuaternion(hq).x, -new THREE.Vector3(0, 0, -1).applyQuaternion(hq).z);
    const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    if (touching) {
      at.y = plane + 0.0005;
      this.rub(ctx, at);
      out.rub = 0.8;
      this.hapticT -= dt;
      if (this.hapticT <= 0) {
        ctx.pulse(h, 0.2, 25);
        this.hapticT = 0.08;
      }
      t.mesh.matrix.compose(at, flatQ, new THREE.Vector3(1, 1, 1));
    } else {
      this.eraseLast = null;
      t.mesh.matrix.compose(at, hq, new THREE.Vector3(1, 1, 1));
    }
    if (f.triggerDown) {
      this.eraseHold += dt;
      if (this.eraseHold >= CONFIG.chartMarks.clearHold && this.eraseHold - dt < CONFIG.chartMarks.clearHold) {
        ctx.send({ k: 'clear' });
        ctx.pulse(h, 1, 120);
        ctx.notify('Chart cleared');
      }
    } else this.eraseHold = 0;
    return out;
  }

  private release(ctx: ChartToolsContext, name: ToolName, h: Holder): void {
    const t = this.tools[name];
    t.held = null;
    if (name === 'pencil' && this.drawing) this.penUp(ctx);
    this.eraseHold = 0;
    this.eraseLast = null;
    t.mesh.matrix.copy(t.home);
    if (h && h !== 'desk') ctx.pulse(h, 0.3, 20);
  }

  // ── Desktop ──────────────────────────────────────────────────────────────

  /** Where the reticle's ray meets the chart (table coords), or null. */
  private deskHit(ray: THREE.Ray | null): THREE.Vector3 | null {
    if (!ray) return null;
    this.root.updateWorldMatrix(true, false);
    this.inv.copy(this.root.matrixWorld).invert();
    this.lray.copy(ray).applyMatrix4(this.inv);
    const plane = this.table.chartRect.y;
    const o = this.lray.origin;
    const d = this.lray.direction;
    if (d.y >= -1e-4 || o.y <= plane) return null;
    const t = (plane - o.y) / d.y;
    if (t > DESK_REACH) return null;
    const p = this.lray.at(t, new THREE.Vector3());
    return this.inChart(p) ? p : null;
  }

  /**
   * Desktop: drag on the chart to draw (Shift: straight), right-drag to erase. Returns a
   * reticle label when on the chart (or busy), and whether the mouse buttons were used.
   */
  updateDesktop(ctx: ChartToolsContext, ray: THREE.Ray | null, b: { down: boolean; right: boolean; shift: boolean }, dt: number): { label: string | null; consumed: boolean } {
    this.redraw(ctx.marks);
    const hit = this.deskHit(ray);
    // Pot markers first: a click on the tray, on a marker, or (holding one) on the chart.
    const pressed = b.down && !this.prevDown;
    this.prevDown = b.down;
    if (!b.down) this.deskSuppress = false;
    const onTray = this.trayHit(ray);
    if (this.heldToken?.hand === 'desk') {
      if (hit) this.heldToken.mesh.position.set(hit.x, hit.y + 0.006, hit.z);
      else this.heldToken.mesh.position.copy(this.trayAt).setY(this.trayAt.y + 0.02);
      if (pressed && (hit || onTray)) {
        this.dropToken(ctx, hit ?? null);
        this.deskSuppress = true;
      }
      return { label: 'pot marker\nclick on the chart to put it down · click the tray to put it back', consumed: true };
    }
    if (this.deskSuppress) return { label: null, consumed: true };
    if (pressed && !this.deskTool) {
      const tk = hit ? this.tokenNear(ctx.marks, hit, 0.02) : null;
      if (tk || onTray) {
        this.takeToken(ctx.marks, 'desk', tk);
        this.deskSuppress = true;
        return { label: 'pot marker', consumed: true };
      }
    }
    if (!this.deskTool && onTray && !hit) return { label: 'pot markers\nclick to take one', consumed: false };
    if (!this.deskTool && hit && this.tokenNear(ctx.marks, hit, 0.02)) return { label: 'pot marker\nclick to pick it up', consumed: false };
    let pencil = 0;
    let rub = 0;
    if (this.deskTool === 'pencil') {
      if (!b.down) {
        this.penUp(ctx);
        this.deskTool = null;
        this.tools.pencil.mesh.matrix.copy(this.tools.pencil.home);
      } else if (hit) {
        pencil = Math.min(1, this.penMove(ctx, hit, b.shift, dt) / 400);
        this.posePencilAt(hit);
      }
    } else if (this.deskTool === 'eraser') {
      if (!b.right) {
        this.deskTool = null;
        this.eraseLast = null;
        this.tools.eraser.mesh.matrix.copy(this.tools.eraser.home);
      } else if (hit) {
        this.rub(ctx, hit);
        rub = 0.8;
        this.tools.eraser.mesh.matrix.makeTranslation(hit.x, hit.y, hit.z);
      }
    } else if (hit && b.down && !this.tools.pencil.held) {
      this.deskTool = 'pencil';
      this.penDown(ctx, hit, b.shift);
      this.posePencilAt(hit);
    } else if (hit && b.right && !this.tools.eraser.held) {
      this.deskTool = 'eraser';
      this.rub(ctx, hit);
    }
    this.sound(ctx, pencil, rub, dt);
    if (this.deskTool) return { label: this.deskTool === 'pencil' ? 'pencil' : 'eraser', consumed: true };
    if (!hit) return { label: null, consumed: false };
    return { label: 'chart\ndrag to draw · Shift: straight line · right-drag: erase', consumed: false };
  }

  /** Is the reticle on the marker tray (within desk reach)? */
  private trayHit(ray: THREE.Ray | null): boolean {
    if (!ray) return false;
    this.raycaster.ray.copy(ray);
    this.raycaster.far = DESK_REACH;
    return this.raycaster.intersectObject(this.tray, false).length > 0;
  }

  private posePencilAt(p: THREE.Vector3): void {
    // Leaning back toward you (the inboard side, +x), tip on the paper.
    this.q.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.5, Math.PI / 2, 0, 'YXZ'));
    this.tools.pencil.mesh.matrix.compose(new THREE.Vector3(p.x, p.y + 0.0008, p.z), this.q, new THREE.Vector3(1, 1, 1));
  }

  /** The tool in one of our hands (for the other players to see), or null. */
  heldTool(): { kind: ToolName; hand: Handedness } | null {
    for (const k of Object.keys(this.tools) as ToolName[]) {
      const h = this.tools[k].held;
      if (h === 'left' || h === 'right') return { kind: k, hand: h };
      if (h === 'desk' || (k === 'pencil' && this.deskTool === 'pencil') || (k === 'eraser' && this.deskTool === 'eraser')) return { kind: k, hand: 'right' };
    }
    return null;
  }

  /** Tools a crewmate has in hand: not on the table here (they're in their hand). */
  setRemoteHeld(kinds: Set<string>): void {
    for (const k of Object.keys(this.tools) as ToolName[]) {
      const t = this.tools[k];
      t.mesh.visible = !(kinds.has(k) && t.held === null && !(k === this.deskTool));
    }
  }

  /** Is a tool (or a pot marker) in this hand (its grip is ours)? */
  holding(hand: Handedness): boolean {
    return Object.values(this.tools).some((t) => t.held === hand) || this.heldToken?.hand === hand;
  }

  /** Redraw the marks when nothing else is updating the tools (e.g. a crewmate drew). */
  refresh(marks: ChartMarks): void {
    this.redraw(marks);
  }

  private sound(ctx: ChartToolsContext, pencil: number, rub: number, dt: number): void {
    const k = Math.min(1, dt * 12);
    this.scratchLevel += (pencil - this.scratchLevel) * k;
    this.rubLevel += (rub - this.rubLevel) * k;
    ctx.scratch(this.scratchLevel < 0.01 ? 0 : this.scratchLevel, this.rubLevel < 0.01 ? 0 : this.rubLevel);
  }
}
