import * as THREE from 'three';
import type { HullForm } from '../hullForm';
import type { LayoutConfig } from '../layout';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

/** Placeholder livery; the vessel definition will own colours once there are several types. */
const COLORS = {
  bottom: 0x8c2a22, // antifouling
  topsides: 0xd9622b,
  deck: 0x7d8a78,
  house: 0xe6e6df,
  windows: 0x1f2b33,
  roof: 0xb9bdb6,
  mast: 0x3a3f44,
  rail: 0xe8e4d8,
  floor: 0x7f857c,
  console: 0x3c4248,
  panel: 0x22272b,
};

/**
 * Lofts the hull stations into flat panels (one quad per polygon edge between adjacent
 * stations), closes the transom, and adds bulwarks, rails and the walk-in wheelhouse.
 * Everything static is merged into one vertex-coloured, flat-shaded mesh: one draw call.
 */
export function buildVesselMesh(form: HullForm, layout: LayoutConfig, exhaustOutlet?: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeParts(buildParts(form, layout, exhaustOutlet)), flatVertexColorMaterial());
  mesh.name = 'hull';
  return mesh;
}

/** A layout with a wheelhouse (and its roof and ladder). */
type HouseLayout = LayoutConfig & Required<Pick<LayoutConfig, 'wheelhouse' | 'roof' | 'ladder'>>;

function hasHouse(layout: LayoutConfig): layout is HouseLayout {
  return !!(layout.wheelhouse && layout.roof && layout.ladder);
}

function buildParts(form: HullForm, layout: LayoutConfig, exhaustOutlet?: [number, number, number]): THREE.BufferGeometry[] {
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  /** Add triangle a-b-c, flipped if needed so its normal points away from `inside`. */
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, inside: THREE.Vector3, color: number) => {
    e1.subVectors(b, a);
    e2.subVectors(d, a);
    n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-10) return; // degenerate (stem)
    centroid.copy(a).add(b).add(d).divideScalar(3).sub(inside);
    const verts = n.dot(centroid) >= 0 ? [a, b, d] : [a, d, b];
    c.set(color);
    for (const v of verts) {
      positions.push(v.x, v.y, v.z);
      colors.push(c.r, c.g, c.b);
    }
  };

  const st = form.stations;
  const P = (i: number, k: number) => new THREE.Vector3(st[i].polygon[k][0], st[i].polygon[k][1], st[i].z);
  const inside = (i: number) => {
    const poly = st[i].polygon;
    return new THREE.Vector3(0, (poly[2][1] + poly[0][1]) / 2, st[i].z);
  };

  for (let i = 0; i < st.length - 1; i++) {
    // Interior reference midway between the two stations.
    const mid = inside(i).add(inside(i + 1)).multiplyScalar(0.5);
    const edges: [number, number, number][] = [
      [0, 1, COLORS.topsides], // port topside
      [1, 2, COLORS.bottom], // port bottom
      [2, 3, COLORS.bottom], // starboard bottom
      [3, 4, COLORS.topsides], // starboard topside
      [4, 0, COLORS.deck], // deck
    ];
    for (const [a, b, color] of edges) {
      const a0 = P(i, a);
      const b0 = P(i, b);
      const a1 = P(i + 1, a);
      const b1 = P(i + 1, b);
      tri(a0, b0, b1, mid, color);
      tri(a0, b1, a1, mid, color);
    }
  }
  // Transom (station 0) as a fan around its centre.
  const tIn = inside(0).add(new THREE.Vector3(0, 0, -1));
  const tC = new THREE.Vector3(0, (st[0].polygon[2][1] + st[0].polygon[0][1]) / 2, st[0].z);
  for (let k = 0; k < 5; k++) tri(tC, P(0, k), P(0, (k + 1) % 5), tIn, COLORS.topsides);

  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hull.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  hull.computeVertexNormals();

  const parts = [hull, ...buildDeckFittings(form, layout)];
  // Wet-exhaust outlet: a short pipe stub through the transom.
  const ex = exhaustOutlet;
  if (ex) parts.push(bar(new THREE.Vector3(ex[0], ex[1], ex[2] - 0.12), new THREE.Vector3(ex[0], ex[1], ex[2]), 0.13, 0.13, COLORS.mast));
  if (hasHouse(layout)) parts.push(...buildWheelhouse(layout));
  return parts;
}

