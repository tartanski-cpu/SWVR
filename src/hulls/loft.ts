/**
 * Hull study (not used by the game yet): a lines-plan style hull generator for the
 * modular-boat platform. A `HullDesign` is a short set of design curves, the way a naval
 * architect would sketch a type - sheer, half-breadth, keel profile, section shape - and
 * `loft()` turns it into transverse sections, which `buildHullMesh()` panels into one
 * vertex-coloured mesh (hull, deck, bulwarks, wheelhouse with windows) and which the
 * hydrostatics summary (`hydrostatics()`) integrates for displacement, LCB and
 * coefficients at the design waterline.
 *
 * Axes as in the game: +x starboard, +y up, -z forward; origin on the centreline at the
 * design waterline, z = 0 amidships. Curves are given over `t`, 0 at the transom and 1 at
 * the stem, as control points [t, value] joined by a smooth (monotone cubic) curve, so a
 * design needs a handful of numbers per curve, not an offsets table.
 */
import * as THREE from 'three';

/** Control points [t, value], t from 0 (transom) to 1 (stem), in any order. */
export type Curve = [number, number][];

export interface SectionShape {
  /**
   * Hard-chine: the chine's half-breadth as a fraction of the deck half-breadth, and its
   * height above the keel as a fraction of keel-to-deck depth, each along the length.
   */
  chineBeam: Curve;
  chineHeight: Curve;
  /** A second (spray) chine or knuckle, optional, same conventions. */
  chine2Beam?: Curve;
  chine2Height?: Curve;
  /** Round bilge: how many corner-cutting passes to soften the chines (0 = hard chine). */
  round?: number;
  /**
   * Flare: the topsides lean out so the deck edge is this much wider than it would be with
   * vertical sides from the chine (fraction of the chine half-breadth); negative is tumblehome.
   */
  flare?: Curve;
}

export interface WheelhouseDesign {
  /** Fore-aft extent (m, vessel z; z0 aft of z1, so z0 > z1). */
  z0: number;
  z1: number;
  halfWidth: number;
  /** Height of the sides above the deck it stands on (m). */
  height: number;
  /** The front face leans forward (positive) or back by this much at the top (m). */
  frontRake?: number;
  /** Window band: sill and head heights above the house's base (m). */
  sill: number;
  head: number;
  /** Panes across the front, along each side, and across the back (0 = blind). */
  panesFront: number;
  panesSide: number;
  panesBack: number;
  /** Roof overhang all round (m). */
  overhang?: number;
  /** Set to raise the house on a plinth / trunk this much above the deck. */
  plinth?: number;
  /** Base height above the deck (m): a wheelhouse on top of a deckhouse sits at the deckhouse's height. */
  above?: number;
}

export interface HullDesign {
  id: string;
  name: string;
  /** What this type is and where it comes from, for the viewer. */
  blurb: string;
  /** On the owner's shortlist for the modular-boat platform (shown first in the viewer). */
  shortlist?: boolean;
  /** Length overall (m): transom at z = +L/2, stem at z = -L/2 (before rake). */
  length: number;
  /** Deck half-breadth along the length (m). */
  halfBeam: Curve;
  /** Deck edge height above the DWL (m): the sheer line. A near-vertical step makes a forecastle. */
  sheer: Curve;
  /** Keel height (m, negative below the DWL): rocker, and the forefoot rising to the stem. */
  keel: Curve;
  /**
   * The keel line the chine heights are measured from, where it isn't the keel itself (the
   * Shipyard's reshaped forefoot): the chines run on as if the forefoot weren't cut away, and
   * close in where the keel rises up to them, rather than being dragged up the stem with it.
   */
  chineKeel?: Curve;
  /**
   * Rake: how far the section leans fore-aft per metre of height above the keel (dz/dy).
   * Negative at the stem leans it forward; positive at the transom leans the transom aft.
   */
  rake: Curve;
  section: SectionShape;
  /** Bulwark height above the deck edge (m), 0 for an open rail. */
  bulwark: Curve;
  /** Number of stations lofted. */
  stations?: number;
  /** More stations, where her shape needs them (t, 0 transom .. 1 stem): round a forefoot radius (Shipyard, catalog.ts bowKeel). */
  extraStations?: number[];
  wheelhouse?: WheelhouseDesign;
  /** More deckhouse blocks (a lower deckhouse under a wheelhouse, an engine casing, a tower). */
  houses?: WheelhouseDesign[];
  /**
   * Catamaran: the design's curves describe ONE demihull about its own centreline; two are
   * placed `spacing` apart (centre to centre) under a bridge deck whose underside is
   * `tunnel` m above the DWL.
   */
  catamaran?: { spacing: number; tunnel: number };
  /** Optional raised foredeck break (forecastle): a second deck from t to the stem, this much higher. */
  forecastle?: { from: number; raise: number };
  colours?: Partial<typeof PAINT>;
}

