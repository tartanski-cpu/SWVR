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
import type { BridgeDef, FollyDef, GantryDef, YardShipDef } from './defs';

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
  const a = (g.yawDeg * Math.PI) / 180;
  // Along the track (u) and across it (v), from its middle.
  const [ux, uz, vx, vz] = [Math.sin(a), -Math.cos(a), Math.cos(a), Math.sin(a)];
  const at = (s: number, w: number, y: number): V3 => [g.x + ux * s + vx * w, y, g.z + uz * s + vz * w];
  const y0 = g.base;
  const H = y0 + c.height;
  const half = g.span / 2;
  const parts: THREE.BufferGeometry[] = [];
  // The rails, two on each side, the track's length.
  for (const side of [-1, 1]) for (const d of [-1.2, 1.2]) parts.push(member(at(-g.length / 2, side * half + d, y0 + 0.3), at(g.length / 2, side * half + d, y0 + 0.3), 0.8, 0.6, k.rail));
  const shares = c.at[Math.min(g.count, c.at.length) - 1];
  for (const f of shares) {
    const s = (f - 0.5) * g.length;
    const top = H - c.girderDepth;
    // The girder, a little past the legs each side.
    parts.push(member(at(s, -half - 6, H - c.girderDepth / 2), at(s, half + 6, H - c.girderDepth / 2), c.girderWidth, c.girderDepth, k.frame));
    for (const side of [-1, 1]) {
      const w = side * half;
      // The A-frame: two legs from their feet, spread along the rails, to the girder.
      for (const e of [-1, 1]) {
        parts.push(member(at(s + (e * c.legBase) / 2, w, y0 + 3), at(s + e * (c.girderWidth / 2 - c.leg / 2), w, top + 0.5), c.leg, c.leg, k.frame));
        // Its bogie on the rails.
        parts.push(member(at(s + (e * c.legBase) / 2 - 6, w, y0 + 1.5), at(s + (e * c.legBase) / 2 + 6, w, y0 + 1.5), 4.5, 3, k.dark));
      }
      // A tie across the A-frame at a third of its height.
      const ty = y0 + (top - y0) / 3;
      const tw = (c.legBase / 2) * (2 / 3) + (c.girderWidth / 2) * (1 / 3);
      parts.push(member(at(s - tw, w, ty), at(s + tw, w, ty), 2, 2, k.frame));
    }
    // Its sign along the girder, on both faces, a little to one side of the middle (owner).
    if (g.sign) {
      for (const f of [-1, 1]) {
        const normal = new THREE.Vector3(ux * f, 0, uz * f);
        // Reading left to right for someone facing the face: right = (-normal) x up.
        const right = new THREE.Vector3().crossVectors(normal.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
        const mid = at(s + (f * c.girderWidth) / 2, -half * 0.12, H - c.girderDepth / 2);
        parts.push(...signParts(g.sign, mid, right, normal, c.signHeight, k.sign));
      }
    }
    // The cab trolley riding on the girder, and the hoist trolley under it with its ropes and hook block.
    parts.push(member(at(s, -half * 0.45 - 7, H + 3), at(s, -half * 0.45 + 7, H + 3), c.girderWidth + 2, 6, k.trolley));
    const hw = half * 0.15;
    parts.push(member(at(s, hw - 5, top - 3), at(s, hw + 5, top - 3), c.girderWidth + 1, 6, k.trolley));
    for (const [ds, dw] of [[-2, -3], [2, -3], [-2, 3], [2, 3]]) parts.push(member(at(s + ds, hw + dw, top - 6), at(s + ds, hw + dw, top - 6 - c.hoist), 0.25, 0.25, k.dark));
    parts.push(member(at(s, hw - 4, top - 7 - c.hoist), at(s, hw + 4, top - 7 - c.hoist), 4, 2.5, k.trolley));
    // The T-crane on top of the far leg: its mast and its jib across the girder.
    const mw = half - 3;
    parts.push(member(at(s, mw, H), at(s, mw, H + c.mast), 1.8, 1.8, k.trolley));
    parts.push(member(at(s, mw - c.jib * 0.75, H + c.mast + 1), at(s, mw + c.jib * 0.25, H + c.mast + 1), 2, 2.5, k.trolley));
  }
  return parts;
}

