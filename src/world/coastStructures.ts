/**
 * The coast maps' bridges over the sea and their follies (the landmarks and bridges pass;
 * tools/coast features.ts and package.ts), as geometry: all of a region's merged into one mesh
 * (world/view/coastView.ts draws it: one draw call). Pure: the ground comes in as a function.
 *
 *   cantilever  a deck-on-top steel cantilever, as Connel Bridge over the Falls of Lora: the
 *               road runs level at its deck height; under it, a truss each side whose bottom
 *               chord runs from a stone pier at the water's edge on each bank up toward the
 *               middle, the two arms carrying a shallower suspended span between them, and
 *               back from each pier to the abutment (the anchor arm). Verticals and
 *               diagonals between the chords every `panel` m.
 *   beam        (any other) a deck on girders, on piers down to the seabed every `beamSpan` m
 *               over the water.
 *   gantry      a shipyard's goliath crane over its building dock (Perno): on each rail an
 *               A-frame of two legs on their bogies, a box girder across the span on top, a
 *               cab trolley riding on the girder and a hoist trolley under it with its ropes
 *               and hook block, a T-crane on top of one leg; the rails along the whole track.
 *   yard ship   a cruise ship under construction (Perno), an original design: a hull with a
 *               fine bow and a full stern, to her main deck; deck upon deck of superstructure
 *               with a raked front and terraces aft. How far on she is (`stage`) decides what's
 *               there: in the dock, a patchwork of primer-grey and white hull blocks with the
 *               superstructure stacked block by block over part of her, each deck a band of
 *               windows under its white; `painted` (the ship at the outfitting pier, owner: "the
 *               same shape but with fresh paint, lifeboats and windows"), white over a blue
 *               hull with her lifeboats; finished (`stage` 0.8 on), every deck up, with her
 *               bridge and its wings, a funnel and a water-park aft as well. The yard's yellow luffing
 *               cranes along her.
 *   folly       a ring of arches along its mapped footprint (McCaig's Tower above Oban: two
 *               tiers): a pier every `bay` m round it, two tiers of openings between them
 *               under a band each, a cornice on top; its walls from the lowest ground round it.
 *
 * Original, low-poly forms made to the map's lines and the structure's kind, not copies of
 * the drawings. CONFIG.structures.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { mergeParts, part } from '../render/geometryUtils';
import type { BridgeDef, FloatingDockDef, FollyDef, GantryDef, GravingDockDef, LandmarkModelDef, MuseumShipDef, YardShipDef } from './defs';

type V3 = [number, number, number];

/** A straight member from a to b: a box `w` wide and `h` deep along the line. */
function member(a: V3, b: V3, w: number, h: number, color: number): THREE.BufferGeometry {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = Math.max(0.01, d.length());
  const g = new THREE.BoxGeometry(w, h, len);
  // The box's length is along z: turned onto the line, keeping its width level.
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), d.normalize(), Math.abs(d.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  g.applyMatrix4(m);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return part(g, color);
}

/** A level box between two plan points (x, z), from y0 to y1, `w` wide. */
function slab(ax: number, az: number, bx: number, bz: number, w: number, y0: number, y1: number, color: number): THREE.BufferGeometry {
  const len = Math.max(0.01, Math.hypot(bx - ax, bz - az));
  const g = new THREE.BoxGeometry(w, y1 - y0, len);
  g.rotateY(Math.atan2(bx - ax, bz - az));
  g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
  return part(g, color);
}

/** A bridge's parts. `ground(x, z)` the ground (or seabed) height there (m). */
export function bridgeParts(b: BridgeDef, ground: (x: number, z: number) => number): THREE.BufferGeometry[] {
  const c = CONFIG.structures;
  const [ax, az] = b.path[0];
  const [ex, ez] = b.path[b.path.length - 1];
  const L = Math.hypot(ex - ax, ez - az);
  if (L < 5) return [];
  const ux = (ex - ax) / L;
  const uz = (ez - az) / L;
  // Across (to the left of the way along).
  const vx = uz;
  const vz = -ux;
  const at = (s: number, off: number, y: number): V3 => [ax + ux * s + vx * off, y, az + uz * s + vz * off];
  const gAt = (s: number) => ground(ax + ux * s, az + uz * s);
  const deck = b.deck;
  const half = b.width / 2;
  const parts: THREE.BufferGeometry[] = [];
  // The deck and its parapets.
  parts.push(slab(ax, az, ex, ez, b.width + 0.6, deck - c.deckDepth, deck, c.colours.deck));
  for (const side of [-1, 1]) parts.push(member(at(0, side * (half + 0.2), deck + 0.5), at(L, side * (half + 0.2), deck + 0.5), 0.25, 1, c.colours.steel));
  // Where the water is under it: the banks' piers stand at its edges.
  let s0 = 0;
  let s1 = L;
  for (let s = 0; s <= L; s += 2) if (gAt(s) < 0) {
    s0 = s;
    break;
  }
  for (let s = L; s >= 0; s -= 2) if (gAt(s) < 0) {
    s1 = s;
    break;
  }
  if (s1 - s0 < 10) [s0, s1] = [L * 0.2, L * 0.8];
  const footY = (s: number) => Math.max(0.5, gAt(s) + 1.5);

  if (b.structure === 'cantilever') {
    // The bottom chord's height along the bridge: from the abutment (anchor arm) down to the
    // pier, then up the cantilever arm to the suspended span, level across it, and back.
    const susp = (s1 - s0) * c.suspended;
    const m0 = (s0 + s1) / 2 - susp / 2;
    const m1 = (s0 + s1) / 2 + susp / 2;
    const shallow = deck - c.deckDepth - c.suspendedDepth;
    const anchorEnd = deck - c.deckDepth - c.anchorDepth;
    const bottom = (s: number): number => {
      if (s <= s0) return anchorEnd + ((footY(s0) - anchorEnd) * s) / Math.max(1, s0);
      if (s < m0) return footY(s0) + ((shallow - footY(s0)) * (s - s0)) / (m0 - s0);
      if (s <= m1) return shallow;
      if (s < s1) return shallow + ((footY(s1) - shallow) * (s - m1)) / (s1 - m1);
      return footY(s1) + ((anchorEnd - footY(s1)) * (s - s1)) / Math.max(1, L - s1);
    };
    const top = deck - c.deckDepth;
    // The panel points: every `panel` m, and the breaks (piers, the suspended span's ends).
    const stations = new Set<number>([0, L, s0, s1, m0, m1]);
    for (let s = 0; s < L; s += c.panel) stations.add(Math.round(s * 10) / 10);
    const ss = [...stations].sort((p, q) => p - q);
    for (const side of [-1, 1]) {
      const off = side * (half - 0.3);
      for (let i = 0; i < ss.length; i++) {
        const s = ss[i];
        const yb = bottom(s);
        // The vertical at this panel point (not where the chords meet at a pier).
        if (top - yb > 0.5) parts.push(member(at(s, off, yb), at(s, off, top), 0.35, 0.35, c.colours.steel));
        if (i === 0) continue;
        const p = ss[i - 1];
        // The chords, and a diagonal across the panel (they lean toward the piers).
        parts.push(member(at(p, off, top), at(s, off, top), 0.6, 0.7, c.colours.steel));
        parts.push(member(at(p, off, bottom(p)), at(s, off, yb), 0.7, 0.8, c.colours.steel));
        const toward = s <= (s0 + s1) / 2 ? 1 : -1;
        if (top - Math.min(yb, bottom(p)) > 0.8) parts.push(toward > 0 ? member(at(p, off, top), at(s, off, yb), 0.3, 0.3, c.colours.steel) : member(at(p, off, bottom(p)), at(s, off, top), 0.3, 0.3, c.colours.steel));
      }
    }
    // Cross girders under the deck at the piers and the suspended span's ends.
    for (const s of [s0, s1, m0, m1]) parts.push(member(at(s, -half, top - 0.3), at(s, half, top - 0.3), 0.5, 0.6, c.colours.steel));
    // The stone piers at the water's edge on each bank.
    for (const s of [s0, s1]) {
      const [px, , pz] = at(s, 0, 0);
      parts.push(slab(px - ux * 2, pz - uz * 2, px + ux * 2, pz + uz * 2, b.width + 2, Math.min(ground(px, pz), 0) - 2, footY(s), c.colours.stone));
    }
  } else if (b.pylons) {
    // A cable-stayed main span (the Köhlbrandbrücke): an A-frame pylon at each edge of the
    // water, `pylons` m high, its legs from the river bank either side of the deck to a head
    // over its middle; fans of stays from each head to both deck edges, out over the main
    // span and back over the approach; the main span free of piers, the approaches on piers
    // every `approachSpan` m down to the ground. A design of the game's own to the map's line.
    const k = c.cableStayed;
    for (const side of [-1, 1]) parts.push(member(at(0, side * (half - 0.6), deck - c.deckDepth - 0.6), at(L, side * (half - 0.6), deck - c.deckDepth - 0.6), 0.6, 1.2, c.colours.steel));
    const main = s1 - s0;
    for (const sp of [s0, s1]) {
      const foot = footY(sp);
      const head = b.pylons;
      for (const side of [-1, 1]) parts.push(member(at(sp, side * (half + k.legOut), foot - 2), at(sp, side * k.headHalf, head), k.leg, k.leg, k.colour));
      // The cross beam carrying the deck, and the tie at the head.
      parts.push(member(at(sp, -(half + k.legOut * 0.7), deck - c.deckDepth - 1.5), at(sp, half + k.legOut * 0.7, deck - c.deckDepth - 1.5), k.leg, 2, k.colour));
      parts.push(member(at(sp, -k.headHalf - 1, head - 4), at(sp, k.headHalf + 1, head - 4), k.leg, 3, k.colour));
      // The stays: `stays` a side of each fan, from the head's anchorage down to each deck edge.
      const toMiddle = sp === s0 ? 1 : -1;
      for (let i = 1; i <= k.stays; i++) {
        const y = head - 6 - (i - 1) * k.anchorStep;
        const reach = (main / 2 - 8) * (i / k.stays);
        for (const dir of [toMiddle, -toMiddle]) {
          const sd = Math.max(0, Math.min(L, sp + dir * reach));
          for (const side of [-1, 1]) parts.push(member(at(sp, side * k.headHalf, y), at(sd, side * (half - 0.4), deck), k.stay, k.stay, k.stayColour));
        }
      }
    }
    // The approaches' piers (none in the main span), from the ground up to the girders.
    for (let s = k.approachSpan; s < L - 5; s += k.approachSpan) {
      if (s > s0 - k.approachSpan / 2 && s < s1 + k.approachSpan / 2) continue;
      const [px, , pz] = at(s, 0, 0);
      parts.push(slab(px - ux * 1.5, pz - uz * 1.5, px + ux * 1.5, pz + uz * 1.5, b.width * 0.6, ground(px, pz) - 1, deck - c.deckDepth - 1.2, k.colour));
    }
  } else {
    // A beam bridge: girders under the deck, piers to the seabed every `beamSpan` m over the water.
    for (const side of [-1, 1]) parts.push(member(at(0, side * (half - 0.6), deck - c.deckDepth - 0.6), at(L, side * (half - 0.6), deck - c.deckDepth - 0.6), 0.6, 1.2, c.colours.steel));
    const n = Math.max(1, Math.round((s1 - s0) / c.beamSpan));
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      const [px, , pz] = at(s, 0, 0);
      parts.push(slab(px - ux, pz - uz, px + ux, pz + uz, b.width * 0.7, ground(px, pz) - 1, deck - c.deckDepth - 1.2, c.colours.stone));
    }
  }
  // The abutments: stone from the ground up to the deck at each end.
  for (const s of [0, L]) {
    const [px, , pz] = at(s, 0, 0);
    parts.push(slab(px - ux * 3, pz - uz * 3, px + ux * 3, pz + uz * 3, b.width + 1.5, ground(px, pz) - 2, deck - c.deckDepth, c.colours.stone));
  }
  return parts;
}

