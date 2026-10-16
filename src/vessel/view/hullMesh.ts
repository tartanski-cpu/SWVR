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

/**
 * A wedge (triangular prism) across x0..x1: in the (z, y) plane its corners are (zA, y0),
 * (zA, y1) and (zB, y0) - a wall panel's sloping end.
 */
function wedge(x0: number, x1: number, zA: number, zB: number, y0: number, y1: number, color: number): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(zA, y0), new THREE.Vector2(zB, y0), new THREE.Vector2(zA, y1)]);
  // Extruded along its own +z, then turned so that runs along -x and the shape's x is z.
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(x1, 0, 0);
  return part(g, color);
}

/**
 * A thin bar of cross-section w x h running from p0 to p1 (any direction). Its h side is
 * kept as near vertical as the direction allows (a vertical bar keeps it fore-and-aft), so
 * consecutive segments of a rail or bulwark line up instead of each rolling its own way.
 */
function bar(p0: THREE.Vector3, p1: THREE.Vector3, w: number, h: number, color: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(p1, p0);
  const g = new THREE.BoxGeometry(w, h, d.length());
  const z = d.clone().normalize();
  const up = Math.abs(z.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
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
  // Across the transom, with a notch on the centreline for the towline's fairlead (the
  // fairlead itself is drawn with the towline: tow/towlineView.ts).
  const p = edge(0, -1, 0);
  const q = edge(0, 1, 0);
  const gap = (layout.fairleadGap ?? 0) / 2;
  if (gap > 0) {
    const m = p.clone().lerp(q, 0.5);
    for (const [a, b] of [
      [p, m.clone().setX(-gap)],
      [m.clone().setX(gap), q],
    ] as const)
      parts.push(bar(a.clone().setY(a.y + bh / 2), b.clone().setY(b.y + bh / 2), 0.05, bh, COLORS.topsides));
  } else parts.push(bar(p.clone().setY(p.y + bh / 2), q.clone().setY(q.y + bh / 2), 0.05, bh, COLORS.topsides));
  if (rh > 0) parts.push(bar(p.clone().setY(p.y + rh), q.clone().setY(q.y + rh), 0.05, 0.05, COLORS.rail));
  return parts;
}

/** Width of the aft door's jambs (m): the door buttons sit on the starboard one. */
export const JAMB = 0.16;

/**
 * The pilot-house rake of the wheelhouse front (`wheelhouse.frontRakeDeg`): a shear that
 * moves each point forward (-z) by (height above the front sill, `frontSill`) x tan(rake), keeping
 * heights. Sill and head lines stay level, the glass and mullions lean forward. The rain
 * glass and the wipers (rainGlass.ts) use the same matrix, so they sit on the raked panes.
 */
export function frontRake(wh: { floorY: number; windowSill: number; frontSill?: number; frontRakeDeg?: number }): { matrix: THREE.Matrix4; tan: number; sill: number } {
  const sill = wh.floorY + (wh.frontSill ?? wh.windowSill);
  const tan = Math.tan(((wh.frontRakeDeg ?? 0) * Math.PI) / 180);
  // z' = z - tan * (y - sill)
  const matrix = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, -tan, 1, tan * sill, 0, 0, 0, 1);
  return { matrix, tan, sill };
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

  // Front wall: the lower panel upright; above the sill (the window band's two mullions and
  // the panel above the glass) raked forward, pilot-house style (frontRake).
  // The front glass starts higher than the sides' (`frontSill`, level with the dash top).
  const rake = frontRake(wh);
  const fSill = rake.sill;
  const raked = (g: THREE.BufferGeometry) => g.applyMatrix4(rake.matrix);
  const fwdAtHead = (head - fSill) * rake.tan;
  const fwdAtRoof = (roof - fSill) * rake.tan;
  parts.push(box(-hw, hw, base, fSill, wh.front, wh.front + w, H));
  parts.push(raked(box(-hw, hw, head, roof, wh.front, wh.front + w, H)));
  for (const x of [-0.5, 0.5]) parts.push(raked(box(x - 0.04, x + 0.04, fSill, head, wh.front, wh.front + w, H)));
  // Side walls, each with one mullion. Alongside the console the wall stands up to the
  // console top (`sideRaise`, owner sketch), sloping back down to the sill aft of it. The
  // port wall has a sliding door between the console and the chart table (`sideDoor`).
  const raise = wh.sideRaise;
  const raiseTop = raise ? wh.floorY + raise.height : sill;
  const sd = wh.sideDoor;
  const jamb = 0.08;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? hw - w : -hw;
    const x1 = s > 0 ? hw : -hw + w;
    const door = s < 0 && sd ? sd : null;
    if (door) {
      // Below the window band and above it, round the door opening (floor to door head).
      parts.push(box(x0, x1, base, sill, wh.front, door.z0, H));
      parts.push(box(x0, x1, base, sill, door.z1, wh.aft, H));
      parts.push(box(x0, x1, head, roof, wh.front, door.z0, H));
      parts.push(box(x0, x1, head, roof, door.z1, wh.aft, H));
      parts.push(box(x0, x1, wh.floorY + door.height, roof, door.z0, door.z1, H)); // header
      parts.push(box(x0, x1, base, wh.floorY + 0.02, door.z0, door.z1, COLORS.floor)); // threshold
      // Jambs: forward (the door buttons are on it), and aft, running back to the mullion.
      parts.push(box(x0, x1, sill, wh.floorY + door.height, door.z0 - jamb, door.z0, H));
      parts.push(box(x0, x1, sill, wh.floorY + door.height, door.z1, -0.12, H));
    } else {
      parts.push(box(x0, x1, base, sill, wh.front, wh.aft, H));
      parts.push(box(x0, x1, head, roof, wh.front, wh.aft, H));
    }
    parts.push(box(x0, x1, sill, head, -0.2, -0.12, H));
    if (raise && raiseTop > sill) {
      // Solid up to the console top beside it; on the port side it runs into the door jamb.
      const zEnd = door ? door.z0 - jamb : raise.z1;
      parts.push(box(x0, x1, sill, raiseTop, wh.front, zEnd, H));
      if (!door) parts.push(wedge(x0, x1, raise.z1, raise.z1 + raise.slope, sill, raiseTop, H));
    }
    // Front corner posts, raked with the front; deep enough at the foot that, leaning
    // forward, they still close onto the upright side wall behind (a solid cheek, widest at
    // the top). Above the head the same cheek runs up to the roof.
    // Below the front sill the post is as deep as the raked cheek's foot, so the two meet
    // flush and there's no slot of window beside the dash (owner feedback).
    parts.push(box(x0, x1, sill, fSill, wh.front, wh.front + 0.1 + fwdAtHead, H));
    parts.push(raked(box(x0, x1, fSill, head, wh.front, wh.front + 0.1 + fwdAtHead, H)));
    if (fwdAtRoof > 0) parts.push(raked(box(x0, x1, head, roof, wh.front, wh.front + fwdAtRoof + 0.02, H)));
    parts.push(box(x0, x1, sill, head, wh.aft - 0.1, wh.aft, H));
  }
  // Aft wall: panels either side of the doorway, with the window band open, and a lintel.
  const door = wh.doorWidth / 2;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? door : -hw;
    const x1 = s > 0 ? hw : -door;
    parts.push(box(x0, x1, base, sill, wh.aft - w, wh.aft, H));
    parts.push(box(x0, x1, head, roof, wh.aft - w, wh.aft, H));
    // Door jambs carry the band between sill and head next to the opening (wide enough for
    // the door's push buttons, inside and out).
    const jx = s > 0 ? door : -door - JAMB;
    parts.push(box(jx, jx + JAMB, sill, head, wh.aft - w, wh.aft, H));
  }
  parts.push(box(-door, door, wh.floorY + wh.doorHeight, roof, wh.aft - w, wh.aft, H));
  // Door sill.
  parts.push(box(-door, door, base, wh.floorY + 0.02, wh.aft - w, wh.aft, COLORS.floor));

  // Floor and roof.
  // The floor, round the engine hatch's opening if she has one, and the engine space under it.
  const eh = layout.engineHatch;
  const fx0 = -hw + w;
  const fx1 = hw - w;
  const fz0 = wh.front + w;
  const fz1 = wh.aft - w;
  const fy0 = wh.floorY - 0.1;
  if (eh) {
    parts.push(box(fx0, eh.x0, fy0, wh.floorY, fz0, fz1, COLORS.floor));
    parts.push(box(eh.x1, fx1, fy0, wh.floorY, fz0, fz1, COLORS.floor));
    parts.push(box(eh.x0, eh.x1, fy0, wh.floorY, fz0, eh.z0, COLORS.floor));
    parts.push(box(eh.x0, eh.x1, fy0, wh.floorY, eh.z1, fz1, COLORS.floor));
    // Engine space: four walls and a floor, painted light grey (an engine room's white-ish paint).
    const pit = wh.floorY - eh.pitDepth;
    const t = 0.03;
    parts.push(box(eh.x0 - t, eh.x1 + t, pit - t, pit, eh.z0 - t, eh.z1 + t, 0x5a6066));
    parts.push(box(eh.x0 - t, eh.x0, pit, fy0, eh.z0, eh.z1, 0xb8bcb8));
    parts.push(box(eh.x1, eh.x1 + t, pit, fy0, eh.z0, eh.z1, 0xb8bcb8));
    parts.push(box(eh.x0 - t, eh.x1 + t, pit, fy0, eh.z0 - t, eh.z0, 0xb8bcb8));
    parts.push(box(eh.x0 - t, eh.x1 + t, pit, fy0, eh.z1, eh.z1 + t, 0xb8bcb8));
    // A steel coaming round the opening, flush with the floor.
    parts.push(box(eh.x0 - 0.03, eh.x1 + 0.03, wh.floorY - 0.004, wh.floorY + 0.004, eh.z0 - 0.03, eh.z0, 0x8a9096));
    parts.push(box(eh.x0 - 0.03, eh.x1 + 0.03, wh.floorY - 0.004, wh.floorY + 0.004, eh.z1, eh.z1 + 0.03, 0x8a9096));
  } else parts.push(box(fx0, fx1, fy0, wh.floorY, fz0, fz1, COLORS.floor));
  const rf = layout.roof;
  const top = roof + rf.thickness;
  const ov = rf.overhang;
  parts.push(box(-hw - ov, hw + ov, roof, top, wh.front - ov, wh.aft + ov, COLORS.roof));
  // The brow: the roof edge carried forward over the raked front glass (none if upright).
  if (fwdAtRoof > 0) parts.push(box(-hw - ov, hw + ov, roof, top, wh.front - fwdAtRoof - ov, wh.front - ov, COLORS.roof));
  // The mast is a module since M5b (modules/mast).

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


