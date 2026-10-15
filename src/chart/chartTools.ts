/**
 * Drawing on the paper chart: the pencil marks (drawn as thin lines lying on the chart:
 * one draw call, sharp at any distance, redrawn only when the marks change) and the hand
 * tools - pencil, eraser and parallel rule - with how they feel:
 *
 *   pick up   VR: grip near a tool takes it in that hand; let go and it goes back to its
 *             place (the rule stays where you left it if it's lying on the chart).
 *   pencil    the tip within a few mm of the paper draws: the tip is locked to the paper
 *             and the line smoothed a little, so hand tremor and the boat's motion don't
 *             wobble it. Hold the trigger for a straight line from where you started.
 *             Near the parallel rule's edge, the line snaps onto the edge.
 *   eraser    rub it on the paper to rub marks out; hold its trigger 2 s to clear the chart.
 *   rule      held low over the chart it lies flat on it, sliding and turning with your
 *             hand; let go there and it stays.
 *   desktop   aim at the chart: drag to draw (Shift: straight line), right-drag to erase.
 *
 * Everything here is in the chart table's frame (vessel axes); marks are converted to
 * chart coordinates (world metres) by the ChartTableView. Ops go out through ctx.send,
 * which applies them here at once and shares them (chart/marks.ts).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { Handedness } from '../player/xrInput';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { ChartTableView } from '../vessel/view/chartTable';
import type { ChartMarks, ChartOp } from './marks';

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

type ToolName = 'pencil' | 'eraser' | 'rule';
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
  /** Smoothed tip on the table (vessel axes). */
  tip: THREE.Vector3;
  since: number;
  setDirty: boolean;
}

const GRAB_RANGE = 0.09;
const DESK_REACH = 2.5;

export class ChartTools {
  readonly root = new THREE.Group();
  private readonly lines: THREE.LineSegments;
  private readonly lineGeo = new THREE.BufferGeometry();
  private shownSeq = -1;
  private readonly tools: Record<ToolName, Tool>;
  private ruleOnChart = false;
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

  constructor(private readonly table: ChartTableView) {
    this.root.name = 'chartTools';
    const r = table.chartRect;
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
    // Parallel rule: two perspex rules joined by brass links; flat, long axis along its z.
    const rule = new THREE.Mesh(
      mergeParts([
        ...[-0.035, 0.035].map((x) => part(new THREE.BoxGeometry(0.04, 0.005, 0.32).translate(x, 0.0025, 0), 0xcfe0dc)),
        ...[-0.1, 0.1].map((z) => part(new THREE.BoxGeometry(0.08, 0.004, 0.01).translate(0, 0.006, z), 0xb89040)),
      ]),
      flatVertexColorMaterial(),
    );
    const [hx, hz] = table.holderAt;
    const T = table.top;
    const home = (pos: THREE.Vector3, rot: THREE.Euler) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
    this.tools = {
      // Standing in the holder, tip down.
      pencil: { mesh: pencil, home: home(new THREE.Vector3(hx + 0.012, T + 0.02, hz + 0.008), new THREE.Euler(-Math.PI / 2 + 0.18, 0, 0)), grab: new THREE.Vector3(0, 0, 0.08), held: null },
      eraser: { mesh: eraser, home: home(new THREE.Vector3(hx + 0.07, T, hz + 0.02), new THREE.Euler(0, 0, 0)), grab: new THREE.Vector3(0, 0.007, 0), held: null },
      rule: { mesh: rule, home: home(new THREE.Vector3((r.x0 + r.x1) / 2 + 0.12, r.y + 0.001, r.z0 + 0.2), new THREE.Euler(0, 0.3, 0)), grab: new THREE.Vector3(0, 0.004, 0), held: null },
    };
    for (const t of Object.values(this.tools)) {
      t.mesh.matrixAutoUpdate = false;
      t.mesh.matrix.copy(t.home);
      this.root.add(t.mesh);
    }
  }

  // ── Marks ────────────────────────────────────────────────────────────────

  /** Rebuild the lines when the marks changed (cheap: a few thousand vertices). */
  private redraw(marks: ChartMarks): void {
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

  /** Pull a point onto the rule's nearer long edge if it's close to it. */
  private snapToRule(p: THREE.Vector3): void {
    if (!this.ruleOnChart && this.tools.rule.held === null) return;
    const rm = this.tools.rule.mesh.matrix;
    this.inv.copy(rm).invert();
    const l = this.tmp2.copy(p).applyMatrix4(this.inv);
    const edge = 0.055; // outer edges of the two rules (rule frame x)
    if (Math.abs(l.z) > 0.16) return;
    for (const ex of [-edge, edge]) {
      if (Math.abs(l.x - ex) < CONFIG.chartMarks.ruleSnap) {
        l.x = ex;
        const y = p.y;
        p.copy(l.applyMatrix4(rm)).setY(y);
        return;
      }
    }
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
    this.snapToRule(p);
    const c = this.table.tableToChart(p.x, p.z);
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
        if (best === 'rule') this.ruleOnChart = false;
        ctx.pulse(h, 0.5, 30);
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
    if (name === 'rule') {
      // Low over the chart it lies flat on it, turned to the hand's heading.
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(hq);
      const flat = hp.y - plane < 0.12 && this.inChart(hp);
      if (flat) {
        const yaw = Math.atan2(-fwd.x, -fwd.z);
        t.mesh.matrix.compose(new THREE.Vector3(hp.x, plane + 0.001, hp.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
      } else {
        t.mesh.matrix.compose(hp, hq, new THREE.Vector3(1, 1, 1));
      }
      this.ruleWasFlat = flat;
      return out;
    }
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

  private ruleWasFlat = false;

  private release(ctx: ChartToolsContext, name: ToolName, h: Holder): void {
    const t = this.tools[name];
    t.held = null;
    if (name === 'pencil' && this.drawing) this.penUp(ctx);
    this.eraseHold = 0;
    this.eraseLast = null;
    // The rule stays where it lies on the chart; everything else goes home.
    if (name === 'rule' && this.ruleWasFlat) this.ruleOnChart = true;
    else t.mesh.matrix.copy(t.home);
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

  private posePencilAt(p: THREE.Vector3): void {
    // Leaning back toward you (the inboard side, +x), tip on the paper.
    this.q.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.5, Math.PI / 2, 0, 'YXZ'));
    this.tools.pencil.mesh.matrix.compose(new THREE.Vector3(p.x, p.y + 0.0008, p.z), this.q, new THREE.Vector3(1, 1, 1));
  }

  /** Is a tool in this hand (its grip is ours)? */
  holding(hand: Handedness): boolean {
    return Object.values(this.tools).some((t) => t.held === hand);
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
