import * as THREE from 'three';
import type { HullForm } from '../hullForm';
import { hullPlan, type LayoutConfig } from '../layout';
import type { Livery } from '../vesselDef';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { CONFIG } from '../../config';
import { paintIndex, type PaintName } from '../../render/pixelPaint';
import type { HouseShape } from '../vesselDef';
import { deckhouseHalfWidth, type DeckhouseLayout } from '../deckhouse';

/** The workboat's livery, and every hull's for the parts her own (`Livery`) doesn't give. */
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
  /** The window frames round the wheelhouse glass. */
  frame: 0x16191b,
  /** The wheelhouse's wood lining, inside. */
  lining: 0x8a5d3c,
};

/** Every part's colour, for a hull's livery. */
type Paint = typeof COLORS;

/** A hull's colours: her livery over the workboat's. */
export function paintOf(livery?: Livery): Paint {
  const paint = { ...COLORS };
  for (const [k, v] of Object.entries(livery ?? {})) if (v !== undefined) paint[k as keyof Paint] = v;
  return paint;
}

/**
 * Lofts the hull stations into flat panels (one quad per polygon edge between adjacent
 * stations), closes the transom, and adds bulwarks, rails and the walk-in wheelhouse.
 * Everything static is merged into one vertex-coloured, flat-shaded mesh: one draw call.
 */
export function buildVesselMesh(form: HullForm, layout: LayoutConfig, exhaustOutlet?: [number, number, number], livery?: Livery): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeParts(buildParts(form, layout, exhaustOutlet, paintOf(livery))), flatVertexColorMaterial());
  mesh.name = 'hull';
  return mesh;
}

/** How far the window frames stand proud of the walls (m): enough not to flicker against them. */
const FRAME_PROUD = 0.004;

/** A bow this wide at the stem (half-beam, m) is square (a landing bow): plated across, with a bulwark. */
const SQUARE_BOW = 0.2;

/** A layout with a wheelhouse (and its roof; a ladder up to it if it's walked). */
type HouseLayout = LayoutConfig & Required<Pick<LayoutConfig, 'wheelhouse' | 'roof'>>;

function hasHouse(layout: LayoutConfig): layout is HouseLayout {
  return !!(layout.wheelhouse && layout.roof);
}

