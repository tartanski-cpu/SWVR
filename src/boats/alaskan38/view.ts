/**
 * The Alaskan 38's one-off geometry (owner, Oct 2026: a one-off hull and superstructure;
 * only the working parts are modules). What her hull mesh (vessel/view/hullMesh.ts, from
 * her stations and layout) doesn't give her, built here from her definition and merged
 * into one vertex-coloured mesh (one draw call):
 *
 *   stage 1  the outboard bracket off her transom with its swim platform and rails, the
 *            twin outboards (cowls, legs, propellers), the two spray rails along her
 *            topsides carried round the stem, and the bow rail;
 *   stage 2  the superstructure: the trunk cabin on the foredeck, the pilothouse and saloon
 *            (their walls, glass and the tan eyebrow roof round the game's house box, which
 *            stays what you walk in: layout.wheelhouse with `shell: 'oneOff'`), the roof
 *            carried aft over the cockpit on two posts with the radar and rod rack;
 *   stage 3  the interior.
 *
 * Drawing only: her physics is her stations and her modules'. The outboards are drawn here;
 * her thrust comes from a twin diesel-inboard module placed at them (boats/alaskan38.json)
 * until there's an outboard engine module.
 */
import * as THREE from 'three';
import { bar } from '../../mechanisms/line';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { CONFIG } from '../../config';
import { houseFloorAt, type VesselDef } from '../../vessel/vesselDef';
import { facetDepth, facetDz, frontRake, paintOf, setBack } from '../../vessel/view/hullMesh';

const ALU = 0x9aa0a6; // bare aluminium: bracket, platform frame
const GRATING = 0xb4b9be; // the platform's non-slip top
const BLACK = 0x1a1c1e; // rails, the outboards' legs
const COWL = 0xeeeeea; // the outboards' cowls
const DARK = 0x2f3438; // the outboards' lower units
const BRONZE = 0xc08a3e;

type V3 = [number, number, number];

function box(w: number, h: number, l: number, at: V3, colour: number): THREE.BufferGeometry {
  return part(new THREE.BoxGeometry(w, h, l).translate(at[0], at[1], at[2]), colour);
}
function drum(r: number, l: number, at: V3, colour: number, sides = 12): THREE.BufferGeometry {
  return part(new THREE.CylinderGeometry(r, r, l, sides).rotateX(Math.PI / 2).translate(at[0], at[1], at[2]), colour);
}
/** A box by its extents (either order). */
function span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, colour: number): THREE.BufferGeometry {
  return box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], colour);
}
/** A post or rail, round. */
function rod(a: V3, b: V3, r: number, colour: number): THREE.BufferGeometry {
  return bar(new THREE.Vector3(...a), new THREE.Vector3(...b), r, colour, 8);
}

/**
 * The deck edge at z (between her stations): half-beam and height. Past the stem, the stem's.
 */
function deckEdge(def: VesselDef): (z: number) => { x: number; y: number } {
  const st = def.hull.stations;
  return (z) => {
    let i = 0;
    while (i < st.length - 2 && st[i + 1].z > z) i++;
    const a = st[i];
    const d = st[i + 1];
    const t = Math.max(0, Math.min(1, (z - a.z) / (d.z - a.z || 1)));
    return { x: a.halfBeamDeck + (d.halfBeamDeck - a.halfBeamDeck) * t, y: a.polygon[0][1] + (d.polygon[0][1] - a.polygon[0][1]) * t };
  };
}

/**
 * A lofted box along z: at each section its half-width and its bottom and top heights; a
 * top, two sides and the two ends (the trunk cabin, which follows the deck edge and the
 * deck's rise forward).
 */
function loftBox(sections: { z: number; half: number; y0: number; y1: number }[], colour: number, inward = false): THREE.BufferGeometry {
  const v: number[] = [];
  // (Inward: the faces turned to look into the box, for a lining seen from inside.)
  const quad = (a: V3, b: V3, c: V3, d: V3) => (inward ? v.push(...a, ...c, ...b, ...a, ...d, ...c) : v.push(...a, ...b, ...c, ...a, ...c, ...d));
  for (let i = 1; i < sections.length; i++) {
    const p = sections[i - 1];
    const q = sections[i];
    // (Sections run forward, toward -z: the top's winding puts its face up.)
    quad([-p.half, p.y1, p.z], [-q.half, q.y1, q.z], [q.half, q.y1, q.z], [p.half, p.y1, p.z]);
    quad([p.half, p.y0, p.z], [q.half, q.y0, q.z], [q.half, q.y1, q.z], [p.half, p.y1, p.z]); // starboard side, facing +x
    quad([-p.half, p.y1, p.z], [-q.half, q.y1, q.z], [-q.half, q.y0, q.z], [-p.half, p.y0, p.z]); // port side, facing -x
  }
  const e = sections[sections.length - 1];
  quad([-e.half, e.y0, e.z], [-e.half, e.y1, e.z], [e.half, e.y1, e.z], [e.half, e.y0, e.z]); // the forward end, facing -z
  const f = sections[0];
  quad([f.half, f.y0, f.z], [f.half, f.y1, f.z], [-f.half, f.y1, f.z], [-f.half, f.y0, f.z]); // the aft end, facing +z
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return part(g, colour);
}

/**
 * Her one-off parts in her axes: one opaque mesh, and her glass as a second, tinted and
 * see-through (the game's other houses have open window frames; hers is tinted, as the
 * boat's is, dark from outside, a light tint from within: CONFIG.vessels.alaskan38.glass).
 */
