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
 *   drawing   three bands (milestone 5), so a wooded hillside reads as woods from the sea:
 *             near      the full trees within CONFIG.trees.nearDistance, nearest first, up to
 *                       `maxNear`: one instanced mesh per model (five draw calls at most);
 *             middle    out to `midDistance`, a sparser scatter (a jittered grid, about one
 *                       tree in midThin² of the near band's) of cheaper models (5-16 triangles,
 *                       no trunks: the canopy hides their feet), crowns a little bigger: five
 *                       more instanced meshes, up to `maxMid`;
 *             far       the canopy: a bumpy, flat-shaded surface over the woods at their
 *                       height (per kind of wood), falling to the ground at their edges, out to
 *                       `canopyDistance`, built a 2 km square a frame and merged into one mesh.
 *                       It isn't drawn within `canopyFrom` of the viewer (a dithered fade),
 *                       where the trees themselves stand.
 *             No shadows, no colliders: scenery. Placed again as the viewer moves.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { coastGroundSolid } from '../coastTerrain';
import { forestCell, type Forest, type ForestLayout } from '../forest';
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
 * The middle band's models, cheaper (5-16 triangles): no trunk under a crown (the canopy
 * hides the feet of the trees out there), an octahedron for a crown, a five-sided cone for
 * a conifer. Same unit size as the near models, so a tree's scale means the same.
 */
export function midTreeGeometry(model: TreeModel): THREE.BufferGeometry {
  const b = new Builder();
  const octa = (cy: number, rx: number, ry: number) => {
    const ring = Builder.ring(4, cy, rx, 0.3);
    const top = [0, cy + ry, 0];
    const bot = [0, cy - ry, 0];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      b.tri(ring[i], top, ring[j], 0xffffff, 1);
      b.tri(ring[j], bot, ring[i], 0xffffff, 1);
    }
  };
  if (model === 'conifer') {
    const base = Builder.ring(5, 0.12, 0.5, 0);
    for (let i = 0; i < 5; i++) b.tri(base[i], [0, 1, 0], base[(i + 1) % 5], 0xffffff, 1);
  } else if (model === 'broadleaf') octa(0.62, 0.5, 0.38);
  else if (model === 'birch') octa(0.7, 0.5, 0.3);
  else if (model === 'scrub') octa(0.4, 0.5, 0.4);
  else {
    b.trunk(0.045, 0, 0.78, BARK);
    octa(0.86, 0.5, 0.15);
  }
  return b.geometry();
}

/**
 * The far woods' canopy (milestone 5): over the wooded ground, a bumpy surface at the height
 * of the kind of wood (CONFIG.trees.canopyHeight), falling to the ground at the wood's edge
 * (each corner the mean of the four cells round it, and a skirt down to the ground along its
 * edge), flat-shaded, coloured by the kind's species. One `canopySquare` m square, on a
 * `canopyCell` m grid, in world coordinates. Pure.
 */