function buildParts(form: HullForm, layout: LayoutConfig, exhaustOutlet: [number, number, number] | undefined, col: Paint): THREE.BufferGeometry[] {
  const positions: number[] = [];
  const colors: number[] = [];
  const paints: number[] = [];
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  /** Add triangle a-b-c, flipped if needed so its normal points away from `inside`. */
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, inside: THREE.Vector3, color: number, paint?: PaintName) => {
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
      paints.push(paintIndex(paint));
    }
  };

  const st = form.stations;
  // Each station's outline as drawn: her section (port deck, port chine, keel, starboard
  // chine, starboard deck), with a spray chine between each chine and deck edge where she
  // has one (drawn only; a station without it takes the midpoint, so the panels still join).
  const sprayed = st.some((s) => s.spray);
  const outlines = st.map((s): [number, number][] => {
    const p = s.polygon;
    if (!sprayed) return p;
    const [x, y] = s.spray ?? [(p[3][0] + p[4][0]) / 2, (p[3][1] + p[4][1]) / 2];
    return [p[0], [-x, y], p[1], p[2], p[3], [x, y], p[4]];
  });
  /** Outline points: deck edges first and last, the keel in the middle, chines `chine` in from each end. */
  const last = outlines[0].length - 1;
  const chine = sprayed ? 2 : 1;
  const P = (i: number, k: number) => new THREE.Vector3(outlines[i][k][0], outlines[i][k][1], st[i].z);
  const inside = (i: number) => {
    const poly = st[i].polygon;
    return new THREE.Vector3(0, (poly[2][1] + poly[0][1]) / 2, st[i].z);
  };

  // A cabin sunk below the deck (its floor lower than the deck under it: you step down into
  // it) has no deck across it: the deck is cut away inside the house's walls.
  const sunk = sunkenHouse(form, layout);
  for (let i = 0; i < st.length - 1; i++) {
    // Interior reference midway between the two stations.
    const mid = inside(i).add(inside(i + 1)).multiplyScalar(0.5);
    const cut = !!sunk && Math.min(st[i].z, st[i + 1].z) < sunk.aft && Math.max(st[i].z, st[i + 1].z) > sunk.front;
    // Topsides from each deck edge down to its chine, bottom from the chines to the keel.
    const edges: [number, number, number][] = [];
    for (let k = 0; k < last; k++) edges.push([k, k + 1, k < chine || k >= last - chine ? col.topsides : col.bottom]);
    if (!cut) edges.push([last, 0, col.deck]); // deck
    else {
      // The deck in pieces between the stations and the house's ends; across the house, only
      // its strips outside the walls.
      const za = st[i].z;
      const zb = st[i + 1].z;
      const at = (z: number, k: number) => P(i, k).lerp(P(i + 1, k), (z - za) / (zb - za));
      const breaks = [za, zb, sunk.front, sunk.aft].filter((z) => z <= Math.max(za, zb) && z >= Math.min(za, zb)).sort((a, b) => b - a);
      for (let j = 0; j < breaks.length - 1; j++) {
        const z0 = breaks[j];
        const z1 = breaks[j + 1];
        if (z0 - z1 < 1e-6) continue;
        const p0 = at(z0, 0), p1 = at(z1, 0), s0 = at(z0, last), s1 = at(z1, last);
        const zm = (z0 + z1) / 2;
        if (zm > sunk.front && zm < sunk.aft) {
          for (const [e0, e1, x] of [[p0, p1, -sunk.halfWidth], [s0, s1, sunk.halfWidth]] as const) {
            const i0 = e0.clone().setX(x);
            const i1 = e1.clone().setX(x);
            tri(e0, i0, i1, mid, col.deck, 'nonSlip');
            tri(e0, i1, e1, mid, col.deck, 'nonSlip');
          }
        } else {
          tri(s0, p0, p1, mid, col.deck, 'nonSlip');
          tri(s0, p1, s1, mid, col.deck, 'nonSlip');
        }
      }
    }
    for (const [a, b, color] of edges) {
      const a0 = P(i, a);
      const b0 = P(i, b);
      const a1 = P(i + 1, a);
      const b1 = P(i + 1, b);
      // Non-slip paint on the deck; her topsides and bottom plain (owner: workboats are mostly
      // GRP, or aluminium in big sheets: no plate seams).
      const paint = color === col.deck && a === last ? 'nonSlip' : undefined;
      tri(a0, b0, b1, mid, color, paint);
      tri(a0, b1, a1, mid, color, paint);
    }
  }
  // Transom (station 0) as a fan around its centre.
  const tIn = inside(0).add(new THREE.Vector3(0, 0, -1));
  const tC = new THREE.Vector3(0, (st[0].polygon[2][1] + st[0].polygon[0][1]) / 2, st[0].z);
  for (let k = 0; k <= last; k++) tri(tC, P(0, k), P(0, (k + 1) % (last + 1)), tIn, col.topsides);
  // A square bow (a landing bow: the last station still has width) is closed the same way,
  // by a bow plate.
  const e = st.length - 1;
  if (st[e].halfBeamDeck > SQUARE_BOW) {
    const bIn = inside(e).add(new THREE.Vector3(0, 0, 1));
    const bC = new THREE.Vector3(0, (st[e].polygon[2][1] + st[e].polygon[0][1]) / 2, st[e].z);
    for (let k = 0; k <= last; k++) tri(bC, P(e, k), P(e, (k + 1) % (last + 1)), bIn, col.topsides);
  }

  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hull.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  hull.setAttribute('paint', new THREE.Float32BufferAttribute(paints, 1));
  hull.computeVertexNormals();

  const parts = [hull, ...buildDeckFittings(form, layout, col)];
  // Wet-exhaust outlet: a short pipe stub through the transom.
  const ex = exhaustOutlet;
  if (ex) parts.push(bar(new THREE.Vector3(ex[0], ex[1], ex[2] - 0.12), new THREE.Vector3(ex[0], ex[1], ex[2]), 0.13, 0.13, col.mast));
  // A deckhouse under the wheelhouse (vessel/deckhouse.ts), from a little below the deck
  // under each part of it (her sides tuck in below the deck: lower, it showed through them).
  if (layout.deckhouse) {
    const plan = hullPlan({ hull: form });
    parts.push(buildDeckhouse(layout.deckhouse, (z) => plan.deckY(z) - 0.06, col.house));
  }
  if (hasHouse(layout)) {
    // Its walls start below the deck so there's never a gap there, but no lower than 0.06 m
    // under it, where the hull's sides are still wider than the house: on a fine entry the
    // hull narrows fast below the deck and lower walls showed through her topsides. A sunk
    // house's walls go down to its floor (the Shipyard keeps those where her hull is wide).
    const wh = layout.wheelhouse;
    const plan = hullPlan({ hull: form });
    const deckLo = Math.min(...Array.from({ length: 9 }, (_, i) => plan.deckY(wh.front + ((wh.aft - wh.front) * i) / 8)));
    const low = Math.min(0.9, wh.floorY - 0.15);
    const base = sunk ? low : Math.max(low, deckLo - 0.06);
    parts.push(...(wh.shape ? buildShapedHouse(layout, col, base) : buildWheelhouse(layout, col, base)));
    // Steps at the aft door: solid blocks up to each tread.
    const d = wh.doorWidth / 2;
    const foot = Math.min(wh.floorY, plan.deckY(wh.aft)) - 0.05;
    for (const st of wh.steps ?? []) parts.push(box(-d, d, foot, st.y, st.z0, st.z1, col.deck, 'nonSlip'));
  }
  // Stepping down into a sunken cabin: the step's face, from the deck down to the door sill.
  if (sunk && layout.wheelhouse) {
    const wh = layout.wheelhouse;
    const d = wh.doorWidth / 2;
    parts.push(box(-d, d, wh.floorY, hullPlan({ hull: form }).deckY(wh.aft), wh.aft, wh.aft + 0.03, col.deck));
  }
  return parts;
}

/**
 * Lines a house wall inside: its faces that stand upright and look in towards `centre` (in
 * plan) take the lining's colour and the wood paint. Only a part in the house's own colour
 * (the window frames stay black inside too).
 */
