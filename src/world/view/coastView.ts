/**
 * Drawing a coast region (real coastline from tools/coast; coastTerrain.ts): its ground is
 * the pipeline's mesh, already flat-shaded and coloured, in 2 km chunks.
 *
 *   near   a chunk within CONFIG.regions.coastFineDistance of the viewer is drawn in full
 *          (the pipeline's faces: the real coast, ~3.5k triangles a chunk), built the first
 *          time it's wanted, a couple a frame
 *   mid    farther chunks, out to `coastMidDistance`, are a coarse copy: the same ground
 *          sampled every `coastCoarseCell` m, land and the shore only (the sea is opaque),
 *          coloured from the mesh (or a chunked region's coarse grid). Each
 *          reaches `coastCoarseOverlap` m into its neighbours and sits `coastCoarseDrop` m
 *          lower, so where a near chunk's edge (its faces end raggedly, each in the chunk its
 *          middle is in) meets a far one there is no gap to see through, and the near one
 *          always shows on top.
 *   far    beyond, a very coarse copy every `coastFarCell` m (a big region, the Clyde's
 *          37 km, would otherwise draw a quarter of a million triangles of distant hills).
 *          All the chunks drawn far are ONE mesh, merged again (at most every
 *          `coastFarRebuild` s) when the set of them changes as you move: the Clyde's 293
 *          far chunks as separate meshes were 70 extra draw calls, and its frame rate.
 *   silhouette  the whole region far off: the same, every `coastSilhouetteCell` m.
 *   buildings   a town's worth: merged per chunk, built the first time the viewer comes
 *          within `coastBuildingDistance`, shown only within it.
 *   structures  its bridges over the sea, follies and gantry cranes (world/coastStructures.ts), one mesh.
 * Everything is built a few pieces a frame (the coarse chunks first), so no frame stalls.
 * Colours are the pipeline's per-face sRGB bytes, used as the game's terrain colours are.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { flatVertexColorMaterial } from '../../render/geometryUtils';
import { coastSample, coastTerrain, type CoastPiece, type CoastSample, type CoastTerrain } from '../coastTerrain';
import type { BuildingDef, RegionDef } from '../defs';
import type { TerrainArrays } from './terrainMesh';
import { forestOf } from '../forest';
import { TreesView } from './treesView';
import { structuresGeometry } from '../coastStructures';
import { groundHeight } from '../terrain';

const S: CoastSample = { h: 0, r: 0, g: 0, b: 0, fine: false };

/**
 * A regular grid of the coast region's ground over a box (world m), every `cell` m: two
 * triangles a cell, kept where any corner stands above `keepAbove`, each lowered by `drop`
 * and coloured from the mesh face under its middle.
 */
function gridArrays(x0: number, z0: number, x1: number, z1: number, cell: number, keepAbove: number, drop: number): TerrainArrays {
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const hs = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) hs[j * (nx + 1) + i] = coastSample(x0 + i * cell, z0 + j * cell, S) ? S.h : -40;
  const pos: number[] = [];
  const col: number[] = [];
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    if (Math.max(a[1], b[1], c[1]) < keepAbove) return;
    pos.push(a[0], a[1] - drop, a[2], b[0], b[1] - drop, b[2], c[0], c[1] - drop, c[2]);
    const mx = (a[0] + b[0] + c[0]) / 3;
    const mz = (a[2] + b[2] + c[2]) / 3;
    let r = 0.45, g = 0.5, bl = 0.4; // prettier-ignore
    if (coastSample(mx, mz, S)) {
      r = S.r / 255;
      g = S.g / 255;
      bl = S.b / 255;
    }
    for (let k = 0; k < 3; k++) col.push(r, g, bl);
  };
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const p = (ii: number, jj: number): [number, number, number] => [x0 + ii * cell, hs[jj * (nx + 1) + ii], z0 + jj * cell];
      // Counter-clockwise seen from above (y up, z south).
      tri(p(i, j), p(i, j + 1), p(i + 1, j));
      tri(p(i + 1, j), p(i, j + 1), p(i + 1, j + 1));
    }
  return { position: new Float32Array(pos), color: new Float32Array(col) };
}