export const PAINT = {
  bottom: 0x8c2a22,
  boot: 0xe8e4d8,
  topsides: 0x2f5d8a,
  deck: 0x6f7a6a,
  bulwark: 0x2f5d8a,
  bulwarkIn: 0xd9dcd4,
  house: 0xe6e6df,
  window: 0x1a2630,
  roof: 0xb9bdb6,
};

/** A lofted section: points from the keel up to the deck edge (port side, x <= 0), in world (x, y, z). */
export interface Section {
  t: number;
  /** Centre-plane z of this station (before rake). */
  z: number;
  keelY: number;
  deckY: number;
  halfBeam: number;
  /** Keel .. deck edge, port side. */
  pts: THREE.Vector3[];
  bulwark: number;
}

export interface LoftedHull {
  design: HullDesign;
  sections: Section[];
}

// ---- curves -------------------------------------------------------------------------

/** Monotone cubic (Fritsch-Carlson) through the control points: no overshoot between them. */
export function curveAt(c: Curve, t: number): number {
  const p = [...c].sort((a, b) => a[0] - b[0]);
  if (p.length === 1) return p[0][1];
  if (t <= p[0][0]) return p[0][1];
  if (t >= p[p.length - 1][0]) return p[p.length - 1][1];
  const n = p.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / Math.max(1e-9, p[i + 1][0] - p[i][0]));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  let i = 0;
  while (t > p[i + 1][0]) i++;
  const h = p[i + 1][0] - p[i][0];
  const u = (t - p[i][0]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * p[i + 1][1] + (u3 - u2) * h * m[i + 1];
}

// ---- lofting ------------------------------------------------------------------------