function lineInside(g: THREE.BufferGeometry, house: number, lining: number, centre: THREE.Vector3): void {
  const col = g.attributes.color;
  const pos = g.attributes.position;
  const paint = g.attributes.paint;
  const h = new THREE.Color(house);
  if (Math.abs(col.getX(0) - h.r) + Math.abs(col.getY(0) - h.g) + Math.abs(col.getZ(0) - h.b) > 1e-3) return;
  const c = new THREE.Color(lining);
  const wood = paintIndex('wood');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    d.fromBufferAttribute(pos, i + 2);
    const n = d.clone().sub(b).cross(a.clone().sub(b)).normalize();
    if (Math.abs(n.y) > 0.5) continue;
    const mid = a.clone().add(b).add(d).divideScalar(3);
    if (n.x * (centre.x - mid.x) + n.z * (centre.z - mid.z) <= 0.01) continue;
    for (let k = i; k < i + 3; k++) {
      col.setXYZ(k, c.r, c.g, c.b);
      paint.setX(k, wood);
    }
  }
}

/** Box from (x0,y0,z0) to (x1,y1,z1), axis-aligned. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, paint?: PaintName): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return part(g, color, paint);
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
function buildDeckFittings(form: HullForm, layout: LayoutConfig, col: Paint): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const st = form.stations;
  const bh = layout.bulwarkHeight;
  const rh = layout.railHeight;
  const edge = (i: number, side: number, up: number) => {
    const [x, y] = st[i].polygon[side > 0 ? 4 : 0];
    return new THREE.Vector3(x - side * 0.03, y + up, st[i].z);
  };
  // The working-deck gate (layout.sideGate): its bulwark and rail section is a separate,
  // moving part (controls/SideGate.ts); here the gap is left, with a post at each end.
  const gate = layout.sideGate;
  for (const side of [-1, 1]) {
    for (let i = 0; i < st.length - 1; i++) {
      const a = edge(i, side, 0);
      const b = edge(i + 1, side, 0);
      // The parts of this segment outside the gateway, as fractions along it.
      let pieces: [number, number][] = [[0, 1]];
      if (gate && side === gate.side) {
        const f = (z: number) => (z - a.z) / (b.z - a.z);
        const lo = Math.max(0, Math.min(f(gate.z0), f(gate.z1)));
        const hi = Math.min(1, Math.max(f(gate.z0), f(gate.z1)));
        if (hi > lo) pieces = [[0, lo], [hi, 1]].filter(([u, v]) => v - u > 1e-3) as [number, number][];
      }
      for (const [u, v] of pieces) {
        const p0 = a.clone().lerp(b, u);
        const p1 = a.clone().lerp(b, v);
        // Bulwark plate (a thin bar standing on the deck edge).
        parts.push(bar(p0.clone().setY(p0.y + bh / 2), p1.clone().setY(p1.y + bh / 2), 0.05, bh, col.topsides));
        if (rh > 0) parts.push(bar(p0.clone().setY(p0.y + rh), p1.clone().setY(p1.y + rh), 0.05, 0.05, col.rail));
      }
      const inGap = !!gate && side === gate.side && a.z > gate.z0 && a.z < gate.z1;
      if (rh > 0 && !inGap) parts.push(bar(edge(i, side, bh), edge(i, side, rh), 0.04, 0.04, col.rail));
    }
  }
  if (gate) {
    const side = gate.side;
    // Deck edge at z (between stations).
    const edgeAt = (z: number, up: number) => {
      let i = 0;
      while (i < st.length - 2 && !((st[i].z - z) * (st[i + 1].z - z) <= 0)) i++;
      const a = edge(i, side, up);
      const b = edge(i + 1, side, up);
      return a.lerp(b, (z - a.z) / (b.z - a.z));
    };
    // Gateposts, the full height from deck to rail.
    for (const z of [gate.z0, gate.z1]) parts.push(bar(edgeAt(z, 0), edgeAt(z, Math.max(rh, bh) + 0.03), 0.06, 0.06, col.rail));
    // The boarding step on the hull side below the gateway, on two brackets. It reaches in
    // past the flare so it meets the plating.
    const mid = edgeAt((gate.z0 + gate.z1) / 2, -gate.stepDrop);
    const len = Math.abs(gate.z1 - gate.z0) - 0.12;
    const step = new THREE.BoxGeometry(0.5, 0.04, len).translate(mid.x + side * 0.08, mid.y, mid.z);
    parts.push(part(step, col.rail));
    for (const dz of [-len / 2 + 0.04, len / 2 - 0.04]) parts.push(part(new THREE.BoxGeometry(0.3, 0.2, 0.03).translate(mid.x - side * 0.02, mid.y - 0.12, mid.z + dz), col.rail));
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
      parts.push(bar(a.clone().setY(a.y + bh / 2), b.clone().setY(b.y + bh / 2), 0.05, bh, col.topsides));
  } else parts.push(bar(p.clone().setY(p.y + bh / 2), q.clone().setY(q.y + bh / 2), 0.05, bh, col.topsides));
  if (rh > 0) parts.push(bar(p.clone().setY(p.y + rh), q.clone().setY(q.y + rh), 0.05, 0.05, col.rail));
  // Across a square bow, the same; unless she has a bow ramp, which closes it (it's drawn
  // apart, moving: controls/BowRamp.ts). Its rams pivot on a post each side.
  const e = st.length - 1;
  const ramp = layout.bowRamp;
  if (ramp) {
    const z = st[e].z + ramp.ram.aft;
    const deck = hullPlan({ hull: form }).deckY(z);
    for (const side of [-1, 1]) {
      const x = side * ramp.ram.x;
      parts.push(bar(new THREE.Vector3(x, deck, z), new THREE.Vector3(x, deck + ramp.ram.height + 0.04, z), 0.09, 0.09, col.rail));
    }
  } else if (st[e].halfBeamDeck > SQUARE_BOW) {
    const pb = edge(e, -1, 0);
    const qb = edge(e, 1, 0);
    parts.push(bar(pb.clone().setY(pb.y + bh / 2), qb.clone().setY(qb.y + bh / 2), 0.05, bh, col.topsides));
    if (rh > 0) parts.push(bar(pb.clone().setY(pb.y + rh), qb.clone().setY(qb.y + rh), 0.05, 0.05, col.rail));
  }
  return parts;
}

/**
 * A wheelhouse whose floor is below the deck under it (the landing craft's: you step down
 * into her cabin, for the headroom): its footprint, where the deck is cut away. Null if her
 * house floor is above the deck (the workboat's), or she has no house.
 */
