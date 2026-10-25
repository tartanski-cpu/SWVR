/**
 * A harbour tug's fendering (owner, Oct 2026: the harbour tug, step 2), built on the game's
 * own stations for her (vessel/hullForm.ts hullFormFromDesign), so it sits on her hull as the
 * game draws it. Heavy black rubber, as on harbour tugs:
 *   belt       a D-fender (a half-round) along each side just under her deck edge;
 *   lowerBelt  a second, smaller one below it, along her parallel body;
 *   stern      a cylinder fender round her stern: across her transom and round its corners;
 *   bow        a cylinder fender round the top of her bow, shoulder to shoulder, and under it
 *              a row of ribbed block fenders down towards her waterline, for pushing ships.
 * Where each runs is along her length as `t` (0 her transom, 1 her stem), as her design curves.
 * Drawn only for now (the hull study viewer): her contacts with quays and ships, and her
 * place in the game, come when she goes into the Shipyard.
 */
import * as THREE from 'three';
import type { HullForm, Station } from '../vessel/hullForm';

export interface FenderRun {
  /** Radius of its section (m). */
  radius: number;
  /** How far under her deck edge its middle is (m). */
  drop: number;
  /** Along her length (t, 0 transom .. 1 stem): where it runs. */
  from: number;
  to: number;
}

export interface TugFendering {
  belt: FenderRun;
  lowerBelt?: FenderRun;
  /** Round her stern, from `to` on one side across her transom to `to` on the other (`from` unused). */
  stern: FenderRun;
  /** Round her bow, from `from` on one side round her stem to `from` on the other (`to` unused). */
  bow: FenderRun & {
    /** The block fenders under it: each `width` across, `gap` between, `depth` thick, `height` deep (m). */
    blocks: { width: number; gap: number; depth: number; height: number };
  };
}

/** Black rubber. */
export const RUBBER = 0x1b1c1e;

type P = THREE.Vector3;

/** Her starboard side's half-breadth at height `y` on a station, down her drawn outline from her deck edge. */
function sideAt(st: Station, y: number): number {
  const p = st.polygon;
  const pts: [number, number][] = [p[4], ...(st.bilge ? [st.bilge[1], st.bilge[0]] : [p[3]]), p[2]];
  if (y >= pts[0][1]) return pts[0][0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (y <= y0 && y >= y1) return y0 === y1 ? x0 : x0 + ((x1 - x0) * (y0 - y)) / (y0 - y1);
  }
  return pts[pts.length - 1][0];
}

/**
 * A point on her starboard side `drop` under her deck edge, at `t` along her (stations
 * interpolated): [half-breadth, height, z].
 */
function sidePoint(form: HullForm, t: number, drop: number): P {
  const st = [...form.stations].sort((a, b) => b.z - a.z); // transom first
  const z0 = st[0].z;
  const z1 = st[st.length - 1].z;
  const z = z0 + (z1 - z0) * Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < st.length - 2 && st[i + 1].z > z) i++;
  const a = st[i];
  const b = st[i + 1];
  const u = a.z === b.z ? 0 : (z - a.z) / (b.z - a.z);
  const deckY = a.polygon[4][1] + u * (b.polygon[4][1] - a.polygon[4][1]);
  const y = deckY - drop;
  return new THREE.Vector3(sideAt(a, y) + u * (sideAt(b, y) - sideAt(a, y)), y, z);
}

/** Samples along t from `a` to `b`: her stations' spacing, closer (`fine`) where her ends curve. */
function samples(a: number, b: number, n: number): number[] {
  const out = new Set<number>([a, b]);
  const step = 1 / (n - 1);
  for (let k = 0; k < n; k++) {
    const t = k * step;
    if (t > Math.min(a, b) && t < Math.max(a, b)) out.add(t);
  }
  // Closer round her bow and stern, where she curves in plan.
  for (let t = 0; t <= 1.0001; t += 0.02) if ((t < 0.15 || t > 0.85) && t > Math.min(a, b) && t < Math.max(a, b)) out.add(Math.round(t * 1000) / 1000);
  const ts = [...out].sort((x, y) => x - y);
  return a <= b ? ts : ts.reverse();
}

/** Each point's outward direction, level: across the path, away from her middle. */
function outwards(path: P[], zMid: number): P[] {
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    const o = new THREE.Vector3(-t.z, 0, t.x);
    if (o.dot(new THREE.Vector3(p.x, 0, p.z - zMid)) < 0) o.negate();
    return o;
  });
}

