import * as THREE from 'three';
import { Control, type Wiring } from '../../controls/Control';
import { Toggle } from '../../controls/Toggle';
import type { VesselState } from '../vesselState';
import { drawPaperChart, type PaperChart } from '../../nav/paperChart';
import { SHEETS, type ChartSheet } from '../../nav/chartSheets';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import type { CONFIG } from '../../config';
import { REGIONS, regionById } from '../../world/regions';

/** Its plan from its own corner, its lamp and switch (the chart-table module gives them). */
type ChartTableConfig = typeof CONFIG.vessels.workboat.chartTable;

/**
 * The chart table: a drop-leaf on the port wall (owner request: with the logbook gone the
 * fixed table was too big). The leaf is hinged along the wall at table height on a wooden
 * batten; unfolded it's a table, held up by a leg that swings down from its inboard edge;
 * folded, it hangs flat against the wall with the chart facing into the wheelhouse, still
 * readable, and the floor in front of it is free. A press on the knob on its inboard edge
 * folds or unfolds it (ChartLeafHandle, vessel control `chartLeaf`). The lamp stands on the
 * leaf on a stalk, its gooseneck curving over the chart (owner); its switch is on the batten.
 *
 * You stand on its inboard side facing the wall, so the chart lies north to port: chart
 * east runs forward (-z), north outboard (-x). The chart covers the leaf's depth;
 * `chartToTable` maps world metres on the chart to table coordinates (milestone 7 draws on
 * it). Everything on the leaf (chart, pen holder, dividers, and the chart tools and marks,
 * which App puts in `leafFrame`) lives in a frame that is the table's own frame while it's
 * unfolded, so the chart maths needs no change; drawing works only unfolded.
 *
 * Light: the chart is unlit (basic) materials whose brightness follows the daylight, the
 * cabin lamp and this lamp (setLight) - the lamp costs no real light.
 */
export class ChartTableView {
  readonly root = new THREE.Group();
  /** The lamp switch (Deck lights breaker), for the interaction system. */
  readonly lampSwitch: Toggle;
  /** The knob that folds and unfolds the leaf, for the interaction system. */
  readonly leafHandle: ChartLeafHandle;
  /** The chart rack on the wall above the table: a press turns to the next sheet (regions: the archipelago sheet, a sheet per region; then the planning chart). */
  readonly sheetTab: ChartSheetTab;
  /** The leaf's contents' frame: the table frame while unfolded (chart tools go in here). */
  readonly leafFrame = new THREE.Group();
  readonly top: number;
  /** The pen holder on the table top [x, z] (the hand tools stand by it). */
  readonly holderAt: [number, number];
  private readonly chartMat: THREE.MeshBasicMaterial;
  /** The table's own material: a warm glow while the lamp is on (no real light). */
  private readonly tableMat: THREE.MeshLambertMaterial;
  private readonly bulbMat: THREE.MeshBasicMaterial;
  /** The sheet on the table now, and the others once drawn (nav/chartSheets.ts; drawn when first turned to). */
  private chart: PaperChart;
  private sheetIndex = Math.max(0, SHEETS.findIndex((s) => s.id === (regionById('home') ?? REGIONS[0]).id));
  private readonly drawn = new Map<string, PaperChart>();
  private readonly chartTex: THREE.CanvasTexture;
  /** The chart on the leaf (the paper sheet, or the planning chart), for the planning chart's pointer. */
  readonly chartFace: THREE.Mesh;
  /** The planning chart's picture (the App's: voyage/chartPad.ts), the last "sheet" in the rack; null: none. */
  private planTexture: THREE.Texture | null = null;
  /** Table metres per world metre on the chart, and the chart's centre on the table. */
  scale: number;
  private readonly chartDepth: number;
  private readonly chartCenter: THREE.Vector3;
  private lit = -1;

  /**
   * @param keys what its lamp switch and leaf knob send and read (the chart-table module's
   *             bus keys; by default the old channels)
   */
  constructor(cfg: ChartTableConfig, floorY: number, keys: { lamp?: Wiring; leaf?: Wiring } = {}) {
    this.root.name = 'chartTable';
    const T = floorY + cfg.height;
    this.top = T;
    this.holderAt = cfg.holder;
    const { x0, x1, z0, z1 } = cfg;
    const box = (ax: number, bx: number, ay: number, by: number, az: number, bz: number, c: number) =>
      part(new THREE.BoxGeometry(bx - ax, by - ay, bz - az).translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), c);
    const WOOD = 0x7a5230;
    const DARK = 0x4e3420;
    this.tableMat = flatVertexColorMaterial();