export function sunkenHouse(form: HullForm, layout: LayoutConfig): { front: number; aft: number; halfWidth: number } | null {
  const wh = layout.wheelhouse;
  if (!wh) return null;
  const plan = hullPlan({ hull: form });
  const deck = Math.max(plan.deckY(wh.front), plan.deckY(wh.aft));
  return wh.floorY < deck ? { front: wh.front, aft: wh.aft, halfWidth: wh.halfWidth } : null;
}

/** Width of the aft door's jambs (m): the door buttons sit on the starboard one. */
export const JAMB = 0.16;

/**
 * The pilot-house rake of the wheelhouse front (`wheelhouse.frontRakeDeg`): a shear that
 * moves each point forward (-z) by (height above the front sill, `frontSill`) x tan(rake), keeping
 * heights. Sill and head lines stay level, the glass and mullions lean forward. The rain
 * glass and the wipers (rainGlass.ts) use the same matrix, so they sit on the raked panes.
 */
export function frontRake(wh: { floorY: number; windowSill: number; frontSill?: number; frontRakeDeg?: number; shape?: HouseShape }): { matrix: THREE.Matrix4; tan: number; sill: number; ahead: number } {
  const sill = wh.floorY + (wh.frontSill ?? wh.windowSill);
  const tan = Math.tan(((wh.frontRakeDeg ?? 0) * Math.PI) / 180);
  // A shaped house's front below the windows leans forward, carrying their foot `ahead`.
  const sh = wh.shape;
  const ahead = sh ? Math.max(0, sill - sh.lowerFromY) * Math.tan((sh.lowerRakeDeg * Math.PI) / 180) : 0;
  // z' = z - ahead - tan * (y - sill)
  const matrix = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, -tan, 1, tan * sill - ahead, 0, 0, 0, 1);
  return { matrix, tan, sill, ahead };
}

/** A shear that leans what's above `y0` forward at `deg` from vertical (z' = z - tan (y - y0)). */
function leanForward(deg: number, y0: number): THREE.Matrix4 {
  const tan = Math.tan((deg * Math.PI) / 180);
  return new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, -tan, 1, tan * y0, 0, 0, 0, 1);
}

/** A prism across x0..x1 whose section (in z, y) is the polygon `pts`: a wall panel of any outline. */
function prism(x0: number, x1: number, pts: [number, number][], color: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  // Extruded along its own +z, then turned so that runs along -x and the shape's x is z (as wedge()).
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(x1, 0, 0);
  return part(g, color);
}

/**
 * A shaped wheelhouse (the Shipyard's, owner; its layout's `shape`): in profile, the front
 * below the windows leans forward from `lowerFromY` up to the window band; the front windows
 * rake either way (`frontRakeDeg`) from there; above them a header up to the roof: one flat
 * slab (owner) reaching forward of the windows' head as a visor, its front face raked back
 * as it rises (`roofEdgeDeg`), like the windows below it.
 * The side walls follow that profile at their front ends, so their windows are trapezoids.
 * A side door (`sideDoor`, in the port wall) is an opening from the floor up through the
 * window band, with jambs, a header up to the band's top and a threshold.
 * The side and aft windows start lower (windowSill) than the front's (frontSill, the dash
 * top); between them at each front corner a black post. No roof rail or ladder: the roof
 * isn't walked.
 * Frames, the wood lining, the floor and the console are the box house's (buildWheelhouse).
 */