class Mesh {
  pos: number[] = [];
  /** Triangle a-b-c, wound to face away from `inside`. */
  tri(a: P, b: P, c: P, inside: P): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-12) return;
    const m = a.clone().add(b).add(c).divideScalar(3).sub(inside);
    const v = n.dot(m) >= 0 ? [a, b, c] : [a, c, b];
    for (const p of v) this.pos.push(p.x, p.y, p.z);
  }
  /**
   * A tube along `path`: round (`full`), or a half-round with its flat back on the path
   * bulging outwards; its ends closed.
   */
  tube(path: P[], out: P[], r: number, full: boolean): void {
    const N = full ? 8 : 4;
    const up = new THREE.Vector3(0, 1, 0);
    const centres = path.map((p, i) => (full ? p.clone().addScaledVector(out[i], r * 0.85) : p.clone()));
    const rings = centres.map((c, i) =>
      Array.from({ length: full ? N : N + 1 }, (_, k) => {
        const ang = full ? (2 * Math.PI * k) / N : -Math.PI / 2 + (Math.PI * k) / N;
        return c.clone().addScaledVector(out[i], r * Math.cos(ang)).addScaledVector(up, r * Math.sin(ang));
      }),
    );
    for (let i = 0; i < rings.length - 1; i++) {
      const inside = centres[i].clone().add(centres[i + 1]).multiplyScalar(0.5);
      const m = rings[i].length;
      for (let k = 0; k < (full ? m : m - 1); k++) {
        const k1 = (k + 1) % m;
        this.tri(rings[i][k], rings[i][k1], rings[i + 1][k1], inside);
        this.tri(rings[i][k], rings[i + 1][k1], rings[i + 1][k], inside);
      }
    }
    // Its ends.
    for (const [i, j] of [[0, 1], [rings.length - 1, rings.length - 2]]) {
      const c = centres[i];
      const beyond = centres[j];
      const ring = rings[i];
      for (let k = 0; k < (full ? ring.length : ring.length - 1); k++) this.tri(c, ring[k], ring[(k + 1) % ring.length], beyond);
    }
  }
  /** A block between two levels: at each, its back's middle `b`, across it `along`, out `out`. */
  block(levels: { b: P; along: P; out: P }[], w: number, d: number): void {
    const corners = levels.map(({ b, along, out }) => [
      b.clone().addScaledVector(along, -w / 2),
      b.clone().addScaledVector(along, w / 2),
      b.clone().addScaledVector(along, w / 2).addScaledVector(out, d),
      b.clone().addScaledVector(along, -w / 2).addScaledVector(out, d),
    ]);
    const [t, u] = corners;
    const mid = [...t, ...u].reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(8);
    const quad = (a: P, b: P, c: P, e: P) => {
      this.tri(a, b, c, mid);
      this.tri(a, c, e, mid);
    };
    quad(t[0], t[1], t[2], t[3]);
    quad(u[0], u[1], u[2], u[3]);
    for (let k = 0; k < 4; k++) quad(t[k], t[(k + 1) % 4], u[(k + 1) % 4], u[k]);
  }
}

/** Her fendering as one mesh (black rubber), in her own axes as the game's hull form has them. */
export function fenderingGeometry(form: HullForm, f: TugFendering): THREE.BufferGeometry {
  const m = new Mesh();
  const st = form.stations;
  const n = st.length;
  const zMid = (st[0].z + st[n - 1].z) / 2;
  const mirror = (p: P) => new THREE.Vector3(-p.x, p.y, p.z);
  const along = (run: FenderRun, ts: number[]) => ts.map((t) => sidePoint(form, t, run.drop));
  // The belts: each side on its own, a half-round with its back on her plating.
  for (const run of [f.belt, f.lowerBelt]) {
    if (!run) continue;
    const stbd = along(run, samples(run.from, run.to, n));
    for (const side of [stbd, stbd.map(mirror)]) m.tube(side, outwards(side, zMid), run.radius, false);
  }
  // Round her stern: up one quarter, across her transom, down the other.
  {
    const run = f.stern;
    const quarter = along(run, samples(run.to, 0, n));
    const z0 = quarter[quarter.length - 1];
    const across = Array.from({ length: 7 }, (_, k) => new THREE.Vector3(z0.x * (1 - (2 * (k + 1)) / 8), z0.y, z0.z));
    const path = [...quarter, ...across, ...quarter.slice().reverse().map(mirror)];
    m.tube(path, outwards(path, zMid), run.radius, true);
  }
  // Round her bow: from one shoulder round her stem to the other.
  {
    const run = f.bow;
    const shoulder = along(run, samples(run.from, 1, n));
    const path = [...shoulder, ...shoulder.slice(0, -1).reverse().map(mirror)];
    m.tube(path, outwards(path, zMid), run.radius, true);
    // The blocks under it, shoulder to shoulder, each standing on her plating.
    const b = run.blocks;
    const top = run.drop + run.radius * 1.1;
    const levels = (t: number, side: number) =>
      [top, top + b.height].map((drop) => {
        const p = sidePoint(form, t, drop);
        return side < 0 ? mirror(p) : p;
      });
    const ts = samples(run.from, 1, 200);
    // Her bow's girth along the blocks' top, each way from her stem.
    const pts = ts.map((t) => levels(t, 1)[0]);
    const s: number[] = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const girth = s[s.length - 1];
    const pitch = b.width + b.gap;
    const tAt = (len: number) => {
      let i = 1;
      while (i < s.length - 1 && s[i] < len) i++;
      const u = (len - s[i - 1]) / Math.max(1e-9, s[i] - s[i - 1]);
      return ts[i - 1] + u * (ts[i] - ts[i - 1]);
    };
    // From her stem aft each way: the first block centred on her stem.
    for (let len = girth; len > b.width; len -= pitch) {
      const t = tAt(len);
      for (const side of len >= girth - 1e-6 ? [1] : [1, -1]) {
        const [p0, p1] = levels(t, side);
        const [q0] = levels(tAt(Math.max(0, len - 0.05)), side);
        const dir = new THREE.Vector3(q0.x - p0.x, 0, q0.z - p0.z).normalize();
        const out = new THREE.Vector3(-dir.z, 0, dir.x);
        if (out.dot(new THREE.Vector3(p0.x, 0, p0.z - zMid)) < 0) out.negate();
        m.block([{ b: p0, along: dir, out }, { b: p1, along: dir, out }], b.width, b.depth);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  const c = new THREE.Color(RUBBER);
  g.setAttribute('color', new THREE.Float32BufferAttribute(m.pos.map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
  g.computeVertexNormals();
  return g;
}