/** The region seen from far off: its land, coarse (WorldView's silhouette for a coast region). */
export function coastSilhouetteArrays(region: RegionDef): TerrainArrays {
  const b = region.bounds;
  return gridArrays(b.x0, b.z0, b.x1, b.z1, CONFIG.regions.coastSilhouetteCell, 0.4, 0);
}

/** One chunk's own faces, in full (the pipeline's mesh). */
function fineArrays(t: CoastPiece, start: number, count: number): TerrainArrays {
  const { V, F, C } = t;
  const position = new Float32Array(count * 9);
  const color = new Float32Array(count * 9);
  for (let n = 0; n < count; n++) {
    const f = start + n;
    for (let k = 0; k < 3; k++) {
      const v = F[3 * f + k] * 3;
      position[n * 9 + k * 3] = V[v];
      position[n * 9 + k * 3 + 1] = V[v + 1];
      position[n * 9 + k * 3 + 2] = V[v + 2];
      color[n * 9 + k * 3] = C[3 * f] / 255;
      color[n * 9 + k * 3 + 1] = C[3 * f + 1] / 255;
      color[n * 9 + k * 3 + 2] = C[3 * f + 2] / 255;
    }
  }
  return { position, color };
}

function toMesh(a: TerrainArrays, mat: THREE.Material, name: string): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.matrixAutoUpdate = false;
  return m;
}

/** A coast region's terrain, near chunks in full and far ones coarse (see the header). */
export class CoastTerrainView {
  readonly root = new THREE.Group();
  private readonly chunks: {
    /** Its index in the region's chunk list (a chunked region's chunk files go by it). */
    k: number;
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    /** A whole region's: where its faces are in the one mesh. */
    start: number;
    count: number;
    mid: THREE.Mesh | null;
    /** Its very coarse copy, merged with the others drawn far into `farMesh`. */
    far: TerrainArrays | null;
    fine: THREE.Mesh | null;
    buildings: BuildingDef[];
    town: THREE.Mesh | null;
  }[] = [];
  private readonly mat = flatVertexColorMaterial();
  private readonly t: CoastTerrain;
  /** Its trees near the viewer (treesView.ts), if it has a forest map. */
  readonly trees: TreesView | null;
  /** Triangles drawn now (near and far), for the debug overlay. */
  triangles = 0;
  /** The chunks drawn far, as one mesh; which they are (their indices), and when it was last merged (ms). */
  private farMesh: THREE.Mesh | null = null;
  private farSet = new Set<number>();
  private farAt = -Infinity;
  /** The chunks by distance from where the viewer was when last sorted (CONFIG.regions.coastResort). */
  private order: { ch: CoastTerrainView['chunks'][number]; d: number }[] = [];
  private sortedAt = { x: Infinity, z: Infinity };
  /** The region's harbour kit in squares (worldView), each shown near the viewer only. */
  private structures: { x: number; z: number; mesh: THREE.Mesh }[] = [];
  private structureHalf = 0;

  setStructures(list: { x: number; z: number; mesh: THREE.Mesh }[], cell: number): void {
    this.structures = list;
    this.structureHalf = cell / 2;
  }

  /**
   * @param buildTown merges a chunk's buildings into one geometry (worldView's builder)
   */
  constructor(
    region: RegionDef,
    private readonly buildTown: (list: BuildingDef[]) => THREE.BufferGeometry,
    private readonly townMat: THREE.Material,
  ) {
    this.root.name = 'coast-terrain';
    const t = coastTerrain(region.id);
    if (!t) throw new Error(`coast region ${region.id}: its terrain isn't loaded`);
    this.t = t;
    const forest = forestOf(region.id);
    this.trees = forest ? new TreesView(forest) : null;
    if (this.trees) this.root.add(this.trees.root);
    // Its bridges over the sea, follies and gantry cranes (the landmarks pass): one merged mesh,
    // built now (a few thousand triangles at most), drawn wherever the fog allows.
    const structures = structuresGeometry(region.bridges ?? [], region.follies ?? [], (x, z) => groundHeight(x, z), region.gantries ?? [], region.yardShips ?? []);
    if (structures) {
      const m = new THREE.Mesh(structures, this.mat);
      m.name = 'coast-structures';
      m.matrixAutoUpdate = false;
      this.root.add(m);
    }
    const list = t.layout ? t.layout.chunks.map((c) => ({ ...c, drawn: c.count })) : t.chunked!.chunks.map((c) => ({ ...c, start: 0, count: c.drawn }));
    list.forEach((ch, k) => {
      const x0 = ch.x0 + t.ox;
      const z0 = ch.z0 + t.oz;
      const x1 = x0 + ch.size;
      const z1 = z0 + ch.size;
      const buildings = region.buildings.filter((b) => b.x >= x0 && b.x < x1 && b.z >= z0 && b.z < z1);
      this.chunks.push({ k, x0, z0, x1, z1, start: ch.start, count: ch.count, mid: null, far: null, fine: null, buildings, town: null });
    });
  }