export function buildAlaskan38Parts(def: VesselDef): THREE.Group {
  const c = CONFIG.vessels.alaskan38;
  const st = def.hull.stations;
  const transom = st[0].z;
  const parts: THREE.BufferGeometry[] = [];

  // ── The outboard bracket and swim platform ──
  // A buoyant box off the transom (as the hull's topsides: it's welded on), its top the swim
  // platform a couple of steps below the deck, a rail round it except where the outboards hang.
  const b = c.bracket;
  const deckAft = st[0].polygon[0][1];
  parts.push(box(2 * b.halfWidth - 0.1, b.top - b.bottom, b.length, [0, (b.top + b.bottom) / 2, transom + b.length / 2], 0x3a3f44));
  parts.push(box(2 * b.halfWidth, 0.05, b.length + 0.15, [0, b.top + 0.025, transom + (b.length + 0.15) / 2], GRATING));
  // A step down from the deck to the platform, through the transom gate (two treads).
  const gateX = b.gateX;
  for (const [k, y] of [0.33, 0.67].entries()) parts.push(box(0.6, 0.04, 0.3, [gateX, b.top + y * (deckAft - b.top), transom + 0.2 + k * 0.3], GRATING));
  // The rail: posts on the platform's edge, a top rail joining them; open across the stern
  // between the outboards and at the gate.
  const railTop = b.top + b.railHeight;
  const corner = (x: number, z: number) => [new THREE.Vector3(x, b.top, z), new THREE.Vector3(x, railTop, z)] as const;
  const zEnd = transom + b.length + 0.15;
  const posts: [number, number][] = [];
  for (const side of [-1, 1]) posts.push([side * (b.halfWidth - 0.05), transom + 0.1], [side * (b.halfWidth - 0.05), zEnd - 0.05], [side * (b.outboardX + 0.5), zEnd - 0.05]);
  for (const [x, z] of posts) {
    const [lo, hi] = corner(x, z);
    parts.push(bar(lo, hi, 0.018, BLACK, 8));
  }
  for (const side of [-1, 1]) {
    const x = side * (b.halfWidth - 0.05);
    parts.push(bar(new THREE.Vector3(x, railTop, transom + 0.1), new THREE.Vector3(x, railTop, zEnd - 0.05), 0.02, BLACK, 8));
    parts.push(bar(new THREE.Vector3(x, railTop, zEnd - 0.05), new THREE.Vector3(side * (b.outboardX + 0.5), railTop, zEnd - 0.05), 0.02, BLACK, 8));
  }

  // ── The outboards ──
  // Each hangs on a mounting plate at the bracket's aft face: a cowl (the engine) above the
  // platform, a slim leg down through it, the lower unit and its propeller under water.
  const o = c.outboards;
  for (const side of [-1, 1]) {
    const x = side * b.outboardX;
    const zPlate = transom + b.length;
    parts.push(box(o.cowlWidth + 0.2, 0.6, 0.06, [x, b.top + 0.3, zPlate + 0.03], ALU)); // mounting plate
    const zCowl = zPlate + 0.1 + o.cowlLength / 2;
    const yCowl = o.legTop + o.cowlHeight / 2;
    parts.push(box(o.cowlWidth, o.cowlHeight, o.cowlLength, [x, yCowl, zCowl], COWL));
    parts.push(box(o.cowlWidth + 0.02, 0.08, o.cowlLength - 0.1, [x, o.legTop + 0.04, zCowl], DARK)); // the pan under the cowl
    parts.push(box(o.cowlWidth * 0.55, o.cowlHeight * 0.35, 0.02, [x, yCowl + 0.05, zCowl + o.cowlLength / 2 + 0.01], DARK)); // the air intake panel at the back
    // The leg: from under the cowl down to the anti-ventilation plate, then the lower unit.
    const zLeg = zPlate + 0.1 + o.cowlLength * 0.45;
    parts.push(box(o.legWidth, o.legTop - o.plateY, 0.42, [x, (o.legTop + o.plateY) / 2, zLeg], DARK));
    parts.push(box(o.legWidth + 0.3, 0.025, 0.7, [x, o.plateY, zLeg + 0.05], DARK)); // anti-ventilation plate
    parts.push(box(o.legWidth * 0.8, o.plateY - o.gearY, 0.34, [x, (o.plateY + o.gearY) / 2, zLeg], DARK));
    parts.push(drum(0.1, 0.62, [x, o.gearY, zLeg + 0.06], DARK, 14)); // the torpedo
    parts.push(part(new THREE.ConeGeometry(0.1, 0.22, 14).rotateX(-Math.PI / 2).translate(x, o.gearY, zLeg - 0.36), DARK)); // its nose
    parts.push(box(0.03, 0.42, 0.26, [x, o.gearY - 0.1, zLeg - 0.08], DARK)); // the skeg
    // The propeller behind the torpedo.
    const zProp = zLeg + 0.42;
    parts.push(drum(0.045, 0.1, [x, o.gearY, zProp], BRONZE, 10));
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.BoxGeometry(0.07, o.propDiameter / 2 - 0.04, 0.012).translate(0, o.propDiameter / 4 + 0.02, 0);
      blade.rotateY(0.6).rotateZ((i * 2 * Math.PI) / 3).translate(x, o.gearY, zProp);
      parts.push(part(blade, BRONZE));
    }
  }

  // ── The spray rails ──
  // Two strakes along the topsides, each at a set share of the way from the chine up to the
  // deck edge, standing proud, carried from the transom round to the stem.
  for (const share of c.sprayRails.shares) {
    const run: THREE.Vector3[] = [];
    for (const s of st) {
      // The starboard chine and deck edge (the polygon runs port deck, port chine, keel, starboard chine, starboard deck); mirrored below.
      const chine = s.polygon[3];
      const deck = s.polygon[4];
      const x = chine[0] + share * (deck[0] - chine[0]);
      const y = chine[1] + share * (deck[1] - chine[1]);
      run.push(new THREE.Vector3(x, y, s.z));
    }
    for (const side of [1, -1]) {
      for (let i = 1; i < run.length; i++) {
        const a = run[i - 1].clone();
        const d = run[i].clone();
        a.x = side * (Math.abs(a.x) + c.sprayRails.proud);
        d.x = side * (Math.abs(d.x) + c.sprayRails.proud);
        if (Math.abs(d.x) < 0.1 && i === run.length - 1) d.x = 0; // meeting at the stem
        parts.push(bar(a, d, c.sprayRails.radius, c.sprayRails.colour, 6));
      }
    }
  }

  // ── The bow rail ──
  // From the house's forward end to the stem: posts on the deck edge each side, a rail
  // along their tops meeting at the stem, where it stands the highest.
  const r = c.bowRail;
  const plan = deckEdge(def);
  const stem = st[st.length - 1].z;
  const zs: number[] = [];
  for (let z = r.from; z > stem + 0.15; z -= r.spacing) zs.push(z);
  for (const side of [-1, 1]) {
    const tops: THREE.Vector3[] = [];
    for (const z of zs) {
      const e = plan(z);
      const foot = new THREE.Vector3(side * (e.x - 0.04), e.y + def.layout.bulwarkHeight, z);
      const top = foot.clone().setY(foot.y + r.height);
      parts.push(bar(foot, top, 0.016, BLACK, 8));
      tops.push(top);
    }
    const stemTop = new THREE.Vector3(0, plan(stem + 0.02).y + def.layout.bulwarkHeight + r.height + 0.05, stem + 0.1);
    tops.push(stemTop);
    for (let i = 1; i < tops.length; i++) parts.push(bar(tops[i - 1], tops[i], 0.02, BLACK, 8));
  }

  const glass: THREE.BufferGeometry[] = [];
  buildSuperstructure(def, parts, glass);

  const group = new THREE.Group();
  group.name = 'alaskan38';
  const mesh = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
  mesh.name = 'alaskan38-parts';
  group.add(mesh);
  const g = CONFIG.vessels.alaskan38.glass;
  const panes = new THREE.Mesh(mergeParts(glass), new THREE.MeshBasicMaterial({ color: g.colour, transparent: true, opacity: g.opacity, depthWrite: false, side: THREE.DoubleSide }));
  panes.name = 'alaskan38-glass';
  panes.renderOrder = 2;
  group.add(panes);
  return group;
}

