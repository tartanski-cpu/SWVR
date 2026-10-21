/**
 * A coast region's trees near the viewer (the settlements brief, Part B2 and the near band
 * of B3), scattered from its forest map (world/forest.ts):
 *
 *   where     each `tile` m square is scattered once and kept: a Poisson-disc scatter (no
 *             two trees closer than the closest-spaced kind of wood, no regular grid), each
 *             point kept or not by the map's density there and its kind's own spacing; a
 *             plantation or an orchard instead in rows (a jittered grid, its rows all one way
 *             across the region, as they're planted). Seeded by the region and the square:
 *             the same trees every visit.
 *   which     the kind's species mix (the region's theme, from the package): in the West
 *             Highlands a plantation is all conifers, a natural wood birch and oak with a few
 *             pines; on Syros pines, olives and scrub.
 *   models    five low-poly trees, 20-32 triangles each, flat-shaded: conifer (two cones on a
 *             trunk), broadleaf (a faceted crown; an olive is one, squat and grey-green), birch
 *             (narrow crown, pale trunk), scrub (a low lumpy bush) and pine (a flat umbrella
 *             crown on a tall trunk). Each tree its own height, width, turn, lean and crown
 *             colour (from its species' colours, lighter or darker), so a few models make
 *             thousands of different trees. A plantation's trees vary less.
 *   drawing   one instanced mesh per model (five draw calls at most), filled with the trees
 *             within CONFIG.trees.nearDistance, nearest first, up to `maxNear`, placed again as
 *             the viewer moves. No shadows, no colliders: scenery.
 * (The far woods, a canopy over the forest seen from the sea, are milestone 5.)
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { coastGroundSolid } from '../coastTerrain';
import { forestCell, type Forest } from '../forest';
import { groundHeight } from '../terrain';

export type TreeModel = 'conifer' | 'broadleaf' | 'birch' | 'scrub' | 'pine';
const MODELS: TreeModel[] = ['conifer', 'broadleaf', 'birch', 'scrub', 'pine'];
/** Which model each species is drawn with. */
const MODEL_OF: Record<string, TreeModel> = { conifer: 'conifer', broadleaf: 'broadleaf', birch: 'birch', scrub: 'scrub', pine: 'pine', olive: 'broadleaf' };

/** A small seeded random number generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ── The models: a unit tree (1 m tall, 1 m across the crown), scaled per tree ──

/** Triangles with a colour each and a crown flag (1: tinted by the tree's colour; 0: the trunk keeps its own). */
class Builder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly crown: number[] = [];
  tri(a: number[], b: number[], c: number[], colour: number, crown: number): void {
    const k = new THREE.Color(colour);
    for (const v of [a, b, c]) {
      this.pos.push(v[0], v[1], v[2]);
      this.col.push(k.r, k.g, k.b);
      this.crown.push(crown);
    }
  }
  /** A ring of `n` points at height y, radius r (an optional seeded wobble). */
  static ring(n: number, y: number, r: number, turn = 0): number[][] {
    return Array.from({ length: n }, (_, i) => [Math.cos(turn + (i / n) * Math.PI * 2) * r, y, Math.sin(turn + (i / n) * Math.PI * 2) * r]);
  }
  /** A trunk: an open prism of `n` sides from y0 to y1. */
  trunk(r: number, y0: number, y1: number, colour: number, n = 4): void {
    const lo = Builder.ring(n, y0, r, 0.4);
    const hi = Builder.ring(n, y1, r * 0.75, 0.4);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.tri(lo[i], hi[i], lo[j], colour, 0);
      this.tri(lo[j], hi[i], hi[j], colour, 0);
    }
  }
  /** A cone: base ring at y0 (closed underneath), apex at y1. */
  cone(r: number, y0: number, y1: number, n: number, colour: number, turn: number): void {
    const base = Builder.ring(n, y0, r, turn);
    const apex = [0, y1, 0];
    const mid = [0, y0, 0];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.tri(base[i], apex, base[j], colour, 1);
      this.tri(base[j], mid, base[i], colour, 1);
    }
  }
  /** A faceted crown: an icosahedron centred at (0, cy, 0), radii rx, ry (its points wobbled a little). */
  blob(cy: number, rx: number, ry: number, colour: number, seed: number): void {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const p = g.attributes.position;
    const r = rng(seed);
    // The same corner wobbles the same way on every face it's on.
    const wobble = new Map<string, number>();
    for (let i = 0; i < p.count; i += 3) {
      const v = [0, 1, 2].map((k) => {
        const x = p.getX(i + k);
        const y = p.getY(i + k);
        const z = p.getZ(i + k);
        const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
        if (!wobble.has(key)) wobble.set(key, 0.85 + 0.3 * r());
        const w = wobble.get(key)!;
        return [x * rx * w, cy + y * ry * w, z * rx * w];
      });
      this.tri(v[0], v[1], v[2], colour, 1);
    }
    g.dispose();
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('crown', new THREE.Float32BufferAttribute(this.crown, 1));
    g.computeVertexNormals();
    return g;
  }
}