    // On the wall: the batten the leaf hangs from.
    const wall = new THREE.Mesh(mergeParts([box(x0, x0 + 0.03, T - 0.09, T - 0.04, z0, z1, DARK)]), this.tableMat);
    wall.name = 'chartTableWall';
    // The lamp (owner, from a picture: a gooseneck reading lamp fixed to the table, not hung
    // off the wall): a round black base with a rocker switch on its face, at the leaf's wall
    // edge; a long flexible neck rising from it and arching over; a cylindrical head on its
    // end, aimed down and out at the chart, its lens in the open end. Part of the leaf: it
    // folds down with it. (Not moveable yet; its switch is the one on the batten.)
    const lp = cfg.lamp;
    const BLACK = 0x1a1c1e;
    const foot = new THREE.Vector3(x0 + 0.07, T, lp.base[1]);
    // The head's axis: down and out over the chart, 35° off the vertical.
    const tilt = (35 * Math.PI) / 180;
    const aim = new THREE.Vector3(Math.sin(tilt), -Math.cos(tilt), 0);
    const mouth = new THREE.Vector3(lp.head[0], T + lp.height * 0.62, lp.head[1]);
    const headLen = 0.1;
    const neckEnd = mouth.clone().addScaledVector(aim, -headLen);
    const neck = new THREE.CatmullRomCurve3([
      new THREE.Vector3(foot.x - 0.01, T + 0.035, foot.z),
      new THREE.Vector3(foot.x - 0.005, T + lp.height * 0.6, foot.z),
      new THREE.Vector3(foot.x + (neckEnd.x - foot.x) * 0.4, T + lp.height, foot.z),
      new THREE.Vector3(neckEnd.x - 0.03, neckEnd.y + 0.06, neckEnd.z),
      neckEnd,
    ]);
    const along = (g: THREE.BufferGeometry, at: THREE.Vector3) => g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim)).translate(at.x, at.y, at.z);
    const lampParts = [
      part(new THREE.CylinderGeometry(0.05, 0.055, 0.035, 20).translate(foot.x, T + 0.0175, foot.z), BLACK), // base
      box(foot.x + 0.045, foot.x + 0.056, T + 0.01, T + 0.026, foot.z - 0.012, foot.z + 0.012, 0x3a3d40), // its rocker switch
      part(new THREE.TubeGeometry(neck, 32, 0.008, 8), BLACK), // the gooseneck
      part(along(new THREE.CylinderGeometry(0.026, 0.024, headLen, 16, 1, true), neckEnd.clone().addScaledVector(aim, headLen / 2)), BLACK), // the head
      part(along(new THREE.CylinderGeometry(0.016, 0.026, 0.02, 16), neckEnd), BLACK), // its back, where the neck joins
    ];
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0x4a463e });
    // The lens, just inside the head's open end.
    const bulb = new THREE.Mesh(along(new THREE.CylinderGeometry(0.021, 0.021, 0.004, 16), new THREE.Vector3()), this.bulbMat);
    bulb.position.copy(mouth).addScaledVector(aim, -0.008);

    // The leaf: top, fiddle rails (outboard, forward, aft; the inboard edge stays open to
    // lean on), hinge knuckles, pen holder, dividers. In table coordinates, inside leafFrame.
    const parts: THREE.BufferGeometry[] = [
      box(x0, x1, T - 0.04, T, z0, z1, WOOD),
      box(x0, x0 + 0.02, T, T + 0.022, z0, z1, WOOD),
      box(x0, x1, T, T + 0.022, z0, z0 + 0.02, WOOD),
      box(x0, x1, T, T + 0.022, z1 - 0.02, z1, WOOD),
      ...[z0 + 0.12, z1 - 0.12].map((z) => part(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8).rotateX(Math.PI / 2).translate(x0 + 0.01, T - 0.045, z), 0x9aa0a6)),
    ];
    const [hx, hz] = cfg.holder;
    parts.push(part(new THREE.CylinderGeometry(0.032, 0.03, 0.085, 12).translate(hx, T + 0.0425, hz), 0x2c3a44));
    for (const a of [-0.12, 0.12]) parts.push(placed(new THREE.BoxGeometry(0.005, 0.005, 0.16).translate(0, 0, -0.08), x0 + 0.12, T + 0.004, z0 + 0.58, 2.3 + a, 0x9aa0a6));
    parts.push(...lampParts);
    const leaf = new THREE.Mesh(mergeParts(parts), this.tableMat);
    leaf.name = 'chartTableBody';
    // The leg (a gate leg): hinged under the leaf at its inboard aft corner, down to the floor
    // when unfolded; folding, it swings forward to lie flat along the underside (the leaf is
    // longer fore-aft than the leg, so it tucks in clear of the hinge).
    const legLen = T - 0.04 - floorY;
    const leg = new THREE.Mesh(mergeParts([box(-0.025, 0.025, -legLen, 0, -0.03, 0.03, DARK), box(-0.05, 0.05, -legLen, -legLen + 0.02, -0.05, 0.05, DARK)]), this.tableMat);
    const legPivot = new THREE.Group();
    legPivot.position.set(x1 - 0.06, T - 0.04, z1 - 0.05);
    legPivot.add(leg);

    // The paper chart, north to port (-x), east forward (-z): basis X -> -z, Y -> -x, Z -> +y.
    this.chart = drawPaperChart(2048, SHEETS[this.sheetIndex]);
    this.drawn.set(SHEETS[this.sheetIndex].id, this.chart);
    const b = this.chart.bounds;
    const depth = x1 - x0 - 0.06;
    this.chartDepth = depth;
    this.scale = depth / (b.z1 - b.z0);
    const cw = (b.x1 - b.x0) * this.scale;
    const ch = depth;
    const tex = new THREE.CanvasTexture(this.chart.canvas);
    this.chartTex = tex;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16; // clamped to what the GPU allows: crisp at a slant from standing height
    this.chartMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), this.chartMat);
    chart.name = 'paperChart';
    this.chartFace = chart;
    this.chartCenter = new THREE.Vector3((x0 + x1) / 2, T + 0.001, z0 + 0.03 + cw / 2);
    chart.matrixAutoUpdate = false;
    chart.matrix.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)).setPosition(this.chartCenter);

    // The hinge: a pivot on the wall at the leaf's outboard edge (axis fore-aft); leafFrame
    // inside it is offset back so that, unfolded, it is exactly the table's frame.
    const pivot = new THREE.Group();
    pivot.position.set(x0, T - 0.02, 0);
    this.leafFrame.position.set(-x0, -(T - 0.02), 0);
    pivot.add(this.leafFrame);
    this.leafHandle = new ChartLeafHandle(pivot, legPivot, keys.leaf);
    this.leafHandle.root.position.set(x1, T - 0.02, (z0 + z1) / 2);
    this.leafFrame.add(leaf, chart, bulb, legPivot, this.leafHandle.root);
    // The chart rack: a pigeonhole of folded charts on the wall above the table's forward
    // end, clear of the paper (a click on the paper is the pencil's). A press turns to the
    // next sheet. On the wall, not the leaf: it stays put when the leaf folds.
    this.sheetTab = new ChartSheetTab(() => this.nextSheet());
    this.sheetTab.root.position.set(x0 + 0.045, T + 0.14, z0 + 0.14);

    this.lampSwitch = new Toggle('chartLamp', keys.lamp?.channel ?? 'chartLamp', 'Chart table lamp', keys.lamp?.read ?? ((s) => s.controls.chartLamp));
    // On the batten, aft end, its lever moving up and down the wall.
    this.lampSwitch.root.position.set(x0 + 0.03, T - 0.065, cfg.lampSwitch[1]);
    this.lampSwitch.root.rotation.z = -Math.PI / 2; // its "up" out of the wall (+x)
    this.lampSwitch.root.scale.setScalar(0.8);
    this.root.add(wall, pivot, this.lampSwitch.root, this.sheetTab.root);
    this.detail = [chart, bulb];
  }

  /** The paper sheet on the table (or the last one, while the planning chart is out). */
  get sheet(): ChartSheet {
    return SHEETS[Math.min(this.sheetIndex, SHEETS.length - 1)];
  }

  /**
   * The planning chart out on the leaf (owner, 29 Oct 2026: "the drop-leaf chart table shows
   * the planning chart on its leaf"): the rack's last "sheet", after the paper ones. The
   * pencil and its marks are put by while it's out (they're the paper's).
   */
  get planning(): boolean {
    return this.sheetIndex >= SHEETS.length;
  }

  /** The planning chart's picture (its canvas the chart's shape: planAspect), the rack's last sheet. */
  setPlanChart(texture: THREE.Texture): void {
    this.planTexture = texture;
  }

  /** The chart's width (along the leaf) over its depth (across it), for the planning chart's picture. */
  get planAspect(): number {
    const g = this.chartFace.geometry as THREE.PlaneGeometry;
    return g.parameters.width / g.parameters.height;
  }

  /** Turn to the next sheet (drawn the first time it's wanted); the marks, in world metres, fall where they should. */
  nextSheet(): void {
    this.sheetIndex = (this.sheetIndex + 1) % (SHEETS.length + (this.planTexture ? 1 : 0));
    if (this.planning) {
      this.chartMat.map = this.planTexture;
      this.chartMat.needsUpdate = true;
      return;
    }
    if (this.chartMat.map !== this.chartTex) {
      this.chartMat.map = this.chartTex;
      this.chartMat.needsUpdate = true;
    }
    const sheet = SHEETS[this.sheetIndex];
    let chart = this.drawn.get(sheet.id);
    if (!chart) {
      chart = drawPaperChart(2048, sheet);
      this.drawn.set(sheet.id, chart);
    }
    this.chart = chart;
    const b = chart.bounds;
    // The sheets share one shape, so the paper on the table stays the same size.
    this.scale = this.chartDepth / (b.z1 - b.z0);
    this.chartTex.image = chart.canvas;
    this.chartTex.needsUpdate = true;
  }

  /** Unfolded all the way (the chart can be drawn on, read from above). */
  get isOpen(): boolean {
    return this.leafHandle.fullyOpen;
  }

  /** The chart and the lamp bulb (the small things), hidden from afar to save draw calls. */
  private detail: THREE.Object3D[] = [];
  setDetail(on: boolean): void {
    for (const o of this.detail) o.visible = on;
  }

  /** The chart's rectangle on the table (the table's own frame: its root) and its surface height. */
  get chartRect(): { x0: number; x1: number; z0: number; z1: number; y: number } {
    const b = this.chart.bounds;
    const hn = ((b.z1 - b.z0) * this.scale) / 2;
    const he = ((b.x1 - b.x0) * this.scale) / 2;
    const c = this.chartCenter;
    return { x0: c.x - hn, x1: c.x + hn, z0: c.z - he, z1: c.z + he, y: c.y };
  }

  /** Table point (its own frame) -> world metres on the chart. */
  tableToChart(x: number, z: number): { x: number; z: number } {
    const b = this.chart.bounds;
    const n = this.chartCenter.x - x; // outboard = north
    const e = this.chartCenter.z - z; // forward = east
    return { x: (b.x0 + b.x1) / 2 + e / this.scale, z: (b.z0 + b.z1) / 2 - n / this.scale };
  }

  /** World metres on the chart -> table point (its own frame) on the chart's surface. */
  chartToTable(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const b = this.chart.bounds;
    const e = (x - (b.x0 + b.x1) / 2) * this.scale; // east -> -z
    const n = ((b.z0 + b.z1) / 2 - z) * this.scale; // north -> -x
    return out.set(this.chartCenter.x - n, this.chartCenter.y, this.chartCenter.z - e);
  }

  /**
   * @param paper the chart's colour for the light on it (render/nightPaper.ts: dim, and red
   *              at night)
   * @param lampOn the lamp is lit (switched on and powered)
   */
  setLight(paper: THREE.Color, lampOn: boolean): void {
    // Red light at night: the lamp's bulb and its glow on the table go red too.
    const red = paper.r > 0.01 && paper.g / paper.r < 0.6;
    const key = Math.round(paper.r * 100) * 10000 + Math.round(paper.g * 100) * 10 + (lampOn ? 1 : 0);
    if (key === this.lit) return;
    this.lit = key;
    this.chartMat.color.copy(paper);
    this.bulbMat.color.setHex(lampOn ? (red ? 0xff5a3a : 0xfff0c0) : 0x4a463e);
    this.tableMat.emissive.setHex(lampOn ? (red ? 0x2a0804 : 0x3a2a14) : 0x000000);
  }
}