  /** Built everything at least roughly (the whole region can be shown). */
  get ready(): boolean {
    return this.chunks.every((ch) => ch.far || ch.count === 0);
  }

  /** A chunk's own faces in full: a whole region's from its mesh, a chunked one's from its loaded chunk (null: not in yet). */
  private fineOf(ch: (typeof this.chunks)[number]): TerrainArrays | null {
    if (this.t.piece) return fineArrays(this.t.piece, ch.start, ch.count);
    const p = this.t.pieces.get(ch.k);
    return p ? fineArrays(p, 0, ch.count) : null;
  }

  /**
   * The chunks for a viewer at (x, z): in full near, coarse out to `coastMidDistance`, very
   * coarse beyond, out to `fogFar` (m, where the fog is total). Builds at most `maxBuilds` pieces a call (each a few milliseconds), the
   * nearest first.
   */
  update(x: number, z: number, maxBuilds = 2, fogFar = Infinity): void {
    const c = CONFIG.regions;
    let built = 0;
    let tris = 0;
    // Sorted again only once the viewer has moved a little (a few metres don't change which
    // ring a 2 km chunk is in).
    if (Math.hypot(x - this.sortedAt.x, z - this.sortedAt.z) > c.coastResort) {
      this.order = this.chunks
        .map((ch) => ({ ch, d: Math.hypot(Math.max(ch.x0 - x, 0, x - ch.x1), Math.max(ch.z0 - z, 0, z - ch.z1)) }))
        .sort((a, b) => a.d - b.d);
      this.sortedAt = { x, z };
    }
    const order = this.order;
    // The fog's reach, in steps, rounded up (nothing in sight left out).
    const fog = Number.isFinite(fogFar) ? Math.ceil(fogFar / c.coastFogStep) * c.coastFogStep : Infinity;
    const hyst = c.coastHysteresis;
    const grid = (ch: (typeof this.chunks)[number], cell: number, overlap: number, drop: number, name: string) =>
      toMesh(gridArrays(ch.x0 - overlap, ch.z0 - overlap, ch.x1 + overlap, ch.z1 + overlap, cell, -0.5, drop), this.mat, name);
    // The very coarse copy of every chunk (the whole region at least roughly), several a
    // call, nearest first, on a budget of their own, so a big region's near ground (below)
    // isn't kept waiting for its far hills. Open sea (nothing drawn) needs none: the sea hides it.
    let farBuilt = 0;
    for (const { ch } of order) {
      if (ch.far || ch.count === 0 || farBuilt >= maxBuilds * 4) continue;
      ch.far = gridArrays(ch.x0 - c.coastFarCell, ch.z0 - c.coastFarCell, ch.x1 + c.coastFarCell, ch.z1 + c.coastFarCell, c.coastFarCell, -0.5, c.coastCoarseDrop * 2);
      farBuilt++;
    }
    // Those that must be in the far mesh now, and those a merge takes in (coastFarAhead).
    const farList: (typeof this.chunks)[number][] = [];
    const farWant: (typeof this.chunks)[number][] = [];
    for (const { ch, d } of order) {
      // A chunked region's chunk that has been dropped: its full mesh goes with it.
      if (ch.fine && !this.t.piece && !this.t.pieces.has(ch.k)) {
        this.root.remove(ch.fine);
        ch.fine.geometry.dispose();
        ch.fine = null;
      }
      let full = d < c.coastFineDistance;
      if (full && !ch.fine && built < maxBuilds) {
        const a = this.fineOf(ch);
        if (a) {
          ch.fine = toMesh(a, this.mat, 'coast-fine');
          this.root.add(ch.fine);
          built++;
        }
      }
      if (!ch.fine) full = false;
      // Coarse within coastMidDistance; one already drawn coarse stays so a little past it.
      const mid = !full && d < c.coastMidDistance + (ch.mid?.visible ? hyst : 0);
      if (ch.mid && !mid && d > c.coastMidDistance * c.coastDropFactor) {
        // Well past it: freed, made again on coming back.
        this.root.remove(ch.mid);
        ch.mid.geometry.dispose();
        ch.mid = null;
      }
      if (mid && !ch.mid && built < maxBuilds) {
        ch.mid = grid(ch, c.coastCoarseCell, c.coastCoarseOverlap, c.coastCoarseDrop, 'coast-coarse');
        this.root.add(ch.mid);
        built++;
      }
      const showMid = mid && !!ch.mid;
      if (ch.fine) ch.fine.visible = full;
      if (ch.mid) ch.mid.visible = showMid;
      // Past where the fog is total (the clearest day's haze, or today's visibility) a far
      // chunk can't be seen: left out (a big map is mostly beyond it).
      if (ch.far && !full && !showMid && d < fog) farList.push(ch);
      if (ch.far && ((!full && !showMid && d < fog) || (d > c.coastMidDistance - c.coastFarAhead && d < fog + c.coastFarAhead))) farWant.push(ch);
      tris += full ? ch.count : showMid ? count(ch.mid!) : 0;
      // The buildings, near only.
      const town = d < c.coastBuildingDistance && ch.buildings.length > 0;
      if (town && !ch.town && built < maxBuilds) {
        ch.town = new THREE.Mesh(this.buildTown(ch.buildings), this.townMat);
        ch.town.name = 'coast-town';
        ch.town.matrixAutoUpdate = false;
        this.root.add(ch.town);
        built++;
      }
      if (ch.town && !town && d > c.coastBuildingDistance * c.coastDropFactor) {
        // Well past it: freed (the material is shared), made again on coming back.
        this.root.remove(ch.town);
        ch.town.geometry.dispose();
        ch.town = null;
      }
      if (ch.town) {
        ch.town.visible = town;
        if (town) tris += count(ch.town);
      }
    }
    // The far chunks, merged again only when they must be. A chunk joining them (no longer
    // drawn coarse, or the fog lifting) is merged at once, or there'd be a hole where it is
    // (while the far copies are still being made, at most every coastFarRebuild s). One
    // leaving them (now drawn nearer, which sits higher and hides it, or gone into the fog)
    // stays in the mesh, until they're more than coastFarSlack of it (every coastFarTidy s at most).
    const now = performance.now();
    const joins = farList.some((ch) => !this.farSet.has(ch.k));
    const stale = this.farSet.size - farWant.filter((ch) => this.farSet.has(ch.k)).length;
    const tidy = stale > 0 && stale > this.farSet.size * c.coastFarSlack && now - this.farAt > c.coastFarTidy * 1000;
    if ((joins && (farBuilt === 0 || now - this.farAt > c.coastFarRebuild * 1000)) || tidy) {
      this.farSet = new Set(farWant.map((ch) => ch.k));
      this.farAt = now;
      if (this.farMesh) {
        this.root.remove(this.farMesh);
        this.farMesh.geometry.dispose();
        this.farMesh = null;
      }
      const n = farWant.reduce((t, ch) => t + ch.far!.position.length, 0);
      if (n) {
        const position = new Float32Array(n);
        const color = new Float32Array(n);
        let at = 0;
        for (const ch of farWant) {
          position.set(ch.far!.position, at);
          color.set(ch.far!.color, at);
          at += ch.far!.position.length;
        }
        this.farMesh = toMesh({ position, color }, this.mat, 'coast-far');
        this.root.add(this.farMesh);
      }
    }
    if (this.farMesh) tris += count(this.farMesh);
    if (this.trees) {
      this.trees.update(x, z);
      tris += this.trees.triangles;
    }
    // The harbour kit, square by square.
    const hs = this.structureHalf;
    for (const sq of this.structures) {
      const d = Math.hypot(Math.max(Math.abs(sq.x - x) - hs, 0), Math.max(Math.abs(sq.z - z) - hs, 0));
      sq.mesh.visible = d < c.coastStructureDistance;
      if (sq.mesh.visible) tris += count(sq.mesh);
    }
    this.triangles = tris;
  }
}

function count(m: THREE.Mesh): number {
  const g = m.geometry;
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
}
