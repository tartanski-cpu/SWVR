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
import type { VesselDef } from '../../vessel/vesselDef';
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
function loftBox(sections: { z: number; half: number; y0: number; y1: number }[], colour: number): THREE.BufferGeometry {
  const v: number[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
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
      const [, chine, , , deck] = [s.polygon[0], s.polygon[1], s.polygon[2], s.polygon[3], s.polygon[4]];
      // (The starboard side; mirrored below.)
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
 * what you walk in; its floor and console are the hull mesh's). From forward:
 *   - the trunk cabin on the foredeck: the fore cabin's top, following the deck edge
 *     `inset` in from it, tapering forward, a glass hatch in it;
 *   - the pilothouse: a three-facet front, reverse-raked above the sill (the same shear
 *     as the rain glass, hullMesh.ts frontRake / facetDz, so the rain lands on the panes),
 *     side glass to `pilothouseAft` with a hinged door in the starboard side;
 *   - the saloon: two long side windows each side, the aft wall with the doorway (the door
 *     itself is the game's, boatView.ts) and a window each side of it;
 *   - the roof: one tan slab (the eyebrow) from a visor ahead of the front glass, past the
 *     walls each side, carried aft over the cockpit as the overhead, on two posts at its
 *     aft corners, with grab rails along its sides, the radar dome and the rod rack on it.
 * Her colours are her livery's (the design's: light grey house, tan roof, dark glass).
 */
function buildSuperstructure(def: VesselDef, parts: THREE.BufferGeometry[], glass: THREE.BufferGeometry[]): void {
  const wh = def.layout.wheelhouse;
  if (!wh) return;
  const h = CONFIG.vessels.alaskan38.house;
  const col = paintOf(def.livery);
  const H = col.house;
  const GLASS = 0; // (the panes' colour is their material's: they go in `glass`)
  const FRAME = col.frame;
  const FW = CONFIG.pixelPaint.frameWidth;
  const edge = deckEdge(def);
  const hw = wh.halfWidth;
  const w = wh.wall;
  const front = wh.front;
  const aft = wh.aft;
  const roof = wh.roofY;
  const roofTop = roof + (def.layout.roof?.thickness ?? 0.1);
  const sill = wh.floorY + wh.windowSill;
  const head = wh.floorY + wh.windowHead;
  // The walls start a little under the deck at the house's lowest point (the aft end: the
  // deck rises forward), as the game's houses do, so there's never a gap at the deck.
  const base = Math.min(edge(front).y, edge(aft).y) - 0.06;
  const rake = frontRake(wh);
  const dz = facetDz(wh);
  const fd = facetDepth(wh);

  // ── Side walls ──
  // Below the glass and above it solid; between, the glass in frames: the pilothouse's pane
  // (with the door in it to starboard), then the saloon's two, a mullion between each.
  const mullion = (x0: number, x1: number, y0: number, y1: number, z: number) => span(x0, x1, y0, y1, z - FW / 2, z + FW / 2, FRAME);
  for (const s of [-1, 1]) {
    const xi = s * (hw - w);
    const xo = s * hw;
    const zF = front + fd; // the facet's corner: where the side wall begins
    parts.push(span(xi, xo, base, sill, zF, aft, H));
    parts.push(span(xi, xo, head, roof, zF, aft, H));
    // The glass: one pane thick, set in the wall's middle.
    glass.push(span(s * (hw - w / 2 - 0.01), s * (hw - w / 2 + 0.01), sill, head, zF, aft, GLASS));
    // Frames: the sill and head bands, a mullion at each pane's end.
    const xf0 = s * (hw - 0.004);
    const xf1 = s * (hw + 0.004);
    parts.push(span(xf0, xf1, sill - 0.004, sill + FW, zF, aft, FRAME));
    parts.push(span(xf0, xf1, head - FW, head + 0.004, zF, aft, FRAME));
    const breaks = [zF, (zF + h.pilothouseAft) / 2, h.pilothouseAft, (h.pilothouseAft + aft) / 2, aft];
    for (const z of breaks) parts.push(mullion(xf0, xf1, sill, head, z));
    // The pilothouse door, to starboard: a panel standing a little proud, glass in its top, a handle.
    if (s > 0) {
      const d = h.sideDoor;
      const doorFoot = Math.max(wh.floorY - 0.02, edge((d.z0 + d.z1) / 2).y);
      parts.push(span(xo, xo + 0.03, doorFoot, sill - 0.004, d.z0, d.z1, 0xb9bdbf));
      parts.push(span(xo, xo + 0.03, head + 0.004, head + 0.08, d.z0, d.z1, 0xb9bdbf));
      for (const z of [d.z0, d.z1]) parts.push(span(xo, xo + 0.034, doorFoot, head + 0.08, z - 0.03, z + 0.03, FRAME));
      parts.push(span(xo + 0.03, xo + 0.07, doorFoot + 1.0, doorFoot + 1.03, d.z1 - 0.3, d.z1 - 0.1, FRAME)); // the handle
    }
  }

  // ── The aft wall ──
  // Solid each side of the doorway with a window in it, a header over the door.
  const dw = wh.doorWidth / 2;
  const doorTop = wh.floorY + wh.doorHeight;
  for (const s of [-1, 1]) {
    const x0 = s * dw;
    const x1 = s * hw;
    parts.push(span(x0, x1, base, sill, aft - w, aft, H));
    parts.push(span(x0, x1, head, roof, aft - w, aft, H));
    // The window: a pane between the jamb and the corner, framed.
    const g0 = s * (dw + 0.12);
    const g1 = s * (hw - 0.14);
    glass.push(span(g0, g1, sill, head, aft - w / 2 - 0.01, aft - w / 2 + 0.01, GLASS));
    parts.push(span(s * (dw + 0.12 - FW), g0, sill, head, aft - 0.004, aft + 0.004, FRAME));
    parts.push(span(g1, s * (hw - 0.14 + FW), sill, head, aft - 0.004, aft + 0.004, FRAME));
    parts.push(span(g0, g1, sill - FW, sill, aft - 0.004, aft + 0.004, FRAME));
    parts.push(span(g0, g1, head, head + FW, aft - 0.004, aft + 0.004, FRAME));
    // The wall between the jamb and the glass, where the door's frame stands.
    parts.push(span(x0, g0, sill, head, aft - w, aft, H));
    parts.push(span(g1, x1, sill, head, aft - w, aft, H));
  }
  parts.push(span(-dw, dw, doorTop, roof, aft - w, aft, H));

  // ── The front ──
  // Built flat across at `front`, then each vertex set back by its x (the three facets:
  // the middle pane square across, the outer two angled back to the walls) and what's
  // above the sill leaned forward by the rake, as the rain glass is.
  const S = rake.sill;
  const c = wh.shape?.facet?.centre ?? hw;
  const lower: THREE.BufferGeometry[] = [span(-hw, hw, base, S, front, front + w, H)];
  const upper: THREE.BufferGeometry[] = [];
  const panes: THREE.BufferGeometry[] = [];
  const paneX = [-(hw - w), -c, c, hw - w];
  for (let i = 0; i + 1 < paneX.length; i++) panes.push(span(paneX[i] + 0.005, paneX[i + 1] - 0.005, S, head, front + w / 2 - 0.01, front + w / 2 + 0.01, GLASS));
  for (const x of [-c, c]) upper.push(span(x - FW / 2, x + FW / 2, S, head, front - 0.004, front + 0.004, FRAME)); // the mullions
  for (const s of [-1, 1]) {
    // The corner posts, foot to roof: below the sill upright, above it raked with the glass.
    lower.push(span(s * (hw - FW), s * hw, base, S, front - 0.004, front + 0.004, FRAME));
    upper.push(span(s * (hw - FW), s * hw, S, roof, front - 0.004, front + 0.004, FRAME));
  }
  upper.push(span(-hw, hw, S - 0.004, S + FW, front - 0.004, front + 0.004, FRAME)); // the sill band
  upper.push(span(-hw, hw, head - FW, head + 0.004, front - 0.004, front + 0.004, FRAME)); // the head band
  upper.push(span(-hw, hw, head, roof, front, front + w, H)); // the header
  setBack(lower, dz);
  setBack(upper, dz);
  setBack(panes, dz);
  for (const g of [...upper, ...panes]) g.applyMatrix4(rake.matrix);
  parts.push(...lower, ...upper);
  glass.push(...panes);

  // ── The roof: the eyebrow, carried aft as the cockpit overhead ──
  // One tan slab, its front edge following the facets and reaching `visor` ahead of the
  // raked glass's head; a light-grey top set in from the edge, so the tan shows as a band.
  const ahead = rake.tan * (roof - S); // how far the glass's top is ahead of the sill line
  const zRoofFront = front - ahead - h.eyebrow.visor;
  const ox = hw + h.eyebrow.sideOverhang;
  const slab = [span(-ox, ox, roof, roofTop, zRoofFront, h.overhead.aft, col.roof), span(-ox + 0.1, ox - 0.1, roofTop, roofTop + 0.03, zRoofFront + 0.1, h.overhead.aft - 0.1, H)];
  setBack(slab, dz, front + 0.5); // (the front edge only)
  parts.push(...slab);
  // The overhead's posts, on the deck at its aft corners, and the beam between them.
  const zPost = h.overhead.aft - 0.12;
  for (const s of [-1, 1]) {
    const x = s * (ox - 0.1);
    parts.push(rod([x, edge(zPost).y, zPost], [x, roof, zPost], h.overhead.postRadius, H));
  }
  parts.push(span(-ox + 0.06, ox - 0.06, roof - 0.1, roof, h.overhead.aft - 0.16, h.overhead.aft - 0.02, H));
  // Grab rails along the roof's sides.
  const rr = h.roofRail;
  for (const s of [-1, 1]) {
    const x = s * (ox - 0.07);
    const z0 = front + 0.2;
    const z1 = h.overhead.aft - 0.3;
    parts.push(rod([x, roofTop + rr.height, z0], [x, roofTop + rr.height, z1], 0.018, BLACK));
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / Math.max(1, Math.round((z1 - z0) / rr.spacing))) parts.push(rod([x, roofTop, z], [x, roofTop + rr.height, z], 0.015, BLACK));
  }
  // The radar: a white dome on a short pedestal.
  const rd = h.radar;
  parts.push(span(-0.12, 0.12, roofTop, roofTop + 0.18, rd.z - 0.12, rd.z + 0.12, H));
  parts.push(part(new THREE.CylinderGeometry(rd.radius, rd.radius * 0.9, rd.height, 16).translate(0, roofTop + 0.18 + rd.height / 2, rd.z), COWL));
  // The rod rack: two uprights and a bar across, the rod holders along it, raked aft.
  const rk = h.rodRack;
  const rackTop = roofTop + rk.height;
  for (const s of [-1, 1]) parts.push(rod([s * rk.halfWidth, roofTop, rk.z], [s * rk.halfWidth, rackTop, rk.z], 0.02, ALU));
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
}

/** For tests: where her outboards' propellers turn (her axes). */
export function alaskan38PropellerAt(def: VesselDef): V3[] {
  const c = CONFIG.vessels.alaskan38;
  const transom = def.hull.stations[0].z;
  const zLeg = transom + c.bracket.length + 0.1 + c.outboards.cowlLength * 0.45;
  return [-1, 1].map((side) => [side * c.bracket.outboardX, c.outboards.gearY, zLeg + 0.42] as V3);
}
