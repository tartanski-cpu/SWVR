/**
 * Sketching on her views (owner, Oct 2026): drawing in 3D space didn't work, as nobody's
 * pen landed where anyone else expected. So sketches are drawn only on her four elevations:
 * the side (from starboard, bow to the right), the plan (from above), the bow and the stern,
 * each seen flat (no perspective). Each view has one drawing plane, a sheet of glass standing
 * just clear of her on that side, the same for everyone in the session. A stroke is kept on
 * its plane in **hull fractions** (as pins are, notes.ts), so it stays put on her when she's
 * stretched, and it shows only when you look from that view.
 *
 * A stroke is an `Ink` note whose sheet is the plane's name with an @ ('@side'): it is shared
 * while it's drawn (sent again every so often with the same id, so the others see the pen
 * moving), and put or deleted whole like any note.
 */
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { fromFrac, toFrac, type Ink } from './notes';

export type PlaneName = 'side' | 'plan' | 'bow' | 'stern';

/**
 * Each view's plane: which of her axes the pen moves along (u across the view, v up it,
 * as hull-fraction indices: 0 across her beam, 1 up, 2 along her length, bow at 0) and
 * where the glass stands: just past her extent on the side the view looks from.
 */
export const PLANES: Record<PlaneName, { u: 0 | 1 | 2; v: 0 | 1 | 2; normal: 0 | 1 | 2; side: 1 | -1; title: string }> = {
  side: { u: 2, v: 1, normal: 0, side: 1, title: 'Side' },
  plan: { u: 0, v: 2, normal: 1, side: 1, title: 'Plan' },
  bow: { u: 0, v: 1, normal: 2, side: -1, title: 'Bow' },
  stern: { u: 0, v: 1, normal: 2, side: 1, title: 'Stern' },
};

/** How far the glass stands off her (m): clear of her rails and fenders, so the ink is never hidden. */
export const PLANE_GAP = 0.6;

/** The sheet id a plane's strokes carry. */
export const planeSheet = (p: PlaneName) => `@${p}`;
export const isPlaneSheet = (sheet: string): boolean => /^@(side|plan|bow|stern)$/.test(sheet);

/** Where a plane's glass stands, along its normal (m, boat axes). */
export function planeAt(p: PlaneName, min: readonly number[], max: readonly number[]): number {
  const P = PLANES[p];
  return P.side > 0 ? max[P.normal] + PLANE_GAP : min[P.normal] - PLANE_GAP;
}

/** A point on a plane's glass (boat axes, m) as the stroke keeps it: [u, v] hull fractions, to 3 decimals. */
export function toPlane(p: PlaneName, point: readonly number[], min: readonly number[], max: readonly number[]): [number, number] {
  const f = toFrac(point, min, max);
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return [r(f[PLANES[p].u]), r(f[PLANES[p].v])];
}

/** A stroke's point back on the glass, on her as she is now (boat axes, m). */
export function fromPlane(p: PlaneName, uv: readonly [number, number], min: readonly number[], max: readonly number[]): [number, number, number] {
  const P = PLANES[p];
  const f: [number, number, number] = [0.5, 0.5, 0.5];
  f[P.u] = uv[0];
  f[P.v] = uv[1];
  const out = fromFrac(f, min, max);
  out[P.normal] = planeAt(p, min, max);
  return out;
}

/** The view's plane, if the camera looks at her square on to one (within ~25°), else null. */
export function planeFacing(look: THREE.Vector3): PlaneName | null {
  const d = look.clone().normalize();
  const best = (['side', 'plan', 'bow', 'stern'] as PlaneName[]).find((p) => {
    const P = PLANES[p];
    // Looking towards her from the plane's side: against its outward direction.
    const n = new THREE.Vector3();
    n.setComponent(P.normal, P.side);
    return d.dot(n) < -0.9;
  });
  return best ?? null;
}

/**
 * The strokes in the 3D view: fat lines (a few pixels wide whatever the zoom) on each plane,
 * shown only for the plane being looked at, and a faint sheet of glass with squares while
 * you're drawing on it.
 */
export class PlaneInk {
  readonly group = new THREE.Group();
  private readonly glass: THREE.Mesh;
  private readonly grid: THREE.LineSegments;
  private readonly mats = new Map<string, LineMaterial>();
  private size = new THREE.Vector2(1, 1);

  constructor() {
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf2efe6, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xcfe2ee, transparent: true, opacity: 0.18, depthWrite: false }));
    this.glass.visible = this.grid.visible = false;
    this.glass.renderOrder = this.grid.renderOrder = 9;
  }

  /** The canvas size in pixels (the lines' width is in pixels). */
  resize(w: number, h: number): void {
    this.size.set(w, h);
    for (const m of this.mats.values()) m.resolution.copy(this.size);
  }

  private mat(colour: string): LineMaterial {
    let m = this.mats.get(colour);
    if (!m) {
      m = new LineMaterial({ color: new THREE.Color(colour).getHex(), linewidth: 3.5, transparent: true, depthTest: false });
      m.resolution.copy(this.size);
      this.mats.set(colour, m);
    }
    return m;
  }

  /** Draw the strokes of the plane being looked at (none: hide them all); `glass`: show the drawing sheet. */
  draw(inks: readonly Ink[], facing: PlaneName | null, glass: boolean, min: readonly number[], max: readonly number[]): void {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c instanceof Line2) c.geometry.dispose();
    }
    this.group.add(this.glass, this.grid);
    this.glass.visible = this.grid.visible = !!facing && glass;
    if (!facing) return;
    if (glass) this.placeGlass(facing, min, max);
    for (const ink of inks) {
      if (ink.sheet !== planeSheet(facing)) continue;
      const pts = ink.pts.flatMap((uv) => fromPlane(facing, uv, min, max));
      if (pts.length < 6) continue;
      const g = new LineGeometry();
      g.setPositions(pts);
      const line = new Line2(g, this.mat(ink.colour));
      line.renderOrder = 10;
      this.group.add(line);
    }
  }

  /** The glass over her on that side, a margin all round, squared every metre. */
  private placeGlass(p: PlaneName, min: readonly number[], max: readonly number[]): void {
    const P = PLANES[p];
    const lo = [P.u, P.v].map((a) => min[a] - (max[a] - min[a]) * 0.6);
    const hi = [P.u, P.v].map((a) => max[a] + (max[a] - min[a]) * 0.6);
    const at = planeAt(p, min, max) + 0.01 * P.side; // just behind the ink
    const corner = (u: number, v: number) => {
      const q = new THREE.Vector3();
      q.setComponent(P.u, u);
      q.setComponent(P.v, v);
      q.setComponent(P.normal, at);
      return q;
    };
    const geo = new THREE.BufferGeometry().setFromPoints([corner(lo[0], lo[1]), corner(hi[0], lo[1]), corner(hi[0], hi[1]), corner(lo[0], lo[1]), corner(hi[0], hi[1]), corner(lo[0], hi[1])]);
    this.glass.geometry.dispose();
    this.glass.geometry = geo;
    const lines: THREE.Vector3[] = [];
    for (let u = Math.ceil(lo[0]); u <= hi[0]; u++) lines.push(corner(u, lo[1]), corner(u, hi[1]));
    for (let v = Math.ceil(lo[1]); v <= hi[1]; v++) lines.push(corner(lo[0], v), corner(hi[0], v));
    this.grid.geometry.dispose();
    this.grid.geometry = new THREE.BufferGeometry().setFromPoints(lines);
  }
}