const BARK = 0x4a3a2a;
const BIRCH_BARK = 0xd8d4c8;
/** The five models (triangles: conifer 32, broadleaf 28, birch 28, scrub 20, pine 28). */
export function treeGeometry(model: TreeModel): THREE.BufferGeometry {
  const b = new Builder();
  if (model === 'conifer') {
    b.trunk(0.045, 0, 0.16, BARK);
    b.cone(0.5, 0.12, 0.74, 6, 0xffffff, 0);
    b.cone(0.36, 0.44, 1, 6, 0xffffff, 0.5);
  } else if (model === 'broadleaf') {
    b.trunk(0.06, 0, 0.42, BARK);
    b.blob(0.64, 0.5, 0.36, 0xffffff, 11);
  } else if (model === 'birch') {
    b.trunk(0.035, 0, 0.55, BIRCH_BARK);
    b.blob(0.7, 0.5, 0.3, 0xffffff, 23);
  } else if (model === 'scrub') {
    b.blob(0.4, 0.5, 0.42, 0xffffff, 37);
  } else {
    b.trunk(0.045, 0, 0.78, BARK);
    b.blob(0.86, 0.5, 0.15, 0xffffff, 41);
  }
  return b.geometry();
}

/**
 * The trees' material: flat-shaded, vertex-coloured, each tree's colour tinting only its
 * crown (the `crown` attribute), so a birch keeps its pale trunk.
 */
function treeMaterial(): THREE.MeshLambertMaterial {
  // Both sides: a few small triangles whose winding needn't be checked one by one.
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float crown;').replace(
      '#include <color_vertex>',
      `vColor = vec4(1.0);
#ifdef USE_COLOR
  vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, crown);
#endif`,
    );
  };
  m.customProgramCacheKey = () => 'trees';
  return m;
}

// ── The scatter ──

