import * as THREE from 'three';
import type { HullForm } from '../hullForm';
import { hullPlan, type LayoutConfig } from '../layout';
import { frontMullions, houseFloorAt, houseFloorLow, housesOf, houseX, planHalfWidth, wingCurveY, type CabinBelow, type Livery } from '../vesselDef';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { CONFIG } from '../../config';
import { paintIndex, type PaintName } from '../../render/pixelPaint';
import type { HouseShape } from '../vesselDef';
import { deckhouseHalfWidth, type DeckhouseLayout } from '../deckhouse';
import { houseFlare, type HouseFlare } from '../houseFlare';

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
  /** The wheelhouse's lining inside, its walls and its ceiling (her livery's `interior` sets them: CONFIG.interiors). */
  lining: 0x8a5d3c,
  ceiling: 0x8a5d3c,
};

/**
 * Every part's colour, for a hull's livery (`roofTop`: only a roof with an inset top in a
 * second colour has one), and the tiles the wheelhouse's lining wears inside.
 */
type Paint = typeof COLORS & { roofTop?: number; liningTile: PaintName; ceilingTile: PaintName; floorTile: PaintName };

/** A hull's colours: her livery over the workboat's; inside, her interior finish (the wood lining if none) and floor (matting). */
export function paintOf(livery?: Livery): Paint {
  const fin = CONFIG.interiors[livery?.interior ?? 0] ?? CONFIG.interiors[0];
  const fl = CONFIG.cabinFloors[livery?.cabinFloor ?? 0] ?? CONFIG.cabinFloors[0];
  const paint: Paint = { ...COLORS, lining: fin.walls, ceiling: fin.ceiling, liningTile: fin.wallTile, ceilingTile: fin.ceilingTile, floorTile: fl.tile };
  for (const [k, v] of Object.entries(livery ?? {})) if (v !== undefined && k !== 'interior' && k !== 'cabinFloor') (paint as unknown as Record<string, number>)[k] = v;
  if (fl.colour !== null) paint.floor = fl.colour;
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

/**
 * The same, in two meshes: her hull (with its bulwarks, rails and fittings) and her house
 * (deckhouse, wheelhouse and its steps), for the Shipyard, which shows one step's part on
 * its own (owner, Oct 2026: the hull without the house; the house over a ghost of the hull).
 * The game draws the one merged mesh above.
 */
export function buildVesselMeshParts(form: HullForm, layout: LayoutConfig, exhaustOutlet?: [number, number, number], livery?: Livery): { hull: THREE.Mesh; house: THREE.Mesh | null } {
  const at = { house: 0 };
  const parts = buildParts(form, layout, exhaustOutlet, paintOf(livery), at);
  const mesh = (list: THREE.BufferGeometry[]) => new THREE.Mesh(mergeParts(list), flatVertexColorMaterial());
  const hull = mesh(parts.slice(0, at.house));
  hull.name = 'hull';
  const rest = parts.slice(at.house);
  const house = rest.length ? mesh(rest) : null;
  if (house) house.name = 'house';
  return { hull, house };
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

function buildParts(form: HullForm, layout: LayoutConfig, exhaustOutlet: [number, number, number] | undefined, col: Paint, at?: { house: number }): THREE.BufferGeometry[] {
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
  // A catamaran (Station.demihull): each demihull's panels face away from its own centreline,
  // the wet deck's underside down (away from a point above it); her inner topsides and the
  // wet deck are painted as her topsides, not her bottom.
  const cat = form.catamaran;
  const insideEdge = (i: number, k: number): THREE.Vector3 => {
    if (!cat) return inside(i);
    const poly = st[i].polygon;
    if (k === 4) return new THREE.Vector3(0, poly[4][1] + 0.3, st[i].z);
    return new THREE.Vector3((k < 4 ? -1 : 1) * cat.spacing / 2, (poly[2][1] + poly[0][1]) / 2, st[i].z);
  };
  const topsideEdge = (k: number) => (cat ? [0, 3, 4, 5, 8].includes(k) : k < chine || k >= last - chine);

  // A cabin sunk below the deck (its floor lower than the deck under it: you step down into
  // it) has no deck across it: the deck is cut away inside the house's walls. Every house's
  // (P2a: the list), the helm's first.
  const cuts = sunkenHouses(form, layout);
  // ...and an engine hatch in the deck (a Shipyard design's, over her engine forward or aft
  // of the house) has its opening cut out, from x0 to x1 across. Each cut: the deck stays
  // outboard of its inner edge on each side (`inner`, by side -1 port, 1 starboard).
  const deckHatch = layout.engineHatch?.y !== undefined ? layout.engineHatch : undefined;
  const holdHatch = layout.fishHold?.hatch;
  const deckCuts = [
    ...cuts.map((c) => ({ front: c.front, aft: c.aft, zs: c.zs ?? [], inner: (side: number, z: number) => (c.x ?? 0) + side * c.halfWidth(z) })),
    ...(deckHatch ? [{ front: deckHatch.z0, aft: deckHatch.z1, zs: [] as number[], inner: (side: number) => (side < 0 ? deckHatch.x0 : deckHatch.x1) }] : []),
    // ...and a fish hold's hatch (modules/fishHold: its coaming stands round the opening).
    ...(holdHatch ? [{ front: holdHatch.z0, aft: holdHatch.z1, zs: [] as number[], inner: (side: number) => (side < 0 ? holdHatch.x0 : holdHatch.x1) }] : []),
  ];
  for (let i = 0; i < st.length - 1; i++) {
    // Interior reference midway between the two stations.
    const mid = inside(i).add(inside(i + 1)).multiplyScalar(0.5);
    const cut = deckCuts.some((c) => Math.min(st[i].z, st[i + 1].z) < c.aft && Math.max(st[i].z, st[i + 1].z) > c.front);
    // Topsides from each deck edge down to its chine, bottom from the chines to the keel.
    const edges: [number, number, number][] = [];
    for (let k = 0; k < last; k++) edges.push([k, k + 1, topsideEdge(k) ? col.topsides : col.bottom]);
    if (!cut) edges.push([last, 0, col.deck]); // deck
    else {
      // The deck in pieces between the stations and the house's ends; across the house, only
      // its strips outside the walls.
      const za = st[i].z;
      const zb = st[i + 1].z;
      const at = (z: number, k: number) => P(i, k).lerp(P(i + 1, k), (z - za) / (zb - za));
      const breaks = [za, zb, ...deckCuts.flatMap((c) => [c.front, c.aft, ...c.zs])].filter((z) => z <= Math.max(za, zb) && z >= Math.min(za, zb)).sort((a, b) => b - a);
      for (let j = 0; j < breaks.length - 1; j++) {
        const z0 = breaks[j];
        const z1 = breaks[j + 1];
        if (z0 - z1 < 1e-6) continue;
        const p0 = at(z0, 0), p1 = at(z1, 0), s0 = at(z0, last), s1 = at(z1, last);
        const zm = (z0 + z1) / 2;
        const across = deckCuts.find((c) => zm > c.front && zm < c.aft);
        if (across) {
          for (const [e0, e1, side] of [[p0, p1, -1], [s0, s1, 1]] as const) {
            const i0 = e0.clone().setX(across.inner(side, z0));
            const i1 = e1.clone().setX(across.inner(side, z1));
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
      const ref = cat && a !== last ? insideEdge(i, a).add(insideEdge(i + 1, a)).multiplyScalar(0.5) : mid;
      tri(a0, b0, b1, ref, color, paint);
      tri(a0, b1, a1, ref, color, paint);
    }
  }
  // Transom (station 0) as a fan around its centre.
  const tIn = inside(0).add(new THREE.Vector3(0, 0, -1));
  const tC = new THREE.Vector3(0, (st[0].polygon[2][1] + st[0].polygon[0][1]) / 2, st[0].z);
  // A catamaran's end isn't convex (her tunnel's a notch in it): it's cut into triangles that
  // leave the tunnel open, each demihull's transom and the bridge deck's plate across.
  const endPlate = (i: number, ref: THREE.Vector3) => {
    const tris = THREE.ShapeUtils.triangulateShape(outlines[i].map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const [a, b, d] of tris) tri(P(i, a), P(i, b), P(i, d), ref, col.topsides);
  };
  if (cat) endPlate(0, tIn);
  else for (let k = 0; k <= last; k++) tri(tC, P(0, k), P(0, (k + 1) % (last + 1)), tIn, col.topsides);
  // A square bow (a landing bow: the last station still has width) is closed the same way,
  // by a bow plate. (A catamaran's bow: the bridge deck's front, across her tunnel.)
  const e = st.length - 1;
  if (st[e].halfBeamDeck > SQUARE_BOW) {
    const bIn = inside(e).add(new THREE.Vector3(0, 0, 1));
    const bC = new THREE.Vector3(0, (st[e].polygon[2][1] + st[e].polygon[0][1]) / 2, st[e].z);
    if (cat) endPlate(e, bIn);
    else for (let k = 0; k <= last; k++) tri(bC, P(e, k), P(e, (k + 1) % (last + 1)), bIn, col.topsides);
  }

  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hull.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  hull.setAttribute('paint', new THREE.Float32BufferAttribute(paints, 1));
  hull.computeVertexNormals();

  const parts = [hull, ...buildDeckFittings(form, layout, col)];
  // The engine space under a deck hatch: as under one in the cabin floor (buildFloor).
  if (deckHatch) parts.push(...engineSpaceParts(deckHatch, deckHatch.y!, deckHatch.y!, true));
  // Wet-exhaust outlet: a short pipe stub through the transom.
  const ex = exhaustOutlet;
  if (ex) parts.push(bar(new THREE.Vector3(ex[0], ex[1], ex[2] - 0.12), new THREE.Vector3(ex[0], ex[1], ex[2]), 0.13, 0.13, col.mast));
  // Ladders up to a raised foredeck (Shipyard): each tread a block from her deck up, in the
  // deck's colour, non-slip; and a handrail up each ladder's inboard side, on a post at its foot
  // and one at its head on the raised deck (her bulwark is its other side).
  if (layout.deckSteps?.length) {
    const plan = hullPlan({ hull: form });
    for (const t of layout.deckSteps) parts.push(box(t.x0, t.x1, plan.deckY(t.z1) - 0.02, t.y, t.z0, t.z1, col.deck, 'nonSlip'));
    const rail = CONFIG.shipyard.foredeck.rail;
    for (const side of [-1, 1]) {
      const ladder = layout.deckSteps.filter((t) => Math.sign(t.x0 + t.x1) === side);
      if (!ladder.length) continue;
      const x = side < 0 ? Math.max(...ladder.map((t) => t.x1)) : Math.min(...ladder.map((t) => t.x0));
      const zHead = Math.min(...ladder.map((t) => t.z0));
      const zFoot = Math.max(...ladder.map((t) => t.z1));
      const yHead = Math.max(...ladder.map((t) => t.y)) + (Math.max(...ladder.map((t) => t.y)) - Math.min(...ladder.map((t) => t.y))) / Math.max(1, ladder.length - 1);
      const yFoot = plan.deckY(zFoot + 0.05);
      const head = new THREE.Vector3(x, yHead + rail, zHead - 0.25);
      const foot = new THREE.Vector3(x, yFoot + rail, zFoot);
      parts.push(bar(new THREE.Vector3(x, yHead, head.z), head, 0.04, 0.04, col.rail));
      parts.push(bar(new THREE.Vector3(x, yFoot, zFoot), foot, 0.04, 0.04, col.rail));
      parts.push(bar(new THREE.Vector3(x, yHead + rail, zHead), foot, 0.04, 0.04, col.rail));
      parts.push(bar(new THREE.Vector3(x, yHead + rail, head.z), new THREE.Vector3(x, yHead + rail, zHead), 0.04, 0.04, col.rail));
    }
  }
  // The house's parts from here on (buildVesselMeshParts).
  if (at) at.house = parts.length;
  // A deckhouse under the wheelhouse (vessel/deckhouse.ts), from a little below the deck
  // under each part of it (her sides tuck in below the deck: lower, it showed through them).
  if (layout.deckhouse) {
    const plan = hullPlan({ hull: form });
    // (A cabin below's companionway comes down through its top as well as the wheelhouse floor.)
    parts.push(buildDeckhouse(layout.deckhouse, (z) => plan.deckY(z) - 0.06, col.house, layout.cabin ? [layout.cabin.stair] : []));
    if (layout.deckhouse.walk) parts.push(...deckhouseRail(layout.deckhouse, layout.wheelhouse?.halfWidth ?? 0, plan.deckY, col.rail, col.deck));
  }
  // A cabin below (P2c): under the deckhouse, or under a raised foredeck the wheelhouse stands on.
  if (layout.cabin) parts.push(...cabinParts(layout.cabin));
  // Her houses (P2a: the list), the helm's first: each drawn as the helm's is, from a layout
  // that is its own (a further house has no engine hatch in its floor, no ladder to its roof).
  if (hasHouse(layout)) {
    const plan = hullPlan({ hull: form });
    for (const [k, wh] of housesOf(layout).entries()) {
      const own: HouseLayout = k === 0 ? layout : { ...layout, wheelhouse: wh, engineHatch: undefined, ladder: undefined, overhead: undefined };
      const sunkHere = cuts.some((c) => c.house === k);
      // Its walls start below the deck so there's never a gap there, but no lower than 0.06 m
      // under it, where the hull's sides are still wider than the house: on a fine entry the
      // hull narrows fast below the deck and lower walls showed through her topsides. A sunk
      // house's walls go down to its floor (the Shipyard keeps those where her hull is wide).
      const deckLo = Math.min(...Array.from({ length: 9 }, (_, i) => plan.deckY(wh.front + ((wh.aft - wh.front) * i) / 8)));
      const low = Math.min(0.9, houseFloorLow(wh) - 0.15);
      // (With a cabin below under it, P2c: from its floor's underside, so they don't stand across the cabin.)
      const base = k === 0 && layout.cabin ? Math.max(low, wh.floorY - 0.12) : sunkHere ? low : Math.max(low, deckLo - 0.06);
      // (Built in the house's own frame, then moved across to where it stands: houseX.)
      const from = parts.length;
      if (wh.shell === 'oneOff') {
        // Her own walls, floors, console body and roof (boats/oneOffViews.ts): nothing here.
      } else parts.push(...(wh.shape ? buildShapedHouse(own, col, base) : buildWheelhouse(own, col, base)));
      // Steps at the aft door: solid blocks up to each tread.
      const d = wh.doorWidth / 2;
      // (Its floor at the door: a saloon's, a step or two down from the helm's.)
      const doorFloor = houseFloorAt(wh, wh.aft);
      const foot = Math.min(doorFloor, plan.deckY(wh.aft)) - 0.05;
      for (const st of wh.steps ?? []) parts.push(box(-d, d, foot, st.y, st.z0, st.z1, col.deck, 'nonSlip'));
      // Stepping down into a sunken cabin: the step's face, from the deck down to the door sill.
      if (sunkHere) parts.push(box(-d, d, doorFloor, plan.deckY(wh.aft), wh.aft, wh.aft + 0.03, col.deck));
      const hx = houseX(wh);
      if (hx) for (let j = from; j < parts.length; j++) parts[j].translate(hx, 0, 0);
    }
  }
  return parts;
}

/**
 * Lines a house wall inside: its faces that stand upright and look in towards `centre` (in
 * plan) take the lining's colour and tile (the interior finish's). Only a part in the house's
 * own colour (the window frames stay black inside too).
 */
function lineInside(g: THREE.BufferGeometry, house: number, lining: number, tile: PaintName, centre: THREE.Vector3): void {
  const col = g.attributes.color;
  const pos = g.attributes.position;
  const paint = g.attributes.paint;
  const h = new THREE.Color(house);
  if (Math.abs(col.getX(0) - h.r) + Math.abs(col.getY(0) - h.g) + Math.abs(col.getZ(0) - h.b) > 1e-3) return;
  const c = new THREE.Color(lining);
  const wood = paintIndex(tile);
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

/**
 * A plate `w` thick standing on the line from `p0` to `p1` (its foot following them) up to a
 * level top at `topY`: its two faces, its top and its ends (a bulwark risen along a
 * full-width deckhouse).
 */
function levelPlate(p0: THREE.Vector3, p1: THREE.Vector3, topY: number, w: number, color: number): THREE.BufferGeometry[] {
  const along = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z).normalize();
  const n = new THREE.Vector3(along.z, 0, -along.x).multiplyScalar(w / 2);
  const c = (p: THREE.Vector3, s: number, top: boolean) => new THREE.Vector3(p.x + n.x * s, top ? topY : p.y, p.z + n.z * s);
  const faces = [
    [c(p0, 1, false), c(p1, 1, false), c(p1, 1, true), c(p0, 1, true)],
    [c(p0, -1, false), c(p1, -1, false), c(p1, -1, true), c(p0, -1, true)],
    [c(p0, 1, true), c(p1, 1, true), c(p1, -1, true), c(p0, -1, true)],
    [c(p0, 1, false), c(p0, -1, false), c(p0, -1, true), c(p0, 1, true)],
    [c(p1, 1, false), c(p1, -1, false), c(p1, -1, true), c(p1, 1, true)],
  ];
  return faces.map((f) => plate(f, color));
}

/** Bulwarks, and (if `railHeight` > 0) handrails and stanchions, along the deck edge and across the transom. */
function buildDeckFittings(form: HullForm, layout: LayoutConfig, col: Paint): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const st = form.stations;
  const bh = layout.bulwarkHeight;
  const rh = layout.railHeight;
  const edge = (i: number, side: number, up: number) => {
    const p = st[i].polygon;
    const [x, y] = p[side > 0 ? p.length - 1 : 0];
    return new THREE.Vector3(x - side * 0.03, y + up, st[i].z);
  };
  // The working-deck gate (layout.sideGate): its bulwark and rail section is a separate,
  // moving part (controls/SideGate.ts); here the gap is left, with a post at each end.
  const gate = layout.sideGate;
  // A deckhouse out to her sides (a raised deck, owner): along it her bulwark plate and rail
  // rise by as much as its top stands over her deck, so they guard its top as they do the deck.
  const dh = layout.deckhouse?.full ? layout.deckhouse : undefined;
  const risen = (z: number) => !!dh && z > dh.z0 && z < dh.z1;
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
      // (Split where a full-width deckhouse starts and ends: its bulwark is risen between.)
      if (dh) {
        const f = (z: number) => (z - a.z) / (b.z - a.z);
        const cuts = [f(dh.z0), f(dh.z1)].filter((t) => t > 1e-3 && t < 1 - 1e-3);
        pieces = pieces.flatMap(([u, v]) => {
          const ts = [u, ...cuts.filter((t) => t > u && t < v).sort((x, y) => x - y), v];
          return ts.slice(1).map((t, k): [number, number] => [ts[k], t]);
        });
      }
      for (const [u, v] of pieces) {
        const p0 = a.clone().lerp(b, u);
        const p1 = a.clone().lerp(b, v);
        // Risen along a full-width deckhouse: the deck under her plate here is its top, which
        // is level, so the plate's top and the rail are level too (owner, Oct 2026: raised by
        // the height at each piece's middle, they followed her sheer and stepped back up at
        // every station, a sawtooth). Its foot stays on her deck edge.
        if (risen((p0.z + p1.z) / 2)) {
          parts.push(...levelPlate(p0, p1, dh!.top + bh, 0.05, col.topsides));
          if (rh > 0) parts.push(bar(p0.clone().setY(dh!.top + rh), p1.clone().setY(dh!.top + rh), 0.05, 0.05, col.rail));
          continue;
        }
        // Bulwark plate (a thin bar standing on the deck edge).
        parts.push(bar(p0.clone().setY(p0.y + bh / 2), p1.clone().setY(p1.y + bh / 2), 0.05, bh, col.topsides));
        if (rh > 0) parts.push(bar(p0.clone().setY(p0.y + rh), p1.clone().setY(p1.y + rh), 0.05, 0.05, col.rail));
      }
      const inGap = !!gate && side === gate.side && a.z > gate.z0 && a.z < gate.z1;
      const upAt = risen(a.z) ? dh!.top - a.y : 0;
      if (rh > 0 && !inGap) parts.push(bar(edge(i, side, bh + upAt), edge(i, side, rh + upAt), 0.04, 0.04, col.rail));
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
export function sunkenHouse(form: HullForm, layout: LayoutConfig): { front: number; aft: number; halfWidth: (z: number) => number } | null {
  return sunkenHouses(form, layout).find((c) => c.helm) ?? null;
}

/** Where the deck is cut away for her houses (P2a: every house sunk below the deck; the helm's, `house` 0, with any deck opening forward of it). */
export function sunkenHouses(form: HullForm, layout: LayoutConfig): { house: number; helm: boolean; front: number; aft: number; halfWidth: (z: number) => number; zs?: number[]; x?: number }[] {
  const plan = hullPlan({ hull: form });
  // (`zs`: where its edge bends, a plan's points, so the deck's cut edge follows it; `x`: a house standing off her centreline, its middle.)
  const out: { house: number; helm: boolean; front: number; aft: number; halfWidth: (z: number) => number; zs?: number[]; x?: number }[] = [];
  for (const [k, wh] of housesOf(layout).entries()) {
    const helm = k === 0 && !!layout.wheelhouse;
    const deck = Math.max(plan.deckY(wh.front), plan.deckY(wh.aft));
    // A cabin below the deck forward of the helm's house (layout.deckOpening: under a trunk
    // cabin): the cut runs on forward, `inset` in from the deck edge there.
    const op = helm ? layout.deckOpening : undefined;
    // (A Shipyard cabin below, P2c: cut to its own plan, from its front to its aft end. The house above stands on its deckhouse.)
    if (op?.plan) {
      const plan = op.plan;
      out.push({ house: k, helm, front: plan[0][0], aft: plan[plan.length - 1][0], halfWidth: (z) => planHalfWidth(plan, z), zs: plan.map(([z]) => z) });
      if (houseFloorLow(wh) < deck) out.push({ house: k, helm: false, front: wh.front, aft: wh.aft, halfWidth: () => wh.halfWidth });
    } else if (op) out.push({ house: k, helm, front: Math.min(wh.front, op.front), aft: wh.aft, halfWidth: (z) => (z < wh.front ? Math.max(0.2, plan.halfBeam(z) - op.inset) : wh.halfWidth) });
    else if (houseFloorLow(wh) < deck) out.push({ house: k, helm, front: wh.front, aft: wh.aft, halfWidth: () => wh.halfWidth, ...(houseX(wh) ? { x: houseX(wh) } : {}) });
  }
  return out;
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

/**
 * A faceted front's setback at `x` (m aft of the house's front): 0 across the middle pane,
 * growing to the facet's depth at the side walls (vesselDef.ts HouseShape.facet); 0 everywhere
 * for a flat front. The console wraps round with it (its wings set back as much).
 */
export function facetDz(wh: { halfWidth: number; shape?: HouseShape }): (x: number) => number {
  const f = wh.shape?.facet;
  if (!f) return () => 0;
  const k = f.depth / (wh.halfWidth - f.centre);
  return (x) => Math.max(0, Math.abs(x) - f.centre) * k;
}
export const facetDepth = (wh: { shape?: HouseShape }): number => wh.shape?.facet?.depth ?? 0;

/** Set each vertex (forward of `zone`, if given) back by `dz` at its x: a faceted front's walls, its console's wings. */
export function setBack(geoms: THREE.BufferGeometry[], dz: (x: number) => number, zone = Infinity): void {
  for (const g of geoms) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getZ(i) < zone) p.setZ(i, p.getZ(i) + dz(p.getX(i)));
    p.needsUpdate = true;
    g.computeVertexNormals();
  }
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

/** Move every vertex by the house's flare (houseFlare.ts): walls raked out all round. */
function applyFlare(geoms: THREE.BufferGeometry[], fl: HouseFlare): void {
  for (const g of geoms) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [x, y, z] = fl.at(p.getX(i), p.getY(i), p.getZ(i));
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
  }
}

/** A flat plate through the corners `pts` (a convex polygon, in order), seen from both sides. */
function plate(pts: THREE.Vector3[], color: number): THREE.BufferGeometry {
  const v: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++)
    for (const [a, b, c] of [[pts[0], pts[i], pts[i + 1]], [pts[0], pts[i + 1], pts[i]]]) v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return part(g, color);
}

/**
 * A shaped wheelhouse (the Shipyard's, owner; its layout's `shape`): in profile, the front
 * below the windows leans forward from `lowerFromY` up to the window band; the front windows
 * rake either way (`frontRakeDeg`) from there; above them a header up to the roof: one flat
 * slab (owner) reaching forward of the windows' head as a visor, its front and side faces
 * chamfered back as they rise (`roofEdgeDeg`; owner: the visor look of a tug's roof).
 * The side walls follow that profile at their front ends, so their windows are trapezoids.
 * A side door (`sideDoor`, in the port wall) is an opening from the floor up through the
 * window band, with jambs, a header up to the band's top and a threshold.
 * The side and aft windows start lower (windowSill) than the front's (frontSill, the dash
 * top); between them at each front corner a black post. No roof rail or ladder: the roof
 * isn't walked.
 * Frames, the wood lining, the floor and the console are the box house's (buildWheelhouse).
 * Windows raked out all round (`shape.flare`, houseFlare.ts): the walls and the roof as built
 * are deformed so the sides lean out and the aft wall aft above the sill; the aft doorway's
 * lintel is left upright (its door hinged, swinging out), closed off to the leaning walls by
 * plates beside it. (A side door slides along an upright wall: not offered with it.)
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
  // A lower saloon roof (P2b) aft of its step (`zStep`): the saloon's windows' head as far under
  // its roof as the wheelhouse's are under hers; its walls and aft wall up to its roof.
  const sr = wh.saloonRoof;
  const zStep = sr ? sr.z : zA;
  const headS = sr ? sr.y - (roofY - head) : head;
  const roofS = sr ? sr.y : roofY;
  // The lower front leans from L0 (no lower than the walls' foot) up to the sill.
  const L0 = Math.max(base, Math.min(sh.lowerFromY, S));
  const lean = leanForward(sh.lowerRakeDeg, L0);
  const tanL = Math.tan((sh.lowerRakeDeg * Math.PI) / 180);
  const zLow = (y: number) => zF - Math.max(0, y - L0) * tanL;
  // The windows' foot and head, in z.
  const zS = zF - rake.ahead;
  const zH = zS - (head - S) * rake.tan;
  const wallsFrom = parts.length;
  // What stays upright when the windows are raked out all round: the doors.
  const upright = new Set<THREE.BufferGeometry>();
  const keep = (...gs: THREE.BufferGeometry[]) => {
    for (const g of gs) upright.add(g);
    return gs;
  };

  // Front: below the windows (upright up to L0, leaning above it), the mullions between the
  // panes (two, or more on a wide house: frontMullions), and the header above them up to the roof. A faceted front is built in three
  // across (split at the mullions) and its outer two set back below (facetDz).
  const fc = sh.facet?.centre;
  const spans: [number, number][] = fc ? [[-hw, -fc], [-fc, fc], [fc, hw]] : [[-hw, hw]];
  for (const [a, b] of spans) {
    if (L0 > base + 0.01) parts.push(box(a, b, base, L0, zF, zF + w, H));
    parts.push(...framed(a, b, L0, S, zF, zF + w, 'top').map((g) => g.applyMatrix4(lean)));
    parts.push(...framed(a, b, head, roofY + 0.02, zH, zH + w, 'bottom'));
  }
  for (const x of frontMullions(wh)) parts.push(raked(fbox(x - 0.04, x + 0.04, S, head, zF, zF + w)));

  // Side walls: below the band, following the front's lower lean; the band's posts (the
  // front one raked with the windows) and a mullion; above it, up to the raked roof.
  // The side windows' front post (raked with the front, set back with a faceted corner): its aft
  // face's z at height y. The band's mullion stands upright midway between it and the aft wall.
  const fd = facetDepth(wh);
  const frontPostAft = (y: number) => zF + fd - rake.ahead - rake.tan * (y - S) + 0.1;
  const bandMid = ((frontPostAft(sideS) + frontPostAft(head)) / 2 + zA) / 2;
  // Upright (owner): only the front post takes the rake. A front raked aft can lean back over it:
  // then it stops where the post meets it (cut short).
  const mullionTop = rake.tan < 0 && frontPostAft(head) > bandMid - 0.04 ? S + (zF + fd - rake.ahead + 0.1 - (bandMid - 0.04)) / rake.tan : head;
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
      parts.push(...keep(fbox(x0, x1, base, doorTop, door.z0 - jamb, door.z0), fbox(x0, x1, base, doorTop, door.z1, door.z1 + jamb))); // the jambs
      if (head - doorTop > 0.01) parts.push(...keep(box(x0, x1, doorTop, head, door.z0, door.z1, H))); // the header, up to the band's top
      parts.push(...keep(box(x0, x1, base, wh.floorY + 0.02, door.z0, door.z1, col.floor))); // the threshold
    }
    // The front corner post: from the side windows' sill up to the front's, following the lean.
    // Proud of the walls all round, the front too: its face in the front wall's plane flickered (owner).
    if (S > sideS + 0.01) {
      const e = FRAME_PROUD;
      parts.push(prism(x0 - e, x1 + e, [[zLow(top) - e, top - e], [zLow(S) - e, S + e], [zLow(S) + 0.1, S + e], [zLow(top) + 0.1, top - e]], col.frame));
    }
    parts.push(raked(fbox(x0, x1, S, head, zF, zF + 0.1)));
    parts.push(fbox(x0, x1, sideS, headS, zA - 0.1, zA));
    // The band's mullion (not in a doorway): upright, cut short under a front raked back over it
    // (and under a lower saloon roof's head aft of the step).
    if ((!door || bandMid < door.z0 - 0.15 || bandMid > door.z1 + 0.15) && mullionTop > sideS + 0.1) parts.push(fbox(x0, x1, sideS, Math.min(bandMid > zStep ? headS : head, mullionTop), bandMid - 0.04, bandMid + 0.04));
    parts.push(fbox(x0, x1, head, head + FW, zH, zStep));
    // Wall above the band, if the glass stops short of the roof (the Shipyard's runs up to it).
    if (roofY + 0.02 - (head + FW) > 0.01) parts.push(box(x0, x1, head + FW, roofY + 0.02, zH, zStep, H));
    if (sr) {
      // The saloon's band under its lower roof: a post where the wheelhouse's ends at the step,
      // its head frame, and any wall above it up to its roof.
      parts.push(fbox(x0, x1, sideS, head, zStep - 0.08, zStep));
      parts.push(fbox(x0, x1, headS, headS + FW, zStep, zA));
      if (roofS + 0.02 - (headS + FW) > 0.01) parts.push(box(x0, x1, headS + FW, roofS + 0.02, zStep, zA, H));
    }
  }

  // Aft wall: panels either side of the doorway, the band open, and a lintel up to the roof.
  const door = wh.doorWidth / 2;
  const roofAft = roofS + 0.02;
  for (const s of [-1, 1]) {
    const [p0, p1] = s > 0 ? [door, hw] : [-hw, -door];
    parts.push(box(p0, p1, base, sideS - FW, zA - w, zA, H), fbox(p0, p1, sideS - FW, sideS, zA - w, zA));
    parts.push(fbox(p0, p1, headS, headS + FW, zA - w, zA));
    if (roofAft - (headS + FW) > 0.01) parts.push(box(p0, p1, headS + FW, roofAft, zA - w, zA, H));
    const jx = s > 0 ? door : -door - JAMB;
    parts.push(fbox(jx, jx + JAMB, sideS, headS, zA - w, zA));
  }
  // The step in the roofline: the wheelhouse's aft wall above the saloon's roof, across her.
  if (sr) parts.push(box(-hw, hw, roofS, roofY + 0.02, zStep - w, zStep, H));
  // (The doorway from the floor at the door: a saloon's, if it's a step or two down.)
  const doorFloor = houseFloorAt(wh, zA);
  parts.push(...keep(box(-door, door, doorFloor + wh.doorHeight, roofAft, zA - w, zA, H)));
  // A faceted front: everything at the front (forward of a little aft of the front wall, the
  // raked glass's frames and the header included) set back by facetDz at its x, so the outer
  // panes and the side walls' front ends meet on the angle. Glass raked aft has its head aft of
  // the wall (zH): the zone reaches past that too, or the tops of its posts were left behind
  // and crossed the bottoms (owner).
  if (sh.facet) setBack(parts.slice(wallsFrom), facetDz(wh), Math.max(zF, zH) + w + 0.13);
  // The walls' inside faces: the lining (pixel painting, owner; the interior finish's).
  const centre = new THREE.Vector3(0, 0, mid);
  for (const g of parts.slice(wallsFrom)) lineInside(g, H, col.lining, col.liningTile, centre);
  // Raked out all round: the walls (not the aft doorway's lintel) lean out, and plates beside
  // the doorway close them off to it, from the sill up to the roof.
  const fl = houseFlare(wh);
  if (fl) {
    applyFlare(parts.slice(wallsFrom).filter((g) => !upright.has(g)), fl);
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const F = (x: number, y: number, z: number) => V(...fl.at(x, y, z));
    for (const x of [-door, door]) parts.push(plate([V(x, sideS, zA), F(x, headS, zA), F(x, roofAft, zA), V(x, roofAft, zA)], H));
    // (No side door: it slides, so it needs an upright wall; the Shipyard leaves it off.)
  }
  // Door sill, floor, console.
  parts.push(box(-door, door, base, doorFloor + 0.02, zA - w, zA, col.floor));
  buildFloor(layout, col, parts);
  buildConsole(wh, col, parts);

  // Roof: one flat slab from the visor's edge to aft of the house. Its front and sides are
  // chamfered back as they rise (owner: never square, always back; the visor look): the
  // underside reaches furthest out, the top is set in by roofEdgeDeg; the aft face square.
  // The ceiling under it.
  const rf = layout.roof;
  const ov = rf.overhang;
  const t = rf.thickness;
  const zV = zH - sh.visor;
  const back = t * Math.tan((sh.roofEdgeDeg * Math.PI) / 180);
  // A faceted front's roof follows it (owner): square across the middle, cut back on the angle outside.
  const roofFrom = parts.length;
  // With a lower saloon roof the wheelhouse's ends `ov` aft of the step, over the saloon's
  // (which starts inside the step's wall, its front hidden); each has its ceiling.
  const zRoofEnd = sr ? zStep + ov : zA + ov;
  parts.push(chamferedSlab(hw + ov, zV, zRoofEnd, roofY, t, back, col.roof, sh.facet?.centre ?? 0, facetDz(wh)));
  if (sr) parts.push(chamferedSlab(hw + ov, zStep - w, zA + ov, roofS, t, back, col.roof));
  // The eyebrow (owner): a panel on each roof's top set in from its edges in a second colour.
  if (col.roofTop !== undefined) {
    const k = CONFIG.shipyard.saloon.roofInset;
    const wi = hw + ov - back - k;
    const dz = facetDz(wh);
    const c = Math.min(sh.facet?.centre ?? 0, wi);
    const front = (x: number): [number, number] => [x, zV + back + k + dz(x)];
    const across = c > 0 ? [front(-wi), front(-c), front(c), front(wi)] : [front(-wi), front(wi)];
    parts.push(planSlab([...across, [wi, zRoofEnd - k], [-wi, zRoofEnd - k]], roofY + t, roofY + t + 0.02, col.roofTop));
    if (sr) parts.push(planSlab([[-wi, zRoofEnd + k], [wi, zRoofEnd + k], [wi, zA + ov - k], [-wi, zA + ov - k]], roofS + t, roofS + t + 0.02, col.roofTop));
  }
  const ceilFrom = parts.length;
  for (const [a, b] of spans) parts.push(box(Math.max(a, -hw + w), Math.min(b, hw - w), roofY - 0.012, roofY, Math.max(zF, zH) + w, zStep - w, col.ceiling, col.ceilingTile));
  // (Only its front: its aft end, at the step to a lower saloon roof or the aft wall, stays put.)
  if (sh.facet) setBack(parts.slice(ceilFrom), facetDz(wh), zStep - w - 0.01);
  if (sr) parts.push(box(-hw + w, hw - w, roofS - 0.012, roofS, zStep, zA - w, col.ceiling, col.ceilingTile));
  // Raked out all round: the roof and the ceiling go out with the walls' tops.
  if (fl) applyFlare(parts.slice(roofFrom), fl);
  // A cockpit overhead (P2b): the aft roof carried on aft over the working deck (its edges
  // chamfered as the roof's, its top panel in the roof top's colour too), on a wing each side
  // in the house's colour: full height from the house to the knee on the deck, then a hollow
  // curve sweeping up to the roof's aft edge.
  const oh = layout.overhead;
  if (oh) {
    parts.push(chamferedSlab(oh.halfWidth, oh.z0 - w, oh.z1, oh.y, oh.thickness, back, col.roof));
    if (col.roofTop !== undefined) {
      const k = CONFIG.shipyard.saloon.roofInset;
      const wi = oh.halfWidth - back - k;
      parts.push(planSlab([[-wi, oh.z0 + k], [wi, oh.z0 + k], [wi, oh.z1 - k], [-wi, oh.z1 - k]], oh.y + oh.thickness, oh.y + oh.thickness + 0.02, col.roofTop));
    }
    const n = 10;
    const sweep: [number, number][] = Array.from({ length: n + 1 }, (_, i) => {
      const z = oh.kneeZ + ((oh.z1 - oh.kneeZ) * i) / n;
      return [z, i === n ? oh.y : wingCurveY(oh, z)];
    });
    const outline: [number, number][] = [[oh.z0, oh.deckY - 0.05], [oh.kneeZ, oh.deckY - 0.05], ...sweep.slice(1), [oh.z0, oh.y]];
    for (const sgn of [-1, 1]) parts.push(prism(sgn > 0 ? oh.halfWidth - oh.wing : -oh.halfWidth, sgn > 0 ? oh.halfWidth : -oh.halfWidth + oh.wing, outline, H));
  }
  return parts;
}

/** A slab from `y0` up to `y1` whose plan is the convex polygon `pts` ([x, z], going round to starboard first from forward). */
function planSlab(pts: [number, number][], y0: number, y1: number, color: number): THREE.BufferGeometry {
  const v: number[] = [];
  const n = pts.length;
  // A fan from the first corner: the top facing up, the bottom down; then the sides.
  for (let i = 1; i + 1 < n; i++) {
    const [a, b, c] = [pts[0], pts[i], pts[i + 1]];
    v.push(a[0], y1, a[1], c[0], y1, c[1], b[0], y1, b[1]);
    v.push(a[0], y0, a[1], b[0], y0, b[1], c[0], y0, c[1]);
  }
  for (let i = 0; i < n; i++) {
    const [a, b] = [pts[i], pts[(i + 1) % n]];
    v.push(a[0], y0, a[1], a[0], y1, a[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], b[0], y0, b[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return part(g, color);
}

/**
 * A slab `t` thick from `y0` up, `halfW` either side of the centreline from `z0` (forward)
 * to `z1`, its front and sides chamfered: the top set in by `back` (the aft face square).
 * Faceted (`dz`, hullMesh facetDz; owner: the roof follows the three-facet windows): its
 * front in three across, square between -`centre` and `centre`, set back by `dz` outside.
 */
function chamferedSlab(halfW: number, z0: number, z1: number, y0: number, t: number, back: number, color: number, centre = 0, dz: (x: number) => number = () => 0): THREE.BufferGeometry {
  const y1 = y0 + t;
  const wt = halfW - back;
  const c = Math.min(centre, wt);
  // The front edge, port to starboard, underneath and on top; then the aft corners.
  const B = [-halfW, -c, c, halfW].map((x) => [x, y0, z0 + dz(x)]);
  const T = [-wt, -c, c, wt].map((x) => [x, y1, z0 + back + dz(x)]);
  const [Bsa, Bpa, Tsa, Tpa] = [[halfW, y0, z1], [-halfW, y0, z1], [wt, y1, z1], [-wt, y1, z1]];
  const v: number[] = [];
  // Each face's corners clockwise as seen from outside it (as buildDeckhouse's).
  const quad = (a: number[], b: number[], c: number[], d: number[]) => v.push(...a, ...c, ...b, ...a, ...d, ...c);
  const fan = (pts: number[][]) => {
    for (let i = 1; i + 1 < pts.length; i++) v.push(...pts[0], ...pts[i + 1], ...pts[i]);
  };
  fan([...T, Tsa, Tpa]); // top
  fan([B[0], Bpa, Bsa, B[3], B[2], B[1]]); // underside
  for (let i = 0; i < 3; i++) quad(B[i], B[i + 1], T[i + 1], T[i]); // the front chamfer, in three
  quad(Bsa, Tsa, T[3], B[3]); // starboard
  quad(B[0], T[0], Tpa, Bpa); // port
  quad(Bsa, Bpa, Tpa, Tsa); // aft
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return part(g, color);
}

/**
 * A deckhouse (vessel/deckhouse.ts): lofted along her from front to aft through its plan's
 * half widths, from its foot (`baseAt` z: just below the deck there) up to its top; through
 * the front's rake (the first stretch aft of its foot) the top comes down to the deck, so
 * the front is one sloping face that follows her sides. One geometry: its sides, top, front
 * and aft faces.
 */
function buildDeckhouse(dh: DeckhouseLayout, baseAt: (z: number) => number, color: number, holes: readonly { x0: number; x1: number; z0: number; z1: number }[] = []): THREE.BufferGeometry {
  const foot = baseAt(dh.z0);
  const shift = (dh.top - foot) * Math.tan((dh.rakeDeg * Math.PI) / 180);
  // Sections every 0.25 m, and where the rake ends.
  const zs = new Set<number>([dh.z0, dh.z1, ...dh.plan.map(([z]) => z)]);
  for (let z = dh.z0; z < dh.z1; z += 0.25) zs.add(z);
  if (shift > 0 && dh.z0 + shift < dh.z1) zs.add(dh.z0 + shift);
  // A wheelhouse sunk into it: no top over the cabin, nor aft face across its door (see deckhouse.ts).
  const well = dh.well;
  if (well) zs.add(well.z0);
  for (const h of holes) zs.add(h.z0).add(h.z1);
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
    if (well && p.z >= well.z0 - 1e-6) {
      // Beside the well only.
      const ww = well.halfWidth;
      if (p.w > ww) {
        quad([ww, p.y, p.z], [p.w, p.y, p.z], [q.w, q.y, q.z], [ww, q.y, q.z]);
        quad([-p.w, p.y, p.z], [-ww, p.y, p.z], [-ww, q.y, q.z], [-q.w, q.y, q.z]);
      }
    } else {
      // The top (and the raked front), less any opening through it here (a companionway: across, either side of it).
      const hole = holes.find((h) => p.z >= h.z0 - 1e-6 && q.z <= h.z1 + 1e-6);
      if (!hole) quad([-p.w, p.y, p.z], [p.w, p.y, p.z], [q.w, q.y, q.z], [-q.w, q.y, q.z]);
      else {
        if (hole.x0 > -p.w) quad([-p.w, p.y, p.z], [hole.x0, p.y, p.z], [hole.x0, q.y, q.z], [-q.w, q.y, q.z]);
        if (hole.x1 < p.w) quad([hole.x1, p.y, p.z], [p.w, p.y, p.z], [q.w, q.y, q.z], [hole.x1, q.y, q.z]);
      }
    }
  }
  const f = sec[0];
  const a = sec[sec.length - 1];
  quad([-f.w, f.b, f.z], [f.w, f.b, f.z], [f.w, f.y, f.z], [-f.w, f.y, f.z]); // the front's foot
  if (!well) quad([a.w, a.b, a.z], [-a.w, a.b, a.z], [-a.w, a.y, a.z], [a.w, a.y, a.z]); // the aft face
  else if (a.w > well.halfWidth) {
    // Either side of the wheelhouse's aft wall.
    const ww = well.halfWidth;
    quad([a.w, a.b, a.z], [ww, a.b, a.z], [ww, a.y, a.z], [a.w, a.y, a.z]);
    quad([-ww, a.b, a.z], [-a.w, a.b, a.z], [-a.w, a.y, a.z], [-ww, a.y, a.z]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return part(g, color);
}

/**
 * A walked deckhouse top's rail and ladder (vessel/deckhouse.ts DeckhouseWalk): a top rail and
 * a mid rail on posts (evenly spaced, `postSpacing` apart at most), just in from its edge, along both sides from the flat top's front aft,
 * across its front, and across the aft ends of the strips beside the wheelhouse (`hw` its half
 * width); open at the ladder head. The ladder: two stiles carried up past the top as grab
 * handles, rungs 0.3 m apart; up the aft face beside the house, or up the front (leaning with
 * a raked front). All bars, merged with the hull.
 */
function deckhouseRail(dh: DeckhouseLayout, hw: number, deckY: (z: number) => number, color: number, deckColor: number): THREE.BufferGeometry[] {
  const w = dh.walk!;
  const parts: THREE.BufferGeometry[] = [];
  const top = dh.top;
  const h = w.railHeight;
  const inset = 0.05;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const half = (z: number) => deckhouseHalfWidth(dh, z) - inset;
  // A rail along a line of points in plan (x, z): its top and mid rails through every point
  // (so it follows the deckhouse's sides), its posts evenly spaced along it, ends included, no
  // more than `postSpacing` apart (owner: the outline's points are only 0.25 m apart).
  const railAlong = (pts: [number, number][]) => {
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      for (const k of [1, 0.5]) parts.push(bar(V(a[0], top + h * k, a[1]), V(b[0], top + h * k, b[1]), k === 1 ? 0.045 : 0.035, k === 1 ? 0.045 : 0.035, color));
    }
    const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    const total = seg.reduce((a, l) => a + l, 0);
    const n = Math.max(1, Math.ceil(total / w.postSpacing - 1e-6));
    for (let k = 0; k <= n; k++) {
      // The point k/n of the way along the line.
      let d = (total * k) / n;
      let i = 0;
      while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
      const t = seg[i] > 0 ? Math.min(1, d / seg[i]) : 0;
      const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
      const z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
      parts.push(bar(V(x, top, z), V(x, top + h, z), 0.04, 0.04, color));
    }
  };
  const lad = w.ladder;
  const gap = (x0: number, x1: number, z: number, open: boolean) => {
    // A run across at z from x0 to x1, open over the ladder's width.
    if (open && lad.x - lad.width / 2 > x0 && lad.x + lad.width / 2 < x1) {
      railAlong([[x0, z], [lad.x - lad.width / 2, z]]);
      railAlong([[lad.x + lad.width / 2, z], [x1, z]]);
    } else railAlong([[x0, z], [x1, z]]);
  };
  // Along each side: through its plan's points from the flat top aft.
  const zs = [w.z0, ...dh.plan.map(([z]) => z).filter((z) => z > w.z0 + 0.05 && z < dh.z1 - 0.05), dh.z1 - inset];
  // (Out to her sides: none; her bulwarks are risen along it.)
  if (!dh.full) for (const sg of [-1, 1]) railAlong(zs.map((z): [number, number] => [sg * half(z), z]));
  // Across the front.
  const zf = w.z0 + inset;
  gap(-half(w.z0), half(w.z0), zf, lad.face === 'front');
  // Across the aft ends of the strips beside the house (or, run on aft of it, right across).
  const za = dh.z1 - inset;
  const ha = half(dh.z1);
  if (dh.houseAft !== undefined) gap(-ha, ha, za, lad.face !== 'front');
  else if (ha - hw > 0.2) {
    gap(-ha, -hw - 0.02, za, lad.face === 'aft' && lad.x < 0);
    gap(hw + 0.02, ha, za, lad.face === 'aft' && lad.x > 0);
  }
  // A stair across its aft face (DeckhouseWalk.stair): each tread a thin steel plate at its
  // height, nothing under it (owner, Oct 2026: "just the steps themselves as if they were metal
  // plates"), in the deck's colour, non-slip, against the face; railed along its open (aft) side from its foot up to the
  // landing, and round the landing's aft edge and port end. (The face is its other side.)
  if (w.stair) {
    const [landing, ...treads] = w.stair;
    const plate = 0.03;
    for (const t of treads) parts.push(box(t.x0, t.x1, t.y - plate, t.y, t.z0, t.z1, deckColor, 'nonSlip'));
    // (The landing: a plate too, from its edge out to the stair's width.)
    parts.push(box(landing.x0, landing.x1, top - plate, top, dh.z1 + 0.02, landing.z1, deckColor, 'nonSlip'));
    const zr = landing.z1 - 0.03;
    const low = treads.length ? treads[treads.length - 1] : landing;
    const xFoot = low.x1 - 0.03;
    const yFoot = deckY(zr);
    for (const k of [1, 0.5]) {
      const th = k === 1 ? 0.045 : 0.035;
      // Down the stair, parallel to its pitch line; then the landing's aft edge and port end.
      parts.push(bar(V(landing.x1, top + h * k, zr), V(xFoot, yFoot + h * k, zr), th, th, color));
      parts.push(bar(V(landing.x0 + 0.03, top + h * k, zr), V(landing.x1, top + h * k, zr), th, th, color));
      parts.push(bar(V(landing.x0 + 0.03, top + h * k, dh.z1 + 0.02), V(landing.x0 + 0.03, top + h * k, zr), th, th, color));
    }
    for (const [x, y] of [[xFoot, yFoot], [landing.x1, top], [landing.x0 + 0.03, top]]) parts.push(bar(V(x, y, zr), V(x, y + h, zr), 0.04, 0.04, color));
    return parts;
  }
  // The ladder.
  const sx = lad.width / 2 - 0.04;
  const [zFoot, zHead] = lad.face === 'aft' ? [dh.z1 + 0.12, dh.z1 + 0.12] : [dh.z0 - 0.12, w.z0 - 0.12];
  const yFoot = deckY(zFoot);
  const zAt = (y: number) => zFoot + ((y - yFoot) / (top - yFoot)) * (zHead - zFoot);
  for (const sg of [-1, 1]) {
    parts.push(bar(V(lad.x + sg * sx, yFoot, zFoot), V(lad.x + sg * sx, top, zHead), 0.045, 0.045, color));
    parts.push(bar(V(lad.x + sg * sx, top, zHead), V(lad.x + sg * sx, top + 1.0, zHead), 0.045, 0.045, color));
  }
  for (let y = yFoot + 0.3; y < top - 0.05; y += 0.3) parts.push(bar(V(lad.x - sx, y, zAt(y)), V(lad.x + sx, y, zAt(y)), 0.035, 0.035, color));
  return parts;
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
  // (A hatch in the deck instead, at its own height `y`, is the hull's: buildVesselMeshParts.)
  // The hatch is in her axes, the house drawn in its own frame (houseX): taken across into it.
  const her = layout.engineHatch?.y === undefined ? layout.engineHatch : undefined;
  const hx = houseX(wh);
  const eh = her && hx ? { ...her, x0: her.x0 - hx, x1: her.x1 - hx, ...(her.space ? { space: { x0: her.space.x0 - hx, x1: her.space.x1 - hx } } : {}) } : her;
  const fx0 = -hw + w;
  const fx1 = hw - w;
  // A faceted front (facetDz): the floor from aft of its corners, and forward of that a
  // piece out to the angled walls.
  const fd = facetDepth(wh);
  const fz0 = wh.front + w + fd;
  // A floor at more than one height (levels: a saloon a step or two down, its treads): the
  // helm's floor forward of them, each level a block from the lowest floor up, and the riser
  // where the helm's floor ends (the engine hatch is in the helm's, if in the house).
  const levels = wh.levels ?? [];
  const lowest = houseFloorLow(wh) - 0.1;
  const fz1 = levels.length ? Math.min(...levels.map((lv) => lv.z0)) : wh.aft - w;
  for (const lv of levels) parts.push(box(fx0, fx1, lowest, lv.y, Math.max(lv.z0, fz0), Math.min(lv.z1, wh.aft - w), col.floor, col.floorTile));
  if (levels.length && wh.floorY - 0.1 > lowest + 0.005) parts.push(box(fx0, fx1, lowest, wh.floorY - 0.1, fz1 - 0.05, fz1, col.floor));
  const fy0 = wh.floorY - 0.1;
  if (fd) {
    const c = wh.shape!.facet!.centre;
    const z0 = wh.front + w;
    const zc = z0 + facetDz(wh)(fx1);
    parts.push(planSlab([[-c, z0], [c, z0], [fx1, zc], [fx1, fz0], [fx0, fz0], [fx0, zc]], fy0, wh.floorY, col.floor));
  }
  if (eh) {
    parts.push(box(fx0, eh.x0, fy0, wh.floorY, fz0, fz1, col.floor, col.floorTile));
    parts.push(box(eh.x1, fx1, fy0, wh.floorY, fz0, fz1, col.floor, col.floorTile));
    parts.push(box(eh.x0, eh.x1, fy0, wh.floorY, fz0, eh.z0, col.floor, col.floorTile));
    parts.push(box(eh.x0, eh.x1, fy0, wh.floorY, eh.z1, fz1, col.floor, col.floorTile));
    parts.push(...engineSpaceParts(eh, wh.floorY, fy0));
  } else parts.push(...boxWithHoles(fx0, fx1, fy0, wh.floorY, fz0, fz1, wh.floorHoles ?? [], col.floor, col.floorTile));
}

/**
 * A box (a floor) with rectangular openings through it (a companionway: wheelhouse.floorHoles):
 * in strips along z between the openings' ends, each strip in pieces across between them.
 */
function boxWithHoles(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, holes: readonly { x0: number; x1: number; z0: number; z1: number }[], color: number, paint?: PaintName): THREE.BufferGeometry[] {
  if (!holes.length) return [box(x0, x1, y0, y1, z0, z1, color, paint)];
  const out: THREE.BufferGeometry[] = [];
  const zs = [...new Set([z0, z1, ...holes.flatMap((h) => [h.z0, h.z1])])].filter((z) => z >= z0 && z <= z1).sort((a, b) => a - b);
  for (let i = 1; i < zs.length; i++) {
    const [za, zb] = [zs[i - 1], zs[i]];
    if (zb - za < 1e-4) continue;
    const across = holes.filter((h) => h.z0 < (za + zb) / 2 && h.z1 > (za + zb) / 2).sort((a, b) => a.x0 - b.x0);
    let x = x0;
    for (const h of across) {
      if (h.x0 - x > 1e-4) out.push(box(x, Math.min(h.x0, x1), y0, y1, za, zb, color, paint));
      x = Math.max(x, h.x1);
    }
    if (x1 - x > 1e-4) out.push(box(x, x1, y0, y1, za, zb, color, paint));
  }
  return out;
}

/**
 * A cabin below (vessel/vesselDef.ts CabinBelow, P2c): its lining, facing in (the hull and the
 * deckhouse are drawn to be seen from outside: from in here they'd be see-through), up each
 * side and across each end, and under the trunk's top (aft of the wheelhouse front, the
 * wheelhouse floor's own underside is its ceiling); its sole; the V-berth and its cushion;
 * the companionway's steps, a solid block up to each tread. All merged with the hull.
 */
function cabinParts(c: CabinBelow): THREE.BufferGeometry[] {
  const cc = CONFIG.shipyard.deckhouse.cabin;
  const parts: THREE.BufferGeometry[] = [];
  const v: number[] = [];
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // A quad facing toward `inner` (whichever way round its corners come).
  const face = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, e: THREE.Vector3, inner: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const [p, q, r, t] = n.dot(new THREE.Vector3().subVectors(inner, a)) >= 0 ? [a, b, d, e] : [a, e, d, b];
    for (const k of [p, q, r, p, r, t]) v.push(k.x, k.y, k.z);
  };
  const ceilAt = (z: number) => (z < c.ceiling.front ? c.ceiling.trunk : c.ceiling.house);
  const plan = c.plan;
  for (let i = 1; i < plan.length; i++) {
    const [za, wa] = plan[i - 1];
    const [zb, wb] = plan[i];
    const top = ceilAt((za + zb) / 2);
    const mid = P(0, (c.sole + top) / 2, (za + zb) / 2);
    for (const sg of [-1, 1]) face(P(sg * wa, c.sole, za), P(sg * wb, c.sole, zb), P(sg * wb, top, zb), P(sg * wa, top, za), mid);
    if ((za + zb) / 2 < c.ceiling.front) face(P(-wa, top, za), P(wa, top, za), P(wb, top, zb), P(-wb, top, zb), mid);
    parts.push(planSlab([[-wa, za], [wa, za], [wb, zb], [-wb, zb]], c.sole - 0.05, c.sole, COLORS.floor));
  }
  // The bulkheads at each end, and the step in its ceiling under the wheelhouse front.
  const [f, a] = [plan[0], plan[plan.length - 1]];
  face(P(-f[1], c.sole, f[0]), P(f[1], c.sole, f[0]), P(f[1], ceilAt(f[0]), f[0]), P(-f[1], ceilAt(f[0]), f[0]), P(0, c.sole + 1, f[0] + 1));
  face(P(-a[1], c.sole, a[0]), P(a[1], c.sole, a[0]), P(a[1], ceilAt(a[0]), a[0]), P(-a[1], ceilAt(a[0]), a[0]), P(0, c.sole + 1, a[0] - 1));
  const { trunk, house, front } = c.ceiling;
  if (Math.abs(trunk - house) > 0.01 && front > c.z0 && front < c.z1) {
    const w = planHalfWidth(plan, front);
    const [lo, hi] = [Math.min(trunk, house), Math.max(trunk, house)];
    face(P(-w, lo, front), P(w, lo, front), P(w, hi, front), P(-w, hi, front), P(0, lo, front + (house > trunk ? 1 : -1)));
  }
  const lining = new THREE.BufferGeometry();
  lining.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  lining.computeVertexNormals();
  parts.push(part(lining, cc.lining));
  // The V-berth: following her sides forward, its front (aft edge) in trim, a cushion on top.
  const b = c.berth;
  if (b) {
    const zs = plan.map(([z]) => z).filter((z) => z < b.z1);
    const outline = (inset: number): [number, number][] => [...zs.map((z): [number, number] => [-(planHalfWidth(plan, z) - inset), z]), [-(planHalfWidth(plan, b.z1) - inset), b.z1]];
    const ring = (inset: number): [number, number][] => {
      const port = outline(inset);
      return [port[0], [-port[0][0], port[0][1]], ...port.slice(1).map(([x, z]): [number, number] => [-x, z]), ...port.slice(1).reverse()];
    };
    parts.push(planSlab(ring(0), c.sole, b.top - cc.berth.top * 0.25, cc.trim));
    parts.push(planSlab(ring(0.04), b.top - cc.berth.top * 0.25, b.top, cc.cushion));
  }
  // The companionway's steps.
  for (const t of c.stair.treads) parts.push(box(c.stair.x0, c.stair.x1, c.sole, t.y, t.z0, t.z1, cc.trim));
  return parts;
}

/**
 * The engine space under its hatch (in the cabin floor, or the deck): four walls up to
 * `wallTop` and a floor `pitDepth` under the hatch's `top`, painted light grey (an engine
 * room's white-ish paint), and a steel coaming flush with the top across its ends (and
 * along its sides, `allRound`: in the deck, which has no floor boards to meet it there).
 */
function engineSpaceParts(eh: NonNullable<LayoutConfig['engineHatch']>, top: number, wallTop: number, allRound = false): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const pit = top - eh.pitDepth;
  const t = 0.03;
  // (Across both engines of a twin, wider than the opening: `space`.)
  const x0 = eh.space?.x0 ?? eh.x0;
  const x1 = eh.space?.x1 ?? eh.x1;
  parts.push(box(x0 - t, x1 + t, pit - t, pit, eh.z0 - t, eh.z1 + t, 0x5a6066));
  parts.push(box(x0 - t, x0, pit, wallTop, eh.z0, eh.z1, 0xb8bcb8));
  parts.push(box(x1, x1 + t, pit, wallTop, eh.z0, eh.z1, 0xb8bcb8));
  parts.push(box(x0 - t, x1 + t, pit, wallTop, eh.z0 - t, eh.z0, 0xb8bcb8));
  parts.push(box(x0 - t, x1 + t, pit, wallTop, eh.z1, eh.z1 + t, 0xb8bcb8));
  parts.push(box(eh.x0 - 0.03, eh.x1 + 0.03, top - 0.004, top + 0.004, eh.z0 - 0.03, eh.z0, 0x8a9096));
  parts.push(box(eh.x0 - 0.03, eh.x1 + 0.03, top - 0.004, top + 0.004, eh.z1, eh.z1 + 0.03, 0x8a9096));
  if (allRound) for (const [x0, x1] of [[eh.x0 - 0.03, eh.x0], [eh.x1, eh.x1 + 0.03]]) parts.push(box(x0, x1, top - 0.004, top + 0.004, eh.z0, eh.z1, 0x8a9096));
  return parts;
}

/** Helm console across the front: body, sloping top (approximated by a step), panel face. */
function buildConsole(wh: HouseLayout['wheelhouse'], col: Paint, parts: THREE.BufferGeometry[]): void {
  // A house with no console (a further house, P2a: consoleDepth 0).
  if (wh.consoleDepth <= 0) return;
  const hw = wh.halfWidth;
  const w = wh.wall;
  // (Set back from the wall if the house says so: clear of the front glass.)
  const c0 = wh.front + w + (wh.consoleBack ?? 0);
  const c1 = c0 + wh.consoleDepth;
  const cTop = wh.floorY + wh.consoleHeight;
  // A faceted front's console wraps round with it: built in three across, its wings set back.
  const f = wh.shape?.facet;
  // (Cut short across the cabin, to port, the middle or starboard: consoleSpan.)
  const x0 = wh.consoleSpan?.x0 ?? -hw + w;
  const x1 = wh.consoleSpan?.x1 ?? hw - w;
  const spans = (f ? ([[-hw + w, -f.centre], [-f.centre, f.centre], [f.centre, hw - w]] as [number, number][]) : [[-hw + w, hw - w] as [number, number]])
    .map(([a, b]): [number, number] => [Math.max(a, x0), Math.min(b, x1)])
    .filter(([a, b]) => b - a > 0.01);
  const from = parts.length;
  for (const [a, b] of spans) {
    parts.push(box(a, b, wh.floorY, cTop, c0, c1, col.console));
    parts.push(box(a, b, cTop, cTop + 0.12, c0, c0 + wh.consoleDepth * 0.45, col.console));
    parts.push(box(Math.max(a, x0 + 0.05), Math.min(b, x1 - 0.05), cTop - 0.01, cTop + 0.005, c0 + wh.consoleDepth * 0.45, c1 - 0.03, col.panel));
  }
  if (f) setBack(parts.slice(from), facetDz(wh));
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
  for (const x of frontMullions(wh)) parts.push(raked(fbox(x - 0.04, x + 0.04, fSill, head, wh.front, wh.front + w)));
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
  const doorFloor = houseFloorAt(wh, wh.aft);
  parts.push(box(-door, door, doorFloor + wh.doorHeight, roof, wh.aft - w, wh.aft, H));
  // The walls' inside faces: the lining (pixel painting, owner; the interior finish's).
  const centre = new THREE.Vector3(0, 0, (wh.front + wh.aft) / 2);
  for (const g of parts.slice(wallsFrom)) lineInside(g, H, col.lining, col.liningTile, centre);
  // The ceiling, just under the roof.
  parts.push(box(-hw + w, hw - w, roof - 0.012, roof, wh.front + w, wh.aft - w, col.ceiling, col.ceilingTile));
  // Door sill.
  parts.push(box(-door, door, base, doorFloor + 0.02, wh.aft - w, wh.aft, col.floor));

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