/** Box from (x0,y0,z0) to (x1,y1,z1), axis-aligned. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return part(g, color);
}

/** A thin bar of cross-section w x h running from p0 to p1 (any direction). */
function bar(p0: THREE.Vector3, p1: THREE.Vector3, w: number, h: number, color: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(p1, p0);
  const g = new THREE.BoxGeometry(w, h, d.length());
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
  return part(g, color);
}

/** Bulwarks, and (if `railHeight` > 0) handrails and stanchions, along the deck edge and across the transom. */
function buildDeckFittings(form: HullForm, layout: LayoutConfig): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const st = form.stations;
  const bh = layout.bulwarkHeight;
  const rh = layout.railHeight;
  const edge = (i: number, side: number, up: number) => {
    const [x, y] = st[i].polygon[side > 0 ? 4 : 0];
    return new THREE.Vector3(x - side * 0.03, y + up, st[i].z);
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < st.length - 1; i++) {
      // Bulwark plate (a thin bar standing on the deck edge).
      const a = edge(i, side, bh / 2);
      const b = edge(i + 1, side, bh / 2);
      parts.push(bar(a, b, 0.05, bh, COLORS.topsides));
      if (rh <= 0) continue;
      parts.push(bar(edge(i, side, rh), edge(i + 1, side, rh), 0.05, 0.05, COLORS.rail));
      parts.push(bar(edge(i, side, bh), edge(i, side, rh), 0.04, 0.04, COLORS.rail));
    }
  }
  // Across the transom.
  const p = edge(0, -1, 0);
  const q = edge(0, 1, 0);
  parts.push(bar(p.clone().setY(p.y + bh / 2), q.clone().setY(q.y + bh / 2), 0.05, bh, COLORS.topsides));
  if (rh > 0) parts.push(bar(p.clone().setY(p.y + rh), q.clone().setY(q.y + rh), 0.05, 0.05, COLORS.rail));
  return parts;
}

/**
 * Walk-in wheelhouse: walls with a window band all round, an aft doorway, floor, helm
 * console, roof and mast. Dimensions come from the layout config (shared with layout.ts).
 */