export function canopyArrays(f: Forest, x0: number, z0: number): { position: Float32Array; color: Float32Array } {
  const c = CONFIG.trees;
  const cell = c.canopyCell;
  const n = Math.round(c.canopySquare / cell);
  const L = f.layout;
  // Each kind's colour: its species' colours, by its mix, a shade darker (a canopy's shadowed crowns).
  const kindColour = L.kinds.map((k) => {
    const st = L.styles[k];
    const total = st.species.reduce((t, [, w]) => t + w, 0);
    const col = new THREE.Color(0, 0, 0);
    for (const [sp, w] of st.species) col.add(new THREE.Color((L.colours[sp] ?? [0x4a6a34])[0]).multiplyScalar(w / total));
    return col.multiplyScalar(0.88);
  });
  // The cells: their canopy height (0: none) and kind.
  const hc = new Float32Array(n * n);
  const kc = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = forestCell(f, x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
      const kind = v >> 4;
      const dens = v & 15;
      if (!kind || dens < c.canopyMinDensity) continue;
      hc[j * n + i] = (c.canopyHeight[L.kinds[kind - 1]] ?? 10) * (0.75 + (0.25 * dens) / 15);
      kc[j * n + i] = kind;
    }
  const cellH = (i: number, j: number) => (i < 0 || j < 0 || i >= n || j >= n ? forestH(i, j) : hc[j * n + i]);
  // Cells just outside the square (for the corners on its edge): looked up the same way.
  const forestH = (i: number, j: number) => {
    const v = forestCell(f, x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
    const kind = v >> 4;
    return kind && (v & 15) >= c.canopyMinDensity ? (c.canopyHeight[L.kinds[kind - 1]] ?? 10) * (0.75 + (0.25 * (v & 15)) / 15) : 0;
  };
  // The corners: the ground, and the canopy (the mean of the four cells round each) with a bump.
  const N = n + 1;
  const ground = new Float32Array(N * N);
  const top = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      const g = groundHeight(x, z);
      const h = (cellH(i - 1, j - 1) + cellH(i, j - 1) + cellH(i - 1, j) + cellH(i, j)) / 4;
      const bump = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      ground[j * N + i] = g;
      top[j * N + i] = g + h + (h > 0 ? bump * c.canopyBump * Math.min(1, h / 8) : 0);
    }
  const pos: number[] = [];
  const col: number[] = [];
  const put = (p: number[][], k: THREE.Color, shade: number) => {
    for (const v of p) pos.push(v[0], v[1], v[2]);
    for (let q = 0; q < p.length; q++) col.push(k.r * shade, k.g * shade, k.b * shade);
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (!hc[j * n + i]) continue;
      const k = kindColour[kc[j * n + i] - 1];
      const shade = 0.9 + 0.2 * Math.abs((Math.sin((x0 + i * cell) * 3.1 + (z0 + j * cell) * 7.7) * 4375.85) % 1);
      const P = (ii: number, jj: number, y: Float32Array) => [x0 + ii * cell, y[jj * N + ii], z0 + jj * cell];
      // The canopy over the cell.
      put([P(i, j, top), P(i, j + 1, top), P(i + 1, j, top), P(i + 1, j, top), P(i, j + 1, top), P(i + 1, j + 1, top)], k, shade);
      // A skirt down to the ground on each side that borders unwooded ground.
      const side = (a: [number, number], b: [number, number]) => put([P(a[0], a[1], top), P(b[0], b[1], top), P(a[0], a[1], ground), P(a[0], a[1], ground), P(b[0], b[1], top), P(b[0], b[1], ground)], k, shade * 0.75);
      if (!cellH(i, j - 1)) side([i, j], [i + 1, j]);
      if (!cellH(i, j + 1)) side([i + 1, j + 1], [i, j + 1]);
      if (!cellH(i - 1, j)) side([i, j + 1], [i, j]);
      if (!cellH(i + 1, j)) side([i + 1, j], [i + 1, j + 1]);
    }
  return { position: new Float32Array(pos), color: new Float32Array(col) };
}

/**
 * The canopy's material: flat-shaded, vertex-coloured, both sides; not drawn within
 * `canopyFrom` of the viewer (where the trees themselves stand), fading in over `canopyFade`
 * m by a dither (no transparency, so no sorting and no overdraw).
 */
function canopyMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const c = CONFIG.trees;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.canopyFrom = { value: c.canopyFrom };
    shader.uniforms.canopyFade = { value: c.canopyFade };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCanopyWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCanopyWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCanopyWorld;\nuniform float canopyFrom;\nuniform float canopyFade;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
{
  float d = distance(vCanopyWorld.xz, cameraPosition.xz);
  float t = (d - (canopyFrom - canopyFade)) / canopyFade;
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (t < dither) discard;
}`,
      );
  };
  m.customProgramCacheKey = () => 'canopy';
  return m;
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

type SpeciesSpec = { height: [number, number]; width: [number, number]; lean: number };

/**
 * One tree at world (x, z), or none: kept by the map's density there (and, for scattered
 * woods, thinned from a scatter `rMin` m apart to the kind's own spacing); its species by the
 * kind's mix, its size, turn, lean and colour by `r`. `rows`: only a planted kind (true),
 * only a scattered one (false), or either (null: the middle band's sparse grid).
 */
function plantTree(f: Forest, styles: ForestLayout['styles'][string][], r: () => number, x: number, z: number, rows: boolean | null, rMin: number): Tree | null {
  const cell = forestCell(f, x, z);
  const kind = cell >> 4;
  const dens = cell & 15;
  if (!kind || !dens) return null;
  const st = styles[kind - 1];
  if (!st || (rows !== null && !!st.rows !== rows)) return null;
  const thin = (dens / 15) * Math.min(1, (rMin / st.spacing) ** 2);
  if (r() > thin) return null;
  // The species, by the kind's mix.
  const total = st.species.reduce((t, [, w]) => t + w, 0);
  let at = r() * total;
  let species = st.species[0][0];
  for (const [sp, w] of st.species)
    if ((at -= w) < 0) {
      species = sp;
      break;
    }
  const spec = CONFIG.trees.species as Record<string, SpeciesSpec>;
  const s = spec[species] ?? spec.broadleaf;
  // A plantation's trees are much of an age: less spread in size, standing straight.
  const planted = !!st.rows;
  const spread = planted ? 0.35 : 1;
  const h = s.height[0] + (s.height[1] - s.height[0]) * (0.5 + (r() - 0.5) * spread);
  const w = h * (s.width[0] + (s.width[1] - s.width[0]) * r());
  const lean = ((planted ? 0.3 : 1) * s.lean * Math.PI) / 180;
  const colours = f.layout.colours[species] ?? [0x4a6a34];
  const c = new THREE.Color(colours[Math.floor(r() * colours.length)]);
  const shade = 0.85 + 0.3 * r();
  return { x, z, model: MODELS.indexOf(MODEL_OF[species] ?? 'broadleaf'), height: h, width: w, turn: r() * Math.PI * 2, leanX: (r() - 0.5) * 2 * lean, leanZ: (r() - 0.5) * 2 * lean, r: c.r * shade, g: c.g * shade, b: c.b * shade };
}

/** A tile's own random sequence (the region's seed and the tile's place; `salt` for another use of the same tile). */
function tileRng(seed: number, tx: number, tz: number, size: number, salt = 0): () => number {
  return rng(seed ^ Math.imul(Math.round(tx / size) + 7919, 73856093) ^ Math.imul(Math.round(tz / size) + 104729, 19349663) ^ salt);
}

/**
 * Scatter one tile (its south-west corner at world (tx, tz), `size` m a side) from the forest
 * map. Pure: the same tile gives the same trees.
 */
export function scatterTile(f: Forest, seed: number, tx: number, tz: number, size: number): Tree[] {
  const L = f.layout;
  const styles = L.kinds.map((k) => L.styles[k]);
  const out: Tree[] = [];
  const r = tileRng(seed, tx, tz, size);
  const keep = (x: number, z: number, rows: boolean, rMin: number): void => {
    const t = plantTree(f, styles, r, x, z, rows, rMin);
    if (t) out.push(t);
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

/**
 * The middle band's trees in a tile: a jittered grid `midThin` times the closest spacing
 * apart (so about one tree in midThin² of the near band's), cheap to make for the many tiles
 * out to midDistance. Pure, as scatterTile.
 */
export function scatterMid(f: Forest, seed: number, tx: number, tz: number, size: number): Tree[] {
  const L = f.layout;
  const styles = L.kinds.map((k) => L.styles[k]);
  const r = tileRng(seed, tx, tz, size, 0x5bd1e995);
  const minSpacing = Math.min(...styles.map((s) => s.spacing));
  const g = minSpacing * CONFIG.trees.midThin;
  // Thinned as if from a scatter at 0.85 of the closest spacing (a Poisson-disc scatter packs
  // about that much looser than a grid), so each kind ends up about 1/midThin² as thick as
  // in the near band.
  const rEff = minSpacing * 0.85;
  const out: Tree[] = [];
  for (let v = 0; v < size / g; v++)
    for (let u = 0; u < size / g; u++) {
      const x = tx + (u + 0.15 + 0.7 * r()) * g;
      const z = tz + (v + 0.15 + 0.7 * r()) * g;
      if (x >= tx + size || z >= tz + size) continue;
      const t = plantTree(f, styles, r, x, z, null, rEff);
      if (t) out.push(t);
    }
  return out;
}

/** A model's instanced mesh, with room for `max` trees. */
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.count = 0;
  // They stand round the viewer: never all off screen, and their bounds change as they're placed.
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * A region's trees round the viewer, in three bands: near, the full trees (one instanced
 * mesh per model); middle, sparser cheap ones (another per model); far, the canopy (one
 * merged mesh). See the header.
 */
export class TreesView {
  readonly root = new THREE.Group();
  private readonly near: THREE.InstancedMesh[];
  private readonly mid: THREE.InstancedMesh[];
  private readonly tiles = new Map<string, Tree[]>();
  private readonly midTiles = new Map<string, Tree[]>();
  private readonly seed: number;
  private nearAt = { x: Infinity, z: Infinity, t: -Infinity };
  private midAt = { x: Infinity, z: Infinity, t: -Infinity };
  /** The canopy: each square's arrays (by "i,j"), the merged mesh, which squares it holds, when it was merged (ms). */
  private readonly squares = new Map<string, { position: Float32Array; color: Float32Array }>();
  private canopy: THREE.Mesh | null = null;
  private canopyKey = '';
  private canopyAt = -Infinity;
  private readonly canopyMat = canopyMaterial();
  /** Trees drawn now, in the near and middle bands, and the triangles of all three (debug overlay, tests). */
  count = 0;
  midCount = 0;
  triangles = 0;
  private nearTris = 0;
  private midTris = 0;

  constructor(private readonly forest: Forest) {
    this.root.name = 'trees';
    this.seed = hashString(forest.id);
    const mat = treeMaterial();
    const c = CONFIG.trees;
    this.near = MODELS.map((m) => instanced(treeGeometry(m), mat, c.maxNear, `trees:${m}`));
    this.mid = MODELS.map((m) => instanced(midTreeGeometry(m), mat, c.maxMid, `trees-mid:${m}`));
    for (const mesh of [...this.near, ...this.mid]) this.root.add(mesh);
  }

  /** Once a frame: place the near trees, the middle band, and the canopy's squares, each when it's due. */
  update(x: number, z: number): void {
    const c = CONFIG.trees;
    const now = performance.now();
    const due = (at: { x: number; z: number; t: number }, move: number) => Math.hypot(x - at.x, z - at.z) >= move || now - at.t >= c.refresh * 1000;
    if (due(this.nearAt, c.moveAgain)) {
      this.nearAt = { x, z, t: now };
      this.nearTris = this.place(this.near, x, z, 0, c.nearDistance, c.maxNear, 1, (i, j) => this.tile(this.tiles, i, j, scatterTile), (n) => (this.count = n));
    }
    if (due(this.midAt, c.midMoveAgain)) {
      this.midAt = { x, z, t: now };
      this.midTris = this.place(this.mid, x, z, c.nearDistance, c.midDistance, c.maxMid, c.midScale, (i, j) => this.tile(this.midTiles, i, j, scatterMid), (n) => (this.midCount = n));
    }
    this.updateCanopy(x, z, now);
    this.triangles = this.nearTris + this.midTris + (this.canopy ? this.canopy.geometry.attributes.position.count / 3 : 0);
  }

  private tile(cache: Map<string, Tree[]>, i: number, j: number, scatter: typeof scatterTile): Tree[] {
    const key = `${i},${j}`;
    let t = cache.get(key);
    if (!t) {
      const size = CONFIG.trees.tile;
      t = scatter(this.forest, this.seed, i * size, j * size, size);
      cache.set(key, t);
      // Keep the cache to the squares round the viewer: forget the oldest beyond a ring's worth.
      if (cache.size > 900) for (const k of [...cache.keys()].slice(0, 200)) cache.delete(k);
    }
    return t;
  }

  /**
   * Fill a band's meshes with the trees between `from` and `to` m of (x, z), nearest first,
   * up to `max`, each scaled by `scale`. Returns the triangles drawn.
   */
  private place(meshes: THREE.InstancedMesh[], x: number, z: number, from: number, to: number, max: number, scale: number, tile: (i: number, j: number) => Tree[], counted: (n: number) => void): number {
    const size = CONFIG.trees.tile;
    const found: { t: Tree; d: number }[] = [];
    for (let j = Math.floor((z - to) / size); j <= Math.floor((z + to) / size); j++)
      for (let i = Math.floor((x - to) / size); i <= Math.floor((x + to) / size); i++) {
        const dx = Math.max(i * size - x, 0, x - (i + 1) * size);
        const dz = Math.max(j * size - z, 0, z - (j + 1) * size);
        if (Math.hypot(dx, dz) > to) continue;
        // (A tile wholly inside the inner edge holds none of this band's trees.)
        const fx = Math.max(Math.abs(i * size - x), Math.abs((i + 1) * size - x));
        const fz = Math.max(Math.abs(j * size - z), Math.abs((j + 1) * size - z));
        if (Math.hypot(fx, fz) < from) continue;
        for (const t of tile(i, j)) {
          const d = Math.hypot(t.x - x, t.z - z);
          if (d >= from && d <= to) found.push({ t, d });
        }
      }
    found.sort((a, b) => a.d - b.d);
    const counts = MODELS.map(() => 0);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    for (const { t } of found) {
      if (n >= max) break;
      // Only where the ground is the detailed mesh (a big map's square not yet streamed in is coarse: they'd float or sink).
      if (!coastGroundSolid(t.x, t.z)) continue;
      const mesh = meshes[t.model];
      const k = counts[t.model]++;
      p.set(t.x, groundHeight(t.x, t.z) - 0.25, t.z);
      q.setFromEuler(e.set(t.leanX, t.turn, t.leanZ, 'YXZ'));
      s.set(t.width * scale, t.height * Math.sqrt(scale), t.width * scale);
      mesh.setMatrixAt(k, m.compose(p, q, s));
      mesh.setColorAt(k, col.setRGB(t.r, t.g, t.b));
      n++;
    }
    counted(n);
    let tris = 0;
    meshes.forEach((mesh, i) => {
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = counts[i] > 0;
      tris += (counts[i] * mesh.geometry.attributes.position.count) / 3;
    });
    return tris;
  }

  /**
   * The canopy: its squares within canopyDistance, one made per call (a few milliseconds
   * each), merged into one mesh again when the set has changed (at most every canopyRebuild s).
   */
  private updateCanopy(x: number, z: number, now: number): void {
    const c = CONFIG.trees;
    const S = c.canopySquare;
    const want: { key: string; i: number; j: number; d: number }[] = [];
    for (let j = Math.floor((z - c.canopyDistance) / S); j <= Math.floor((z + c.canopyDistance) / S); j++)
      for (let i = Math.floor((x - c.canopyDistance) / S); i <= Math.floor((x + c.canopyDistance) / S); i++) {
        const d = Math.hypot(Math.max(i * S - x, 0, x - (i + 1) * S), Math.max(j * S - z, 0, z - (j + 1) * S));
        if (d <= c.canopyDistance) want.push({ key: `${i},${j}`, i, j, d });
      }
    want.sort((a, b) => a.d - b.d);
    const missing = want.find((w) => !this.squares.has(w.key));
    if (missing) this.squares.set(missing.key, canopyArrays(this.forest, missing.i * S, missing.j * S));
    const have = want.filter((w) => this.squares.has(w.key));
    const key = have.map((w) => w.key).join(';');
    if (key === this.canopyKey || now - this.canopyAt < c.canopyRebuild * 1000) return;
    this.canopyKey = key;
    this.canopyAt = now;
    if (this.canopy) {
      this.root.remove(this.canopy);
      this.canopy.geometry.dispose();
      this.canopy = null;
    }
    // Squares well out of reach are forgotten.
    for (const k of [...this.squares.keys()]) if (!want.some((w) => w.key === k) && this.squares.size > want.length + 8) this.squares.delete(k);
    const total = have.reduce((t, w) => t + this.squares.get(w.key)!.position.length, 0);
    if (!total) return;
    const position = new Float32Array(total);
    const color = new Float32Array(total);
    let at = 0;
    for (const w of have) {
      const a = this.squares.get(w.key)!;
      position.set(a.position, at);
      color.set(a.color, at);
      at += a.position.length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.canopy = new THREE.Mesh(geo, this.canopyMat);
    this.canopy.name = 'trees-canopy';
    this.canopy.matrixAutoUpdate = false;
    this.root.add(this.canopy);
  }
}
