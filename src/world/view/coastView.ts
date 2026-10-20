/**
 * Drawing a coast region (real coastline from tools/coast; coastTerrain.ts): its ground is
 * the pipeline's mesh, already flat-shaded and coloured, in 2 km chunks.
 *
 *   near   a chunk within CONFIG.regions.coastFineDistance of the viewer is drawn in full
 *          (the pipeline's faces: the real coast, ~3.5k triangles a chunk), built the first
 *          time it's wanted, a couple a frame
 *   far    farther chunks are a coarse copy: the same ground sampled every `coastCoarseCell`
 *          m, land and the shore only (the sea is opaque), coloured from the mesh. Each
 *          reaches `coastCoarseOverlap` m into its neighbours and sits `coastCoarseDrop` m
 *          lower, so where a near chunk's edge (its faces end raggedly, each in the chunk its
 *          middle is in) meets a far one there is no gap to see through, and the near one
 *          always shows on top.
 *   silhouette  the whole region far off: the same, every `coastSilhouetteCell` m.
 *   buildings   a town's worth: merged per chunk, built the first time the viewer comes
 *          within `coastBuildingDistance`, shown only within it.
 * Everything is built a few pieces a frame (the coarse chunks first), so no frame stalls.
 * Colours are the pipeline's per-face sRGB bytes, used as the game's terrain colours are.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { flatVertexColorMaterial } from '../../render/geometryUtils';
import { coastSample, coastTerrain, type CoastSample, type CoastTerrain } from '../coastTerrain';
import type { BuildingDef, RegionDef } from '../defs';
import type { TerrainArrays } from './terrainMesh';

const S: CoastSample = { h: 0, t: null, f: -1 };

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
    if (coastSample(mx, mz, S) && S.t) {
      const C = S.t.C;
      r = C[3 * S.f] / 255;
      g = C[3 * S.f + 1] / 255;
      bl = C[3 * S.f + 2] / 255;
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
function fineArrays(t: CoastTerrain, start: number, count: number): TerrainArrays {
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
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    start: number;
    count: number;
    coarse: THREE.Mesh | null;
    fine: THREE.Mesh | null;
    buildings: BuildingDef[];
    town: THREE.Mesh | null;
  }[] = [];
  private readonly mat = flatVertexColorMaterial();
  private readonly t: CoastTerrain;
  /** Triangles drawn now (near and far), for the debug overlay. */
  triangles = 0;

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
    for (const ch of t.layout.chunks) {
      const x0 = ch.x0 + t.ox;
      const z0 = ch.z0 + t.oz;
      const x1 = x0 + ch.size;
      const z1 = z0 + ch.size;
      const buildings = region.buildings.filter((b) => b.x >= x0 && b.x < x1 && b.z >= z0 && b.z < z1);
      this.chunks.push({ x0, z0, x1, z1, start: ch.start, count: ch.count, coarse: null, fine: null, buildings, town: null });
    }
  }

  /** Built everything at least coarse (the whole region can be shown). */
  get ready(): boolean {
    return this.chunks.every((ch) => ch.coarse);
  }

  /**
   * Near chunks in full, far ones coarse, for a viewer at (x, z). Builds at most
   * `maxBuilds` full chunks per call (each a few milliseconds), the nearest first.
   */
  update(x: number, z: number, maxBuilds = 2): void {
    const c = CONFIG.regions;
    let built = 0;
    let tris = 0;
    const order = this.chunks
      .map((ch) => ({ ch, d: Math.hypot(Math.max(ch.x0 - x, 0, x - ch.x1), Math.max(ch.z0 - z, 0, z - ch.z1)) }))
      .sort((a, b) => a.d - b.d);
    // The coarse chunks first (the whole region at least roughly), two to a build.
    for (const { ch } of order) {
      if (ch.coarse || built >= maxBuilds * 2) continue;
      const m = c.coastCoarseOverlap;
      ch.coarse = toMesh(gridArrays(ch.x0 - m, ch.z0 - m, ch.x1 + m, ch.z1 + m, c.coastCoarseCell, -0.5, c.coastCoarseDrop), this.mat, 'coast-coarse');
      this.root.add(ch.coarse);
      built++;
    }
    for (const { ch, d } of order) {
      let full = d < c.coastFineDistance;
      if (full && !ch.fine && built < maxBuilds) {
        ch.fine = toMesh(fineArrays(this.t, ch.start, ch.count), this.mat, 'coast-fine');
        this.root.add(ch.fine);
        built++;
      }
      if (!ch.fine) full = false;
      if (ch.fine) ch.fine.visible = full;
      if (ch.coarse) ch.coarse.visible = !full;
      tris += full ? ch.count : ch.coarse ? ch.coarse.geometry.attributes.position.count / 3 : 0;
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
        if (town) tris += ch.town.geometry.index ? ch.town.geometry.index.count / 3 : ch.town.geometry.attributes.position.count / 3;
      }
    }
    this.triangles = tris;
  }
}