/** Chaikin corner cutting on the interior points (keel and deck edge stay put). */
function soften(pts: [number, number][], passes: number): [number, number][] {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const out: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      if (i > 0) out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      if (i < p.length - 2) out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

export function loft(d: HullDesign): LoftedHull {
  const n = d.stations ?? 25;
  const L = d.length;
  const sections: Section[] = [];
  // Evenly spaced stations, plus a doubled station at a forecastle break so the step in the
  // deck is a vertical bulkhead rather than a slope between two stations.
  const ts: number[] = [];
  for (let i = 0; i < n; i++) ts.push(i / (n - 1));
  if (d.forecastle) ts.push(d.forecastle.from - 1e-4, d.forecastle.from);
  // Extra stations (a forefoot radius), unless one already stands within 5 cm.
  for (const t of d.extraStations ?? []) if (ts.every((u) => Math.abs(u - t) * L > 0.05)) ts.push(t);
  ts.sort((a, b) => a - b);
  for (const t of ts) {
    const z = L / 2 - t * L;
    const keelY = curveAt(d.keel, t);
    // (A forecastle raises the deck forward of its break, not her chines: they're measured
    // from her deck as drawn, so they run on straight under the step.)
    const drawnDeckY = curveAt(d.sheer, t);
    let deckY = drawnDeckY;
    if (d.forecastle && t >= d.forecastle.from) deckY += d.forecastle.raise;
    // The stem itself is a point; just before it the sections are narrow.
    // A pointed stem comes to nothing; a square (landing) bow keeps its width, closed by a bow plate.
    const hb = Math.max(0, curveAt(d.halfBeam, t));
    const s = d.section;
    // The chines' heights, from the keel (or the line given for them, chineKeel). Where the
    // keel rises to within a fifth of that depth of a chine, the chine closes in to it.
    const refY = d.chineKeel ? curveAt(d.chineKeel, t) : keelY;
    const refDepth = Math.max(0.05, drawnDeckY - refY);
    const chine = (frac: number, beam: number): [number, number] => {
      const y = refY + frac * refDepth;
      const close = Math.min(1, Math.max(0, (y - keelY) / (0.2 * refDepth)));
      return [beam * (d.chineKeel ? close : 1), Math.max(y, keelY)];
    };
    const [cB, cY] = chine(curveAt(s.chineHeight, t), curveAt(s.chineBeam, t) * hb);
    const flare = s.flare ? curveAt(s.flare, t) : 0;
    const prof: [number, number][] = [[0, keelY]];
    if (s.chine2Beam && s.chine2Height) {
      const [c2B, c2Y] = chine(curveAt(s.chine2Height, t), curveAt(s.chine2Beam, t) * hb);
      // Order the two chines bottom-up.
      const lo = c2Y < cY ? [c2B, c2Y] : [cB, cY];
      const hi = c2Y < cY ? [cB, cY] : [c2B, c2Y];
      prof.push([lo[0], lo[1]], [hi[0], hi[1]]);
    } else prof.push([cB, cY]);
    // Deck edge: the upper chine's breadth, flared out, but never past the design half-beam.
    const top = prof[prof.length - 1];
    const deckX = Math.min(hb, Math.max(top[0] * (1 + flare), hb));
    prof.push([deckX, deckY]);
    const shaped = s.round ? soften(prof, s.round) : prof;
    const rake = curveAt(d.rake, t);
    const pts = shaped.map(([x, y]) => new THREE.Vector3(-x, y, z + rake * (y - keelY)));
    sections.push({ t, z, keelY, deckY, halfBeam: hb, pts, bulwark: Math.max(0, curveAt(d.bulwark, t)) });
  }
  return { design: d, sections };
}

// ---- mesh ---------------------------------------------------------------------------

class Builder {
  positions: number[] = [];
  colors: number[] = [];
  private c = new THREE.Color();
  tri(a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, color: number): void {
    this.c.set(color);
    for (const v of [a, b, d]) {
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(this.c.r, this.c.g, this.c.b);
    }
  }
  /** Quad a-b-c-d (any winding; `out` says which way the face looks). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number, out?: THREE.Vector3): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    if (n.lengthSq() < 1e-12) {
      // Degenerate on one edge (stem): fall back to a triangle fan.
      const n2 = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(d, a));
      if (n2.lengthSq() < 1e-12) return;
      const flip = out && n2.dot(out) < 0;
      if (flip) this.tri(a, d, c, color);
      else this.tri(a, c, d, color);
      return;
    }
    const flip = out && n.dot(out) < 0;
    if (flip) {
      this.tri(a, d, b, color);
      this.tri(b, d, c, color);
    } else {
      this.tri(a, b, d, color);
      this.tri(b, c, d, color);
    }
  }
  /** One triangle of a fan about `c`, wound to look along `out`. */
  fan(c: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, color: number, out: THREE.Vector3): void {
    const n = new THREE.Vector3().subVectors(a, c).cross(new THREE.Vector3().subVectors(b, c));
    if (n.lengthSq() < 1e-12) return;
    if (n.dot(out) < 0) this.tri(c, b, a, color);
    else this.tri(c, a, b, color);
  }
  /** An axis-aligned box. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number): void {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const pos = g.getAttribute('position');
    const idx = g.getIndex()!;
    this.c.set(color);
    for (let i = 0; i < idx.count; i++) {
      const k = idx.getX(i);
      this.positions.push(pos.getX(k), pos.getY(k), pos.getZ(k));
      this.colors.push(this.c.r, this.c.g, this.c.b);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Panel the lofted sections into one mesh (both sides, deck, transom, bulwarks, wheelhouse). */
export function buildHullMesh(h: LoftedHull): THREE.Mesh {
  const paint = { ...PAINT, ...(h.design.colours ?? {}) };
  const b = new Builder();
  const cat = h.design.catamaran;
  if (cat) {
    // Two demihulls, each plated like a monohull about its own centreline, then the bridge deck.
    for (const side of [-1, 1]) {
      const shifted: LoftedHull = {
        design: h.design,
        sections: h.sections.map((s) => ({ ...s, pts: s.pts.map((p) => new THREE.Vector3(p.x + (side * cat.spacing) / 2, p.y, p.z)) })),
      };
      plateHull(b, shifted, paint, side);
    }
    bridgeDeck(b, h, cat, paint);
  } else plateHull(b, h, paint, 0);
  for (const w of [...(h.design.wheelhouse ? [h.design.wheelhouse] : []), ...(h.design.houses ?? [])]) wheelhouse(b, h, w, paint);

  const mesh = new THREE.Mesh(b.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.name = `hull:${h.design.id}`;
  return mesh;
}

/**
 * The bridge deck of a catamaran: the deck between the demihulls' inner edges, its wet
 * underside at tunnel height, the bulwarks along the outer edges and a transom plate
 * (the demihulls' own bulwarks are left off).
 */
function bridgeDeck(b: Builder, h: LoftedHull, cat: { spacing: number; tunnel: number }, paint: typeof PAINT): void {
  const S = h.sections;
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const aft = new THREE.Vector3(0, 0, 1);
  const half = cat.spacing / 2;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i].pts[S[i].pts.length - 1];
    const c = S[i + 1].pts[S[i + 1].pts.length - 1];
    // a.x <= 0 is the demihull's half-beam: inner edges at half - hb, outer at half + hb.
    const inA = Math.max(0, half + a.x);
    const inC = Math.max(0, half + c.x);
    const outA = half - a.x;
    const outC = half - c.x;
    b.quad(V(-outA, a.y, a.z), V(outA, a.y, a.z), V(outC, c.y, c.z), V(-outC, c.y, c.z), paint.deck, up);
    b.quad(V(-inA, cat.tunnel, a.z), V(inA, cat.tunnel, a.z), V(inC, cat.tunnel, c.z), V(-inC, cat.tunnel, c.z), paint.bottom, down);
    const bw0 = S[i].bulwark;
    const bw1 = S[i + 1].bulwark;
    if (bw0 > 0.01 || bw1 > 0.01) {
      for (const side of [-1, 1]) {
        const o = V(side, 0, 0);
        const p0 = V(side * outA, a.y, a.z);
        const p1 = V(side * outC, c.y, c.z);
        const t0 = p0.clone().setY(a.y + bw0);
        const t1 = p1.clone().setY(c.y + bw1);
        b.quad(p0, t0, t1, p1, paint.bulwark, o);
        const q0 = p0.clone().setX(side * (outA - 0.08));
        const q1 = p1.clone().setX(side * (outC - 0.08));
        b.quad(q0, q0.clone().setY(t0.y), q1.clone().setY(t1.y), q1, paint.bulwarkIn, o.clone().negate());
        b.quad(t0, t0.clone().setX(q0.x), t1.clone().setX(q1.x), t1, paint.bulwarkIn, up);
      }
    }
  }
  // Transom plate across the tunnel (wet deck to deck), and the bulwark above it.
  const t0 = S[0].pts[S[0].pts.length - 1];
  const inner = half + t0.x;
  const outer = half - t0.x;
  b.quad(V(-inner, cat.tunnel, t0.z), V(inner, cat.tunnel, t0.z), V(inner, t0.y, t0.z), V(-inner, t0.y, t0.z), paint.topsides, aft);
  if (S[0].bulwark > 0.01) {
    const y1 = t0.y + S[0].bulwark;
    b.quad(V(-outer, t0.y, t0.z), V(outer, t0.y, t0.z), V(outer, y1, t0.z), V(-outer, y1, t0.z), paint.bulwark, aft);
  }
  // Forward end of the tunnel: a plate across where the wet deck meets the bows (square bow)
  // or where the demihulls' inner sides meet on the centreline (fine bows).
  let i = S.length - 1;
  while (i > 0 && half + S[i].pts[S[i].pts.length - 1].x <= 0.02) i--;
  const e = S[i].pts[S[i].pts.length - 1];
  const inE = Math.max(0, half + e.x);
  b.quad(V(-inE, cat.tunnel, e.z), V(inE, cat.tunnel, e.z), V(inE, e.y, e.z), V(-inE, e.y, e.z), paint.topsides, V(0, 0, -1));
}

/**
 * Plate one hull: both sides, deck, bulwarks, transom, forecastle break. `which` is 0 for
 * a monohull; for a catamaran demihull it is -1 (port) or 1 (starboard), the sections are
 * already shifted off the centreline, mirroring is about the demihull's own centreline,
 * and the bulwarks are left to the bridge deck.
 */
function plateHull(b: Builder, h: LoftedHull, paint: typeof PAINT, which: number): void {
  const S = h.sections;
  const cx = which === 0 ? 0 : (which * (h.design.catamaran?.spacing ?? 0)) / 2;
  const mirror = (v: THREE.Vector3) => new THREE.Vector3(2 * cx - v.x, v.y, v.z);
  const outPort = new THREE.Vector3(-1, 0, 0);
  const outStbd = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const aft = new THREE.Vector3(0, 0, 1);

  // Hull plating between neighbouring stations, point by point up the section. Sections
  // may have different point counts after softening, so resample both to the longer.
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i].pts;
    const c = S[i + 1].pts;
    const m = Math.max(a.length, c.length);
    const at = (p: THREE.Vector3[], k: number) => p[Math.min(p.length - 1, Math.round((k / (m - 1)) * (p.length - 1)))];
    for (let k = 0; k < m - 1; k++) {
      const p0 = at(a, k);
      const p1 = at(a, k + 1);
      const q0 = at(c, k);
      const q1 = at(c, k + 1);
      // Antifouling below the waterline, a boot-top band, topsides above.
      const yMid = (p0.y + p1.y + q0.y + q1.y) / 4;
      const col = yMid < 0.0 ? paint.bottom : yMid < 0.2 ? paint.boot : paint.topsides;
      const outward = new THREE.Vector3(-1, -0.3, 0);
      b.quad(p0, p1, q1, q0, col, outward);
      b.quad(mirror(p0), mirror(p1), mirror(q1), mirror(q0), col, new THREE.Vector3(1, -0.3, 0));
    }
    // Deck: between the deck edges, flat across.
    const dp = a[a.length - 1];
    const dq = c[c.length - 1];
    b.quad(dp, mirror(dp), mirror(dq), dq, paint.deck, up);
    // Bulwark: outer face continues the topsides up, inner face set in, with a cap.
    const bw0 = S[i].bulwark;
    const bw1 = S[i + 1].bulwark;
    if (which === 0 && (bw0 > 0.01 || bw1 > 0.01)) {
      const inset = 0.08;
      const tp = dp.clone().setY(dp.y + bw0);
      const tq = dq.clone().setY(dq.y + bw1);
      const ip = new THREE.Vector3(dp.x + inset, dp.y + bw0, dp.z);
      const iq = new THREE.Vector3(dq.x + inset, dq.y + bw1, dq.z);
      const fp = new THREE.Vector3(dp.x + inset, dp.y, dp.z);
      const fq = new THREE.Vector3(dq.x + inset, dq.y, dq.z);
      for (const side of [1, -1]) {
        const M = (v: THREE.Vector3) => (side > 0 ? v : mirror(v));
        b.quad(M(dp), M(tp), M(tq), M(dq), paint.bulwark, side > 0 ? outPort : outStbd);
        b.quad(M(fp), M(ip), M(iq), M(fq), paint.bulwarkIn, side > 0 ? outStbd : outPort);
        b.quad(M(tp), M(ip), M(iq), M(tq), paint.bulwarkIn, up);
      }
    }
  }
  // Transom: fan from a centre point over the aft section, both halves.
  // The centre point sits on the transom's own (raked) plane, so the fan is flat.
  const T = S[0].pts;
  const Td = T[T.length - 1];
  const yMid = (T[0].y + Td.y) / 2;
  const tc = new THREE.Vector3(cx, yMid, T[0].z + ((Td.z - T[0].z) * (yMid - T[0].y)) / (Td.y - T[0].y || 1));
  // The half-section is closed along the centreline at deck height (keel to deck centre),
  // so the fan also covers the wedge between the deck edge and the centreline.
  const Tc = [...T, new THREE.Vector3(cx, Td.y, Td.z)];
  for (let k = 0; k < Tc.length - 1; k++) {
    b.fan(tc, Tc[k], Tc[k + 1], paint.topsides, aft);
    b.fan(tc, mirror(Tc[k]), mirror(Tc[k + 1]), paint.topsides, aft);
  }
  // Transom bulwark plate.
  if (which === 0 && S[0].bulwark > 0.01) {
    const d0 = T[T.length - 1];
    const t0 = d0.clone().setY(d0.y + S[0].bulwark);
    b.quad(d0, t0, mirror(t0), mirror(d0), paint.bulwark, aft);
    b.quad(d0.clone().setZ(d0.z - 0.08), t0.clone().setZ(t0.z - 0.08), mirror(t0).setZ(t0.z - 0.08), mirror(d0).setZ(d0.z - 0.08), paint.bulwarkIn, new THREE.Vector3(0, 0, -1));
    b.quad(t0, t0.clone().setZ(t0.z - 0.08), mirror(t0).setZ(t0.z - 0.08), mirror(t0), paint.bulwarkIn, up);
  }
  // Square bow: a flat (raked) bow plate over the forward section, like the transom, and a
  // bulwark across the top of it.
  const last = S[S.length - 1];
  if (last.halfBeam > 0.05) {
    const B = last.pts;
    const Bd = B[B.length - 1];
    const by = (B[0].y + Bd.y) / 2;
    const bc = new THREE.Vector3(cx, by, B[0].z + ((Bd.z - B[0].z) * (by - B[0].y)) / (Bd.y - B[0].y || 1));
    const fwd = new THREE.Vector3(0, 0, -1);
    const Bc = [...B, new THREE.Vector3(cx, Bd.y, Bd.z)];
    for (let k = 0; k < Bc.length - 1; k++) {
      b.fan(bc, Bc[k], Bc[k + 1], paint.topsides, fwd);
      b.fan(bc, mirror(Bc[k]), mirror(Bc[k + 1]), paint.topsides, fwd);
    }
    if (which === 0 && last.bulwark > 0.01) {
      const tb = Bd.clone().setY(Bd.y + last.bulwark);
      b.quad(Bd, tb, mirror(tb), mirror(Bd), paint.bulwark, fwd);
      const inner = (v: THREE.Vector3) => v.clone().setZ(v.z + 0.08);
      b.quad(inner(Bd), inner(tb), inner(mirror(tb)), inner(mirror(Bd)), paint.bulwarkIn, aft);
      b.quad(tb, inner(tb), inner(mirror(tb)), mirror(tb), paint.bulwarkIn, up);
    }
  }
  // Forecastle break: a vertical bulkhead at the step.
  const fc = h.design.forecastle;
  if (fc && which === 0) {
    const i = S.findIndex((s) => s.t >= fc.from);
    if (i > 0) {
      const dl = S[i - 1].pts[S[i - 1].pts.length - 1];
      const dh = S[i].pts[S[i].pts.length - 1];
      b.quad(dl, mirror(dl), mirror(dh), dh, paint.house, aft);
    }
  }
}

