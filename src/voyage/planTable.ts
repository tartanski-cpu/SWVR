/**
 * The voyage planning table (owner, Oct 2026): a big chart table on the quay where a Voyage
 * map starts, a few metres behind where you begin, that the crew plan on together.
 *
 *   the chart   the map's paper chart (nav/paperChart.ts), drawn for whatever the table's
 *               view is: the whole map, or zoomed in on a part (sharper detail). The view is
 *               the plan's (world.plan.view), so everyone sees the same chart, as round one
 *               real table. Drawn again when it changes (a few views kept).
 *   the route   on a transparent sheet over the chart: the plan's points joined up, each
 *               numbered, a stop a square, a thing to look at a diamond, a waypoint a dot;
 *               points reached greyed, the next one ringed; and a line of what's next.
 *   the boats   every player's boat, a small marker where she is, turned to her heading.
 *   the keys    along the near edge: the tools (Waypoint, Stop, Look at, Remove, Zoom in;
 *               a press on the chart then does it there) and Zoom out, Whole map, Undo and
 *               Clear (pressed twice). The tool is yours (this page); what it does is sent
 *               to the host (the `plan` intent, voyage/plan.ts), so the plan is everyone's.
 *
 * You stand at its near side (the quay's edge behind you) and read the chart the right way
 * up from there: its north is the table's far edge, whichever way the quay runs, as a chart
 * on a real table. Press the chart with the controller's ray or its tip (VR), or click it
 * (desktop): Control.pressPoint says where.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { Control } from '../controls/Control';
import type { WorldState } from '../core/world';
import { playerBoats } from '../core/launch';
import { drawPaperChart } from '../nav/paperChart';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { berthWithId } from '../world/berths';
import { landFloor } from '../world/landWalkArea';
import { REGIONS } from '../world/regions';
import { quaySpot, startBerthId } from '../world/startSpot';
import { nextPoint, pointLabel, viewBounds, wholeView, type PlanKind, type PlanView } from './plan';

export type PlanTool = PlanKind | 'remove' | 'zoom';

export interface PlanTableHost {
  /** Send a plan action to the host (the `plan` env intent). */
  send(ref: string, args?: number[]): void;
  notify(text: string): void;
}

const TOOLS: { tool: PlanTool; text: string; hover: string }[] = [
  { tool: 'way', text: 'Waypoint', hover: 'Chart: press to put a waypoint there' },
  { tool: 'stop', text: 'Stop', hover: 'Chart: press to put a stop there (it takes the nearest harbour’s name)' },
  { tool: 'look', text: 'Look at', hover: 'Chart: press on something to look at (a castle, a monument, a hill, a wreck, a light)' },
  { tool: 'remove', text: 'Remove', hover: 'Chart: press by a point to take it off' },
  { tool: 'zoom', text: 'Zoom in', hover: 'Chart: press where to zoom in' },
];

/** Route colours: the line and marks, a reached point, the next one. */
const ROUTE = '#b0186a';
const DONE = '#8a8a8a';

/**
 * A key on the table's near edge: a flat block with its name printed on top; a press calls
 * `onPress`. Lit (a brighter top) while `lit` says so (the tool in hand).
 */
class TableKey extends Control {
  readonly kind = 'press' as const;
  private readonly top: THREE.Mesh;
  private readonly topMat: THREE.MeshLambertMaterial;
  private readonly tex: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private shown = '';
  private shownLit = false;