/** A folly's parts: a ring of arches in two tiers along its footprint. */
export function follyParts(f: FollyDef): THREE.BufferGeometry[] {
  const c = CONFIG.structures.folly;
  const ring = f.outline;
  const H = f.height ?? c.height;
  const y0 = f.base;
  // The tiers: each an opening from its sill to its band; the cornice over the top.
  const tier = (H - c.cornice) / c.tiers;
  const parts: THREE.BufferGeometry[] = [];
  // Round the outline, a pier every `bay` m (measured along it).
  const pts: [number, number][] = [];
  for (let i = 1; i < ring.length; i++) {
    const [ax, az] = ring[i - 1];
    const [bx, bz] = ring[i];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / c.bay));
    for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.1) continue;
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    // The pier at this point (its share of the bay), full height.
    const pw = Math.min(c.pier, len * 0.45);
    parts.push(slab(ax - (ux * pw) / 2, az - (uz * pw) / 2, ax + (ux * pw) / 2, az + (uz * pw) / 2, c.thick, y0 - 2, y0 + H, c.colours.wall));
    // Over each tier's opening: its band (the arch's head, squared off at this size).
    for (let t = 0; t < c.tiers; t++) {
      const top = y0 + (t + 1) * tier;
      parts.push(slab(ax, az, bx, bz, c.thick, top - c.band, top, c.colours.wall));
      // The sill wall under the lower tier's openings.
      if (t === 0) parts.push(slab(ax, az, bx, bz, c.thick, y0 - 2, y0 + c.sill, c.colours.wall));
    }
    parts.push(slab(ax, az, bx, bz, c.thick + 0.3, y0 + H - c.cornice, y0 + H, c.colours.cornice));
  }
  return parts;
}

/**
 * A landmark modelled from the map's own 3D building parts (Hamburg's Elbphilharmonie and main
 * churches; features.ts): each part its footprint, walled from `min` up to its eaves and roofed
 * to `height` in the shape the map gives:
 *   flat              a flat top;
 *   pyramidal         to a point over the footprint's middle (a spire, a tower's cap);
 *   dome, round       in `domeRings` rings, a quarter circle in section;
 *   onion             a bulb, swelling past the walls then drawing in to a point;
 *   gabled            on a four-sided footprint, a ridge along its long sides with gable ends;
 *   skillion          a single slope across its long side;
 *   anything else     (hipped, mansard, gambrel...) a hip: drawn in to a ridge-like top.
 * In the map's colours, else its material's (CONFIG.structures.landmark.material). `crown:
 * 'wave'` crests the tallest part's top in waves along its length (the Elbphilharmonie's roof,
 * which the map can't describe), its glass walls rising to meet each crest.
 */