/** A part turned about the vertical by `yaw` and placed at (x, y, z). */
function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number, color: number): THREE.BufferGeometry {
  return part(geo.rotateY(yaw).translate(x, y, z), color);
}

/**
 * The leaf's fold knob: a wooden knob on the leaf's inboard edge. A press folds the leaf
 * down against the wall (the leg swings up under it first) or lifts it back up (vessel
 * control `chartLeaf`: 1 unfolded, 0 folded; it starts unfolded). About a second either way.
 */
export class ChartLeafHandle extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Chart table: fold / unfold';
  /** 1 unfolded, 0 folded, in between while it moves. */
  private open = 1;
  private target = 1;
  private pressed = false;

  private readonly read: (s: VesselState) => number;

  constructor(
    private readonly pivot: THREE.Object3D,
    private readonly legPivot: THREE.Object3D,
    wiring: Wiring = {},
  ) {
    super('chartLeaf', wiring.channel ?? 'chartLeaf');
    this.read = wiring.read ?? ((s) => s.controls.chartLeaf ?? 1);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.03, 10).rotateZ(Math.PI / 2).translate(0.015, 0, 0), this.material(0xb8a070));
    this.root.add(knob);
    this.hitObjects.push(knob);
  }

  get fullyOpen(): boolean {
    return this.open >= 1;
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).length();
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.target = this.target > 0.5 ? 0 : 1;
    this.markPending();
    this.ctx?.haptic(0.5, 40);
    this.ctx?.emit(this.channel, this.target);
  }

  pressEnd(): void {
    this.pressed = false;
  }

  sync(state: VesselState): void {
    const open = this.read(state) > 0.5 ? 1 : 0;
    if (this.awaiting(open === this.target)) return;
    this.target = open;
  }

  tick(dt: number): void {
    super.tick(dt);
    if (this.open === this.target) return;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), dt * 1.2);
    // The leg folds in over the first half; the leaf drops over the whole travel, ending
    // hanging straight down against the wall (its top facing into the wheelhouse).
    const f = 1 - this.open;
    this.legPivot.rotation.x = Math.min(1, f * 2) * (Math.PI / 2);
    this.pivot.rotation.z = -f * (Math.PI / 2);
  }
}