/** Deck height at vessel z (interpolated between stations). */
export function deckYAt(h: LoftedHull, z: number): number {
  const S = h.sections;
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i];
    const c = S[i + 1];
    if ((z <= a.z && z >= c.z) || (z >= a.z && z <= c.z)) {
      const f = (z - a.z) / (c.z - a.z || 1);
      return a.deckY + (c.deckY - a.deckY) * f;
    }
  }
  return S[0].deckY;
}

/**
 * The wheelhouse: a prism (front face raked) on the deck, windows as dark panes set a
 * little proud of each face in the band sill..head, a roof slab with an overhang.
 */
function wheelhouse(b: Builder, h: LoftedHull, w: WheelhouseDesign, paint: typeof PAINT): void {
  const base = deckYAt(h, (w.z0 + w.z1) / 2) + (w.plinth ?? 0) + (w.above ?? 0);
  const top = base + w.height;
  const rake = w.frontRake ?? 0;
  const hw = w.halfWidth;
  if (w.plinth) b.box(-hw, hw, base - w.plinth, base, w.z1, w.z0, paint.house);
  // Corners: bottom (z0 aft, z1 fwd) and top (front moved forward by the rake).
  const B = (x: number, zz: number) => new THREE.Vector3(x, base, zz);
  const Tt = (x: number, zz: number) => new THREE.Vector3(x, top, zz);
  const zf = w.z1;
  const zft = w.z1 - rake;
  const up = new THREE.Vector3(0, 1, 0);
  b.quad(B(-hw, w.z0), B(-hw, zf), Tt(-hw, zft), Tt(-hw, w.z0), paint.house, new THREE.Vector3(-1, 0, 0)); // port
  b.quad(B(hw, w.z0), B(hw, zf), Tt(hw, zft), Tt(hw, w.z0), paint.house, new THREE.Vector3(1, 0, 0)); // stbd
  b.quad(B(-hw, zf), B(hw, zf), Tt(hw, zft), Tt(-hw, zft), paint.house, new THREE.Vector3(0, 0, -1)); // front
  b.quad(B(-hw, w.z0), B(hw, w.z0), Tt(hw, w.z0), Tt(-hw, w.z0), paint.house, new THREE.Vector3(0, 0, 1)); // back
  // Roof slab.
  const o = w.overhang ?? 0.12;
  b.box(-hw - o, hw + o, top, top + 0.08, zft - o, w.z0 + o, paint.roof);

  // Window panes: on a face given by two bottom corners and the band heights, split into
  // n panes with mullions between.
  const panes = (p0: THREE.Vector3, p1: THREE.Vector3, n: number, out: THREE.Vector3, lean: THREE.Vector3) => {
    if (n <= 0) return;
    const len = p0.distanceTo(p1);
    const mull = 0.08;
    const paneW = (len - mull * (n + 1)) / n;
    if (paneW <= 0.05) return;
    const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
    const proud = out.clone().multiplyScalar(0.015);
    for (let k = 0; k < n; k++) {
      const s0 = mull + k * (paneW + mull);
      const a = p0.clone().addScaledVector(dir, s0).add(proud);
      const c = p0.clone().addScaledVector(dir, s0 + paneW).add(proud);
      // The band, following the face's lean (the front rakes).
      const a0 = a.clone().addScaledVector(lean, w.sill);
      const c0 = c.clone().addScaledVector(lean, w.sill);
      const a1 = a.clone().addScaledVector(lean, w.head);
      const c1 = c.clone().addScaledVector(lean, w.head);
      b.quad(a0, c0, c1, a1, paint.window, out);
    }
  };
  // Side faces lean straight up; the front leans with the rake (unit per metre of height).
  const frontLean = new THREE.Vector3(0, 1, -rake / w.height).normalize().multiplyScalar(Math.hypot(1, rake / w.height));
  panes(B(-hw, zf), B(hw, zf), w.panesFront, new THREE.Vector3(0, 0, -1), frontLean);
  panes(B(-hw, w.z0), B(-hw, zf), w.panesSide, new THREE.Vector3(-1, 0, 0), up);
  panes(B(hw, w.z0), B(hw, zf), w.panesSide, new THREE.Vector3(1, 0, 0), up);
  panes(B(-hw, w.z0), B(hw, w.z0), w.panesBack, new THREE.Vector3(0, 0, 1), up);
}

