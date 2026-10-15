import * as THREE from 'three';
import { Toggle } from '../../controls/Toggle';
import { drawPaperChart, type PaperChart } from '../../nav/paperChart';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import type { VesselDef } from '../vesselDef';

type ChartTableConfig = NonNullable<VesselDef['chartTable']>;

/**
 * The chart table along the port wall (vessel axes). One merged static mesh for the
 * table, cabinet, fiddle rails, pen holder with pencil and eraser, parallel rule, dividers
 * and the lamp's stand and shade; plus the paper chart (drawn once), the lamp's bulb and
 * its switch. The logbook lies at the aft end (log/logbookView.ts).
 *
 * You stand on its inboard side facing the wall, so the chart lies north to port: chart
 * east runs forward (-z), north outboard (-x). The chart covers the table's depth;
 * `chartToTable` maps world metres on the chart to table coordinates (milestone 7 draws
 * on it).
 *
 * Light: the chart and the book are unlit (basic) materials whose brightness follows the
 * daylight, the cabin lamp and this lamp (setLight) - the lamp costs no real light.
 */
export class ChartTableView {
  readonly root = new THREE.Group();
  /** The lamp switch (Deck lights breaker), for the interaction system. */
  readonly lampSwitch: Toggle;
  readonly top: number;
  private readonly chartMat: THREE.MeshBasicMaterial;
  /** The table's own material: a warm glow while the lamp is on (no real light). */
  private readonly tableMat: THREE.MeshLambertMaterial;
  private readonly bulbMat: THREE.MeshBasicMaterial;
  private readonly chart: PaperChart;
  /** Table metres per world metre on the chart, and the chart's centre on the table. */
  readonly scale: number;
  private readonly chartCenter: THREE.Vector3;
  private lit = -1;