function buildShapedHouse(layout: HouseLayout, col: Paint, base: number): THREE.BufferGeometry[] {
  const wh = layout.wheelhouse;
  const sh = wh.shape!;
  const parts: THREE.BufferGeometry[] = [];
  const hw = wh.halfWidth;
  const w = wh.wall;
  const H = col.house;
  const { FW, fbox, framed } = frameKit(col);
  const zF = wh.front;
  const zA = wh.aft;
  const mid = (zF + zA) / 2;
  const roofY = wh.roofY;
  const rake = frontRake(wh);
  const raked = (g: THREE.BufferGeometry) => g.applyMatrix4(rake.matrix);
  const S = rake.sill;
  const sideS = Math.min(S, wh.floorY + wh.windowSill);
  const head = wh.floorY + wh.windowHead;
  // The lower front leans from L0 (no lower than the walls' foot) up to the sill.
  const L0 = Math.max(base, Math.min(sh.lowerFromY, S));
  const lean = leanForward(sh.lowerRakeDeg, L0);
  const tanL = Math.tan((sh.lowerRakeDeg * Math.PI) / 180);
  const zLow = (y: number) => zF - Math.max(0, y - L0) * tanL;
  // The windows' foot and head, in z.
  const zS = zF - rake.ahead;
  const zH = zS - (head - S) * rake.tan;
  const wallsFrom = parts.length;

  // Front: below the windows (upright up to L0, leaning above it), the two mullions between
  // the panes, and the header above them up to the roof.
  if (L0 > base + 0.01) parts.push(box(-hw, hw, base, L0, zF, zF + w, H));
  parts.push(...framed(-hw, hw, L0, S, zF, zF + w, 'top').map((g) => g.applyMatrix4(lean)));
  for (const x of [-0.5, 0.5]) parts.push(raked(fbox(x - 0.04, x + 0.04, S, head, zF, zF + w)));
  parts.push(...framed(-hw, hw, head, roofY + 0.02, zH, zH + w, 'bottom'));

  // Side walls: below the band, following the front's lower lean; the band's posts (the
  // front one raked with the windows) and a mullion; above it, up to the raked roof.
  const bandMid = ((zS + zH) / 2 + 0.1 + zA) / 2;
  const sd = wh.sideDoor;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? hw - w : -hw;
    const x1 = s > 0 ? hw : -hw + w;
    const top = sideS - FW;
    const door = s < 0 && sd ? sd : null;
    // Below the band: forward of the door (or the whole wall), and aft of it.
    const fore = door ? door.z0 : zA;
    const low: [number, number][] = [[fore, base], [fore, top], [zLow(top), top], ...(top > L0 ? [[zF, L0] as [number, number]] : []), ...(L0 > base + 0.01 ? [[zF, base] as [number, number]] : [])];
    parts.push(prism(x0, x1, low, H));
    parts.push(fbox(x0, x1, top, sideS, zLow(sideS) + 0.1, fore));
    if (door) {
      const jamb = 0.08;
      const doorTop = wh.floorY + door.height;
      parts.push(box(x0, x1, base, top, door.z1, zA, H), fbox(x0, x1, top, sideS, door.z1, zA));
      parts.push(fbox(x0, x1, base, doorTop, door.z0 - jamb, door.z0), fbox(x0, x1, base, doorTop, door.z1, door.z1 + jamb)); // the jambs
      if (head - doorTop > 0.01) parts.push(box(x0, x1, doorTop, head, door.z0, door.z1, H)); // the header, up to the band's top
      parts.push(box(x0, x1, base, wh.floorY + 0.02, door.z0, door.z1, col.floor)); // the threshold
    }
    // The front corner post: from the side windows' sill up to the front's, following the lean.
    // Proud of the walls all round, the front too: its face in the front wall's plane flickered (owner).
    if (S > sideS + 0.01) {
      const e = FRAME_PROUD;
      parts.push(prism(x0 - e, x1 + e, [[zLow(top) - e, top - e], [zLow(S) - e, S + e], [zLow(S) + 0.1, S + e], [zLow(top) + 0.1, top - e]], col.frame));
    }
    parts.push(raked(fbox(x0, x1, S, head, zF, zF + 0.1)));
    parts.push(fbox(x0, x1, sideS, head, zA - 0.1, zA));
    // The band's mullion (not in a doorway).
    if (!door || bandMid < door.z0 - 0.15 || bandMid > door.z1 + 0.15) parts.push(fbox(x0, x1, sideS, head, bandMid - 0.04, bandMid + 0.04));
    parts.push(fbox(x0, x1, head, head + FW, zH, zA));
    // Wall above the band, if the glass stops short of the roof (the Shipyard's runs up to it).
    if (roofY + 0.02 - (head + FW) > 0.01) parts.push(box(x0, x1, head + FW, roofY + 0.02, zH, zA, H));
  }

  // Aft wall: panels either side of the doorway, the band open, and a lintel up to the roof.
  const door = wh.doorWidth / 2;
  const roofAft = roofY + 0.02;
  for (const s of [-1, 1]) {
    const [p0, p1] = s > 0 ? [door, hw] : [-hw, -door];
    parts.push(box(p0, p1, base, sideS - FW, zA - w, zA, H), fbox(p0, p1, sideS - FW, sideS, zA - w, zA));
    parts.push(fbox(p0, p1, head, head + FW, zA - w, zA));
    if (roofAft - (head + FW) > 0.01) parts.push(box(p0, p1, head + FW, roofAft, zA - w, zA, H));
    const jx = s > 0 ? door : -door - JAMB;
    parts.push(fbox(jx, jx + JAMB, sideS, head, zA - w, zA));
  }
  parts.push(box(-door, door, wh.floorY + wh.doorHeight, roofAft, zA - w, zA, H));
  // The walls' inside faces: wood lining (pixel painting, owner).
  const centre = new THREE.Vector3(0, 0, mid);
  for (const g of parts.slice(wallsFrom)) lineInside(g, H, col.lining, centre);
  // Door sill, floor, console.
  parts.push(box(-door, door, base, wh.floorY + 0.02, zA - w, zA, col.floor));
  buildFloor(layout, col, parts);
  buildConsole(wh, col, parts);

  // Roof: one flat slab from the visor's edge to aft of the house. Its front face rakes back
  // as it rises (owner: never square, always back): the underside reaches furthest forward,
  // the top is set back by roofEdgeDeg. The wood ceiling under it.
  const rf = layout.roof;
  const ov = rf.overhang;
  const t = rf.thickness;
  const zV = zH - sh.visor;
  const back = t * Math.tan((sh.roofEdgeDeg * Math.PI) / 180);
  parts.push(prism(-hw - ov, hw + ov, [[zV + back, roofY + t], [zA + ov, roofY + t], [zA + ov, roofY], [zV, roofY]], col.roof));
  parts.push(box(-hw + w, hw - w, roofY - 0.012, roofY, Math.max(zF, zH) + w, zA - w, col.lining, 'wood'));
  return parts;
}