// ---- hydrostatics -------------------------------------------------------------------

export interface HydroSummary {
  loa: number;
  lwl: number;
  beam: number;
  beamWl: number;
  draught: number;
  depth: number;
  /** Displacement volume (m^3) and mass in sea water (t) at the DWL. */
  volume: number;
  displacementT: number;
  /** Longitudinal centre of buoyancy (m, +aft of amidships) and of flotation. */
  lcb: number;
  lcf: number;
  waterplane: number;
  /** Block, prismatic, midship and waterplane coefficients. */
  cb: number;
  cp: number;
  cm: number;
  cwp: number;
  /** Transverse metacentre above the keel (m): KB + BM. */
  km: number;
}

/** Area and centroid height of the part of a (closed) full section below y = 0, and its waterline half-breadth. */
function immersed(sec: Section): { area: number; yc: number; bwl: number } {
  // Full closed polygon: port keel->deck, then starboard deck->keel.
  const port = sec.pts.map((p) => [p.x, p.y] as [number, number]);
  const poly = [...port, ...port.slice().reverse().map(([x, y]) => [-x, y] as [number, number])];
  // Clip against y <= 0 (Sutherland-Hodgman, one plane).
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const c = poly[(i + 1) % poly.length];
    const ain = a[1] <= 0;
    const cin = c[1] <= 0;
    if (ain) out.push(a);
    if (ain !== cin) {
      const f = (0 - a[1]) / (c[1] - a[1]);
      out.push([a[0] + (c[0] - a[0]) * f, 0]);
    }
  }
  // Shoelace: signed area and first moment about the x axis (sign cancels in the centroid).
  let signed = 0;
  let my = 0;
  let bwl = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const c = out[(i + 1) % out.length];
    const cross = a[0] * c[1] - c[0] * a[1];
    signed += cross;
    my += (a[1] + c[1]) * cross;
    if (Math.abs(a[1]) < 1e-6) bwl = Math.max(bwl, Math.abs(a[0]));
  }
  const area = Math.abs(signed) / 2;
  const yc = Math.abs(signed) > 1e-9 ? my / (3 * signed) : 0;
  return { area, yc, bwl };
}