export function landmarkModelParts(m: LandmarkModelDef): THREE.BufferGeometry[] {
  const c = CONFIG.structures.landmark;
  const out: THREE.BufferGeometry[] = [];
  const tallest = m.parts.reduce((a, p) => (p.height > a.height ? p : a), m.parts[0]);
  // A crown spans the building's whole footprint (the widest part reaching into the tallest's
  // height); the parts inside its height range are inside it, and aren't drawn.
  const area = (r: [number, number][]) => Math.abs(r.reduce((t, q, i) => t + q[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * q[1], 0)) / 2;
  const crowned = m.crown === 'wave';
  const crownRing = crowned ? m.parts.filter((p) => p.height > tallest.min).reduce((a, p) => (area(p.outline) > area(a) ? p.outline : a), tallest.outline) : null;
  for (const p of m.parts) {
    if (crowned && p !== tallest && p.min >= tallest.min - 5 && p.height <= tallest.height) continue;
    const ring = p.outline.slice();
    if (ring.length > 2 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 0.05) ring.pop();
    if (ring.length < 3 || p.height <= p.min) continue;
    const mat = c.material[p.material as keyof typeof c.material];
    const wall = p.wall ?? mat ?? c.wall;
    const roofCol = p.roofColour ?? (p.material === 'copper' ? c.material.copper : c.roof);
    const y0 = m.base + p.min;
    const top = m.base + p.height;
    const [cx, cz] = [ring.reduce((t, q) => t + q[0], 0) / ring.length, ring.reduce((t, q) => t + q[1], 0) / ring.length];
    const span = Math.max(...ring.map(([x, z]) => Math.hypot(x - cx, z - cz))) * 2;
    if (crowned && p === tallest) {
      const cr = crownRing!.slice();
      if (Math.hypot(cr[0][0] - cr[cr.length - 1][0], cr[0][1] - cr[cr.length - 1][1]) < 0.05) cr.pop();
      out.push(...waveCrown(cr, y0, top, wall, c.crownRoof, c.wave));
      continue;
    }
    if (m.lean) {
      out.push(leaningBlock(ring, y0, top, m.lean, m.leanBearing ?? 0, wall, roofCol));
      continue;
    }
    const shape = p.roof === 'round' ? 'dome' : p.roof;
    const deflt = shape === 'flat' ? 0 : shape === 'pyramidal' ? span * 1.2 : shape === 'dome' || shape === 'onion' ? span * 0.5 : span * 0.35;
    const rh = Math.min(p.roofHeight ?? deflt, p.height - p.min);
    const eaves = top - rh;
    // The walls (up to the eaves), turned to face out.
    if (eaves - y0 > 0.05) out.push(walls(ring, ring.map(() => y0), ring.map(() => eaves), wall));
    if (rh < 0.05 || shape === 'flat') {
      out.push(cap(ring, ring.map(() => eaves), roofCol));
      continue;
    }
    if (shape === 'skillion') {
      const u = axisOf(ring);
      out.push(walls(ring, ring.map(() => eaves), ring.map(([x, z]) => eaves + rh * u(x, z)), wall));
      out.push(cap(ring, ring.map(([x, z]) => eaves + rh * u(x, z)), roofCol));
      continue;
    }
    if (shape === 'gabled' && ring.length === 4) {
      out.push(...gable(ring, eaves, top, roofCol, wall));
      continue;
    }
    // Ringed roofs: each profile step a ring scaled toward the middle at a share of the roof's height.
    const profile = shape === 'pyramidal' ? c.profiles.pyramidal : shape === 'dome' ? c.profiles.dome : shape === 'onion' ? c.profiles.onion : c.profiles.hip;
    out.push(ringed(ring, cx, cz, eaves, rh, profile, roofCol));
  }
  return out;
}

/**
 * A block leaning `lean` m at its top toward `bearing` (deg): a parallelogram in elevation
 * (the Dockland). Its footprint's box along the lean: the ground floor the back part of it,
 * the roof the front part, the two ends slanting between, the sides parallelograms.
 */
function leaningBlock(ring: [number, number][], y0: number, top: number, lean: number, bearing: number, wall: number, roof: number): THREE.BufferGeometry {
  const b = (bearing * Math.PI) / 180;
  const [dx, dz] = [Math.sin(b), -Math.cos(b)];
  const along = ring.map(([x, z]) => x * dx + z * dz);
  const across = ring.map(([x, z]) => -x * dz + z * dx);
  const [a0, a1, c0, c1] = [Math.min(...along), Math.max(...along), Math.min(...across), Math.max(...across)];
  const L = Math.min(lean, (a1 - a0) * 0.6);
  const at = (a: number, c: number, y: number) => [a * dx - c * dz, y, a * dz + c * dx];
  const bot = [at(a0, c0, y0), at(a1 - L, c0, y0), at(a1 - L, c1, y0), at(a0, c1, y0)];
  const up = [at(a0 + L, c0, top), at(a1, c0, top), at(a1, c1, top), at(a0 + L, c1, top)];
  const tris: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tris.push([...bot[i], ...bot[j], ...up[j]], [...bot[i], ...up[j], ...up[i]]);
  }
  const mid = at((a0 + a1) / 2, (c0 + c1) / 2, (y0 + top) / 2);
  const walls = faces(tris, wall, (x, y, z) => [x - mid[0], 0.0001 * (y - mid[1]), z - mid[2]]);
  return mergeParts([walls, faces([[...up[0], ...up[1], ...up[2]], [...up[0], ...up[2], ...up[3]]], roof, () => [0, 1, 0])]);
}

/** Triangles (non-indexed) of one colour, each turned so its face points away from `from` (or up, for a cap). */
function faces(tris: number[][], color: number, from: (cx: number, cy: number, cz: number) => [number, number, number]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const [ax, ay, az, bx, by, bz, qx, qy, qz] of tris) {
    // The face's normal (b - a) x (c - a); against the way out, swap two corners.
    const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, qx - ax, qy - ay, qz - az];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const [ox, oy, oz] = from((ax + bx + qx) / 3, (ay + by + qy) / 3, (az + bz + qz) / 3);
    if (n[0] * ox + n[1] * oy + n[2] * oz < 0) pos.push(ax, ay, az, qx, qy, qz, bx, by, bz);
    else pos.push(ax, ay, az, bx, by, bz, qx, qy, qz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return part(g, color);
}

/** A footprint's walls from `low[i]` to `high[i]` at each corner, facing out (by the footprint's winding). */
function walls(ring: [number, number][], low: number[], high: number[], color: number): THREE.BufferGeometry {
  const n = ring.length;
  // Shoelace in x, z: positive when the footprint runs one way round; outward is to the right of each edge then.
  const sgn = ring.reduce((t, q, i) => t + q[0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * q[1], 0) > 0 ? 1 : -1;
  const tris: number[][] = [];
  const outward: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ax, az] = ring[i];
    const [bx, bz] = ring[j];
    const o: [number, number, number] = [sgn * (bz - az), 0, -sgn * (bx - ax)];
    tris.push([ax, low[i], az, bx, low[j], bz, bx, high[j], bz], [ax, low[i], az, bx, high[j], bz, ax, high[i], az]);
    outward.push(o, o);
  }
  let k = 0;
  return faces(tris, color, () => outward[k++]);
}

/** A footprint's top at `ys[i]` at each corner, facing up. */
function cap(ring: [number, number][], ys: number[], color: number): THREE.BufferGeometry {
  const idx = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
  return faces(idx.map(([a, b, q]) => [ring[a][0], ys[a], ring[a][1], ring[b][0], ys[b], ring[b][1], ring[q][0], ys[q], ring[q][1]]), color, () => [0, 1, 0]);
}

/** Where each corner lies along the footprint's longest edge, 0 at one end to 1 at the other. */
function axisOf(ring: [number, number][]): (x: number, z: number) => number {
  let d = [1, 0];
  let best = 0;
  ring.forEach((q, i) => {
    const r = ring[(i + 1) % ring.length];
    const l = Math.hypot(r[0] - q[0], r[1] - q[1]);
    if (l > best) [best, d] = [l, [(r[0] - q[0]) / l, (r[1] - q[1]) / l]];
  });
  const along = ring.map(([x, z]) => x * d[0] + z * d[1]);
  const [a0, a1] = [Math.min(...along), Math.max(...along)];
  return (x, z) => (x * d[0] + z * d[1] - a0) / Math.max(0.01, a1 - a0);
}

/** A roof drawn in rings: `profile` [share of the ring's size, share of the roof's height] from the eaves up. */
function ringed(ring: [number, number][], cx: number, cz: number, eaves: number, rh: number, profile: readonly (readonly [number, number])[], color: number): THREE.BufferGeometry {
  const tris: number[][] = [];
  const ringAt = (k: number) => ring.map(([x, z]) => [cx + (x - cx) * profile[k][0], eaves + rh * profile[k][1], cz + (z - cz) * profile[k][0]]);
  for (let k = 1; k < profile.length; k++) {
    const [lo, hi] = [ringAt(k - 1), ringAt(k)];
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      tris.push([...lo[i], ...lo[j], ...hi[j]]);
      if (profile[k][0] > 0.001) tris.push([...lo[i], ...hi[j], ...hi[i]]);
    }
  }
  // A top ring left open (a hip's ridge-like top) is closed flat.
  const last = profile[profile.length - 1];
  if (last[0] > 0.001) {
    const topRing = ringAt(profile.length - 1);
    for (const [a, b, q] of THREE.ShapeUtils.triangulateShape(topRing.map(([x, , z]) => new THREE.Vector2(x, z)), [])) tris.push([...topRing[a], ...topRing[b], ...topRing[q]]);
  }
  // Out from the roof's axis (a point well below its middle sees every face from inside).
  const below = eaves - rh * 2 - 10;
  return faces(tris, color, (x, y, z) => [x - cx, y - below, z - cz]);
}