/**
 * Stage 2: her superstructure round the game's house box (layout.wheelhouse, which stays
 * what you walk in; its console is the hull mesh's, its floors are drawn here). Two roof
 * levels, as the boat has. From forward:
 *   - the trunk cabin on the foredeck: the fore cabin's top, following the deck edge
 *     `inset` in from it, tapering forward, a glass hatch in it; the anchor roller;
 *   - the pilothouse, standing high: a three-facet front, reverse-raked above the sill
 *     (the same shear as the rain glass, hullMesh.ts frontRake / facetDz, so the rain
 *     lands on the panes), a long side pane each side with the sliding door in the
 *     starboard one, and above the saloon roof an aft wall with a band of glass;
 *   - the saloon, its floor two steps down and its roof lower: two long side windows each
 *     side, the aft wall with the doorway (the door itself is the game's, boatView.ts) and
 *     a window each side of it;
 *   - the roofs: tan slabs (the eyebrows, a light-grey top set in from the edge), the
 *     pilothouse's from a visor ahead of the front glass, the saloon's carried aft over
 *     the cockpit as the overhead, the hull's width there, on a curved wing each side
 *     (the house side carried aft, sweeping from the deck up to the roof's aft edge) with
 *     grab handles; grab rails along the saloon roof, the radar dome behind the
 *     pilothouse, the rod rack along the overhead's aft edge.
 * Her colours are her livery's (the design's: light grey house, tan roof, dark glass).
 */