export function hydrostatics(h: LoftedHull): HydroSummary {
  const S = h.sections;
  let vol = 0;
  let mz = 0;
  let my = 0;
  let awp = 0;
  let mzwp = 0;
  let iwp = 0;
  let amax = 0;
  let bwlMax = 0;
  let zWet0 = -Infinity;
  let zWet1 = Infinity;
  for (let i = 0; i < S.length; i++) {
    const w = i === 0 || i === S.length - 1 ? Math.abs(S[1].z - S[0].z) / 2 : Math.abs(S[1].z - S[0].z);
    const { area, yc, bwl } = immersed(S[i]);
    vol += area * w;
    mz += area * w * S[i].z;
    my += area * w * yc;
    awp += 2 * bwl * w;
    mzwp += 2 * bwl * w * S[i].z;
    iwp += (2 / 3) * bwl * bwl * bwl * w;
    amax = Math.max(amax, area);
    bwlMax = Math.max(bwlMax, bwl);
    if (bwl > 0.01) {
      zWet0 = Math.max(zWet0, S[i].z);
      zWet1 = Math.min(zWet1, S[i].z);
    }
  }
  const lwl = Math.max(0.1, zWet0 - zWet1);
  // Form coefficients are per hull: for a catamaran they describe one demihull.
  const cb = vol / (lwl * 2 * bwlMax * -Math.min(...S.map((s) => s.keelY)) || 1);
  const cp = vol / (amax * lwl || 1);
  const cm = amax / (2 * bwlMax * -Math.min(...S.map((s) => s.keelY)) || 1);
  const cwp = awp / (lwl * 2 * bwlMax || 1);
  const cat = h.design.catamaran;
  if (cat) {
    // Two demihulls: twice everything, and the waterplane inertia about the centreline
    // picks up the parallel-axis term for each demihull's area at +-spacing/2.
    iwp = 2 * (iwp + awp * (cat.spacing / 2) ** 2);
    vol *= 2;
    mz *= 2;
    my *= 2;
    awp *= 2;
    mzwp *= 2;
    amax *= 2;
  }
  const draught = -Math.min(...S.map((s) => s.keelY));
  const beam = (cat ? cat.spacing : 0) + 2 * Math.max(...S.map((s) => s.halfBeam));
  const depth = Math.max(...S.map((s) => s.deckY)) + draught;
  const kb = draught + (vol > 0 ? my / vol : 0);
  const bm = vol > 0 ? iwp / vol : 0;
  return {
    loa: h.design.length,
    lwl,
    beam,
    beamWl: (cat ? cat.spacing : 0) + 2 * bwlMax,
    draught,
    depth,
    volume: vol,
    displacementT: vol * 1.025,
    lcb: vol > 0 ? mz / vol : 0,
    lcf: awp > 0 ? mzwp / awp : 0,
    waterplane: awp,
    cb,
    cp,
    cm,
    cwp,
    km: kb + bm,
  };
}
