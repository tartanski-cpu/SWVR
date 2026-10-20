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
 *   silhouette  the whole region far off: the same, every `coastSilhouetteCell` m.
 *   buildings   a town's worth: merged per chunk, built the first time the viewer comes
 *          within `coastBuildingDistance`, shown only within it.
 * Everything is built a few pieces a frame (the coarse chunks first), so no frame stalls.
 * Colours are the pipeline's per-face sRGB bytes, used as the game's terrain colours are.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { flatVertexColorMaterial } from '../../render/geometryUtils';
import { coastSample, coastTerrain, type CoastPiece, type CoastSample, type CoastTerrain } from '../coastTerrain';
import type { BuildingDef, RegionDef } from '../defs';
import type { TerrainArrays } from './terrainMesh';

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
    far: THREE.Mesh | null;
    fine: THREE.Mesh | null;
    buildings: BuildingDef[];
    town: THREE.Mesh | null;
  }[] = [];
  private readonly mat = flatVertexColorMaterial();
  private readonly t: CoastTerrain;
  /** Triangles drawn now (near and far), for the debug overlay. */
  triangles = 0;
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
   * coarse beyond. Builds at most `maxBuilds` pieces a call (each a few milliseconds), the
   * nearest first.
   */
  update(x: number, z: number, maxBuilds = 2): void {
    const c = CONFIG.regions;
    let built = 0;
    let tris = 0;
    const order = this.chunks
      .map((ch) => ({ ch, d: Math.hypot(Math.max(ch.x0 - x, 0, x - ch.x1), Math.max(ch.z0 - z, 0, z - ch.z1)) }))
      .sort((a, b) => a.d - b.d);
    const grid = (ch: (typeof this.chunks)[number], cell: number, overlap: number, drop: number, name: string) =>
      toMesh(gridArrays(ch.x0 - overlap, ch.z0 - overlap, ch.x1 + overlap, ch.z1 + overlap, cell, -0.5, drop), this.mat, name);
    // The very coarse copy of every chunk (the whole region at least roughly), several a
    // call, nearest first, on a budget of their own, so a big region's near ground (below)
    // isn't kept waiting for its far hills. Open sea (nothing drawn) needs none: the sea hides it.
    let farBuilt = 0;
    for (const { ch } of order) {
      if (ch.far || ch.count === 0 || farBuilt >= maxBuilds * 4) continue;
      ch.far = grid(ch, c.coastFarCell, c.coastFarCell, c.coastCoarseDrop * 2, 'coast-far');
      this.root.add(ch.far);
      farBuilt++;
    }
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
      const mid = !full && d < c.coastMidDistance;
      if (mid && !ch.mid && built < maxBuilds) {
        ch.mid = grid(ch, c.coastCoarseCell, c.coastCoarseOverlap, c.coastCoarseDrop, 'coast-coarse');
        this.root.add(ch.mid);
        built++;
      }
      const showMid = mid && !!ch.mid;
      if (ch.fine) ch.fine.visible = full;
      if (ch.mid) ch.mid.visible = showMid;
      if (ch.far) ch.far.visible = !full && !showMid;
      tris += full ? ch.count : showMid ? count(ch.mid!) : ch.far ? count(ch.far) : 0;
      // The buildings, near only.
      const town = d < c.coastBuildingDistance && ch.buildings.length > 0;
      if (town && !ch.town && built < maxBuilds) {
        ch.town = new THREE.Mesh(this.buildTown(ch.buildings), this.townMat);
        ch.town.name = 'coast-town';
        ch.town.matrixAutoUpdate = false;
        this.root.add(ch.town);
        built++;
      }
      if (ch.town) {
        ch.town.visible = town;
        if (town) tris += count(ch.town);
      }
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