/** One tree: where, which model, its size, turn, lean and colour. */
interface Tree {
  x: number;
  z: number;
  model: number;
  height: number;
  width: number;
  turn: number;
  leanX: number;
  leanZ: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Scatter one tile (its south-west corner at world (tx, tz), `size` m a side) from the forest
 * map. Pure: the same tile gives the same trees.
 */
export function scatterTile(f: Forest, seed: number, tx: number, tz: number, size: number): Tree[] {
  const L = f.layout;
  const styles = L.kinds.map((k) => L.styles[k]);
  const out: Tree[] = [];
  const r = rng(seed ^ Math.imul(Math.round(tx / size) + 7919, 73856093) ^ Math.imul(Math.round(tz / size) + 104729, 19349663));
  const spec = CONFIG.trees.species as Record<string, { height: [number, number]; width: [number, number]; lean: number }>;
  const keep = (x: number, z: number, rows: boolean, rMin: number): void => {
    const cell = forestCell(f, x, z);
    const kind = cell >> 4;
    const dens = cell & 15;
    if (!kind || !dens) return;
    const st = styles[kind - 1];
    if (!st || !!st.rows !== rows) return;
    // Thinned to the map's density, and (scattered woods) to the kind's own spacing.
    const thin = (dens / 15) * (rows ? 1 : (rMin / st.spacing) ** 2);
    if (r() > thin) return;
    // The species, by the kind's mix.
    const total = st.species.reduce((t, [, w]) => t + w, 0);
    let at = r() * total;
    let species = st.species[0][0];
    for (const [sp, w] of st.species) if ((at -= w) < 0) {
      species = sp;
      break;
    }
    const s = spec[species] ?? spec.broadleaf;
    // A plantation's trees are much of an age: less spread in size, standing straight.
    const spread = rows ? 0.35 : 1;
    const h = s.height[0] + (s.height[1] - s.height[0]) * (0.5 + (r() - 0.5) * spread);
    const w = h * (s.width[0] + (s.width[1] - s.width[0]) * r());
    const lean = ((rows ? 0.3 : 1) * s.lean * Math.PI) / 180;
    const colours = L.colours[species] ?? [0x4a6a34];
    const c = new THREE.Color(colours[Math.floor(r() * colours.length)]);
    const shade = 0.85 + 0.3 * r();
    out.push({ x, z, model: MODELS.indexOf(MODEL_OF[species] ?? 'broadleaf'), height: h, width: w, turn: r() * Math.PI * 2, leanX: (r() - 0.5) * 2 * lean, leanZ: (r() - 0.5) * 2 * lean, r: c.r * shade, g: c.g * shade, b: c.b * shade });
  };

  // Scattered woods: a Poisson-disc scatter (Bridson) at the closest spacing of the scattered kinds.
  const scattered = styles.filter((s) => !s.rows);
  if (scattered.length) {
    const rMin = Math.min(...scattered.map((s) => s.spacing));
    const cs = rMin / Math.SQRT2;
    const n = Math.ceil(size / cs);
    const grid = new Int32Array(n * n).fill(-1);
    const pts: [number, number][] = [];
    const active: number[] = [];
    const add = (x: number, z: number) => {
      pts.push([x, z]);
      active.push(pts.length - 1);
      grid[Math.min(n - 1, Math.floor(z / cs)) * n + Math.min(n - 1, Math.floor(x / cs))] = pts.length - 1;
    };
    add(r() * size, r() * size);
    while (active.length) {
      const ai = Math.floor(r() * active.length);
      const [px, pz] = pts[active[ai]];
      let found = false;
      for (let k = 0; k < 20; k++) {
        const a = r() * Math.PI * 2;
        const d = rMin * (1 + r());
        const x = px + Math.cos(a) * d;
        const z = pz + Math.sin(a) * d;
        if (x < 0 || z < 0 || x >= size || z >= size) continue;
        const gi = Math.floor(x / cs);
        const gj = Math.floor(z / cs);
        let ok = true;
        for (let j = Math.max(0, gj - 2); j <= Math.min(n - 1, gj + 2) && ok; j++)
          for (let i = Math.max(0, gi - 2); i <= Math.min(n - 1, gi + 2); i++) {
            const q = grid[j * n + i];
            if (q >= 0 && Math.hypot(pts[q][0] - x, pts[q][1] - z) < rMin) {
              ok = false;
              break;
            }
          }
        if (ok) {
          add(x, z);
          found = true;
          break;
        }
      }
      if (!found) active.splice(ai, 1);
    }
    for (const [x, z] of pts) keep(tx + x, tz + z, false, rMin);
  }
  // Plantations and orchards: rows, all one way across the region, a little jitter.
  for (const st of styles.filter((s) => s.rows)) {
    const a = (seed % 360) * (Math.PI / 180);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const sp = st.spacing;
    // The grid's points that fall in the tile: walk the rotated grid over the tile's bounding circle.
    const cx = tx + size / 2;
    const cz = tz + size / 2;
    const u0 = Math.floor((cx * ca + cz * sa) / sp);
    const v0 = Math.floor((-cx * sa + cz * ca) / sp);
    const reach = Math.ceil((size * 0.75) / sp);
    for (let v = v0 - reach; v <= v0 + reach; v++)
      for (let u = u0 - reach; u <= u0 + reach; u++) {
        const jx = (r() - 0.5) * 0.3 * sp;
        const jz = (r() - 0.5) * 0.3 * sp;
        const x = (u * sp + jx) * ca - (v * sp + jz) * sa;
        const z = (u * sp + jx) * sa + (v * sp + jz) * ca;
        if (x < tx || z < tz || x >= tx + size || z >= tz + size) continue;
        keep(x, z, true, sp);
      }
  }
  return out;
}

/** The trees near the viewer, drawn as one instanced mesh per model. */
export class TreesView {
  readonly root = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[];
  private readonly tiles = new Map<string, Tree[]>();
  private readonly seed: number;
  private lastX = Infinity;
  private lastZ = Infinity;
  private lastAt = -Infinity;
  /** Trees drawn now (for the debug overlay and the tests). */
  count = 0;
  triangles = 0;