/**
 * A deckhouse (vessel/deckhouse.ts): lofted along her from front to aft through its plan's
 * half widths, from its foot (`baseAt` z: just below the deck there) up to its top; through
 * the front's rake (the first stretch aft of its foot) the top comes down to the deck, so
 * the front is one sloping face that follows her sides. One geometry: its sides, top, front
 * and aft faces.
 */
function buildDeckhouse(dh: DeckhouseLayout, baseAt: (z: number) => number, color: number): THREE.BufferGeometry {
  const foot = baseAt(dh.z0);
  const shift = (dh.top - foot) * Math.tan((dh.rakeDeg * Math.PI) / 180);
  // Sections every 0.25 m, and where the rake ends.
  const zs = new Set<number>([dh.z0, dh.z1, ...dh.plan.map(([z]) => z)]);
  for (let z = dh.z0; z < dh.z1; z += 0.25) zs.add(z);
  if (shift > 0 && dh.z0 + shift < dh.z1) zs.add(dh.z0 + shift);
  const sec = [...zs].sort((a, b) => a - b).map((z) => {
    const b = baseAt(z);
    const y = shift > 0 && z < dh.z0 + shift ? foot + ((z - dh.z0) / shift) * (dh.top - foot) : dh.top;
    return { z, w: deckhouseHalfWidth(dh, z), y: Math.max(b, y), b };
  });
  const v: number[] = [];
  // Each quad's corners in order round it; its outside face the one they go clockwise round, seen from outside.
  const quad = (a: number[], b: number[], c: number[], d: number[]) => v.push(...a, ...c, ...b, ...a, ...d, ...c);
  for (let i = 0; i + 1 < sec.length; i++) {
    const p = sec[i];
    const q = sec[i + 1];
    quad([q.w, q.b, q.z], [q.w, q.y, q.z], [p.w, p.y, p.z], [p.w, p.b, p.z]); // starboard side
    quad([-p.w, p.b, p.z], [-p.w, p.y, p.z], [-q.w, q.y, q.z], [-q.w, q.b, q.z]); // port side
    quad([-p.w, p.y, p.z], [p.w, p.y, p.z], [q.w, q.y, q.z], [-q.w, q.y, q.z]); // the top (and the raked front)
  }
  const f = sec[0];
  const a = sec[sec.length - 1];
  quad([-f.w, f.b, f.z], [f.w, f.b, f.z], [f.w, f.y, f.z], [-f.w, f.y, f.z]); // the front's foot
  quad([a.w, a.b, a.z], [-a.w, a.b, a.z], [-a.w, a.y, a.z], [a.w, a.y, a.z]); // the aft face
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return part(g, color);
}

/**
 * Window frames (pixel painting, owner): a black band round the glass, as its own strip of
 * wall (crisper than a painted line, and it costs a box): along the top of the panels below
 * the glass and the bottom of those above it; the mullions and posts between panes are black.
 */
function frameKit(col: Paint) {
  const H = col.house;
  const F = col.frame;
  const FW = CONFIG.pixelPaint.frameWidth;
  /**
   * A frame piece: 4 mm proud of the wall all round. Where it overlaps a wall panel (a corner
   * post over the front wall's end) their faces would otherwise share a plane and flicker
   * between black and white (z-fighting, owner).
   */
  function fbox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
    const e = FRAME_PROUD;
    return box(Math.min(x0, x1) - e, Math.max(x0, x1) + e, y0 - e, y1 + e, Math.min(z0, z1) - e, Math.max(z0, z1) + e, F);
  }
  /** A wall panel with the frame along its top edge (under the glass) or its bottom (over it); `solid` is a stretch of z with wall, not glass, beside that edge. */
  const framed = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, edge: 'top' | 'bottom', solid?: [number, number]): THREE.BufferGeometry[] => {
    if (y1 - y0 <= 2 * FW) return [fbox(x0, x1, y0, y1, z0, z1)];
    const [b0, b1] = edge === 'top' ? [y1 - FW, y1] : [y0, y0 + FW];
    const out = [edge === 'top' ? box(x0, x1, y0, b0, z0, z1, H) : box(x0, x1, b1, y1, z0, z1, H)];
    // The band, in H where there's wall beside it instead of glass.
    const s0 = solid ? Math.max(z0, Math.min(z1, solid[0])) : z0;
    const s1 = solid ? Math.max(z0, Math.min(z1, solid[1])) : z0;
    if (s0 > z0) out.push(fbox(x0, x1, b0, b1, z0, s0));
    if (s1 > s0) out.push(box(x0, x1, b0, b1, s0, s1, H));
    if (z1 > s1) out.push(fbox(x0, x1, b0, b1, s1, z1));
    return out;
  };
  return { F, FW, fbox, framed };
}