function buildSuperstructure(def: VesselDef, parts: THREE.BufferGeometry[], glass: THREE.BufferGeometry[]): void {
  const wh = def.layout.wheelhouse;
  if (!wh) return;
  const h = CONFIG.vessels.alaskan38.house;
  const col = paintOf(def.livery);
  const H = col.house;
  const FRAME = col.frame;
  const GLASS = 0; // (the panes' colour is their material's: they go in `glass`)
  const FW = CONFIG.pixelPaint.frameWidth;
  const edge = deckEdge(def);
  const hw = wh.halfWidth;
  const w = wh.wall;
  const front = wh.front;
  const aft = wh.aft;
  const phAft = h.pilothouseAft;
  const thick = def.layout.roof?.thickness ?? 0.1;
  // The pilothouse: its floor, glass and roof.
  const phFloor = wh.floorY;
  const phRoof = wh.roofY;
  const phSill = phFloor + wh.windowSill;
  const phHead = phFloor + wh.windowHead;
  // The saloon: sunk, under the lower roof.
  const saFloor = houseFloorAt(wh, aft);
  const saRoof = h.saloon.roofY;
  const saRoofTop = saRoof + thick;
  const saSill = saFloor + h.saloon.sill;
  const saHead = saFloor + h.saloon.head;
  // The walls start a little under the deck at the house's lowest point (the aft end: the
  // deck rises forward), as the game's houses do, so there's never a gap at the deck.
  const base = Math.min(edge(front).y, edge(aft).y) - 0.06;
  const rake = frontRake(wh);
  const dz = facetDz(wh);
  const fd = facetDepth(wh);
  const xi = hw - w; // the walls' inside face

  // ── Floors ──
  // The pilothouse floor as a solid block down to the saloon's level (its aft face is the
  // top riser), the tread likewise, the saloon floor a slab; the levels are the layout's
  // (walked by layout.ts). The saloon floor stops at the aft wall; the door sill is its edge.
  const lv = wh.levels ?? [{ z0: front, z1: aft, y: phFloor }];
  const holes = wh.floorHoles ?? [];
  for (let i = 0; i < lv.length; i++) {
    const l = lv[i];
    const z0 = Math.max(l.z0, front + w + fd);
    const z1 = Math.min(l.z1, aft - w);
    // A slab 0.1 thick (the fore cabin is under the pilothouse's), cut round the holes.
    let pieces: [number, number, number, number][] = [[-xi, xi, z0, z1]];
    for (const o of holes) {
      const next: typeof pieces = [];
      for (const [x0, x1, pz0, pz1] of pieces) {
        if (o.x1 <= x0 || o.x0 >= x1 || o.z1 <= pz0 || o.z0 >= pz1) {
          next.push([x0, x1, pz0, pz1]);
          continue;
        }
        if (o.x0 > x0) next.push([x0, o.x0, pz0, pz1]);
        if (o.x1 < x1) next.push([o.x1, x1, pz0, pz1]);
        const ix0 = Math.max(x0, o.x0);
        const ix1 = Math.min(x1, o.x1);
        if (o.z0 > pz0) next.push([ix0, ix1, pz0, o.z0]);
        if (o.z1 < pz1) next.push([ix0, ix1, o.z1, pz1]);
      }
      pieces = next;
    }
    for (const [x0, x1, pz0, pz1] of pieces) parts.push(span(x0, x1, l.y - 0.1, l.y, pz0, pz1, col.floor));
    // The riser down to the next level, at this level's aft end.
    const nextY = lv[i + 1]?.y;
    if (nextY !== undefined && nextY < l.y) parts.push(span(-xi, xi, nextY - 0.1, l.y - 0.1, l.z1 - 0.03, l.z1, col.floor));
  }
  // The floor's forward piece out to the angled front walls (the facet corner's notch), to starboard of the companionway.
  if (fd) parts.push(span(Math.max(-xi, Math.max(...holes.map((o) => o.x1), -xi)), xi, phFloor - 0.1, phFloor, front + w, front + w + fd, col.floor));
  // The lazarette under the cockpit deck: its walls and bottom (the hatch module opens onto it).
  const eh = def.layout.engineHatch;
  if (eh) {
    const top = edge((eh.z0 + eh.z1) / 2).y;
    const pit = top - eh.pitDepth;
    parts.push(span(eh.x0 - 0.03, eh.x1 + 0.03, pit - 0.03, pit, eh.z0 - 0.03, eh.z1 + 0.03, 0x5a6066));
    for (const [x0, x1] of [[eh.x0 - 0.03, eh.x0], [eh.x1, eh.x1 + 0.03]]) parts.push(span(x0, x1, pit, top, eh.z0, eh.z1, 0xb8bcb8));
    for (const [z0, z1] of [[eh.z0 - 0.03, eh.z0], [eh.z1, eh.z1 + 0.03]]) parts.push(span(eh.x0 - 0.03, eh.x1 + 0.03, pit, top, z0, z1, 0xb8bcb8));
  }

  // ── Side walls ──
  // Each side: the pilothouse's wall (lower, glass, header, to its roof) from the facet's
  // corner to `pilothouseAft`, then the saloon's (lower, glass, header) to the aft wall.
  const mullion = (x0: number, x1: number, y0: number, y1: number, z: number) => span(x0, x1, y0, y1, z - FW / 2, z + FW / 2, FRAME);
  const sideWindows = (s: number, z0: number, z1: number, sill: number, head: number, roof: number, breaks: number[]) => {
    parts.push(span(s * xi, s * hw, base, sill, z0, z1, H));
    parts.push(span(s * xi, s * hw, head, roof, z0, z1, H));
    glass.push(span(s * (hw - w / 2 - 0.01), s * (hw - w / 2 + 0.01), sill, head, z0, z1, GLASS));
    const xf0 = s * (hw - 0.004);
    const xf1 = s * (hw + 0.004);
    parts.push(span(xf0, xf1, sill - 0.004, sill + FW, z0, z1, FRAME));
    parts.push(span(xf0, xf1, head - FW, head + 0.004, z0, z1, FRAME));
    for (const z of breaks) parts.push(mullion(xf0, xf1, sill, head, z));
  };
  for (const s of [-1, 1]) {
    const zF = front + fd; // the facet's corner: where the side wall begins
    sideWindows(s, zF, phAft, phSill, phHead, phRoof, [zF, phAft]);
    sideWindows(s, phAft, aft, saSill, saHead, saRoof, [phAft, (phAft + aft) / 2, aft]);
    // The pilothouse's sliding door, to starboard: a panel standing a little proud, glass
    // in its top (the pane's own frame), a handle.
    if (s > 0) {
      const d = h.sideDoor;
      const xo = hw;
      parts.push(span(xo, xo + 0.03, phFloor - 0.02, phSill - 0.004, d.z0, d.z1, 0xb9bdbf));
      parts.push(span(xo, xo + 0.03, phHead + 0.004, phHead + 0.08, d.z0, d.z1, 0xb9bdbf));
      for (const z of [d.z0, d.z1]) parts.push(span(xo, xo + 0.034, phFloor - 0.02, phHead + 0.08, z - 0.03, z + 0.03, FRAME));
      parts.push(span(xo + 0.03, xo + 0.07, phFloor + 1.0, phFloor + 1.03, d.z1 - 0.3, d.z1 - 0.1, FRAME)); // the handle
    }
  }
  // The pilothouse's aft wall above the saloon roof, with its band of glass.
  {
    const y0 = saRoofTop - 0.02;
    const gs = y0 + 0.12;
    const ge = phHead;
    parts.push(span(-hw, hw, y0, gs, phAft - w, phAft, H));
    parts.push(span(-hw, hw, ge, phRoof, phAft - w, phAft, H));
    for (const s of [-1, 1]) parts.push(span(s * (hw - 0.14), s * hw, gs, ge, phAft - w, phAft, H));
    glass.push(span(-(hw - 0.14), hw - 0.14, gs, ge, phAft - w / 2 - 0.01, phAft - w / 2 + 0.01, GLASS));
    parts.push(span(-(hw - 0.14), hw - 0.14, gs - 0.004, gs + FW, phAft - w - 0.004, phAft + 0.004, FRAME));
    parts.push(span(-(hw - 0.14), hw - 0.14, ge - FW, ge + 0.004, phAft - w - 0.004, phAft + 0.004, FRAME));
    for (const x of [-(hw - 0.14), -0.5, 0.5, hw - 0.14]) parts.push(span(x - FW / 2, x + FW / 2, gs, ge, phAft - w - 0.004, phAft + 0.004, FRAME));
  }

  // ── The aft wall ──
  // Solid each side of the doorway with a window in it, a header over the door.
  const dw = wh.doorWidth / 2;
  const doorTop = saFloor + wh.doorHeight;
  for (const s of [-1, 1]) {
    const x0 = s * dw;
    const x1 = s * hw;
    parts.push(span(x0, x1, base, saSill, aft - w, aft, H));
    parts.push(span(x0, x1, saHead, saRoof, aft - w, aft, H));
    const g0 = s * (dw + 0.12);
    const g1 = s * (hw - 0.14);
    glass.push(span(g0, g1, saSill, saHead, aft - w / 2 - 0.01, aft - w / 2 + 0.01, GLASS));
    parts.push(span(s * (dw + 0.12 - FW), g0, saSill, saHead, aft - 0.004, aft + 0.004, FRAME));
    parts.push(span(g1, s * (hw - 0.14 + FW), saSill, saHead, aft - 0.004, aft + 0.004, FRAME));
    parts.push(span(g0, g1, saSill - FW, saSill, aft - 0.004, aft + 0.004, FRAME));
    parts.push(span(g0, g1, saHead, saHead + FW, aft - 0.004, aft + 0.004, FRAME));
    parts.push(span(x0, g0, saSill, saHead, aft - w, aft, H));
    parts.push(span(g1, x1, saSill, saHead, aft - w, aft, H));
  }
  parts.push(span(-dw, dw, doorTop, saRoof, aft - w, aft, H));
  // The door sill: the saloon floor's edge, a step up to the cockpit deck.
  parts.push(span(-dw, dw, saFloor - 0.1, saFloor, aft - w, aft + 0.03, col.deck));

  // ── The front ──
  // Built flat across at `front`, then each vertex set back by its x (the three facets:
  // the middle pane square across, the outer two angled back to the walls) and what's
  // above the sill leaned forward by the rake, as the rain glass is.
  const S = rake.sill;
  const c = wh.shape?.facet?.centre ?? hw;
  const lower: THREE.BufferGeometry[] = [span(-hw, hw, base, S, front, front + w, H)];
  const upper: THREE.BufferGeometry[] = [];
  const panes: THREE.BufferGeometry[] = [];
  const paneX = [-xi, -c, c, xi];
  for (let i = 0; i + 1 < paneX.length; i++) panes.push(span(paneX[i] + 0.005, paneX[i + 1] - 0.005, S, phHead, front + w / 2 - 0.01, front + w / 2 + 0.01, GLASS));
  for (const x of [-c, c]) upper.push(span(x - FW / 2, x + FW / 2, S, phHead, front - 0.004, front + 0.004, FRAME)); // the mullions
  for (const s of [-1, 1]) {
    // The corner posts, foot to roof: below the sill upright, above it raked with the glass.
    lower.push(span(s * (hw - FW), s * hw, base, S, front - 0.004, front + 0.004, FRAME));
    upper.push(span(s * (hw - FW), s * hw, S, phRoof, front - 0.004, front + 0.004, FRAME));
  }
  upper.push(span(-hw, hw, S - 0.004, S + FW, front - 0.004, front + 0.004, FRAME)); // the sill band
  upper.push(span(-hw, hw, phHead - FW, phHead + 0.004, front - 0.004, front + 0.004, FRAME)); // the head band
  upper.push(span(-hw, hw, phHead, phRoof, front, front + w, H)); // the header
  setBack(lower, dz);
  setBack(upper, dz);
  setBack(panes, dz);
  for (const g of [...upper, ...panes]) g.applyMatrix4(rake.matrix);
  parts.push(...lower, ...upper);
  glass.push(...panes);

  // ── The roofs: the eyebrows ──
  // Tan slabs with a light-grey top set in from the edge, so the tan shows as a band. The
  // pilothouse's front edge follows the facets and reaches `visor` ahead of the raked
  // glass's head; it overhangs its aft wall a little. The saloon's runs from under it aft
  // over the cockpit as the overhead, widening to the hull's width past the aft wall.
  const ahead = rake.tan * (phRoof - S); // how far the glass's top is ahead of the sill line
  const ox = hw + h.eyebrow.sideOverhang;
  const eyebrow = (x: number, y: number, z0: number, z1: number) => [span(-x, x, y, y + thick, z0, z1, col.roof), span(-x + 0.1, x - 0.1, y + thick, y + thick + 0.03, z0 + 0.1, z1 - 0.1, H)];
  const phSlab = eyebrow(ox, phRoof, front - ahead - h.eyebrow.visor, phAft + 0.15);
  setBack(phSlab, dz, front + 0.5); // (the front edge only)
  parts.push(...phSlab);
  parts.push(...eyebrow(ox, saRoof, phAft - 0.02, aft + 0.02));
  const oh = h.overhead;
  parts.push(...eyebrow(oh.halfWidth, saRoof, aft - 0.02, oh.aft));
  // The wings: the house side carried aft under the overhead, a plate each side sweeping
  // from the deck at `kneeFoot` up to the overhead's aft edge in a hollow curve; two grab
  // handles on each.
  for (const s of [-1, 1]) {
    const x0 = s * (oh.halfWidth - 0.06);
    const x1 = s * oh.halfWidth;
    const deckHere = edge(oh.kneeFoot).y - 0.05;
    const shape = new THREE.Shape();
    shape.moveTo(aft - 0.02, deckHere);
    shape.lineTo(oh.kneeFoot, deckHere);
    shape.quadraticCurveTo(oh.kneeFoot + (oh.aft - oh.kneeFoot) * 0.2, saRoof - (saRoof - deckHere) * 0.25, oh.aft, saRoof + 0.02);
    shape.lineTo(aft - 0.02, saRoof + 0.02);
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(x1 - x0), bevelEnabled: false, curveSegments: 8 }).rotateY(-Math.PI / 2).translate(Math.max(x0, x1), 0, 0);
    parts.push(part(g, H));
    for (const y of [deckHere + 0.95, deckHere + 1.45]) {
      const zh = aft + 0.35;
      parts.push(rod([s * (oh.halfWidth + 0.01), y, zh], [s * (oh.halfWidth + 0.06), y, zh], 0.014, BLACK));
      parts.push(rod([s * (oh.halfWidth + 0.01), y, zh + 0.5], [s * (oh.halfWidth + 0.06), y, zh + 0.5], 0.014, BLACK));
      parts.push(rod([s * (oh.halfWidth + 0.06), y, zh], [s * (oh.halfWidth + 0.06), y, zh + 0.5], 0.016, BLACK));
    }
  }
  // Grab rails along the saloon roof's sides.
  const rr = h.roofRail;
  for (const s of [-1, 1]) {
    const x = s * (ox - 0.07);
    const z0 = phAft + 0.2;
    const z1 = aft - 0.1;
    parts.push(rod([x, saRoofTop + rr.height, z0], [x, saRoofTop + rr.height, z1], 0.018, BLACK));
    const n = Math.max(1, Math.round((z1 - z0) / rr.spacing));
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      parts.push(rod([x, saRoofTop, z], [x, saRoofTop + rr.height, z], 0.015, BLACK));
    }
  }
  // The radar: a white dome on a pedestal behind the pilothouse, standing over its roof.
  const rd = h.radar;
  parts.push(span(-0.12, 0.12, saRoofTop, saRoofTop + rd.pedestal, rd.z - 0.12, rd.z + 0.12, H));
  parts.push(part(new THREE.CylinderGeometry(rd.radius, rd.radius * 0.9, rd.height, 16).translate(0, saRoofTop + rd.pedestal + rd.height / 2, rd.z), COWL));
  // The rod rack: two uprights and a bar across, the rod holders along it, raked aft.
  const rk = h.rodRack;
  const rackTop = saRoofTop + rk.height;
  for (const s of [-1, 1]) parts.push(rod([s * rk.halfWidth, saRoofTop, rk.z], [s * rk.halfWidth, rackTop, rk.z], 0.02, ALU));
  parts.push(rod([-rk.halfWidth, rackTop, rk.z], [rk.halfWidth, rackTop, rk.z], 0.02, ALU));
  for (let i = 0; i < rk.rods; i++) {
    const x = -rk.halfWidth + ((i + 0.5) * 2 * rk.halfWidth) / rk.rods;
    parts.push(rod([x, rackTop - 0.14, rk.z - 0.03], [x, rackTop + 0.16, rk.z + 0.08], 0.022, ALU));
  }

  // ── The trunk cabin ──
  // From the house front forward to `fwd`, `inset` in from the deck edge, its top `height`
  // over the deck at the house tapering to `fwdHeight` at its forward end; a glass hatch.
  const tr = h.trunk;
  const sections: { z: number; half: number; y0: number; y1: number }[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = front + 0.02 + (tr.fwd - front - 0.02) * t;
    const e = edge(z);
    sections.push({ z, half: Math.max(0.25, e.x - tr.inset), y0: e.y - 0.08, y1: e.y + tr.height + (tr.fwdHeight - tr.height) * t });
  }
  parts.push(loftBox(sections, H));
  const hz = tr.hatch.z;
  const hTop = edge(hz).y + tr.height + ((tr.fwdHeight - tr.height) * (hz - front)) / (tr.fwd - front);
  glass.push(span(-tr.hatch.size / 2, tr.hatch.size / 2, hTop, hTop + 0.035, hz - tr.hatch.size / 2, hz + tr.hatch.size / 2, GLASS));
  parts.push(span(-tr.hatch.size / 2 - 0.03, tr.hatch.size / 2 + 0.03, hTop, hTop + 0.02, hz - tr.hatch.size / 2 - 0.03, hz + tr.hatch.size / 2 + 0.03, FRAME));
  // The anchor roller at the stem.
  const stem = def.hull.stations[def.hull.stations.length - 1].z;
  const sy = edge(stem + 0.35).y;
  parts.push(span(-0.1, 0.1, sy, sy + 0.12, stem + 0.05, stem + 0.6, ALU));
  parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10).rotateZ(Math.PI / 2).translate(0, sy + 0.14, stem + 0.12), BLACK));

  buildInterior(def, parts, { base, xi, phFloor, phRoof, saFloor, saRoof, front, aft, phAft, fd, dz, edge, col });
}