function buildWheelhouse(layout: HouseLayout): THREE.BufferGeometry[] {
  const wh = layout.wheelhouse;
  const parts: THREE.BufferGeometry[] = [];
  const hw = wh.halfWidth;
  const w = wh.wall;
  const base = 0.9; // walls start below the deck so there's never a gap
  const sill = wh.floorY + wh.windowSill;
  const head = wh.floorY + wh.windowHead;
  const roof = wh.roofY;
  const H = COLORS.house;

  // Front wall (lower panel, upper panel, two mullions).
  parts.push(box(-hw, hw, base, sill, wh.front, wh.front + w, H));
  parts.push(box(-hw, hw, head, roof, wh.front, wh.front + w, H));
  for (const x of [-0.5, 0.5]) parts.push(box(x - 0.04, x + 0.04, sill, head, wh.front, wh.front + w, H));
  // Side walls, each with one mullion.
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? hw - w : -hw;
    const x1 = s > 0 ? hw : -hw + w;
    parts.push(box(x0, x1, base, sill, wh.front, wh.aft, H));
    parts.push(box(x0, x1, head, roof, wh.front, wh.aft, H));
    parts.push(box(x0, x1, sill, head, -0.2, -0.12, H));
    // Corner posts.
    parts.push(box(x0, x1, sill, head, wh.front, wh.front + 0.1, H));
    parts.push(box(x0, x1, sill, head, wh.aft - 0.1, wh.aft, H));
  }
  // Aft wall: panels either side of the doorway, with the window band open, and a lintel.
  const door = wh.doorWidth / 2;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? door : -hw;
    const x1 = s > 0 ? hw : -door;
    parts.push(box(x0, x1, base, sill, wh.aft - w, wh.aft, H));
    parts.push(box(x0, x1, head, roof, wh.aft - w, wh.aft, H));
    // Door jambs carry the band between sill and head next to the opening.
    const jx = s > 0 ? door : -door - 0.1;
    parts.push(box(jx, jx + 0.1, sill, head, wh.aft - w, wh.aft, H));
  }
  parts.push(box(-door, door, wh.floorY + wh.doorHeight, roof, wh.aft - w, wh.aft, H));
  // Door sill.
  parts.push(box(-door, door, base, wh.floorY + 0.02, wh.aft - w, wh.aft, COLORS.floor));

  // Floor, roof, mast.
  parts.push(box(-hw + w, hw - w, wh.floorY - 0.1, wh.floorY, wh.front + w, wh.aft - w, COLORS.floor));
  const rf = layout.roof;
  const top = roof + rf.thickness;
  const ov = rf.overhang;
  parts.push(box(-hw - ov, hw + ov, roof, top, wh.front - ov, wh.aft + ov, COLORS.roof));
  parts.push(box(-0.06, 0.06, top, roof + 1.7, 0.34, 0.46, COLORS.mast));
  parts.push(box(-0.45, 0.45, roof + 1.3, roof + 1.38, 0.36, 0.44, COLORS.mast));

  // Roof rail (posts + top rail), open at the ladder head on the aft edge.
  const lad = layout.ladder;
  const rx = hw + ov - 0.04;
  const z0 = wh.front - ov + 0.04;
  const z1 = wh.aft + ov - 0.04;
  const rail = (a: THREE.Vector3, b: THREE.Vector3) => {
    parts.push(bar(a.clone().setY(top + rf.railHeight), b.clone().setY(top + rf.railHeight), 0.045, 0.045, COLORS.rail));
    parts.push(bar(a.clone().setY(top + rf.railHeight / 2), b.clone().setY(top + rf.railHeight / 2), 0.035, 0.035, COLORS.rail));
    for (const p of [a, b]) parts.push(bar(p.clone().setY(top), p.clone().setY(top + rf.railHeight), 0.04, 0.04, COLORS.rail));
  };
  const V = (x: number, z: number) => new THREE.Vector3(x, top, z);
  rail(V(-rx, z0), V(rx, z0)); // front
  rail(V(-rx, z0), V(-rx, z1)); // port
  rail(V(rx, z0), V(rx, z1)); // starboard
  rail(V(-rx, z1), V(lad.x - lad.width / 2, z1)); // aft, port of the ladder head
  rail(V(lad.x + lad.width / 2, z1), V(rx, z1)); // aft, starboard of it

  // Vertical ladder on the aft face, deck to roof, stiles carried up as grab handles.
  const lz = wh.aft + 0.12;
  const sx = lad.width / 2 - 0.04;
  const footY = 0.9;
  for (const s of [-1, 1]) {
    parts.push(bar(new THREE.Vector3(lad.x + s * sx, footY, lz), new THREE.Vector3(lad.x + s * sx, top + 1.0, lz), 0.045, 0.045, COLORS.rail));
  }
  for (let y = footY + 0.32; y < top; y += 0.3) {
    parts.push(bar(new THREE.Vector3(lad.x - sx, y, lz), new THREE.Vector3(lad.x + sx, y, lz), 0.035, 0.035, COLORS.rail));
  }

  // Helm console across the front: body, sloping top (approximated by a step), panel face.
  const c0 = wh.front + w;
  const c1 = c0 + wh.consoleDepth;
  const cTop = wh.floorY + wh.consoleHeight;
  parts.push(box(-hw + w, hw - w, wh.floorY, cTop, c0, c1, COLORS.console));
  parts.push(box(-hw + w, hw - w, cTop, cTop + 0.12, c0, c0 + wh.consoleDepth * 0.45, COLORS.console));
  parts.push(box(-hw + w + 0.05, hw - w - 0.05, cTop - 0.01, cTop + 0.005, c0 + wh.consoleDepth * 0.45, c1 - 0.03, COLORS.panel));
  return parts;
}