/** A small, steady hash of numbers (0 to 1): a yard ship's blocks, the same each time. */
function hash01(...k: number[]): number {
  let h = 2166136261;
  for (const v of k) h = Math.imul(h ^ Math.round(v * 97), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** A yard ship's half-breadth (m) at `u` m from her middle (forward +): a parallel body, a fine bow over its last 22 %, the stern's corners rounded. */
function halfBreadth(L: number, B: number, u: number): number {
  const bow = L / 2 - 0.22 * L;
  if (u > bow) return (B / 2) * Math.max(0, 1 - ((u - bow) / (0.22 * L)) ** 1.7);
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
  const main = keel + c.depth * L;
  // Her waterline: afloat, the sea's; in the dock, where it will be (her draught from the keel).
  const wl = keel < 0 ? 0 : keel + 8.5;
  // The plan between two stations, sampled along.
  // (Every 8 m in the fine bow; along the straight body only at the block's ends.)
  const bowStart = L / 2 - 0.22 * L;
  const slice = (u0: number, u1: number, scale = 1): [number, number][] => {
    const us: number[] = [];
    for (let u = u0; u < u1; u += u >= bowStart - 8 ? 8 : Math.max(8, Math.min(u1, bowStart) - u)) us.push(u);
    us.push(u1);
    const side = us.map((u) => [u, -halfBreadth(L, B, u) * scale] as [number, number]);
    const other = [...us].reverse().map((u) => [u, halfBreadth(L, B, u) * scale] as [number, number]);
    // (At the stem the two sides meet: one point.)
    return [...side, ...other.filter((p, i) => i > 0 || p[1] > 0.5)];
  };
  // A deck's front block: its front rounded in three facets (owner: "the front of the cruise
  // ships are curved ... three facets"): a flat middle face across the middle third of her,
  // and an angled face each side swept back `frontFacet` of her beam to her side.
  const front3 = (u0: number, u1: number, scale: number): [number, number][] => {
    const back = u1 - c.frontFacet * B;
    if (back - u0 < 4) return slice(u0, u1, scale);
    const ring = slice(u0, back, scale);
    const half = halfBreadth(L, B, back) * scale;
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
      parts.push(prism(ring, wl, wl + 8, w, k.hull));
      parts.push(prism(ring, wl + 8, main, w, k.white));
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
    // Along her in blocks, those this high so far (finished: the deck the length of her).
    for (let u0 = back; u0 < front - 1; u0 += finished ? front - back : c.block) {
      const u1 = finished ? front : Math.min(front, u0 + c.block);
      if (blockDecks(u0) <= d) continue;
      const plan = u1 >= front - 0.01 ? front3 : slice;
      const ring = plan(u0, u1, narrow);
      // Each deck a band of windows and balconies under its white (painted: no primer left).
      const primer = !painted && hash01(y.seed, u0, d) < 0.45;
      parts.push(prism(ring, y0, y0 + 0.7, w, primer ? k.primer : k.glass));
      parts.push(prism(plan(u0, u1, narrow * 0.985), y0 + 0.7, y0 + c.deck, w, primer ? k.light : k.white));
    }
  }
  if (finished) {
    const top = main + c.decks * c.deck;
    const bridgeDeck = main + (c.decks - 4) * c.deck;
    const bridgeU = sFore - (c.decks - 4) * c.rake;
    // The bridge across her, its wings out over her sides, its windows.
    parts.push(member(w(bridgeU - 6, -B / 2 - 3, bridgeDeck + 1.5), w(bridgeU - 6, B / 2 + 3, bridgeDeck + 1.5), 9, 3, k.white));
    parts.push(member(w(bridgeU - 1.8, -B / 2 - 3, bridgeDeck + 2), w(bridgeU - 1.8, B / 2 + 3, bridgeDeck + 2), 1, 1.4, k.glass));
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
    const boatY = main + 2 * c.deck + 1;
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

/** All of a region's bridges, follies, gantry cranes and yard ships, merged (null if it has none). */
export function structuresGeometry(bridges: readonly BridgeDef[], follies: readonly FollyDef[], ground: (x: number, z: number) => number, gantries: readonly GantryDef[] = [], yardShips: readonly YardShipDef[] = []): THREE.BufferGeometry | null {
  const parts = [...bridges.flatMap((b) => bridgeParts(b, ground)), ...follies.flatMap((f) => follyParts(f)), ...gantries.flatMap((g) => gantryParts(g)), ...yardShips.flatMap((y) => yardShipParts(y))];
  return parts.length ? mergeParts(parts) : null;
}