/** A gable roof on a four-sided footprint: the ridge along its long sides, the gable ends in the walls' colour. */
function gable(ring: [number, number][], eaves: number, top: number, roofCol: number, wallCol: number): THREE.BufferGeometry[] {
  const [p0, p1, p2, p3] = ring;
  const long01 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  // The ridge runs between the midpoints of the two short sides.
  const [a, b, q, d] = long01 ? [p0, p1, p2, p3] : [p1, p2, p3, p0];
  const r1: [number, number] = [(b[0] + q[0]) / 2, (b[1] + q[1]) / 2];
  const r2: [number, number] = [(d[0] + a[0]) / 2, (d[1] + a[1]) / 2];
  const [cx, cz] = [(r1[0] + r2[0]) / 2, (r1[1] + r2[1]) / 2];
  const v = (pt: [number, number], y: number) => [pt[0], y, pt[1]];
  const below = eaves - (top - eaves) * 2 - 10;
  const away = (x: number, y: number, z: number): [number, number, number] => [x - cx, y - below, z - cz];
  const slopes = faces([[...v(a, eaves), ...v(b, eaves), ...v(r1, top)], [...v(a, eaves), ...v(r1, top), ...v(r2, top)], [...v(q, eaves), ...v(d, eaves), ...v(r2, top)], [...v(q, eaves), ...v(r2, top), ...v(r1, top)]], roofCol, away);
  const ends = faces([[...v(b, eaves), ...v(q, eaves), ...v(r1, top)], [...v(d, eaves), ...v(a, eaves), ...v(r2, top)]], wallCol, away);
  return [slopes, ends];
}

/**
 * The wave crown: the part's top cresting in `waves` waves along its length, `depth` m from
 * crest to trough. Built in strips across the part (a section every `step` m along it, from
 * one side of the footprint to the other), so each crest is a clean fold, and the walls rise
 * to the same line.
 */
function waveCrown(ring: [number, number][], y0: number, top: number, wallCol: number, roofCol: number, w: { waves: number; depth: number; step: number }): THREE.BufferGeometry[] {
  // The footprint's long axis (its longest edge) and the way across it.
  let d = [1, 0];
  let best = 0;
  ring.forEach((q, i) => {
    const r = ring[(i + 1) % ring.length];
    const l = Math.hypot(r[0] - q[0], r[1] - q[1]);
    if (l > best) [best, d] = [l, [(r[0] - q[0]) / l, (r[1] - q[1]) / l]];
  });
  const along = (x: number, z: number) => x * d[0] + z * d[1];
  const across = (x: number, z: number) => -x * d[1] + z * d[0];
  const as = ring.map(([x, z]) => along(x, z));
  const [a0, a1] = [Math.min(...as), Math.max(...as)];
  const height = (a: number) => top - (w.depth * (1 - Math.cos((2 * Math.PI * w.waves * (a - a0)) / Math.max(0.01, a1 - a0)))) / 2;
  const back = (a: number, c: number): [number, number] => [a * d[0] - c * d[1], a * d[1] + c * d[0]];
  // Each section: where a line across at `a` enters and leaves the footprint.
  const section = (a: number): [number, number] => {
    let lo = Infinity;
    let hi = -Infinity;
    ring.forEach((q, i) => {
      const r = ring[(i + 1) % ring.length];
      const [qa, ra] = [along(q[0], q[1]), along(r[0], r[1])];
      if ((qa - a) * (ra - a) > 0 || qa === ra) return;
      const t = (a - qa) / (ra - qa);
      const c = across(q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t);
      [lo, hi] = [Math.min(lo, c), Math.max(hi, c)];
    });
    return [lo, hi];
  };
  const n = Math.max(2, Math.ceil((a1 - a0) / w.step));
  const tris: number[][] = [];
  for (let k = 0; k < n; k++) {
    const [p, q] = [a0 + ((a1 - a0) * k) / n + 0.01, a0 + ((a1 - a0) * (k + 1)) / n - 0.01];
    const [sp, sq] = [section(p), section(q)];
    if (!Number.isFinite(sp[0]) || !Number.isFinite(sq[0])) continue;
    const [yp, yq] = [height(p), height(q)];
    const P0 = back(p, sp[0]);
    const P1 = back(p, sp[1]);
    const Q0 = back(q, sq[0]);
    const Q1 = back(q, sq[1]);
    tris.push([P0[0], yp, P0[1], P1[0], yp, P1[1], Q1[0], yq, Q1[1]], [P0[0], yp, P0[1], Q1[0], yq, Q1[1], Q0[0], yq, Q0[1]]);
  }
  const roof = faces(tris, roofCol, () => [0, 1, 0]);
  // The walls: corners every `step` m round it, rising to the crest line.
  const pts: [number, number][] = [];
  ring.forEach((q, i) => {
    const r = ring[(i + 1) % ring.length];
    const m = Math.max(1, Math.ceil(Math.hypot(r[0] - q[0], r[1] - q[1]) / w.step));
    for (let k = 0; k < m; k++) pts.push([q[0] + ((r[0] - q[0]) * k) / m, q[1] + ((r[1] - q[1]) * k) / m]);
  });
  return [walls(pts, pts.map(() => y0), pts.map(([x, z]) => height(along(x, z))), wallCol), roof];
}

/**
 * Block capitals as strokes on a 4 by 6 grid (x along, y up), for a sign: the letters the
 * yards' signs need so far; any other character is a space.
 */
const STROKES: Record<string, [number, number, number, number][]> = {
  A: [[0, 0, 2, 6], [2, 6, 4, 0], [1, 2.5, 3, 2.5]],
  E: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3], [0, 0, 4, 0]],
  K: [[0, 0, 0, 6], [4, 6, 0, 2.5], [1.3, 3.5, 4, 0]],
  M: [[0, 0, 0, 6], [0, 6, 2, 3], [2, 3, 4, 6], [4, 6, 4, 0]],
  N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  O: [[0, 1, 0, 5], [0, 5, 1, 6], [1, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 1], [4, 1, 3, 0], [3, 0, 1, 0], [1, 0, 0, 1]],
  R: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3], [2, 3, 4, 0]],
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  U: [[0, 6, 0, 1], [0, 1, 1, 0], [1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 6]],
  Y: [[0, 6, 2, 3], [4, 6, 2, 3], [2, 3, 2, 0]],
};

/**
 * A sign's letters as flat strokes standing proud of a face: centred at `centre`, reading along
 * `right` (unit, horizontal), facing out along `normal`, `height` m tall.
 */
function signParts(text: string, centre: V3, right: THREE.Vector3, normal: THREE.Vector3, height: number, color: number): THREE.BufferGeometry[] {
  const unit = height / 6;
  const advance = 5.4 * unit;
  const stroke = Math.max(0.3, unit * 0.85);
  const parts: THREE.BufferGeometry[] = [];
  const width = text.length * advance - 1.4 * unit;
  const up = new THREE.Vector3(0, 1, 0);
  const o = new THREE.Vector3(...centre).addScaledVector(right, -width / 2).addScaledVector(up, -height / 2).addScaledVector(normal, 0.3);
  [...text.toUpperCase()].forEach((ch, i) => {
    for (const [x0, y0, x1, y1] of STROKES[ch] ?? []) {
      const p = o.clone().addScaledVector(right, i * advance + x0 * unit).addScaledVector(up, y0 * unit);
      const q = o.clone().addScaledVector(right, i * advance + x1 * unit).addScaledVector(up, y1 * unit);
      const along = new THREE.Vector3().subVectors(q, p);
      const len = along.length() + stroke;
      along.normalize();
      const across = new THREE.Vector3().crossVectors(normal, along).normalize();
      // A flat panel just proud of the face (only its front is ever seen): two triangles a stroke.
      const g = new THREE.PlaneGeometry(len, stroke);
      g.applyMatrix4(new THREE.Matrix4().makeBasis(along, across, normal));
      g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
      parts.push(part(g, color));
    }
  });
  return parts;
}