  constructor(cfg: ChartTableConfig, floorY: number) {
    this.root.name = 'chartTable';
    const T = floorY + cfg.height;
    this.top = T;
    const { x0, x1, z0, z1 } = cfg;
    const box = (ax: number, bx: number, ay: number, by: number, az: number, bz: number, c: number) =>
      part(new THREE.BoxGeometry(bx - ax, by - ay, bz - az).translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), c);
    const WOOD = 0x7a5230;
    const DARK = 0x4e3420;
    const parts: THREE.BufferGeometry[] = [
      box(x0, x1, T - 0.04, T, z0, z1, WOOD), // top
      box(x0, x1 - 0.03, floorY, T - 0.04, z0 + 0.01, z1 - 0.01, DARK), // cabinet
      // Fiddle rails: outboard, forward and aft edges (the inboard edge stays open to lean on).
      box(x0, x0 + 0.02, T, T + 0.022, z0, z1, WOOD),
      box(x0, x1, T, T + 0.022, z0, z0 + 0.02, WOOD),
      box(x0, x1, T, T + 0.022, z1 - 0.02, z1, WOOD),
      // Drawer fronts and handles on the inboard face.
      ...[0.35, 0.62].flatMap((f) => {
        const y = floorY + cfg.height * f;
        return [box(x1 - 0.035, x1 - 0.028, y - 0.11, y + 0.11, z0 + 0.06, z1 - 0.06, 0x6a4628), box(x1 - 0.03, x1 - 0.012, y - 0.012, y + 0.012, (z0 + z1) / 2 - 0.08, (z0 + z1) / 2 + 0.08, 0xb8a070)];
      }),
    ];
    // Pen holder: a cup with a pencil standing in it, the eraser beside it.
    const [hx, hz] = cfg.holder;
    parts.push(part(new THREE.CylinderGeometry(0.032, 0.03, 0.085, 12).translate(hx, T + 0.0425, hz), 0x2c3a44));
    parts.push(part(new THREE.CylinderGeometry(0.0045, 0.0045, 0.17, 6).rotateZ(0.18).translate(hx + 0.012, T + 0.1, hz + 0.008), 0xe8c030));
    parts.push(part(new THREE.BoxGeometry(0.025, 0.014, 0.05).translate(hx + 0.07, T + 0.007, hz + 0.02), 0xe88a9a));
    // Parallel rule (two perspex rules and their brass links) and dividers, lying on the chart.
    const rx = (x0 + x1) / 2 + 0.1;
    const rz = z0 + 0.22;
    for (const off of [-0.035, 0.035]) parts.push(placed(new THREE.BoxGeometry(0.04, 0.005, 0.32).translate(off, 0, 0), rx, T + 0.004, rz, 0.3, 0xcfe0dc));
    for (const zz of [-0.1, 0.1]) parts.push(placed(new THREE.BoxGeometry(0.08, 0.007, 0.01).translate(0, 0, zz), rx, T + 0.008, rz, 0.3, 0xb89040));
    for (const a of [-0.12, 0.12]) parts.push(placed(new THREE.BoxGeometry(0.005, 0.005, 0.16).translate(0, 0, -0.08), x0 + 0.12, T + 0.004, z0 + 0.58, 2.3 + a, 0x9aa0a6));
    // Lamp: weighted base, stem, arm reaching over the book, shade.
    const lp = cfg.lamp;
    const [lx, lz] = lp.base;
    const head = new THREE.Vector3(cfg.book.center[0] + 0.02, T + lp.height, (cfg.book.center[1] + lz) / 2);
    parts.push(part(new THREE.CylinderGeometry(0.06, 0.07, 0.025, 14).translate(lx, T + 0.0125, lz), 0x1f3a2a));
    parts.push(part(new THREE.CylinderGeometry(0.008, 0.008, lp.height).translate(lx, T + lp.height / 2, lz), 0x9aa0a6));
    parts.push(bar(new THREE.Vector3(lx, T + lp.height, lz), head, 0.008, 0x9aa0a6));
    parts.push(part(new THREE.CylinderGeometry(0.03, 0.085, 0.09, 16, 1, true).translate(head.x, head.y - 0.03, head.z), 0x1f4a32));
    parts.push(part(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16).translate(head.x, head.y + 0.015, head.z), 0x1f4a32));
    this.tableMat = flatVertexColorMaterial();
    const table = new THREE.Mesh(mergeParts(parts), this.tableMat);
    table.name = 'chartTableBody';
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0x4a463e });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 6), this.bulbMat);
    bulb.position.set(head.x, head.y - 0.04, head.z);

    // The paper chart, north to port (-x), east forward (-z): basis X -> -z, Y -> -x, Z -> +y.
    this.chart = drawPaperChart();
    const b = this.chart.bounds;
    const depth = x1 - x0 - 0.06;
    this.scale = depth / (b.z1 - b.z0);
    const cw = (b.x1 - b.x0) * this.scale;
    const ch = depth;
    const tex = new THREE.CanvasTexture(this.chart.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.chartMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), this.chartMat);
    chart.name = 'paperChart';
    this.chartCenter = new THREE.Vector3((x0 + x1) / 2, T + 0.001, z0 + 0.03 + cw / 2);
    chart.matrixAutoUpdate = false;
    chart.matrix.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)).setPosition(this.chartCenter);

    this.lampSwitch = new Toggle('chartLamp', 'chartLamp', 'Chart table lamp', (s) => s.controls.chartLamp);
    this.lampSwitch.root.position.set(cfg.lampSwitch[0], T, cfg.lampSwitch[1]);
    this.lampSwitch.root.rotation.y = -Math.PI / 2; // lever moves toward / away from you
    this.lampSwitch.root.scale.setScalar(0.8);
    this.root.add(table, chart, bulb, this.lampSwitch.root);
  }

  /** World metres on the chart -> table (vessel axes) point on the chart's surface. */
  chartToTable(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const b = this.chart.bounds;
    const e = (x - (b.x0 + b.x1) / 2) * this.scale; // east -> -z
    const n = ((b.z0 + b.z1) / 2 - z) * this.scale; // north -> -x
    return out.set(this.chartCenter.x - n, this.chartCenter.y, this.chartCenter.z - e);
  }

  /**
   * @param level brightness 0..1 of the chart (daylight, cabin lamp, this lamp)
   * @param lampOn the lamp is lit (switched on and powered)
   */
  setLight(level: number, lampOn: boolean): void {
    const key = Math.round(level * 50) + (lampOn ? 1000 : 0);
    if (key === this.lit) return;
    this.lit = key;
    this.chartMat.color.setScalar(level);
    this.bulbMat.color.setHex(lampOn ? 0xfff0c0 : 0x4a463e);
    this.tableMat.emissive.setHex(lampOn ? 0x3a2a14 : 0x000000);
  }
}

/** A part turned about the vertical by `yaw` and placed at (x, y, z). */
function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number, color: number): THREE.BufferGeometry {
  return part(geo.rotateY(yaw).translate(x, y, z), color);
}

/** A round bar from a to b. */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r, r, len, 6);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  geo.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return part(geo.translate(mid.x, mid.y, mid.z), color);
}