  constructor(private readonly forest: Forest) {
    this.root.name = 'trees';
    this.seed = hashString(forest.id);
    const mat = treeMaterial();
    const max = CONFIG.trees.maxNear;
    this.meshes = MODELS.map((m) => {
      const mesh = new THREE.InstancedMesh(treeGeometry(m), mat, max);
      mesh.name = `trees:${m}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.count = 0;
      // They stand round the viewer: never all off screen, and their bounds change as they're placed.
      mesh.frustumCulled = false;
      this.root.add(mesh);
      return mesh;
    });
  }

  /** Once a frame: place the trees again if the viewer has moved far enough, or now and then (ground streaming in). */
  update(x: number, z: number): void {
    const c = CONFIG.trees;
    const now = performance.now();
    if (Math.hypot(x - this.lastX, z - this.lastZ) < c.moveAgain && now - this.lastAt < c.refresh * 1000) return;
    this.lastX = x;
    this.lastZ = z;
    this.lastAt = now;
    this.place(x, z);
  }

  private tile(i: number, j: number): Tree[] {
    const key = `${i},${j}`;
    let t = this.tiles.get(key);
    if (!t) {
      const size = CONFIG.trees.tile;
      t = scatterTile(this.forest, this.seed, i * size, j * size, size);
      this.tiles.set(key, t);
      // Keep the cache to the squares near the viewer (and a ring round them).
      if (this.tiles.size > 400) for (const k of [...this.tiles.keys()].slice(0, 100)) this.tiles.delete(k);
    }
    return t;
  }

  private place(x: number, z: number): void {
    const c = CONFIG.trees;
    const size = c.tile;
    const R = c.nearDistance;
    // Every tree within R, nearest first, up to maxNear.
    const near: { t: Tree; d: number }[] = [];
    for (let j = Math.floor((z - R) / size); j <= Math.floor((z + R) / size); j++)
      for (let i = Math.floor((x - R) / size); i <= Math.floor((x + R) / size); i++) {
        const dx = Math.max(i * size - x, 0, x - (i + 1) * size);
        const dz = Math.max(j * size - z, 0, z - (j + 1) * size);
        if (Math.hypot(dx, dz) > R) continue;
        for (const t of this.tile(i, j)) {
          const d = Math.hypot(t.x - x, t.z - z);
          if (d <= R) near.push({ t, d });
        }
      }
    near.sort((a, b) => a.d - b.d);
    const counts = MODELS.map(() => 0);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    for (const { t } of near) {
      if (n >= c.maxNear) break;
      // Only where the ground is the detailed mesh (a big map's square not yet streamed in is coarse: they'd float or sink).
      if (!coastGroundSolid(t.x, t.z)) continue;
      const mesh = this.meshes[t.model];
      const k = counts[t.model]++;
      p.set(t.x, groundHeight(t.x, t.z) - 0.25, t.z);
      q.setFromEuler(e.set(t.leanX, t.turn, t.leanZ, 'YXZ'));
      s.set(t.width, t.height, t.width);
      mesh.setMatrixAt(k, m.compose(p, q, s));
      mesh.setColorAt(k, col.setRGB(t.r, t.g, t.b));
      n++;
    }
    this.count = n;
    this.triangles = 0;
    this.meshes.forEach((mesh, i) => {
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = counts[i] > 0;
      this.triangles += (counts[i] * mesh.geometry.attributes.position.count) / 3;
    });
  }
}