/** The wheelhouse floor, round the engine hatch's opening if she has one, and the engine space under it. */
function buildFloor(layout: HouseLayout, col: Paint, parts: THREE.BufferGeometry[]): void {
  const wh = layout.wheelhouse;
  const hw = wh.halfWidth;
  const w = wh.wall;
  const eh = layout.engineHatch;
  const fx0 = -hw + w;
  const fx1 = hw - w;
  const fz0 = wh.front + w;
  const fz1 = wh.aft - w;
  const fy0 = wh.floorY - 0.1;
  if (eh) {
    parts.push(box(fx0, eh.x0, fy0, wh.floorY, fz0, fz1, col.floor, 'mat'));
    parts.push(box(eh.x1, fx1, fy0, wh.floorY, fz0, fz1, col.floor, 'mat'));
    parts.push(box(eh.x0, eh.x1, fy0, wh.floorY, fz0, eh.z0, col.floor, 'mat'));
    parts.push(box(eh.x0, eh.x1, fy0, wh.floorY, eh.z1, fz1, col.floor, 'mat'));
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
  } else parts.push(box(fx0, fx1, fy0, wh.floorY, fz0, fz1, col.floor, 'mat'));
}

/** Helm console across the front: body, sloping top (approximated by a step), panel face. */
function buildConsole(wh: HouseLayout['wheelhouse'], col: Paint, parts: THREE.BufferGeometry[]): void {
  const hw = wh.halfWidth;
  const w = wh.wall;
  const c0 = wh.front + w;
  const c1 = c0 + wh.consoleDepth;
  const cTop = wh.floorY + wh.consoleHeight;
  parts.push(box(-hw + w, hw - w, wh.floorY, cTop, c0, c1, col.console));
  parts.push(box(-hw + w, hw - w, cTop, cTop + 0.12, c0, c0 + wh.consoleDepth * 0.45, col.console));
  parts.push(box(-hw + w + 0.05, hw - w - 0.05, cTop - 0.01, cTop + 0.005, c0 + wh.consoleDepth * 0.45, c1 - 0.03, col.panel));
}

/**
 * Walk-in wheelhouse: walls with a window band all round, an aft doorway, floor, helm
 * console, roof and mast. Dimensions come from the layout config (shared with layout.ts).
 */