/**
 * The chart rack (regions): a wooden pigeonhole on the wall above the chart table with the
 * other sheets folded in it. A press on it turns the table to the next sheet: the
 * archipelago sheet, then each region's detail sheet, then home's again. Each player's own
 * table shows the sheet they turned to (nothing is sent: the pencil marks are in world
 * metres and fall on whichever sheet is out). Its root sits on the wall (x out of the wall).
 */
export class ChartSheetTab extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Chart rack: next sheet (the last is the planning chart)';
  private pressed = false;

  constructor(private readonly onTurn: () => void) {
    super('chartSheet', 'chartSheet');
    const wood = this.material(0x6a4a2e);
    // The box: an open pigeonhole 16 cm wide, 9 cm tall, 7 cm deep, its mouth facing into the wheelhouse (+x).
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.09, 0.16).translate(-0.03, 0, 0), wood);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.16).translate(0, -0.045, 0), wood);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.16).translate(0, 0.045, 0), wood);
    const sides = [-1, 1].map((s) => new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.01).translate(0, 0, s * 0.075), wood));
    // The folded charts in it, their spines out: a few sheets of paper leaning together.
    const paper = this.material(0xe8dfc0);
    const charts = [-0.02, 0, 0.02].map((dz, i) => new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.012).translate(0.005, -0.002 + i * 0.003, dz), paper));
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.06, 0.05).translate(0.034, 0, 0), this.material(0x9a1f78));
    this.root.add(back, bottom, top, ...sides, ...charts, spine);
    this.hitObjects.push(back, bottom, top, ...sides, ...charts);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).length();
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.ctx?.haptic(0.3, 30);
    this.onTurn();
  }

  pressEnd(): void {
    this.pressed = false;
  }

  sync(): void {}
}