/**
 * Stage 3: inside her (drawing only; the walking is layout.extraFloors / hollows and the
 * house's floor levels). The console body to starboard of the companionway (the console
 * module's dash sits on it); the helm and companion seats; the companionway's treads,
 * risers, side wall and rail; the fore cabin under the trunk: its sole, the V-berth with
 * its cushions, a hanging locker, an inward-facing lining and the trunk's ceiling; the
 * saloon's galley counter (sink, stove, fridge) to starboard and the dinette settees to
 * port round the chart-table module; a ceiling lining under each roof.
 */
function buildInterior(
  def: VesselDef,
  parts: THREE.BufferGeometry[],
  g: { base: number; xi: number; phFloor: number; phRoof: number; saFloor: number; saRoof: number; front: number; aft: number; phAft: number; fd: number; dz: (x: number) => number; edge: (z: number) => { x: number; y: number }; col: ReturnType<typeof paintOf> },
): void {
  const wh = def.layout.wheelhouse!;
  const h = CONFIG.vessels.alaskan38.house;
  const it = h.interior;
  const { xi, phFloor, phRoof, saFloor, saRoof, front, aft, phAft, dz, edge, col } = g;
  const w = wh.wall;

  // ── The console body ──
  // From the companionway's starboard edge to the starboard wall, wrapping round with the
  // facets (the hull mesh's console, in three across, for the part of the width it spans).
  {
    const c0 = front + w;
    const c1 = c0 + wh.consoleDepth;
    const top = phFloor + wh.consoleHeight;
    const f = wh.shape?.facet;
    const spans: [number, number][] = f ? [[it.console.x0, f.centre], [f.centre, xi]] : [[it.console.x0, xi]];
    const body: THREE.BufferGeometry[] = [];
    for (const [a, b] of spans) {
      body.push(span(a, b, phFloor, top, c0, c1, it.console.colour));
      body.push(span(a, b, top, top + 0.12, c0, c0 + wh.consoleDepth * 0.45, it.console.colour));
      body.push(span(Math.max(a, it.console.x0 + 0.05), Math.min(b, xi - 0.05), top - 0.01, top + 0.005, c0 + wh.consoleDepth * 0.45, c1 - 0.03, col.panel));
    }
    setBack(body, dz);
    parts.push(...body);
  }
  // ── The seats ──
  for (const st of it.seats) {
    parts.push(span(st.x - 0.18, st.x + 0.18, phFloor, phFloor + 0.02, st.z - 0.18, st.z + 0.18, ALU)); // the pedestal's foot
    parts.push(rod([st.x, phFloor, st.z], [st.x, phFloor + 0.5, st.z], 0.04, ALU));
    parts.push(span(st.x - 0.25, st.x + 0.25, phFloor + 0.5, phFloor + 0.58, st.z - 0.22, st.z + 0.22, 0x2a2d31)); // the seat
    parts.push(span(st.x - 0.25, st.x + 0.25, phFloor + 0.58, phFloor + 1.05, st.z + 0.14, st.z + 0.22, 0x2a2d31)); // the back
  }

  // ── The companionway ──
  // Its treads and risers (walked: layout.extraFloors), the wall on its starboard side down
  // from the pilothouse floor, a handrail along it.
  const cw = it.companionway;
  const treads = (def.layout.extraFloors ?? []).filter((f) => f.x1 <= cw.x1 + 0.01 && f.z0 >= cw.z0 - 0.01 && f.z1 <= cw.z1 + 0.01 && f.y > 0.1);
  const soleY = it.foreCabin.sole;
  for (const t of treads) {
    parts.push(span(t.x0, t.x1, t.y - 0.04, t.y, t.z0, t.z1, it.foreCabin.trim));
    const below = treads.find((o) => o.z1 === t.z0)?.y ?? soleY;
    parts.push(span(t.x0, t.x1, below - 0.04, t.y - 0.04, t.z0, t.z0 + 0.03, it.foreCabin.lining)); // the riser under its forward edge
  }
  parts.push(span(cw.x1, cw.x1 + 0.03, soleY, phFloor, cw.z0, cw.z1, it.foreCabin.lining)); // the side wall
  parts.push(rod([cw.rail.x, treads[0].y + cw.rail.height, cw.z1], [cw.rail.x, soleY + cw.rail.height + 0.2, cw.z0], 0.018, BLACK));

  // ── The fore cabin ──
  // Under the trunk and the pilothouse floor: the sole, the V-berth's platform (following
  // the hull in from the lining) and cushions, a hanging locker to starboard, the lining
  // (turned to face inward) and the ceiling under the trunk.
  const fc = it.foreCabin;
  const tr = h.trunk;
  const fwdEnd = tr.fwd + 0.1;
  const liningHalf = (z: number) => Math.max(0.3, edge(z).x - tr.inset - 0.2);
  const trunkTop = (z: number) => edge(z).y + tr.height + ((tr.fwdHeight - tr.height) * Math.min(1, Math.max(0, (z - front) / (tr.fwd - front))));
  // The sole, in its pieces (narrower forward, where the hull's vee comes up under it).
  const soles = (def.layout.extraFloors ?? []).filter((f) => f.y === soleY);
  for (const sl of soles) parts.push(span(sl.x0 - 0.08, sl.x1 + 0.08, soleY - 0.12, soleY, sl.z0 - 0.05, sl.z1, fc.trim));
  const sole = soles.sort((a, b) => b.z1 - a.z1)[0];
  // The lining: inward-facing loft from the house front to the cabin's forward end.
  const lining: { z: number; half: number; y0: number; y1: number }[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const z = front - 0.02 + (fwdEnd - front + 0.02) * (i / n);
    lining.push({ z, half: liningHalf(z), y0: soleY - 0.15, y1: trunkTop(z) - 0.04 });
  }
  parts.push(loftBox(lining, fc.lining, true));
  // The berth: a platform from `berth.aft` forward, its front a fiddle; cushions on it in two.
  const berth: { z: number; half: number; y0: number; y1: number }[] = [];
  for (let i = 0; i <= 4; i++) {
    const z = fc.berth.aft + (fwdEnd - fc.berth.aft) * (i / 4);
    berth.push({ z, half: liningHalf(z) - 0.02, y0: soleY, y1: fc.berth.top });
  }
  parts.push(loftBox(berth, fc.trim));
  const cushions: { z: number; half: number; y0: number; y1: number }[] = berth.map((b) => ({ ...b, half: b.half - 0.04, y0: fc.berth.top, y1: fc.berth.top + fc.berth.cushion }));
  parts.push(loftBox(cushions, fc.cushion));
  parts.push(span(-0.03, 0.03, fc.berth.top, fc.berth.top + fc.berth.cushion + 0.01, fc.berth.aft, fwdEnd + 0.3, fc.trim)); // the gap between the two cushions
  // Side berth tops either side of the sole, from the berth aft to the house front, over the hull's turn.
  if (sole) {
    for (const s of [-1, 1]) {
      const xIn = s < 0 ? sole.x0 : sole.x1;
      const z1 = s < 0 ? cw.z0 : fc.locker.z0;
      if (z1 > fc.berth.aft) parts.push(span(xIn, s * liningHalf((fc.berth.aft + z1) / 2), soleY, fc.berth.top, fc.berth.aft, z1, fc.trim));
    }
  }
  // The hanging locker to starboard under the pilothouse floor, its door and handle.
  const lk = fc.locker;
  parts.push(span(lk.x0, lk.x1, soleY, lk.top, lk.z0, lk.z1, fc.trim));
  parts.push(span(lk.x0 - 0.01, lk.x0, soleY + 0.1, lk.top - 0.1, lk.z0 + 0.08, lk.z1 - 0.08, fc.lining));
  parts.push(rod([lk.x0 - 0.03, soleY + 0.6, lk.z1 - 0.2], [lk.x0 - 0.03, soleY + 0.75, lk.z1 - 0.2], 0.012, BLACK));

  // ── The saloon ──
  // The galley counter along the starboard side: the body, a lighter top, the sink (a
  // dark well), the stove (black, two rings), the fridge's door outline in the front.
  const ga = it.galley;
  const gTop = saFloor + ga.top;
  parts.push(span(ga.x0, xi, saFloor, gTop - 0.04, ga.z0, ga.z1, fc.trim));
  parts.push(span(ga.x0 - 0.02, xi, gTop - 0.04, gTop, ga.z0 - 0.02, ga.z1 + 0.02, 0xcfd3d6));
  parts.push(span(ga.sink[0] - 0.2, ga.sink[0] + 0.2, gTop - 0.12, gTop + 0.002, ga.sink[1] - 0.18, ga.sink[1] + 0.18, 0x6c7378));
  parts.push(rod([ga.sink[0] + 0.15, gTop, ga.sink[1] + 0.22], [ga.sink[0] + 0.15, gTop + 0.25, ga.sink[1] + 0.22], 0.012, ALU)); // the tap
  parts.push(span(ga.stove[0] - 0.24, ga.stove[0] + 0.24, gTop, gTop + 0.02, ga.stove[1] - 0.22, ga.stove[1] + 0.22, BLACK));
  for (const dzr of [-0.11, 0.11]) parts.push(part(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 12).translate(ga.stove[0], gTop + 0.026, ga.stove[1] + dzr), 0x4a4f54));
  parts.push(span(ga.x0 - 0.012, ga.x0, saFloor + 0.08, gTop - 0.1, ga.fridge[0], ga.fridge[1], 0xb9bdbf)); // the fridge door
  parts.push(rod([ga.x0 - 0.04, saFloor + 0.3, ga.fridge[0] + 0.06], [ga.x0 - 0.04, gTop - 0.2, ga.fridge[0] + 0.06], 0.012, ALU));
  // The dinette to port: an L of settees round the table (the chart-table module), seats
  // and backs; the forward one across the width to the companionway's side wall.
  const dn = it.dinette;
  const seatY = saFloor + dn.seat;
  const backY = saFloor + dn.back;
  for (const [z0, z1] of [dn.fwd, dn.aft]) {
    parts.push(span(-xi, dn.x1, saFloor, seatY, z0, z1, fc.cushion));
    parts.push(span(-xi, -xi + 0.1, seatY, backY, z0, z1, fc.cushion));
    parts.push(span(-xi, dn.x1, saFloor, saFloor + 0.08, z0, z1, fc.trim)); // the plinth
  }
  parts.push(span(dn.x1 - 0.12, dn.x1, saFloor, backY, dn.fwd[0], dn.fwd[1], fc.cushion)); // the forward settee's inboard arm
  // A step-up plinth at the saloon's forward end is the house's tread (drawn with the floors).

  // ── Ceilings ──
  // A light lining under each roof, set in from the walls (the roof slabs are tan).
  const ce = it.ceiling;
  parts.push(span(-xi + ce.inset, xi - ce.inset, phRoof - ce.thickness, phRoof, front + w + g.fd + ce.inset, phAft - w - ce.inset, ce.colour));
  parts.push(span(-xi + ce.inset, xi - ce.inset, saRoof - ce.thickness, saRoof, phAft + ce.inset, aft - w - ce.inset, ce.colour));
}

/** For tests: where her outboards' propellers turn (her axes). */
export function alaskan38PropellerAt(def: VesselDef): V3[] {
  const c = CONFIG.vessels.alaskan38;
  const transom = def.hull.stations[0].z;
  const zLeg = transom + c.bracket.length + 0.1 + c.outboards.cowlLength * 0.45;
  return [-1, 1].map((side) => [side * c.bracket.outboardX, c.outboards.gearY, zLeg + 0.42] as V3);
}