/** A gantry track's parts: its rails, and each of its gantries where it stands along them. */
export function gantryParts(g: GantryDef): THREE.BufferGeometry[] {
  const c = CONFIG.structures.gantry;
  const k = c.colours;
  // Drawn to its own size: a goliath of `fullSpan` m between the rails or more full size (Perno),
  // a smaller one (a container yard's stacking crane, 40 m) scaled down by its span, everything
  // but the rails; under `bareBelow` of full size, without the goliath's T-crane on top.
  const m = Math.min(1, g.span / c.fullSpan);
  const goliath = m >= c.bareBelow;
  const a = (g.yawDeg * Math.PI) / 180;
  // Along the track (u) and across it (v), from its middle.
  const [ux, uz, vx, vz] = [Math.sin(a), -Math.cos(a), Math.cos(a), Math.sin(a)];
  const at = (s: number, w: number, y: number): V3 => [g.x + ux * s + vx * w, y, g.z + uz * s + vz * w];
  const y0 = g.base;
  const [girderDepth, girderWidth, leg, legBase] = [c.girderDepth * m, c.girderWidth * m, c.leg * m, c.legBase * m];
  const H = y0 + c.height * m;
  const half = g.span / 2;
  const parts: THREE.BufferGeometry[] = [];
  // The rails, two on each side, the track's length.
  for (const side of [-1, 1]) for (const d of [-1.2, 1.2]) parts.push(member(at(-g.length / 2, side * half + d, y0 + 0.3), at(g.length / 2, side * half + d, y0 + 0.3), 0.8, 0.6, k.rail));
  const shares = c.at[Math.min(g.count, c.at.length) - 1];
  for (const f of shares) {
    const s = (f - 0.5) * g.length;
    const top = H - girderDepth;
    // The girder, a little past the legs each side.
    parts.push(member(at(s, -half - 6 * m, H - girderDepth / 2), at(s, half + 6 * m, H - girderDepth / 2), girderWidth, girderDepth, k.frame));
    for (const side of [-1, 1]) {
      const w = side * half;
      // The A-frame: two legs from their feet, spread along the rails, to the girder.
      for (const e of [-1, 1]) {
        parts.push(member(at(s + (e * legBase) / 2, w, y0 + 3 * m), at(s + e * (girderWidth / 2 - leg / 2), w, top + 0.5 * m), leg, leg, k.frame));
        // Its bogie on the rails.
        parts.push(member(at(s + (e * legBase) / 2 - 6 * m, w, y0 + 1.5 * m), at(s + (e * legBase) / 2 + 6 * m, w, y0 + 1.5 * m), 4.5 * m, 3 * m, k.dark));
      }
      // A tie across the A-frame at a third of its height.
      const ty = y0 + (top - y0) / 3;
      const tw = (legBase / 2) * (2 / 3) + (girderWidth / 2) * (1 / 3);
      parts.push(member(at(s - tw, w, ty), at(s + tw, w, ty), 2 * m, 2 * m, k.frame));
    }
    // Its sign along the girder, on both faces, a little to one side of the middle (owner).
    if (g.sign && goliath) {
      for (const f of [-1, 1]) {
        const normal = new THREE.Vector3(ux * f, 0, uz * f);
        // Reading left to right for someone facing the face: right = (-normal) x up.
        const right = new THREE.Vector3().crossVectors(normal.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
        const mid = at(s + (f * girderWidth) / 2, -half * 0.12, H - girderDepth / 2);
        parts.push(...signParts(g.sign, mid, right, normal, c.signHeight * m, k.sign));
      }
    }
    // The cab trolley riding on the girder, and the hoist trolley under it with its ropes and hook block.
    parts.push(member(at(s, -half * 0.45 - 7 * m, H + 3 * m), at(s, -half * 0.45 + 7 * m, H + 3 * m), girderWidth + 2 * m, 6 * m, k.trolley));
    const hw = half * 0.15;
    parts.push(member(at(s, hw - 5 * m, top - 3 * m), at(s, hw + 5 * m, top - 3 * m), girderWidth + m, 6 * m, k.trolley));
    for (const [ds, dw] of [[-2, -3], [2, -3], [-2, 3], [2, 3]]) parts.push(member(at(s + ds * m, hw + dw * m, top - 6 * m), at(s + ds * m, hw + dw * m, top - (6 + c.hoist) * m), 0.25, 0.25, k.dark));
    parts.push(member(at(s, hw - 4 * m, top - (7 + c.hoist) * m), at(s, hw + 4 * m, top - (7 + c.hoist) * m), 4 * m, 2.5 * m, k.trolley));
    // The T-crane on top of the far leg: its mast and its jib across the girder (a goliath's).
    if (goliath) {
      const mw = half - 3;
      parts.push(member(at(s, mw, H), at(s, mw, H + c.mast), 1.8, 1.8, k.trolley));
      parts.push(member(at(s, mw - c.jib * 0.75, H + c.mast + 1), at(s, mw + c.jib * 0.25, H + c.mast + 1), 2, 2.5, k.trolley));
    }
  }
  return parts;
}

/** A small, steady hash of numbers (0 to 1): a yard ship's blocks, the same each time. */
function hash01(...k: number[]): number {
  let h = 2166136261;
  for (const v of k) h = Math.imul(h ^ Math.round(v * 97), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** A yard ship's half-breadth (m) at `u` m from her middle (forward +): a parallel body, a full bow over its last `bowLength` of her, the stern's corners rounded. */
function halfBreadth(L: number, B: number, u: number): number {
  const c = CONFIG.structures.yardShip;
  const bow = L / 2 - c.bowLength * L;
  if (u > bow) return (B / 2) * Math.max(0, 1 - ((u - bow) / (c.bowLength * L)) ** c.bowFullness);
  const fromStern = u + L / 2;
  return (B / 2) * (fromStern < 8 ? 0.88 + (0.12 * fromStern) / 8 : 1);
}

/**
 * A prism from y0 to y1 over a plan ring (ship-frame (u, v) points, round in order), its walls
 * and its top, each face turned outward; `w(u, v, y)` places a ship point in the world.
 */
function prism(ring: [number, number][], y0: number, y1: number, w: (u: number, v: number, y: number) => V3, color: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const cu = ring.reduce((t, p) => t + p[0], 0) / ring.length;
  const cv = ring.reduce((t, p) => t + p[1], 0) / ring.length;
  const centre = w(cu, cv, (y0 + y1) / 2);
  const tri = (a: V3, b: V3, c: V3, out: V3) => {
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)));
    if (n.dot(new THREE.Vector3(...out)) < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
  };
  for (let i = 0; i < ring.length; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
    const [a0, b0, a1, b1] = [w(a[0], a[1], y0), w(b[0], b[1], y0), w(a[0], a[1], y1), w(b[0], b[1], y1)];
    const mid = w((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (y0 + y1) / 2);
    const out: V3 = [mid[0] - centre[0], 0, mid[2] - centre[2]];
    tri(a0, b0, b1, out);
    tri(a0, b1, a1, out);
  }
  const top = w(cu, cv, y1);
  for (let i = 0; i < ring.length; i++) tri(top, w(ring[i][0], ring[i][1], y1), w(ring[(i + 1) % ring.length][0], ring[(i + 1) % ring.length][1], y1), [0, 1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return part(g, color);
}

/** A yard ship's parts (stage 0 to 1: hull blocks, superstructure deck by deck, paint). */
export function yardShipParts(y: YardShipDef): THREE.BufferGeometry[] {
  const c = CONFIG.structures.yardShip;
  const k = c.colours;
  const a = (y.yawDeg * Math.PI) / 180;
  const [ux, uz, vx, vz] = [Math.sin(a), -Math.cos(a), Math.cos(a), Math.sin(a)];
  const w = (u: number, v: number, h: number): V3 => [y.x + ux * u + vx * v, h, y.z + uz * u + vz * v];
  const L = y.length;
  const B = y.beam;
  const parts: THREE.BufferGeometry[] = [];
  const keel = y.keel;
  // Her main deck: `hullDecks` decks over her keel (the Icon class: about 5 of her 20 in the hull).
  const main = keel + c.hullDecks * c.deck;
  // Her waterline: afloat, the sea's; in the dock, where it will be (her draught from the keel).
  const wl = keel < 0 ? 0 : keel + 8.5;
  // The plan between two stations, sampled along.
  // (Every 8 m in the fine bow; along the straight body only at the block's ends.)
  const bowStart = L / 2 - c.bowLength * L;
  const hull = (u: number) => halfBreadth(L, B, u);
  const slice = (u0: number, u1: number, scale = 1, half = hull): [number, number][] => {
    const us: number[] = [];
    for (let u = u0; u < u1; u += u >= bowStart - 8 ? 8 : Math.max(8, Math.min(u1, bowStart) - u)) us.push(u);
    us.push(u1);
    const side = us.map((u) => [u, -half(u) * scale] as [number, number]);
    const other = [...us].reverse().map((u) => [u, half(u) * scale] as [number, number]);
    // (At the stem the two sides meet: one point.)
    return [...side, ...other.filter((p, i) => i > 0 || p[1] > 0.5)];
  };
  // A deck's front block: its front rounded in three facets (owner: "the front of the cruise
  // ships are curved ... three facets"): a flat middle face across the middle third of her,
  // and an angled face each side swept back `frontFacet` of her beam to her side.
  const front3 = (u0: number, u1: number, scale: number, width = hull): [number, number][] => {
    const back = u1 - c.frontFacet * B;
    if (back - u0 < 4) return slice(u0, u1, scale, width);
    const ring = slice(u0, back, scale, width);
    const half = width(back) * scale;
    // (The plan runs down one side to its end, then back up the other: the facets go between.)
    const turn = ring.findIndex((p) => p[1] > 0);
    return [...ring.slice(0, turn), [u1, -half / 3], [u1, half / 3], ...ring.slice(turn)];
  };
  // How far her blocks are built (all her decks once `stage` reaches 0.8), and whether she's
  // painted (the owner's ship at the outfitting pier: the dock ship's shape, in fresh paint).
  const finished = y.stage >= 0.8;
  const painted = y.painted ?? finished;
  // The hull: her bottom red to the waterline; above it, finished, a blue band then white to
  // the main deck; painted, blue to it; or,
  // earlier, block by block in primer grey, light grey or white (a few already painted blue).
  const blocks = Math.ceil(L / c.block);
  for (let b = 0; b < blocks; b++) {
    const u0 = -L / 2 + b * c.block;
    const u1 = Math.min(L / 2 - 0.5, u0 + c.block);
    if (u1 - u0 < 1) continue;
    const ring = slice(u0, u1);
    parts.push(prism(ring, keel, wl, w, k.red));
    if (finished) {
      // Her blue band most of her freeboard, a strip of white above it.
      const band = wl + (main - wl) * c.band;
      parts.push(prism(ring, wl, band, w, k.hull));
      parts.push(prism(ring, band, main, w, k.white));
    } else if (painted) parts.push(prism(ring, wl, main, w, k.hull));
    else {
      const mid = (wl + main) / 2;
      for (const [y0, y1, t] of [[wl, mid, 2], [mid, main, 3]] as [number, number, number][]) {
        const r = hash01(y.seed, b, t);
        parts.push(prism(ring, y0, y1, w, r < 0.4 ? k.primer : r < 0.7 ? k.light : r < 0.9 ? k.white : k.hull));
      }
    }
  }
  // The superstructure, deck by deck. Its front rakes back a little a deck; aft it steps
  // forward in terraces. Finished, every deck the length of it; earlier, built up in
  // blocks along her, each its own height (what's been lifted on so far).
  const sAft = -L / 2 + c.aft * L;
  const sFore = -L / 2 + c.fore * L;
  const blockDecks = (u: number) => (finished ? c.decks : Math.floor(c.decks * Math.min(1, Math.max(0, y.stage * 1.8 - 0.3 + (hash01(y.seed, Math.floor(u / c.block), 7) - 0.5) * 0.9))));
  for (let d = 0; d < c.decks; d++) {
    const y0 = main + d * c.deck;
    const front = sFore - d * c.rake;
    const back = sAft + Math.floor(d / c.terrace) * c.terraceStep * (d > c.decks / 2 ? 1.6 : 1);
    if (front - back < 20) break;
    const narrow = d >= c.decks - 3 ? 0.78 : 0.97;
    // Above her lifeboats her decks overhang the hull (`superWidth`), as on the big ships of
    // today, narrowing with the bow under them; below, the hull's width.
    const width = d >= c.overhangFrom ? (u: number) => hull(u) * c.superWidth : hull;
    // Along her in blocks, those this high so far (finished: the deck the length of her).
    for (let u0 = back; u0 < front - 1; u0 += finished ? front - back : c.block) {
      const u1 = finished ? front : Math.min(front, u0 + c.block);
      if (blockDecks(u0) <= d) continue;
      const plan = u1 >= front - 0.01 ? front3 : slice;
      const ring = plan(u0, u1, narrow, width);
      // Each deck a band of windows and balconies under its white (painted: no primer left).
      const primer = !painted && hash01(y.seed, u0, d) < 0.45;
      parts.push(prism(ring, y0, y0 + 0.7, w, primer ? k.primer : k.glass));
      parts.push(prism(plan(u0, u1, narrow * 0.985, width), y0 + 0.7, y0 + c.deck, w, primer ? k.light : k.white));
    }
  }
  if (finished) {
    const top = main + c.decks * c.deck;
    const bridgeDeck = main + (c.decks - 4) * c.deck;
    const bridgeU = sFore - (c.decks - 4) * c.rake;
    // The bridge across her, its wings out over her sides, its windows.
    const wing = (B / 2) * c.superWidth + 3;
    parts.push(member(w(bridgeU - 6, -wing, bridgeDeck + 1.5), w(bridgeU - 6, wing, bridgeDeck + 1.5), 9, 3, k.white));
    parts.push(member(w(bridgeU - 1.8, -wing, bridgeDeck + 2), w(bridgeU - 1.8, wing, bridgeDeck + 2), 1, 1.4, k.glass));
    // The funnel, a third of her length from the stern, raked aft.
    const fu = -L / 2 + 0.36 * L;
    parts.push(member(w(fu, 0, top - 2), w(fu - 6, 0, top + 16), 10, 18, k.funnel));
    parts.push(member(w(fu - 5.4, 0, top + 14.5), w(fu - 6.4, 0, top + 17), 10.5, 18.5, k.hull));
    // The water-park aft: slides in their colours twisting down from a tower, and a dome.
    const pu = sAft + Math.floor((c.decks - 1) / c.terrace) * c.terraceStep * 1.6 + 12;
    for (let i = 0; i < 5; i++) {
      const s0 = pu + (i % 2 ? 6 : -4);
      const side = (i - 2) * (B / 7);
      parts.push(member(w(s0, side, top + 10), w(s0 + 14, side * 1.4, top + 1), 1.6, 1.6, k.park[i % k.park.length]));
      parts.push(member(w(s0 + 14, side * 1.4, top + 1), w(s0 + 4, side * 0.6, top - 5), 1.6, 1.6, k.park[(i + 2) % k.park.length]));
    }
    parts.push(member(w(pu, 0, top), w(pu, 0, top + 11), 5, 5, k.white));
    parts.push(part(new THREE.SphereGeometry(7, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(...w(pu + 30, 0, top)), k.glass));
  }
  // Painted, her lifeboats along her sides, a little out from the hull, where her decks are up to them.
  if (painted) {
    // (Under the decks that overhang them.)
    const boatY = main + (c.overhangFrom - 1) * c.deck + 1;
    for (let u = -L / 2 + c.boatSpan[0] * L; u < -L / 2 + c.boatSpan[1] * L; u += c.boatEvery) {
      if (blockDecks(u) < 4) continue;
      for (const side of [-1, 1]) parts.push(member(w(u - 5.5, side * (B / 2 + 1.5), boatY), w(u + 5.5, side * (B / 2 + 1.5), boatY), 4, 3.2, k.boat));
    }
  }
  // The yard's luffing cranes along her: on the quay beside her (or the dock's side), each a
  // portal on rails, its slewing house and a jib raised over her.
  for (let i = 0; i < c.cranes; i++) {
    const u = (i / Math.max(1, c.cranes - 1) - 0.5) * L * 0.5;
    const side = B / 2 + 14;
    const g0 = Math.max(keel < 0 ? 2.4 : keel - 1, 0);
    for (const e of [-1, 1]) parts.push(member(w(u + e * 4, side - 4, g0), w(u + e * 2, side, g0 + 12), 1.2, 1.2, k.crane), member(w(u + e * 4, side + 4, g0), w(u + e * 2, side, g0 + 12), 1.2, 1.2, k.crane));
    parts.push(member(w(u, side, g0 + 12), w(u, side, g0 + 30), 2.4, 2.4, k.crane));
    parts.push(member(w(u - 3, side + 2, g0 + 30), w(u + 3, side + 2, g0 + 36), 5, 5, k.crane));
    parts.push(member(w(u, side, g0 + 34), w(u + 8 * (i % 2 ? 1 : -1), side - B * 0.9, g0 + 34 + B * 0.8), 1.5, 1.5, k.crane));
  }
  return parts;
}

/**
 * A museum ship moored for good (Hamburg's): designs of the game's own, to the map's hull
 * outline (length, beam, heading toward her bow), afloat at her draught.
 *   cargo   a 1960s cargo liner: forecastle and poop, a white hull over a red bottom, her
 *           superstructure in tiers amidships with her funnel, kingposts and derricks over
 *           her hatches fore and aft (the Cap San Diego);
 *   barque  a square-rigger: her hull in its colour with a white band, poop and forecastle,
 *           `masts` masts crossed with yards (the aftmost fore-and-aft, gaff and boom), her
 *           bowsprit and forestay (the Rickmer Rickmers, the Peking).
 * Drawing only, like the other structures. Settings in CONFIG.structures.museumShip.
 */
export function museumShipParts(sh: MuseumShipDef): THREE.BufferGeometry[] {
  const c = CONFIG.structures.museumShip;
  const a = (sh.yawDeg * Math.PI) / 180;
  const [ux, uz, vx, vz] = [Math.sin(a), -Math.cos(a), Math.cos(a), Math.sin(a)];
  const L = sh.length;
  const B = sh.beam;
  const P = (s: number, w: number): [number, number] => [sh.x + ux * s + vx * w, sh.z + uz * s + vz * w];
  const V = (s: number, w: number, y: number): V3 => [sh.x + ux * s + vx * w, y, sh.z + uz * s + vz * w];
  // Her half-breadth along her (t from -0.5 at the stern to 0.5 at the bow): a square-ish
  // stern, parallel middle body, a fine bow to a point.
  const hb = (t: number) => (B / 2) * (t < -0.42 ? 0.82 + (0.18 * (t + 0.5)) / 0.08 : t <= c.bowFrom ? 1 : Math.max(0, 1 - ((t - c.bowFrom) / (0.5 - c.bowFrom)) ** 1.8));
  const STEPS = [-0.5, -0.46, -0.42, -0.2, 0, c.bowFrom, 0.24, 0.31, 0.37, 0.42, 0.46, 0.49, 0.5];
  /** Her outline between t0 and t1, as a ring (starboard forward, port back). */
  const ringBetween = (t0: number, t1: number, shrink = 0): [number, number][] => {
    const ts = [t0, ...STEPS.filter((t) => t > t0 && t < t1), t1];
    const ring = [...ts.map((t) => P(t * L, Math.max(0, hb(t) - shrink))), ...ts.reverse().map((t) => P(t * L, -Math.max(0, hb(t) - shrink)))];
    return ring.filter((q, i) => i === 0 || Math.hypot(q[0] - ring[i - 1][0], q[1] - ring[i - 1][1]) > 0.05);
  };
  const d = sh.design === 'barque' ? c.barque : c.cargo;
  const hull = sh.hull ?? d.colours.hull;
  const parts: THREE.BufferGeometry[] = [];
  const band = (ring: [number, number][], y0: number, y1: number, col: number) => parts.push(walls(ring, ring.map(() => y0), ring.map(() => y1), col));
  const whole = ringBetween(-0.5, 0.5);
  // The hull in bands: red below the waterline, her colour (a white band on a barque), the deck.
  band(whole, -d.draught, c.boot, d.colours.boot);
  if (sh.design === 'barque') {
    band(whole, c.boot, d.freeboard - c.barque.band[1], hull);
    band(whole, d.freeboard - c.barque.band[1], d.freeboard - c.barque.band[0], c.barque.colours.band);
    band(whole, d.freeboard - c.barque.band[0], d.freeboard, hull);
  } else band(whole, c.boot, d.freeboard, hull);
  parts.push(cap(whole, whole.map(() => d.freeboard), d.colours.deck));
  // Forecastle and poop: raised decks at the ends.
  const fc = ringBetween(d.forecastle[0], 0.5);
  band(fc, d.freeboard, d.freeboard + d.forecastle[1], hull);
  parts.push(cap(fc, fc.map(() => d.freeboard + d.forecastle[1]), d.colours.deck));
  const pp = ringBetween(-0.5, d.poop[0]);
  band(pp, d.freeboard, d.freeboard + d.poop[1], hull);
  parts.push(cap(pp, pp.map(() => d.freeboard + d.poop[1]), d.colours.deck));
  const deck = d.freeboard;
  const box = (s0: number, s1: number, half: number, y0: number, y1: number, col: number) => parts.push(slab(...P(s0, 0), ...P(s1, 0), half * 2, y0, y1, col));
  if (sh.design !== 'barque') {
    const k = c.cargo;
    // The superstructure in tiers, each set in and stepped back; the bridge wings across her on top.
    let y = deck;
    k.tiers.forEach(([inset, back], i) => {
      const s0 = k.house[0] * L + back;
      const s1 = k.house[1] * L - back * 0.3;
      box(s0, s1, B / 2 - inset, y, y + k.tier, k.colours.house);
      y += k.tier;
      if (i === k.tiers.length - 1) box(s1 - 3, s1 - 1, B / 2 + 0.4, y - k.tier + 0.6, y - 0.6, k.colours.house);
    });
    // Her funnel, white with its red top.
    const fs = k.funnel[0] * L;
    box(fs - k.funnel[1] / 2, fs + k.funnel[1] / 2, k.funnel[2] / 2, y, y + k.funnel[3] - 2.5, k.colours.house);
    box(fs - k.funnel[1] / 2, fs + k.funnel[1] / 2, k.funnel[2] / 2, y + k.funnel[3] - 2.5, y + k.funnel[3], k.colours.funnelTop);
    // Hatches, and the kingposts (a pair each) with their derricks leaning over them.
    for (const t of k.hatches) box(t * L - L * 0.035, t * L + L * 0.035, B * 0.28, deck, deck + 1.3, k.colours.hatch);
    for (const t of k.kingposts) {
      for (const w of [-k.postApart / 2, k.postApart / 2]) {
        parts.push(member(V(t * L, w, deck), V(t * L, w, deck + k.post), 0.9, 0.9, k.colours.post));
        const toward = t > 0 ? -1 : 1;
        parts.push(member(V(t * L, w, deck + 2), V(t * L + toward * k.derrick * 0.8, w * 0.6, deck + 2 + k.derrick * 0.6), 0.45, 0.45, k.colours.post));
      }
      parts.push(member(V(t * L, -k.postApart / 2, deck + k.post - 0.5), V(t * L, k.postApart / 2, deck + k.post - 0.5), 0.6, 0.8, k.colours.post));
    }
  } else {
    const k = c.barque;
    box(-0.05 * L, 0.06 * L, B * 0.22, deck, deck + 2.4, k.colours.house);
    const at = k.mastAt[Math.min(Math.max(sh.masts, 2), 5)] ?? k.mastAt[3];
    const main = L * k.mainHeight;
    at.forEach((t, i) => {
      const last = i === at.length - 1;
      const h = main * (i === 0 ? k.foreShare : last ? k.aftShare : 1);
      const s0 = t * L;
      parts.push(member(V(s0, 0, deck - 1), V(s0, 0, deck + h), 0.9, 0.9, k.colours.mast));
      if (!last) {
        k.yards.forEach(([up, span]) => parts.push(member(V(s0, -(B * span) / 2, deck + h * up), V(s0, (B * span) / 2, deck + h * up), 0.45, 0.45, k.colours.yard)));
      } else {
        // Fore-and-aft: her boom and gaff, aft from the mast.
        parts.push(member(V(s0, 0, deck + h * 0.12), V(s0 - L * 0.13, 0, deck + h * 0.14), 0.4, 0.4, k.colours.yard));
        parts.push(member(V(s0, 0, deck + h * 0.45), V(s0 - L * 0.11, 0, deck + h * 0.58), 0.4, 0.4, k.colours.yard));
      }
    });
    // The bowsprit and jib-boom, and the forestay from the foremast's head out to its end.
    const bowY = deck + d.forecastle[1];
    const tip = V(L / 2 + L * k.bowsprit, 0, bowY + 5);
    parts.push(member(V(L / 2 - 4, 0, bowY + 0.5), tip, 0.7, 0.7, k.colours.mast));
    parts.push(member(V(at[0] * L, 0, deck + main * k.foreShare * 0.97), tip, 0.18, 0.18, k.colours.yard));
  }
  return parts;
}

/**
 * A floating dock (Blohm + Voss's): its pontoon just awash, a wing wall along each side of it
 * (`wallShare` of its breadth high, between `wall` limits), each wall's coping, and a jib crane
 * on each wall, reaching over the dock. A design of the game's own to the map's area.
 */
export function floatingDockParts(dk: FloatingDockDef): THREE.BufferGeometry[] {
  const c = CONFIG.structures.floatingDock;
  const a = (dk.yawDeg * Math.PI) / 180;
  const [ux, uz, vx, vz] = [Math.sin(a), -Math.cos(a), Math.cos(a), Math.sin(a)];
  const at = (s: number, w: number, y: number): V3 => [dk.x + ux * s + vx * w, y, dk.z + uz * s + vz * w];
  const plan = (s: number, w: number): [number, number] => [dk.x + ux * s + vx * w, dk.z + uz * s + vz * w];
  const L = dk.length;
  const W = dk.width;
  const H = Math.max(c.wallHeight[0], Math.min(c.wallHeight[1], W * c.wallShare));
  const t = Math.max(c.wallThick, W * 0.12);
  const parts: THREE.BufferGeometry[] = [slab(...plan(-L / 2, 0), ...plan(L / 2, 0), W, c.pontoon[0], c.pontoon[1], c.colours.pontoon)];
  for (const side of [-1, 1]) {
    const w = side * (W / 2 - t / 2);
    parts.push(slab(...plan(-L / 2, w), ...plan(L / 2, w), t, c.pontoon[1], c.pontoon[1] + H, c.colours.wall));
    parts.push(slab(...plan(-L / 2, w), ...plan(L / 2, w), t + 0.4, c.pontoon[1] + H, c.pontoon[1] + H + 0.8, c.colours.coping));
    // A crane on each wall, the two at opposite ends of the dock.
    const s = side * L * 0.22;
    const y0 = c.pontoon[1] + H + 0.8;
    parts.push(member(at(s, w, y0), at(s, w, y0 + c.crane.tower), 2.6, 2.6, c.colours.crane));
    parts.push(member(at(s, w, y0 + c.crane.tower), at(s, w - side * c.crane.jib * Math.cos(0.25), y0 + c.crane.tower + c.crane.jib * Math.sin(0.25)), 1.2, 1.6, c.colours.crane));
  }
  return parts;
}

/**
 * A graving dock (Dock Elbe 17): its gate (a caisson) across the end that opens onto the river,
 * up to the quay's height, and two big cranes on portals along one side, reaching over it.
 */
export function gravingDockParts(g: GravingDockDef): THREE.BufferGeometry[] {
  const c = CONFIG.structures.gravingDock;
  const a = (g.yawDeg * Math.PI) / 180;
  const [ux, uz, vx, vz] = [Math.sin(a), -Math.cos(a), Math.cos(a), Math.sin(a)];
  const at = (s: number, w: number, y: number): V3 => [g.x + ux * s + vx * w, y, g.z + uz * s + vz * w];
  const plan = (s: number, w: number): [number, number] => [g.x + ux * s + vx * w, g.z + uz * s + vz * w];
  const sGate = (g.gate * g.length) / 2;
  const parts: THREE.BufferGeometry[] = [slab(...plan(sGate - c.gateThick / 2, 0), ...plan(sGate + c.gateThick / 2, 0), g.width + 6, c.gateFoot, g.top + 0.5, c.colours.gate)];
  for (const f of [-0.2, 0.2]) {
    const s = f * g.length;
    const w = g.width / 2 + c.crane.portal / 2 + 2;
    for (const [ds, dw] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) parts.push(member(at(s + (ds * c.crane.portal) / 2, w + (dw * c.crane.portal) / 2, g.top), at(s, w, g.top + c.crane.portalHeight), 1.2, 1.2, c.colours.crane));
    parts.push(member(at(s, w, g.top + c.crane.portalHeight), at(s, w, g.top + c.crane.tower), 3, 3, c.colours.crane));
    parts.push(member(at(s, w, g.top + c.crane.tower), at(s, w - c.crane.jib * Math.cos(0.3), g.top + c.crane.tower + c.crane.jib * Math.sin(0.3)), 1.4, 2, c.colours.crane));
  }
  return parts;
}

/** The rest of a coast map's structures (each optional): modelled landmarks, museum ships, floating and graving docks. */
export interface MoreStructures {
  landmarks?: readonly LandmarkModelDef[];
  museumShips?: readonly MuseumShipDef[];
  floatingDocks?: readonly FloatingDockDef[];
  gravingDocks?: readonly GravingDockDef[];
}

/** All of a region's bridges, follies, gantry cranes, yard ships, modelled landmarks, museum ships and docks, merged (null if it has none). */
export function structuresGeometry(bridges: readonly BridgeDef[], follies: readonly FollyDef[], ground: (x: number, z: number) => number, gantries: readonly GantryDef[] = [], yardShips: readonly YardShipDef[] = [], more: MoreStructures = {}): THREE.BufferGeometry | null {
  const parts = [
    ...bridges.flatMap((b) => bridgeParts(b, ground)),
    ...follies.flatMap((f) => follyParts(f)),
    ...gantries.flatMap((g) => gantryParts(g)),
    ...yardShips.flatMap((y) => yardShipParts(y)),
    ...(more.landmarks ?? []).flatMap((m) => landmarkModelParts(m)),
    ...(more.museumShips ?? []).flatMap((m) => museumShipParts(m)),
    ...(more.floatingDocks ?? []).flatMap((d) => floatingDockParts(d)),
    ...(more.gravingDocks ?? []).flatMap((g) => gravingDockParts(g)),
  ];
  return parts.length ? mergeParts(parts) : null;
}
