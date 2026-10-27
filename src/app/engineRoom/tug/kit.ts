/**
 * Shapes for the tug's engine room (owner, 27 Oct 2026: "the next level of detail ... just for
 * the tug"): boxes, cylinders along any axis, pipes bent through a list of points with elbows,
 * flanges and valves, each a vertex-coloured part (render/geometryUtils.ts `part`) to merge
 * into one draw call with everything else that doesn't move. Round things get enough sides
 * to look round from close up (`SIDES`): the room is all there is to draw while you're in it.
 */
import * as THREE from 'three';
import { part } from '../../../render/geometryUtils';
import type { PaintName } from '../../../render/pixelPaint';

/** Sides of a round part: pipes and small things, and big round things (receivers, drums). */
export const SIDES = 14;
export const SIDES_BIG = 24;

export type V3 = [number, number, number];

/** Collects parts, then merges them (the caller's mergeParts). */
export class Kit {
  readonly parts: THREE.BufferGeometry[] = [];
  /** The game's pixel paint (render/pixelPaint.ts) on the parts added meanwhile (`painted`). */
  private paint: PaintName | undefined;

  add(g: THREE.BufferGeometry, colour: number): this {
    this.parts.push(part(g, colour, this.paint));
    return this;
  }

  /** Parts added in `fn` get this pixel paint (chequer plate, brushed steel ...). */
  painted(paint: PaintName, fn: () => void): this {
    const was = this.paint;
    this.paint = paint;
    fn();
    this.paint = was;
    return this;
  }

  /** A box (w across, h up, d along), centred at (x, y, z), turned `yaw` about the vertical. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, colour: number, yaw = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    if (yaw) g.rotateY(yaw);
    return this.add(g.translate(x, y, z), colour);
  }

  /** A cylinder of radius r between two points (its axis from a to b). */
  cyl(r: number, a: V3, b: V3, colour: number, sides = SIDES, r2 = r): this {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-4) return this;
    const g = new THREE.CylinderGeometry(r2, r, len, sides, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyQuaternion(q).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return this.add(g, colour);
  }

  /** An upright cylinder (a tank, a receiver) with dished ends: centre x, z, from y0 to y1. */
  vessel(r: number, x: number, y0: number, y1: number, z: number, colour: number): this {
    this.cyl(r, [x, y0 + r * 0.4, z], [x, y1 - r * 0.4, z], colour, SIDES_BIG);
    const dome = (y: number, up: boolean) => {
      const g = new THREE.SphereGeometry(r, SIDES_BIG, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1);
      if (!up) g.rotateX(Math.PI);
      this.add(g.translate(x, y, z), colour);
    };
    dome(y1 - r * 0.4, true);
    dome(y0 + r * 0.4, false);
    return this;
  }

  /** A sphere (a pump's casing, a knob). */
  ball(r: number, x: number, y: number, z: number, colour: number, sides = SIDES): this {
    return this.add(new THREE.SphereGeometry(r, sides, Math.max(4, sides >> 1)).translate(x, y, z), colour);
  }

  /** A ring (a flange, a handwheel's rim) of radius r, tube t, its axis along `axis`. */
  ring(r: number, t: number, at: V3, axis: 'x' | 'y' | 'z', colour: number, sides = SIDES): this {
    const g = new THREE.TorusGeometry(r, t, 6, sides);
    if (axis === 'x') g.rotateY(Math.PI / 2);
    else if (axis === 'y') g.rotateX(Math.PI / 2);
    return this.add(g.translate(...at), colour);
  }

  /**
   * A pipe through the points, a flange at each end and an elbow (a ball) at each bend, with
   * a bracket to the nearest wall every so often if `bracketTo` says where (x of the lining).
   */
  pipe(r: number, pts: V3[], colour: number, flanges = true): this {
    for (let i = 0; i + 1 < pts.length; i++) this.cyl(r, pts[i], pts[i + 1], colour);
    for (let i = 1; i + 1 < pts.length; i++) this.ball(r * 1.08, ...pts[i], colour, 10);
    if (flanges && pts.length >= 2) {
      const end = (p: V3, q: V3) => {
        const d = new THREE.Vector3(...p).sub(new THREE.Vector3(...q)).normalize();
        const axis = Math.abs(d.x) > 0.7 ? 'x' : Math.abs(d.y) > 0.7 ? 'y' : 'z';
        this.ring(r * 1.25, r * 0.35, p, axis, colour, 12);
      };
      end(pts[0], pts[1]);
      end(pts[pts.length - 1], pts[pts.length - 2]);
    }
    return this;
  }

  /** A valve on a pipe at p: its body, bonnet up, and a handwheel on top (red: a handwheel's usual colour). */
  valve(p: V3, r: number, colour: number, wheel = 0xb52a20): this {
    this.ball(r * 1.6, ...p, colour, 10);
    this.cyl(r * 0.5, [p[0], p[1], p[2]], [p[0], p[1] + r * 4, p[2]], 0x777b7e, 8);
    this.ring(r * 2.2, r * 0.3, [p[0], p[1] + r * 4, p[2]], 'y', wheel, 14);
    this.cyl(r * 0.25, [p[0] - r * 2.2, p[1] + r * 4, p[2]], [p[0] + r * 2.2, p[1] + r * 4, p[2]], wheel, 6);
    this.cyl(r * 0.25, [p[0], p[1] + r * 4, p[2] - r * 2.2], [p[0], p[1] + r * 4, p[2] + r * 2.2], wheel, 6);
    return this;
  }

  /** Bolt heads in a row (or round a circle): small hexagons. */
  bolts(at: V3[], r: number, axis: 'x' | 'y' | 'z', colour: number): this {
    for (const p of at) {
      const g = new THREE.CylinderGeometry(r, r, r * 0.8, 6);
      if (axis === 'x') g.rotateZ(Math.PI / 2);
      else if (axis === 'z') g.rotateX(Math.PI / 2);
      this.add(g.translate(...p), colour);
    }
    return this;
  }

  /** Everything in this kit moved and turned by a matrix (a part built in its own frame). */
  static moved(parts: THREE.BufferGeometry[], m: THREE.Matrix4): THREE.BufferGeometry[] {
    for (const g of parts) g.applyMatrix4(m);
    return parts;
  }
}

/** Points round a circle (for bolts on a flange), in the plane square to `axis`. */
export function circle(c: V3, r: number, n: number, axis: 'x' | 'y' | 'z'): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const u = Math.cos(a) * r;
    const v = Math.sin(a) * r;
    out.push(axis === 'x' ? [c[0], c[1] + u, c[2] + v] : axis === 'y' ? [c[0] + u, c[1], c[2] + v] : [c[0] + u, c[1] + v, c[2]]);
  }
  return out;
}