function buildWheelhouse(layout: HouseLayout, col: Paint, base: number): THREE.BufferGeometry[] {
  const wh = layout.wheelhouse;
  const parts: THREE.BufferGeometry[] = [];
  const hw = wh.halfWidth;
  const w = wh.wall;
  // Walls start at `base`: below the deck (and the floor), so there's never a gap.
  const sill = wh.floorY + wh.windowSill;
  const head = wh.floorY + wh.windowHead;
  const roof = wh.roofY;
  const H = col.house;
  const { FW, fbox, framed } = frameKit(col);
  // Everything from here to the floor is the house's walls: lined with wood inside (below).
  const wallsFrom = parts.length;

  // Front wall: the lower panel upright; above the sill (the window band's two mullions and
  // the panel above the glass) raked forward, pilot-house style (frontRake).
  // The front glass starts higher than the sides' (`frontSill`, level with the dash top).
  const rake = frontRake(wh);
  const fSill = rake.sill;
  const raked = (g: THREE.BufferGeometry) => g.applyMatrix4(rake.matrix);
  const fwdAtHead = (head - fSill) * rake.tan;
  const fwdAtRoof = (roof - fSill) * rake.tan;
  parts.push(...framed(-hw, hw, base, fSill, wh.front, wh.front + w, 'top'));
  parts.push(...framed(-hw, hw, head, roof, wh.front, wh.front + w, 'bottom').map(raked));
  for (const x of [-0.5, 0.5]) parts.push(raked(fbox(x - 0.04, x + 0.04, fSill, head, wh.front, wh.front + w)));
  // Side walls, each with one mullion. Alongside the console the wall stands up to the
  // console top (`sideRaise`, owner sketch), sloping back down to the sill aft of it. The
  // port wall has a sliding door between the console and the chart table (`sideDoor`).
  const raise = wh.sideRaise;
  const raiseTop = raise ? wh.floorY + raise.height : sill;
  const sd = wh.sideDoor;
  const jamb = 0.08;
  // Each side's window mullion: at z -0.16 where the house spans it (the workboat's, aft of
  // her chart table), else halfway along the side (it stood out on the deck before, owner).
  const mullion = wh.front < -0.5 && wh.aft > 0.2 ? -0.16 : (wh.front + wh.aft) / 2;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? hw - w : -hw;
    const x1 = s > 0 ? hw : -hw + w;
    const door = s < 0 && sd ? sd : null;
    // Where the wall stands above the sill beside the console (no glass there, so no frame under it).
    const solid: [number, number] | undefined = raise && raiseTop > sill ? [wh.front, door ? door.z0 : raise.z1 + raise.slope] : undefined;
    if (door) {
      // Below the window band and above it, round the door opening (floor to door head).
      parts.push(...framed(x0, x1, base, sill, wh.front, door.z0, 'top', solid));
      parts.push(...framed(x0, x1, base, sill, door.z1, wh.aft, 'top'));
      parts.push(...framed(x0, x1, head, roof, wh.front, door.z0, 'bottom'));
      parts.push(...framed(x0, x1, head, roof, door.z1, wh.aft, 'bottom'));
      parts.push(box(x0, x1, wh.floorY + door.height, roof, door.z0, door.z1, H)); // header
      parts.push(box(x0, x1, base, wh.floorY + 0.02, door.z0, door.z1, col.floor)); // threshold
      // Jambs: forward (the door buttons are on it), and aft, running back to the mullion.
      parts.push(box(x0, x1, sill, wh.floorY + door.height, door.z0 - jamb, door.z0, H));
      parts.push(box(x0, x1, sill, wh.floorY + door.height, door.z1, mullion + 0.04, H));
    } else {
      parts.push(...framed(x0, x1, base, sill, wh.front, wh.aft, 'top', solid));
      parts.push(...framed(x0, x1, head, roof, wh.front, wh.aft, 'bottom'));
    }
    parts.push(fbox(x0, x1, sill, head, mullion - 0.04, mullion + 0.04));
    if (raise && raiseTop > sill) {
      // Solid up to the console top beside it; on the port side it runs into the door jamb.
      const zEnd = door ? door.z0 - jamb : raise.z1;
      parts.push(...framed(x0, x1, sill, raiseTop, wh.front, zEnd, 'top'));
      if (!door) parts.push(wedge(x0, x1, raise.z1, raise.z1 + raise.slope, sill, raiseTop, H));
    }
    // Front corner posts, raked with the front; deep enough at the foot that, leaning
    // forward, they still close onto the upright side wall behind (a solid cheek, widest at
    // the top). Above the head the same cheek runs up to the roof.
    // Below the front sill the post is as deep as the raked cheek's foot, so the two meet
    // flush and there's no slot of window beside the dash (owner feedback).
    parts.push(fbox(x0, x1, sill, fSill, wh.front, wh.front + 0.1 + fwdAtHead));
    parts.push(raked(fbox(x0, x1, fSill, head, wh.front, wh.front + 0.1 + fwdAtHead)));
    if (fwdAtRoof > 0) parts.push(raked(box(x0, x1, head, roof, wh.front, wh.front + fwdAtRoof + 0.02, H)));
    parts.push(fbox(x0, x1, sill, head, wh.aft - 0.1, wh.aft));
  }
  // Aft wall: panels either side of the doorway, with the window band open, and a lintel.
  const door = wh.doorWidth / 2;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? door : -hw;
    const x1 = s > 0 ? hw : -door;
    // (The aft wall's panels run across, x, so their band is a box across too.)
    const [p0, p1] = [Math.min(x0, x1), Math.max(x0, x1)];
    if (sill - base > 2 * FW) parts.push(box(p0, p1, base, sill - FW, wh.aft - w, wh.aft, H), fbox(p0, p1, sill - FW, sill, wh.aft - w, wh.aft));
    else parts.push(fbox(p0, p1, base, sill, wh.aft - w, wh.aft));
    if (roof - head > 2 * FW) parts.push(box(p0, p1, head + FW, roof, wh.aft - w, wh.aft, H), fbox(p0, p1, head, head + FW, wh.aft - w, wh.aft));
    else parts.push(fbox(p0, p1, head, roof, wh.aft - w, wh.aft));
    // Door jambs carry the band between sill and head next to the opening (wide enough for
    // the door's push buttons, inside and out).
    const jx = s > 0 ? door : -door - JAMB;
    parts.push(fbox(jx, jx + JAMB, sill, head, wh.aft - w, wh.aft));
  }
  parts.push(box(-door, door, wh.floorY + wh.doorHeight, roof, wh.aft - w, wh.aft, H));
  // The walls' inside faces: wood lining (pixel painting, owner).
  const centre = new THREE.Vector3(0, 0, (wh.front + wh.aft) / 2);
  for (const g of parts.slice(wallsFrom)) lineInside(g, H, col.lining, centre);
  // The ceiling: wood lining just under the roof.
  parts.push(box(-hw + w, hw - w, roof - 0.012, roof, wh.front + w, wh.aft - w, col.lining, 'wood'));
  // Door sill.
  parts.push(box(-door, door, base, wh.floorY + 0.02, wh.aft - w, wh.aft, col.floor));

  buildFloor(layout, col, parts);
  buildConsole(wh, col, parts);
  const rf = layout.roof;
  const top = roof + rf.thickness;
  const ov = rf.overhang;
  parts.push(box(-hw - ov, hw + ov, roof, top, wh.front - ov, wh.aft + ov, col.roof));
  // The brow: the roof edge carried forward over the raked front glass (none if upright).
  if (fwdAtRoof > 0) parts.push(box(-hw - ov, hw + ov, roof, top, wh.front - fwdAtRoof - ov, wh.front - ov, col.roof));
  // The mast is a module since M5b (modules/mast).

  // Roof rail (posts + top rail), open at the ladder head on the aft edge.
  const lad = layout.ladder;
  if (!lad) return parts;
  const rx = hw + ov - 0.04;
  const z0 = wh.front - ov + 0.04;
  const z1 = wh.aft + ov - 0.04;
  const rail = (a: THREE.Vector3, b: THREE.Vector3) => {
    parts.push(bar(a.clone().setY(top + rf.railHeight), b.clone().setY(top + rf.railHeight), 0.045, 0.045, col.rail));
    parts.push(bar(a.clone().setY(top + rf.railHeight / 2), b.clone().setY(top + rf.railHeight / 2), 0.035, 0.035, col.rail));
    for (const p of [a, b]) parts.push(bar(p.clone().setY(top), p.clone().setY(top + rf.railHeight), 0.04, 0.04, col.rail));
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
    parts.push(bar(new THREE.Vector3(lad.x + s * sx, footY, lz), new THREE.Vector3(lad.x + s * sx, top + 1.0, lz), 0.045, 0.045, col.rail));
  }
  for (let y = footY + 0.32; y < top; y += 0.3) {
    parts.push(bar(new THREE.Vector3(lad.x - sx, y, lz), new THREE.Vector3(lad.x + sx, y, lz), 0.035, 0.035, col.rail));
  }

  return parts;
}


