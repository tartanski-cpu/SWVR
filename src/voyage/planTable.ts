/**
 * The voyage planning table (owner, Oct 2026): a big chart table on the quay that the crew
 * gather round to plan the voyage on together; made reliable (owner, 29 Oct 2026, "step 2"):
 *
 *   where     at the harbour you're at (the one nearest you: each page's own), on level
 *             ground clear of the buildings, a few metres back from where you step ashore
 *             (planTableSpot). Where a table won't fit (a narrow quay, a pontoon), a chart
 *             stand instead: a sloping chart on a post, a third of the room.
 *   the chart the planning chart (voyage/chartPad.ts): the land drawn sharp at any zoom, the
 *             crew's plan, every player's boat, and the keys along its near edge. Its view is
 *             each player's own (owner: "own view each"), as on the chart board in the hand;
 *             the plan on it is everyone's. The pad and its picture are the App's (one for the
 *             table and the stand both); this is the furniture that shows it.
 *   working it  VR: point a hand at it (from up to `reach` m): the trigger pressed and let go
 *             puts a point or presses a key, held and moved drags the chart, the thumbstick
 *             zooms. Desktop: the reticle on it, click, drag, and the mouse wheel to zoom.
 *
 * You stand at its near side and read it the right way up from there: its north is the
 * table's far edge, whichever way the quay runs, as a chart on a real table.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { berthWithId } from '../world/berths';
import { landFloor } from '../world/landWalkArea';
import { REGIONS } from '../world/regions';
import { quaySpot, startBerthId } from '../world/startSpot';
import type { PadFace, ChartPad } from './chartPad';

/** The big table, or the stand where there's no room for it. */
export type PlanTableForm = 'table' | 'stand';

/** Where a table or stand stands (world): its middle on the ground, the ground's height, and the way its far edge (the chart's north) faces (radians, as a heading: 0 north). */
export interface PlanTableSpot {
  x: number;
  y: number;
  z: number;
  farHeading: number;
}

/** Its footprint on the ground (m): along its near edge, and from near to far. */
export function planTableSize(form: PlanTableForm): { width: number; depth: number } {
  const t = CONFIG.voyage.plan.table;
  return form === 'table' ? { width: t.width, depth: t.depth } : { width: t.stand.width, depth: t.stand.depth };
}

/** Its chart face's width over its depth (the pad's canvas is drawn to it: the table's and the stand's are the same). */
export function planFaceAspect(): number {
  const t = CONFIG.voyage.plan.table;
  return (t.width - 0.06) / (t.depth - 0.06);
}

export class PlanTable {
  readonly root = new THREE.Group();
  /** The chart's face (its UVs cover the pad's canvas), for the pointer (PadFaces). */
  readonly face: PadFace;
  /** How far from the viewer its signs stand to either side of its middle (m): its half width and a little. */
  readonly halfWidth: number;

  /**
   * @param pad  the planning chart it shows (the App's: the table and the stand share one)
   * @param shown whether it can be seen and worked now (the App's: near enough)
   */
  constructor(
    readonly form: PlanTableForm,
    at: PlanTableSpot,
    pad: ChartPad,
    shown: () => boolean,
  ) {
    const t = CONFIG.voyage.plan.table;
    this.root.name = form === 'table' ? 'planTable' : 'planStand';
    const WOOD = 0x6a4a2c;
    const DARK = 0x3e2a18;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
    // The chart: a screen set into the top, lit (it reads in the dark as in the day).
    const mat = new THREE.MeshBasicMaterial({ map: pad.texture, toneMapped: false, color: 0xe8e8e8 });
    let face: THREE.Mesh;
    if (form === 'table') {
      // (In the table's frame: -z its far edge (the chart's north), +x to the right as you stand at it.)
      const W = t.width;
      const D = t.depth;
      const H = t.height;
      this.halfWidth = W / 2;
      const frame = new THREE.Mesh(
        mergeParts([
          box(W + 0.08, 0.06, D + 0.08, 0, H - 0.03, 0, WOOD),
          // A raised rim round the chart, so nothing slides off on the quay.
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
      face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, D - 0.06).rotateX(-Math.PI / 2).translate(0, H + 0.002, 0), mat);
      this.root.add(frame, face);
    } else {
      // The stand: a sloping chart (`stand.face` across, its depth to keep the table's shape)
      // on a post from a broad foot, its near edge at `stand.height`, tilted up toward you by
      // `stand.tiltDeg`, as a lectern.
      const s = t.stand;
      const fw = s.face;
      const fd = fw / planFaceAspect();
      const tilt = (s.tiltDeg * Math.PI) / 180;
      const midY = s.height + (Math.sin(tilt) * fd) / 2;
      this.halfWidth = fw / 2;
      const board = new THREE.Group();
      board.position.set(0, midY, 0);
      board.rotation.x = tilt; // its far edge up
      const back = new THREE.Mesh(mergeParts([box(fw + 0.06, 0.03, fd + 0.06, 0, -0.016, 0, WOOD), box(fw + 0.06, 0.03, 0.02, 0, 0.012, fd / 2 + 0.03, DARK)]), flatVertexColorMaterial());
      face = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd).rotateX(-Math.PI / 2).translate(0, 0.002, 0), mat);
      board.add(back, face);
      const post = new THREE.Mesh(
        mergeParts([
          box(0.09, midY - 0.05, 0.09, 0, (midY - 0.05) / 2, 0, DARK),
          box(s.width * 0.8, 0.05, 0.12, 0, 0.025, 0, DARK),
          box(0.12, 0.05, s.depth * 0.8, 0, 0.025, 0, DARK),
        ]),
        flatVertexColorMaterial(),
      );
      this.root.add(post, board);
    }
    face.name = 'planChart';
    this.face = { mesh: face, pad, reach: t.reach, on: () => this.root.visible && shown() };
    this.moveTo(at);
  }

  /** Stand somewhere else (another harbour). */
  moveTo(at: PlanTableSpot): void {
    this.root.position.set(at.x, at.y, at.z);
    this.root.rotation.y = -at.farHeading;
    this.root.updateMatrixWorld(true);
  }
}

/**
 * Where a table (or a sign, or a stand: `size`, its footprint) stands by a berth (by default
 * the map's start): the nearest spot to the spot ashore by that berth (where you step onto the
 * quay) with level ground under all four corners (a quay or pier deck, or flat land; within a
 * quarter metre of each other), clear of the buildings, at least `table.back` m from the
 * spot, out to 80 m. Its far edge (the chart's north) faces away from the start spot, so you
 * walk up to it and read it the right way up; right behind the spot, that's away from the
 * water. (Tayvallich starts on a pontoon with water behind it: the table goes ashore.)
 * Null if none found (no table).
 */
export function planTableSpot(berthId?: string | null, size: { width: number; depth: number } = planTableSize('table')): PlanTableSpot | null {
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
      const lx = x + ((s * size.width) / 2) * -az + ((f * size.depth) / 2) * ax;
      const lz = z + ((s * size.width) / 2) * ax + ((f * size.depth) / 2) * az;
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
