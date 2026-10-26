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
import type { BridgeDef, FollyDef, GantryDef } from './defs';

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

/** All of a region's bridges, follies and gantry cranes, merged (null if it has none). */
export function structuresGeometry(bridges: readonly BridgeDef[], follies: readonly FollyDef[], ground: (x: number, z: number) => number, gantries: readonly GantryDef[] = []): THREE.BufferGeometry | null {
  const parts = [...bridges.flatMap((b) => bridgeParts(b, ground)), ...follies.flatMap((f) => follyParts(f)), ...gantries.flatMap((g) => gantryParts(g))];
  return parts.length ? mergeParts(parts) : null;
}