  constructor(
    id: string,
    public label: string,
    private text: () => string,
    private readonly lit: () => boolean,
    private readonly onPress: () => void,
    w: number,
    d: number,
  ) {
    super(id, 'planKey');
    const base = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), this.material(0x2b2f33)));
    base.position.y = 0.015;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = Math.round((256 * d) / w);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.topMat = this.material(0xffffff);
    this.topMat.map = this.tex;
    this.top = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, d * 0.84).rotateX(-Math.PI / 2), this.topMat);
    this.top.position.y = 0.031;
    this.root.add(base, this.top);
    this.hitObjects.push(base, this.top);
    this.paint();
  }

  /** Its face: the name, light on dark, or dark on amber while lit. */
  paint(): void {
    const t = this.text();
    const on = this.lit();
    if (t === this.shown && on === this.shownLit) return;
    this.shown = t;
    this.shownLit = on;
    const g = this.canvas.getContext('2d')!;
    const { width: W, height: H } = this.canvas;
    g.fillStyle = on ? '#e0a030' : '#3a4046';
    g.fillRect(0, 0, W, H);
    g.fillStyle = on ? '#1a1a1a' : '#f0ece0';
    g.font = `bold ${Math.round(H * 0.42)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, W / 2, H / 2 + 1, W - 12);
    this.tex.needsUpdate = true;
  }

  distanceTo(world: THREE.Vector3): number {
    return this.top.getWorldPosition(new THREE.Vector3()).distanceTo(world);
  }

  sync(): void {
    this.paint();
  }

  pressStart(): void {
    this.ctx?.haptic(0.4, 25);
    this.onPress();
  }
}

/**
 * The chart's face as a control: a press on it gives the spot (Control.pressPoint, in the
 * world) to `onPress` in chart metres (world x, z), from where it lies on the table.
 */
class ChartSurface extends Control {
  readonly kind = 'press' as const;
  label = 'Chart';
  constructor(
    private readonly face: THREE.Mesh,
    private readonly toChart: (local: THREE.Vector3) => { x: number; z: number } | null,
    private readonly onPress: (x: number, z: number) => void,
  ) {
    super('planChart', 'planChart');
    this.hitObjects.push(face);
  }

  distanceTo(world: THREE.Vector3): number {
    // From the chart's surface (its plane, within its edges), not its middle: it's big.
    const l = this.face.worldToLocal(world.clone());
    const g = this.face.geometry.boundingBox ?? (this.face.geometry.computeBoundingBox(), this.face.geometry.boundingBox!);
    const dx = Math.max(g.min.x - l.x, 0, l.x - g.max.x);
    const dz = Math.max(g.min.z - l.z, 0, l.z - g.max.z);
    return Math.hypot(dx, dz, l.y);
  }

  sync(): void {}

  pressStart(): void {
    if (!this.pressPoint) return;
    const at = this.toChart(this.face.worldToLocal(this.pressPoint.clone()));
    if (!at) return;
    this.ctx?.haptic(0.5, 30);
    this.onPress(at.x, at.z);
  }
}

export class PlanTable {
  readonly root = new THREE.Group();
  /** Its keys and the chart's face, for the interaction system. */
  readonly controls: Control[] = [];
  private tool: PlanTool = 'way';
  private readonly chartMat: THREE.MeshLambertMaterial;
  private readonly chartTex: THREE.CanvasTexture;
  private readonly overlay = document.createElement('canvas');
  private readonly overlayTex: THREE.CanvasTexture;
  private readonly boats: THREE.InstancedMesh;
  private readonly chartSurface: ChartSurface;
  /** The chart's size on the table (m) and its middle (the table's frame). */
  private readonly cw: number;
  private readonly cd: number;
  private readonly cz: number;
  private readonly topY: number;
  /** Drawn charts by view (a few kept: zooming in and back out shouldn't draw again). */
  private readonly drawn = new Map<string, HTMLCanvasElement>();
  private shownView = '';
  private shownSeq = -1;
  private clearArmed = 0;
  private keys: TableKey[] = [];

  /**
   * @param at  where it stands (world): its middle, the quay's deck height there, and the way
   *            its far edge (the chart's north) faces (radians, as a heading: 0 north)
   */
  constructor(
    at: { x: number; y: number; z: number; farHeading: number },
    private readonly host: PlanTableHost,
  ) {
    const t = CONFIG.voyage.plan.table;
    this.root.name = 'planTable';
    this.root.position.set(at.x, at.y, at.z);
    // The table's frame: -z its far edge (the chart's north), +x to the right as you stand at it.
    this.root.rotation.y = -at.farHeading;
    const W = t.width;
    const D = t.depth;
    const H = t.height;
    this.topY = H;
    const WOOD = 0x6a4a2c;
    const DARK = 0x3e2a18;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
    const frame = new THREE.Mesh(
      mergeParts([
        box(W + 0.08, 0.06, D + 0.08, 0, H - 0.03, 0, WOOD),
        // Raised rim round the chart, so nothing slides off on the quay.
        box(W + 0.08, 0.025, 0.04, 0, H + 0.0125, -D / 2 - 0.02, DARK),
        box(W + 0.08, 0.025, 0.04, 0, H + 0.0125, D / 2 + 0.02, DARK),
        box(0.04, 0.025, D + 0.08, -W / 2 - 0.02, H + 0.0125, 0, DARK),
        box(0.04, 0.025, D + 0.08, W / 2 + 0.02, H + 0.0125, 0, DARK),
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.09, H - 0.06, 0.09, sx * (W / 2 - 0.1), (H - 0.06) / 2, sz * (D / 2 - 0.1), DARK))),
        box(W - 0.2, 0.05, 0.05, 0, 0.25, 0, DARK), // a stretcher between the legs
      ]),
      flatVertexColorMaterial(),
    );
    frame.name = 'planTableFrame';
    this.root.add(frame);

    // The chart: the table's top less the keys' strip along the near edge.
    const keyD = t.keyDepth;
    this.cw = W - 0.06;
    this.cd = D - keyD - 0.08;
    this.cz = -(keyD + 0.02) / 2;
    const first = this.chartCanvas(wholeView());
    this.chartTex = new THREE.CanvasTexture(first);
    this.chartTex.colorSpace = THREE.SRGBColorSpace;
    this.chartTex.anisotropy = 4;
    this.chartMat = new THREE.MeshLambertMaterial({ map: this.chartTex });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(this.cw, this.cd).rotateX(-Math.PI / 2).translate(0, H + 0.002, this.cz), this.chartMat);
    face.name = 'planChart';
    face.geometry.computeBoundingBox();
    this.root.add(face);

    // The route sheet over it (transparent, redrawn when the plan changes).
    this.overlay.width = 1536;
    this.overlay.height = Math.round((1536 * this.cd) / this.cw);
    this.overlayTex = new THREE.CanvasTexture(this.overlay);
    this.overlayTex.colorSpace = THREE.SRGBColorSpace;
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cw, this.cd).rotateX(-Math.PI / 2).translate(0, H + 0.004, this.cz),
      new THREE.MeshBasicMaterial({ map: this.overlayTex, transparent: true, depthWrite: false }),
    );
    sheet.name = 'planRoute';
    this.root.add(sheet);

    // The players' boats: small arrowheads on the chart (one draw call for them all).
    const arrow = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.06), new THREE.Vector3(0.032, 0, 0.04), new THREE.Vector3(-0.032, 0, 0.04)]);
    arrow.computeVertexNormals();
    this.boats = new THREE.InstancedMesh(arrow, new THREE.MeshBasicMaterial({ color: 0x0050e0, side: THREE.DoubleSide }), 8);
    this.boats.count = 0;
    this.boats.frustumCulled = false;
    this.root.add(this.boats);

    this.chartSurface = new ChartSurface(face, (l) => this.localToChart(l), (x, z) => this.pressChart(x, z));
    this.root.add(this.chartSurface.root);
    this.controls.push(this.chartSurface);

    // The keys: the tools on the left, the actions on the right.
    const actions: { id: string; text: () => string; hover: string; press: () => void }[] = [
      { id: 'out', text: () => 'Zoom out', hover: 'Zoom the chart out', press: () => this.host.send('out') },
      { id: 'whole', text: () => 'Whole map', hover: 'The whole map on the chart', press: () => this.host.send('whole') },
      { id: 'undo', text: () => 'Undo', hover: 'Take the last point off', press: () => this.host.send('undo') },
      {
        id: 'clear',
        text: () => (performance.now() < this.clearArmed ? 'Sure?' : 'Clear'),
        hover: 'Clear the plan (press twice)',
        press: () => {
          if (performance.now() < this.clearArmed) {
            this.clearArmed = 0;
            this.host.send('clear');
          } else {
            this.clearArmed = performance.now() + 2500;
            this.host.notify('Press Clear again to take every point off the plan');
          }
        },
      },
    ];
    const n = TOOLS.length + actions.length;
    const gap = 0.02;
    const kw = (W - gap * (n + 1)) / n;
    const kz = D / 2 - keyD / 2 - 0.01;
    const keys: TableKey[] = [
      ...TOOLS.map(
        (o) =>
          new TableKey(`plan-${o.tool}`, o.text, () => o.text, () => this.tool === o.tool, () => {
            this.tool = o.tool;
            this.chartSurface.label = o.hover;
          }, kw, keyD - 0.02),
      ),
      ...actions.map((a) => new TableKey(`plan-${a.id}`, a.hover, a.text, () => a.id === 'clear' && performance.now() < this.clearArmed, a.press, kw, keyD - 0.02)),
    ];
    this.keys = keys;
    keys.forEach((k, i) => {
      k.root.position.set(-W / 2 + gap + kw / 2 + i * (kw + gap), H, kz);
      this.root.add(k.root);
      this.controls.push(k);
    });
    this.chartSurface.label = TOOLS[0].hover;
  }

  /** Stand somewhere else (the host went to another harbour: voyage/plan.ts tableFollows). */
  moveTo(at: { x: number; y: number; z: number; farHeading: number }): void {
    this.root.position.set(at.x, at.y, at.z);
    this.root.rotation.y = -at.farHeading;
    this.root.updateMatrixWorld(true);
  }

  /** A point on the chart's face (its own frame) -> chart metres; null off the chart. */
  private localToChart(l: THREE.Vector3): { x: number; z: number } | null {
    const u = l.x / this.cw + 0.5;
    const v = (l.z - this.cz) / this.cd + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const b = viewBounds(this.view);
    return { x: b.x0 + u * (b.x1 - b.x0), z: b.z0 + v * (b.z1 - b.z0) };
  }

  /** Chart metres -> the table's frame on the chart's face (y the chart's top). */
  private chartToLocal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const b = viewBounds(this.view);
    return out.set(((x - b.x0) / (b.x1 - b.x0) - 0.5) * this.cw, this.topY + 0.006, ((z - b.z0) / (b.z1 - b.z0) - 0.5) * this.cd + this.cz);
  }

  private view: PlanView = wholeView();

  private pressChart(x: number, z: number): void {
    const b = viewBounds(this.view);
    if (this.tool === 'zoom') this.host.send('zoom', [x, z]);
    else if (this.tool === 'remove') this.host.send('remove', [x, z, (b.x1 - b.x0) * CONFIG.voyage.plan.removeShare]);
    else this.host.send(`add:${this.tool}`, [x, z]);
  }

  /** The chart for a view: drawn once, then kept (the last few). */
  private chartCanvas(v: PlanView): HTMLCanvasElement {
    const key = `${Math.round(v.cx)},${Math.round(v.cz)},${Math.round(v.span)}`;
    const had = this.drawn.get(key);
    if (had) return had;
    const r = REGIONS[0];
    const span = v.span;
    const chart = drawPaperChart(CONFIG.voyage.plan.drawPx, {
      id: `plan-${key}`,
      title: r ? r.name.toUpperCase() : 'CHART',
      bounds: viewBounds(v),
      // The grid and the soundings thin out as more sea is shown.
      gridMinutes: span > 16000 ? 2 : span > 6000 ? 1 : 0.5,
      soundingStep: Math.max(120, span / 16),
      textScale: 1,
      islands: r?.islands ?? [],
    });
    this.drawn.set(key, chart.canvas);
    while (this.drawn.size > 6) this.drawn.delete(this.drawn.keys().next().value!);
    return chart.canvas;
  }

  /** Each frame: the chart for the shared view, the route when the plan changes, the boats where they are, the keys' faces. */
  update(world: WorldState): void {
    const plan = world.plan;
    const v = plan?.view ?? wholeView();
    const key = `${v.cx},${v.cz},${v.span}`;
    if (key !== this.shownView) {
      this.shownView = key;
      this.view = v;
      this.chartTex.image = this.chartCanvas(v);
      this.chartTex.needsUpdate = true;
      this.shownSeq = -1;
    }
    if ((plan?.seq ?? 0) !== this.shownSeq) {
      this.shownSeq = plan?.seq ?? 0;
      this.drawRoute(world);
    }
    // The boats.
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const b = viewBounds(this.view);
    let n = 0;
    for (const s of playerBoats(world)) {
      if (n >= this.boats.instanceMatrix.count) break;
      const [x, , z] = s.position;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      const [qx, qy, qz, qw] = s.orientation;
      const heading = Math.atan2(-(2 * (qx * qz + qw * qy)), 1 - 2 * (qx * qx + qy * qy));
      this.chartToLocal(x, z, p);
      // The arrow points -z (the chart's north) at heading 0; a heading turns it clockwise seen from above.
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading);
      this.boats.setMatrixAt(n++, m.compose(p, q, one));
    }
    this.boats.count = n;
    this.boats.instanceMatrix.needsUpdate = true;
    for (const k of this.keys) k.paint();
  }

  /** The route sheet: every point joined up, numbered and named; the next ringed; what's next along its foot. */
  private drawRoute(world: WorldState): void {
    const g = this.overlay.getContext('2d')!;
    const { width: W, height: H } = this.overlay;
    g.clearRect(0, 0, W, H);
    const plan = world.plan;
    const b = viewBounds(this.view);
    const px = (x: number) => ((x - b.x0) / (b.x1 - b.x0)) * W;
    const pz = (z: number) => ((z - b.z0) / (b.z1 - b.z0)) * H;
    const pts = plan?.points ?? [];
    const next = plan?.next ?? 0;
    g.lineWidth = 9;
    g.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      g.strokeStyle = i <= next ? DONE : ROUTE;
      g.setLineDash(i <= next ? [16, 14] : []);
      g.beginPath();
      g.moveTo(px(pts[i - 1].x), pz(pts[i - 1].z));
      g.lineTo(px(pts[i].x), pz(pts[i].z));
      g.stroke();
    }
    g.setLineDash([]);
    g.font = 'bold 40px system-ui, sans-serif';
    g.textBaseline = 'middle';
    pts.forEach((p, i) => {
      const x = px(p.x);
      const y = pz(p.z);
      const col = i < next ? DONE : ROUTE;
      g.fillStyle = col;
      g.strokeStyle = '#fff8e8';
      g.lineWidth = 4;
      g.beginPath();
      if (p.kind === 'stop') g.rect(x - 22, y - 22, 44, 44);
      else if (p.kind === 'look') {
        g.moveTo(x, y - 27);
        g.lineTo(x + 27, y);
        g.lineTo(x, y + 27);
        g.lineTo(x - 27, y);
        g.closePath();
      } else g.arc(x, y, 18, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (i === next) {
        g.strokeStyle = '#ffb000';
        g.lineWidth = 7;
        g.beginPath();
        g.arc(x, y, 40, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#fffaf0';
      g.textAlign = 'center';
      g.fillText(String(i + 1), x, y + 1);
      if (p.name) {
        g.textAlign = 'left';
        g.lineWidth = 9;
        g.strokeStyle = 'rgba(255, 250, 235, 0.9)';
        g.strokeText(p.name, x + 34, y - 30);
        g.fillStyle = col;
        g.fillText(p.name, x + 34, y - 30);
      }
    });
    // What's next, along the chart's foot.
    const n = nextPoint(world);
    const line = !pts.length ? 'No plan yet: pick a tool below, then press the chart' : n ? `Next: ${pointLabel(n.p, n.i)}   (${pts.length} ${pts.length === 1 ? 'point' : 'points'})` : `Plan done: all ${pts.length} points reached`;
    g.font = 'bold 38px system-ui, sans-serif';
    g.textAlign = 'left';
    const tw = g.measureText(line).width;
    g.fillStyle = 'rgba(255, 250, 235, 0.92)';
    g.fillRect(14, H - 70, tw + 28, 54);
    g.fillStyle = '#3a1830';
    g.fillText(line, 28, H - 42);
    this.overlayTex.needsUpdate = true;
  }
}

/**
 * Where the table stands (by a berth: the plan's harbour's, voyage/plan.ts tableBerthId;
 * by default the map's start): the nearest spot to the spot ashore by that berth (where you begin on the
 * quay) with level ground under all four legs (a quay or pier deck, or flat land; within a
 * quarter metre of each other), clear of the buildings, at least `table.back` m from the
 * spot, out to 80 m. Its far edge (the chart's north) faces away from the start spot, so you
 * walk up to it and read it the right way up; right behind the spot, that's away from the
 * water. (Tayvallich starts on a pontoon with water behind it: the table goes ashore.)
 * Null if none found (no table).
 */
export function planTableSpot(berthId?: string | null): { x: number; y: number; z: number; farHeading: number } | null {
  const b = berthWithId(berthId ?? startBerthId());
  if (!b) return null;
  const q = quaySpot(b.id);
  const t = CONFIG.voyage.plan.table;
  const buildings = REGIONS.flatMap((r) => r.buildings);
  const inBuilding = (x: number, z: number) =>
    buildings.some((o) => {
      const yaw = (o.yawDeg * Math.PI) / 180;
      const dx = x - o.x;
      const dz = z - o.z;
      const lx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const lz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
      return Math.abs(lx) <= o.width / 2 + 1 && Math.abs(lz) <= o.depth / 2 + 1;
    });
  /** Its deck height there facing (ax, az) away from the spot, or null (a leg off level ground, or in a building). */
  const fits = (x: number, z: number, ax: number, az: number): number | null => {
    let top = -Infinity;
    let low = Infinity;
    for (const [s, f] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]]) {
      // A leg: s along its long side (to the right as you face it), f away from you.
      const lx = x + ((s * t.width) / 2) * -az + ((f * t.depth) / 2) * ax;
      const lz = z + ((s * t.width) / 2) * ax + ((f * t.depth) / 2) * az;
      const y = landFloor(lx, lz);
      if (y === null || y < 0.2 || inBuilding(lx, lz)) return null;
      top = Math.max(top, y);
      low = Math.min(low, y);
    }
    return top - low <= 0.25 ? top : null;
  };
  // Right behind the spot first, away from the water; then ring by ring outward.
  const tries: [number, number][] = [[q.x + b.shoreX * t.back, q.z + b.shoreZ * t.back]];
  for (let r = t.back; r <= 80; r += 2) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 2));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      tries.push([q.x + Math.cos(a) * r, q.z + Math.sin(a) * r]);
    }
  }
  for (const [x, z] of tries) {
    const d = Math.hypot(x - q.x, z - q.z) || 1;
    const ax = (x - q.x) / d;
    const az = (z - q.z) / d;
    const y = fits(x, z, ax, az);
    if (y !== null) return { x, y, z, farHeading: Math.atan2(ax, -az) };
  }
  return null;
}
