import * as THREE from 'three';
import { fitPaint, flatVertexColorMaterial, mergeParts, paintLocal, part } from '../../render/geometryUtils';
import type { PaintName } from '../../render/pixelPaint';
import { LAMPS, LIGHTS, PORT_FLOODS, type BlockDef, type BuildingDef, type CurrentZoneDef, type RegionDef, type ShelterDef, type SlipwayDef, type WreckDef } from '../archipelago';
import type { FallDef, FarmDef, YardDef } from '../defs';
import { lineEnds, ringCentres } from '../farms';
import { CONFIG } from '../../config';
import { groundHeight } from '../terrain';
import { standingHeight } from '../geography';
import { REGIONS, distanceToBounds } from '../regions';
import { seenRange } from '../sight';
import { buildSilhouetteArrays, buildTerrainArrays, hash, summitNear, treeSpots, type TerrainArrays } from './terrainMesh';
import type { TerrainRequest, TerrainResult } from './terrainWorker';
import { glowSprite, LightPointsMaterial } from '../../render/lightPoints';
import { CoastTerrainView, coastSilhouetteArrays } from './coastView';
import { buildKitHouse, isKitBuilding } from './houseKit';
import { faceBollards, shortCleat } from '../berths';
import { blockSteps } from '../blockSteps';
import { startBerthId } from '../startSpot';

/**
 * Everything static in the world, region by region (regions, milestone 2):
 *   terrain     one flat-shaded, vertex-coloured mesh per region, sampled from the same
 *               height function the physics uses (terrainMesh.ts)
 *   structures  quays, pier decks and piles, fenders, bollards, breakwater rock armour,
 *               buildings, light towers, wrecks, lamp posts, cairns - one merged mesh per region
 *   trees       one instanced mesh per region
 *   silhouette  a region seen from far off: its land at 30 m cells, a few thousand triangles
 *   lights      harbour and lighthouse lights (HarbourLights, animated; all regions)
 *
 * Streaming: a region is RESIDENT (its terrain, structures and trees in the scene) while the
 * viewer is within CONFIG.regions.loadDistance of its footprint, and put away again beyond
 * unloadDistance. Home is built before the first frame, as it always was. Any other region
 * is built the first time it's wanted: its terrain and trees in a web worker (no frame
 * stalls), the structures on the game thread when they arrive (a few milliseconds), and
 * kept afterwards. While a region isn't resident its silhouette stands in, as far off as
 * its tallest thing can be seen today (sight.ts). Each player's machine does this for its
 * own viewer; the simulation knows every region all the time.
 */
export class WorldView {
  readonly root = new THREE.Group();
  readonly lights: HarbourLights;
  readonly portLighting: PortLighting;
  private readonly views: RegionView[];
  private worker: Worker | null = null;
  private nextRequest = 1;
  private sinceCheck = Infinity;
  /** Set when the resident set changed since the last read of `shelters` (the ocean shader's zones). */
  residencyChanged = true;

  constructor() {
    this.root.name = 'archipelago';
    this.views = REGIONS.map((r) => new RegionView(r));
    for (const v of this.views) {
      this.root.add(v.silhouette);
      // Home (the first region: the map itself in voyage mode) is here before the first frame
      // (it was always built at start-up); the rest when wanted.
      if (v.region.id === REGIONS[0].id) {
        v.build(buildTerrainArrays(v.region), treeSpots(v.region));
        this.setResident(v, true);
      }
    }
    this.lights = new HarbourLights();
    this.portLighting = new PortLighting();
    this.root.add(this.lights.points, this.portLighting.root);
    this.root.traverse((o) => {
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
  }

  /** The shelter zones of the regions drawn in full, for the ocean shader. */
  get shelters(): ShelterDef[] {
    this.residencyChanged = false;
    return this.views.filter((v) => v.resident).flatMap((v) => v.region.shelters);
  }

  /** The tidal races of the regions drawn in full, for the ocean shader. */
  get races(): CurrentZoneDef[] {
    return this.views.filter((v) => v.resident).flatMap((v) => v.region.currents);
  }

  /**
   * Once per frame: which regions should be drawn in full for this viewer, and which
   * silhouettes are in sight today.
   * @param viewer      the camera (world)
   * @param visibility  today's visibility where the viewer is (m)
   */
  update(viewer: THREE.Vector3, visibility: number, dt: number): void {
    // A region whose arrays have arrived is built one step a frame (terrain, structures,
    // trees), so no single frame carries the whole of it.
    for (const v of this.views) if (v.pending) v.buildStep();
    // A coast region's chunks: in full near the viewer, coarse beyond (coastView.ts).
    for (const v of this.views) if (v.coast && v.resident) v.coast.update(viewer.x, viewer.z, 2, Math.min(visibility, CONFIG.environment.hazeFar));
    for (const v of this.views) if (v.kit && v.resident) v.kit.update(viewer.x, viewer.z, CONFIG.regions.coastKitMs);
    this.sinceCheck += dt;
    if (this.sinceCheck < CONFIG.regions.residencyEvery) return;
    this.sinceCheck = 0;
    const c = CONFIG.regions;
    for (const v of this.views) {
      const d = distanceToBounds(v.region, viewer.x, viewer.z);
      v.distance = d;
      const want = v.resident ? d < c.unloadDistance : d < c.loadDistance;
      if (want && !v.built && !v.building) this.request(v);
      if (want && v.built && !v.resident) this.setResident(v, true);
      else if (!want && v.resident) this.setResident(v, false);
      // The silhouette: when not drawn in full, and any of it can be seen: its nearest edge
      // within the horizon of its highest land and short of where the fog is total (the
      // scene fog ends at the visibility or the clearest day's haze, environmentView.ts),
      // so it is gone only once the fog has already hidden it. (Judged by its landmark
      // alone, it vanished while its nearer land still showed through the haze.)
      v.silhouette.visible = !v.resident && d < seenRange(v.landmark.h, Math.min(visibility, CONFIG.environment.hazeFar));
    }
  }

  /**
   * A hand-built region's drawn terrain, once built (xyz per corner, three corners a
   * triangle), for the chartplotter's sharp coastline (nav/chartLand.ts); null until it is,
   * or for a coast region (its mesh is in world/coastTerrain.ts).
   */
  terrainPositions(regionId: string): Float32Array | null {
    const v = this.views.find((x) => x.region.id === regionId);
    const mesh = v?.full.getObjectByName('terrain') as THREE.Mesh | undefined;
    const attr = mesh?.geometry.getAttribute('position');
    return attr ? (attr.array as Float32Array) : null;
  }

  /** One line per region for the debug overlay: state and distance. */
  status(): string {
    return this.views
      .map((v) => {
        const km = v.distance === Infinity ? '' : ` ${(v.distance / 1000).toFixed(1)} km`;
        const state = v.resident ? 'full' : v.building ? 'building' : v.silhouette.visible ? 'outline' : v.built ? 'put away' : 'unseen';
        return `${v.region.id}: ${state}${km}${v.buildMs && v.built ? ` (built ${v.buildMs.toFixed(0)} ms, worst frame ${v.mainMs.toFixed(0)})` : ''}`;
      })
      .join('  ');
  }

  /** For the debug map: each region's footprint and state. */
  regionStates(): { region: RegionDef; resident: boolean; building: boolean; outline: boolean; distance: number }[] {
    return this.views.map((v) => ({ region: v.region, resident: v.resident, building: v.building, outline: v.silhouette.visible, distance: v.distance }));
  }

  private setResident(v: RegionView, on: boolean): void {
    if (v.resident === on) return;
    v.resident = on;
    if (on) this.root.add(v.full);
    else this.root.remove(v.full);
    this.residencyChanged = true;
  }

  /** Ask the worker for a region's terrain and trees (or build them now where there is no worker). */
  private request(v: RegionView): void {
    v.building = true;
    // A coast region's ground is its ready-made mesh (coastView.ts): no worker needed.
    if (v.region.coast) {
      v.pending = { terrain: null, trees: new Float32Array(0), step: 0 };
      return;
    }
    if (typeof Worker === 'undefined') {
      const t0 = performance.now();
      v.build(buildTerrainArrays(v.region), treeSpots(v.region));
      v.mainMs = v.buildMs = performance.now() - t0;
      return;
    }
    if (!this.worker) {
      this.worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<TerrainResult>) => this.onTerrain(e.data);
    }
    const msg: TerrainRequest = { id: this.nextRequest++, regionId: v.region.id };
    v.requestId = msg.id;
    this.worker.postMessage(msg);
  }

  private onTerrain(r: TerrainResult): void {
    const v = this.views.find((x) => x.requestId === r.id);
    if (!v) return;
    if (r.error) {
      console.error(`region ${r.regionId}: ${r.error}`);
      v.building = false;
      return;
    }
    v.pending = { terrain: { position: r.position, color: r.color }, trees: r.trees, step: 0 };
    v.buildMs = r.ms;
  }
}

/** One region's drawing: its full meshes (when built) and its silhouette. */
class RegionView {
  readonly full = new THREE.Group();
  readonly silhouette: THREE.Mesh;
  /** The tallest thing to steer for: the highest landmark, else the highest island. */
  readonly landmark: { x: number; z: number; h: number };
  built = false;
  building = false;
  resident = false;
  requestId = 0;
  /** Build time: in the worker, and on the game thread (ms), for the debug overlay. */
  buildMs = 0;
  mainMs = 0;
  distance = Infinity;
  /** The worker's arrays, waiting to be built up one step a frame (buildStep); no terrain arrays for a coast region. */
  pending: { terrain: TerrainArrays | null; trees: Float32Array; step: number; parts?: Map<string, THREE.BufferGeometry[]>; making?: Generator<void> } | null = null;
  /** A coast region's terrain (coastView.ts), once built. */
  coast: CoastTerrainView | null = null;
  /** A coast region's harbour kit, built a square at a time near the viewer (CoastKit). */
  kit: CoastKit | null = null;

  constructor(readonly region: RegionDef) {
    this.full.name = `region:${region.id}`;
    const sil = region.coast ? coastSilhouetteArrays(region) : buildSilhouetteArrays(region);
    const mat = flatVertexColorMaterial();
    // Far-off land: nudged toward the camera in depth, so the sea behind it never bleeds
    // through its coast where the depth buffer is coarse (render.far).
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = CONFIG.regions.silhouetteDepthUnits;
    this.silhouette = new THREE.Mesh(arraysToGeometry(sil), mat);
    this.silhouette.name = `silhouette:${region.id}`;
    this.silhouette.visible = false;
    const tall = [...region.landmarks.map((l) => ({ x: l.x, z: l.z, h: l.height })), ...region.islands.map((i) => ({ x: i.x, z: i.z, h: i.height }))];
    this.landmark = tall.reduce((a, b) => (b.h > a.h ? b : a), { x: (region.bounds.x0 + region.bounds.x1) / 2, z: (region.bounds.z0 + region.bounds.z1) / 2, h: 0 });
  }

  /** Makes the full meshes from the worker's arrays (or ones built here), and the structures, all at once (home, at start-up). */
  build(terrain: TerrainArrays, trees: Float32Array): void {
    this.pending = { terrain, trees, step: 0 };
    while (this.pending) this.buildStep();
  }

  /**
   * One step of the build: the terrain mesh, then the structures, then the trees; each a
   * few to a few tens of milliseconds, on its own frame. Done, the region is `built`.
   */
  buildStep(): void {
    const p = this.pending;
    if (!p) return;
    const t0 = performance.now();
    if (p.step === 0) {
      if (this.region.coast) {
        // Its buildings go with its chunks (built and shown near the viewer only).
        this.coast = new CoastTerrainView(
          this.region,
          (list) => {
            const parts: THREE.BufferGeometry[] = [];
            for (const bd of list) buildBuilding(bd, parts, true);
            return mergeParts(parts);
          },
          flatVertexColorMaterial(),
        );
        this.full.add(this.coast.root);
      } else if (p.terrain) {
        const terrainMesh = new THREE.Mesh(arraysToGeometry(p.terrain), flatVertexColorMaterial());
        terrainMesh.name = 'terrain';
        this.full.add(terrainMesh);
      }
    } else if (p.step === 1 && this.region.coast && this.coast) {
      // A coast region's harbour kit: its lighthouses and landmarks now; its 1 km squares as
      // the viewer comes near them, nearest first (CoastKit), those round the start now.
      this.kit = new CoastKit(this.region, this.full, this.coast);
      const start = this.region.berths.find((b) => b.id === startBerthId()) ?? this.region.berths[0];
      if (start) this.kit.update(start.x, start.z, Infinity);
    } else if (p.step === 1) {
      // The structures: all at once, or for a coast region (a harbourful of pieces) a few
      // milliseconds a frame, staying on this step until they're all made.
      // A coast region's are sorted into squares (`coastStructureCell` m), each its own mesh,
      // drawn near the viewer only (coastView.ts); its lighthouses and landmarks into one
      // drawn always. Elsewhere, one mesh.
      const cell = CONFIG.regions.coastStructureCell;
      const coast = !!this.region.coast;
      p.parts ??= new Map();
      const parts = p.parts;
      p.making ??= structureParts(this.region, (x, z, far) => {
        const key = !coast || far ? 'all' : `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
        let list = parts.get(key);
        if (!list) parts.set(key, (list = []));
        return list;
      });
      const budget = this.region.coast ? 8 : Infinity;
      let done = false;
      while (performance.now() - t0 < budget) if ((done = !!p.making.next().done)) break;
      if (!done) {
        this.mainMs = Math.max(this.mainMs, performance.now() - t0);
        this.buildMs += performance.now() - t0;
        return;
      }
      const mat = flatVertexColorMaterial();
      const squares: { x: number; z: number; mesh: THREE.Mesh }[] = [];
      for (const [key, list] of p.parts) {
        if (!list.length) continue;
        const structures = new THREE.Mesh(mergeParts(list), mat);
        structures.name = 'structures';
        this.full.add(structures);
        if (key !== 'all') {
          const [i, j] = key.split(',').map(Number);
          squares.push({ x: (i + 0.5) * cell, z: (j + 0.5) * cell, mesh: structures });
        }
      }
      this.coast?.setStructures(squares, cell);
    } else {
      this.full.add(buildTreesMesh(p.trees));
      this.full.traverse((o) => {
        o.matrixAutoUpdate = false;
        o.updateMatrix();
      });
      this.pending = null;
      this.built = true;
      this.building = false;
    }
    p.step++;
    const ms = performance.now() - t0;
    this.mainMs = Math.max(this.mainMs, ms);
    this.buildMs += ms;
  }
}

function arraysToGeometry(a: TerrainArrays): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * A coast region's harbour kit, made a 1 km square at a time (owner, of Turku: "takes a while
 * to load"; its 3,276 jetty pieces took 5.6 s to build at the start, though each square is
 * drawn only within `coastStructureDistance` of the viewer). Its lighthouses and landmarks,
 * seen from afar, are made at once; then each frame, for up to `coastKitMs` ms, piece by piece,
 * the nearest square not yet made within that distance (and a square more), merged when it's
 * whole; the rest only if the viewer comes near. Those round the start before the first frame. Each square its own merged mesh, shown near the viewer only
 * (coastView.ts), as before. Drawing only: the blocks are in the world from the start.
 */
/** A square of a coast region's kit: where it is, its own pieces, their drawing steps, and whether it's made. */
interface KitSquare {
  key: string;
  x: number;
  z: number;
  region: RegionDef;
  steps: number[];
  made: boolean;
}

class CoastKit {
  private readonly squares: KitSquare[] = [];
  private readonly mat = flatVertexColorMaterial();
  private readonly cell = CONFIG.regions.coastStructureCell;

  constructor(
    region: RegionDef,
    private readonly full: THREE.Group,
    private readonly coast: CoastTerrainView,
  ) {
    const cell = this.cell;
    coast.setStructures([], cell);
    const empty = { blocks: [], slipways: [], ridges: [], wrecks: [], falls: [], farms: [], lamps: [], berths: [], yards: [], lights: [], landmarks: [], buildings: [] };
    const byKey = new Map<string, KitSquare>();
    const square = (x: number, z: number) => {
      const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
      let sq = byKey.get(key);
      if (!sq) {
        const [i, j] = key.split(',').map(Number);
        sq = { key, x: (i + 0.5) * cell, z: (j + 0.5) * cell, region: { ...region, ...structuredClone(empty) } as RegionDef, steps: [], made: false };
        byKey.set(key, sq);
        this.squares.push(sq);
      }
      return sq.region;
    };
    // Each piece into its square (where structureParts would put it), the blocks with their steps.
    const steps = blockSteps(region.blocks);
    region.blocks.forEach((b, i) => {
      square(b.x, b.z).blocks.push(b);
      byKey.get(`${Math.floor(b.x / cell)},${Math.floor(b.z / cell)}`)!.steps.push(steps[i]);
    });
    for (const x of region.slipways) square(x.x, x.z).slipways.push(x);
    for (const r of region.ridges) square(r.ax, r.az).ridges.push(r);
    for (const w of region.wrecks) square(w.x, w.z).wrecks.push(w);
    for (const f of region.falls ?? []) square(f.x, f.z).falls!.push(f);
    for (const f of region.farms ?? []) square(f.x, f.z).farms!.push(f);
    for (const l of region.lamps) square(l.x, l.z).lamps.push(l);
    for (const b of region.berths) square(b.x, b.z).berths.push(b);
    for (const y of region.yards ?? []) square(y.crane.x, y.crane.z).yards!.push(y);
    // The lighthouses and landmarks (seen from afar): now, one mesh, always drawn.
    const far: THREE.BufferGeometry[] = [];
    for (const _ of structureParts({ ...region, ...structuredClone(empty), lights: region.lights, landmarks: region.landmarks } as RegionDef, () => far, [])) void _;
    if (far.length) this.add(far, null);
  }

  private add(parts: THREE.BufferGeometry[], sq: { x: number; z: number } | null): void {
    const mesh = new THREE.Mesh(mergeParts(parts), this.mat);
    mesh.name = 'structures';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.full.add(mesh);
    if (sq) this.coast.addStructure({ x: sq.x, z: sq.z, mesh });
  }

  /** The square being made: its pieces so far, piece by piece over frames (a dense marina's would stall one). */
  private making: { sq: KitSquare; gen: Generator<void>; parts: THREE.BufferGeometry[] } | null = null;

  /** Make the nearest squares not yet made within reach of (x, z), for up to `ms` ms a call, piece by piece. */
  update(x: number, z: number, ms: number): void {
    const t0 = performance.now();
    const reach = CONFIG.regions.coastStructureDistance + this.cell;
    const half = this.cell / 2;
    const dist = (sq: { x: number; z: number }) => Math.hypot(Math.max(Math.abs(sq.x - x) - half, 0), Math.max(Math.abs(sq.z - z) - half, 0));
    while (performance.now() - t0 < ms) {
      if (!this.making) {
        let next: KitSquare | null = null;
        for (const sq of this.squares) if (!sq.made && dist(sq) < reach && (!next || dist(sq) < dist(next))) next = sq;
        if (!next) return;
        const parts: THREE.BufferGeometry[] = [];
        this.making = { sq: next, gen: structureParts(next.region, () => parts, next.steps), parts };
      }
      const m = this.making;
      if (m.gen.next().done) {
        m.sq.made = true;
        if (m.parts.length) this.add(m.parts, m.sq);
        this.making = null;
      }
    }
  }
}

// ── Structures ───────────────────────────────────────────────────────────────────

const CONCRETE = 0x9c9a94;
const TIMBER = 0x7a5a3c;
const PILE = 0x3d3a36;
const FENDER = 0x1e1e1e;
const BOLLARD = 0x2a2c30;

/**
 * The region's structures, one piece at a time into `parts` (a generator: a coast region's
 * many are built a few milliseconds a frame, RegionView.buildStep; the others all at once).
 */
function* structureParts(region: RegionDef, at: (x: number, z: number, far?: boolean) => THREE.BufferGeometry[], steps = blockSteps(region.blocks)): Generator<void> {
  let parts: THREE.BufferGeometry[];
  // Blocks overlapping at one deck height drawn a step apart (world/blockSteps.ts; given, for
  // a coast region's square, from the whole region's, so neighbours across its edge differ).
  for (const [i, b] of region.blocks.entries()) {
    buildBlock(b, at(b.x, b.z), steps[i] * CONFIG.render.blockStepM);
    yield;
  }
  for (const s of region.slipways) {
    buildSlipway(s, at(s.x, s.z));
    yield;
  }
  for (const r of region.ridges) {
    if (r.drawn !== false) buildBreakwater(r.ax, r.az, r.bx, r.bz, r.crest, r.halfWidth, r.slope, at(r.ax, r.az));
    yield;
  }
  // A coast region's buildings (a town's worth) go with its chunks instead (coastView.ts).
  if (!region.coast) {
    for (const bd of region.buildings) {
      buildBuilding(bd, at(bd.x, bd.z));
      yield;
    }
  }
  for (const y of region.yards ?? []) {
    buildYard(y, at(y.crane.x, y.crane.z));
    yield;
  }
  // Lighthouses and landmarks are seen from afar: `far`.
  for (const l of region.lights) {
    buildLightTower(l.x, l.z, l.y, l.color, l.tower, at(l.x, l.z, true));
    yield;
  }
  for (const w of region.wrecks) {
    buildWreck(w, at(w.x, w.z));
    yield;
  }
  for (const l of region.landmarks) {
    if (l.kind === 'hill') buildCairn(l.x, l.z, at(l.x, l.z, true));
    yield;
  }
  for (const l of region.landmarks) {
    if (l.kind === 'mast') buildMast(l.x, l.z, at(l.x, l.z, true));
    yield;
  }
  for (const f of region.falls ?? []) {
    buildFall(f, at(f.x, f.z));
    yield;
  }
  for (const f of region.farms ?? []) {
    buildFarm(f, at(f.x, f.z));
    yield;
  }
  // Lamp posts: a slim pole with a downward-facing head.
  for (const l of region.lamps) {
    parts = at(l.x, l.z);
    const base = standingHeight(l.x, l.z);
    const h = l.y - base;
    parts.push(part(new THREE.CylinderGeometry(0.07, 0.1, h, 6).translate(l.x, base + h / 2, l.z), 0x50565c, 'worn'));
    parts.push(part(new THREE.BoxGeometry(0.5, 0.14, 0.28).translate(l.x, l.y + 0.05, l.z), 0x3a3f44));
    parts.push(part(new THREE.BoxGeometry(0.42, 0.04, 0.22).translate(l.x, l.y - 0.04, l.z), 0xfff1c8));
  }
  // Berth marks: a yellow strip along the quay/pier edge for each named berth (fuel,
  // cargo); you can dock at any bollards, but these are where things happen.
  for (const b of region.berths) {
    parts = at(b.x, b.z);
    const yaw = (b.headingDeg * Math.PI) / 180;
    const ex = b.x + b.shoreX * (b.shoreDist + 0.3);
    const ez = b.z + b.shoreZ * (b.shoreDist + 0.3);
    const strip = new THREE.BoxGeometry(0.3, 0.03, 12).rotateY(-yaw).translate(ex, b.deckY + 0.015, ez);
    parts.push(part(strip, 0xf2c200));
  }
  // The fuel pumps are drawn with their hoses (fuel/fuelView.ts).
}

/**
 * Quay or pier. Geometry is built in the block's frame (local +Z along the axis) and
 * rotated to its bearing. A quay is a solid concrete wall; a pier is a timber deck on piles.
 * Fenders and bollards go only along faces that have water in front of them.
 */
function buildBlock(b: BlockDef, parts: THREE.BufferGeometry[], sink = 0): void {
  const yaw = (b.yawDeg * Math.PI) / 180;
  // Local X (across) -> world (cos yaw, sin yaw) as in geography.ts; local Z runs along the
  // axis (reversed, which doesn't matter: everything here is symmetric end to end).
  const m = new THREE.Matrix4().makeRotationY(-yaw).setPosition(b.x, 0, b.z);
  const local: THREE.BufferGeometry[] = [];
  const L = b.halfLength;
  const W = b.halfWidth;
  // Its deck slab `sink` m lower and narrower than the block (an overlapping block's: drawn
  // apart from its neighbours, blockSteps); the fittings stand where the block is.
  const SL = L - sink;
  const SW = W - sink;
  const ST = b.top - sink;
  // Painted parts take their pixels in the block's own frame, square to its edges (pixel paint).
  const add = (g: THREE.BufferGeometry, color: number, paint?: PaintName) => local.push(paint ? paintLocal(part(g, color, paint)) : part(g, color));

  if (b.kind === 'quay') {
    add(new THREE.BoxGeometry(2 * SW, ST + 6, 2 * SL).translate(0, (ST - 6) / 2, 0), CONCRETE, 'concrete');
  } else if (b.kind === 'barge') {
    // A fish farm's feed barge: a steel hull floating 1.2 m deep, a house at one end, the
    // feed silo at the other (the pellets are blown down hoses to the cages).
    add(new THREE.BoxGeometry(2 * W, b.top + 1.2, 2 * L).translate(0, (b.top - 1.2) / 2, 0), 0x2e4a3e, 'worn');
    add(new THREE.BoxGeometry(2 * W + 0.1, 0.25, 2 * L + 0.1).translate(0, 0.1, 0), 0x1c1c1c);
    add(new THREE.BoxGeometry(2 * W - 1.2, 2.6, 4.5).translate(0, b.top + 1.3, -L + 3), 0xe8e4da, 'sheet');
    add(new THREE.BoxGeometry(2 * W - 1.0, 0.2, 5).translate(0, b.top + 2.7, -L + 3), 0x3a3f44);
    add(new THREE.CylinderGeometry(W * 0.55, W * 0.55, 5.5, 12).translate(0, b.top + 2.75, L - 4), 0xc9ccc8, 'sheet');
    add(new THREE.ConeGeometry(W * 0.55, 1.2, 12).translate(0, b.top + 6.1, L - 4), 0xa8aca8);
  } else if (b.top < 1) {
    // A pontoon (a coast region's marina berths): a low deck on floats, rising and falling
    // with the tide in life (here it stays at its height); no piles.
    add(new THREE.BoxGeometry(2 * SW, 0.3, 2 * SL).translate(0, ST - 0.15, 0), 0xa8a49a, 'concrete');
    add(new THREE.BoxGeometry(2 * SW - 0.3, 0.6, 2 * SL - 0.3).translate(0, ST - 0.6, 0), 0x2c3236);
  } else {
    // Deck planks laid across the pier; a pile each side every `pileSpacing` m. The outer piles
    // are its fendering too (owner, Oct 2026: fewer legs, the leg and the bumper one): a pier
    // has no fender boards of its own. Open-ended (their tops under the deck, their feet in the
    // seabed), `pileSides` sides.
    const k = CONFIG.structures.kit;
    add(new THREE.BoxGeometry(2 * SW, 0.45, 2 * SL).translate(0, ST - 0.225, 0), TIMBER, 'wood');
    const n = Math.max(1, Math.round((2 * L - 4) / k.pileSpacing));
    for (let i = 0; i <= n; i++) {
      const s = -L + 2 + ((2 * L - 4) * i) / n;
      for (const side of [-1, 1]) add(new THREE.CylinderGeometry(k.pileRadius, k.pileRadius, b.top + 9, k.pileSides, 1, true).translate(side * (W - k.pileRadius), (b.top - 9) / 2 - 0.4, s), PILE);
    }
  }

  // Seaward faces: probe the water 2 m beyond each face's middle.
  const toWorld = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
  const faces: { nx: number; nz: number; half: number; offset: number; alongX: boolean }[] = [
    { nx: 1, nz: 0, half: L, offset: W, alongX: false },
    { nx: -1, nz: 0, half: L, offset: W, alongX: false },
    { nx: 0, nz: 1, half: W, offset: L, alongX: true },
    { nx: 0, nz: -1, half: W, offset: L, alongX: true },
  ];
  // A pontoon: a cleat every 12 m along each long side (on a short finger, one near each
  // end: world/berths.ts makes its one berth between them), no fenders (it has a rubbing strip).
  if (b.kind === 'pier' && b.top < 1) {
    const at: number[] = [];
    if (2 * L < 18 && L >= 3) at.push(-shortCleat(L), shortCleat(L));
    else for (let s = -L + 3; s <= L - 3; s += 12) at.push(s);
    for (const side of [-1, 1]) for (const s of at) add(new THREE.BoxGeometry(0.22, 0.12, 0.5).translate(side * (W - 0.5), b.top + 0.06, s), BOLLARD);
    for (const g of local) parts.push(g.applyMatrix4(m));
    return;
  }
  for (const f of faces) {
    const probe = toWorld(f.nx * (f.offset + 2), f.nz * (f.offset + 2));
    if (groundHeight(probe.x, probe.z) > -1) continue; // land or shallows: no berth
    // Fender boards on a quay's face, every `fenderSpacing` m (a pier's piles are its fenders).
    if (b.fendered && b.kind === 'quay')
      for (let s = -f.half + 1.5; s <= f.half - 1.5; s += CONFIG.structures.kit.fenderSpacing) {
        const x = f.alongX ? s : f.nx * (f.offset + 0.12);
        const z = f.alongX ? f.nz * (f.offset + 0.12) : s;
        add(new THREE.BoxGeometry(f.alongX ? 0.5 : 0.25, 1.6, f.alongX ? 0.25 : 0.5).translate(x, b.top - 0.9, z), FENDER);
      }
    // Bollards where the berths' lines tie (world/berths.ts faceBollards): one six-sided post
    // with its cap flared, open at its foot (in the deck).
    for (const s of faceBollards(b, f)) {
      const x = f.alongX ? s : f.nx * (f.offset - 0.5);
      const z = f.alongX ? f.nz * (f.offset - 0.5) : s;
      add(new THREE.CylinderGeometry(0.24, 0.18, 0.56, 6, 1, true).translate(x, b.top + 0.28, z), BOLLARD, 'worn');
      add(new THREE.CircleGeometry(0.24, 6).rotateX(-Math.PI / 2).translate(x, b.top + 0.56, z), BOLLARD);
    }
  }
  for (const g of local) parts.push(g.applyMatrix4(m));
}

/**
 * A landing slipway (SLIPWAYS; world/slipway.ts): a concrete slab on the slope, built down to
 * the seabed, kerbed each side, grip grooves across it, a yellow line along its top edge.
 * Built in its own frame (local +z down the slip, from its top edge) and turned to its
 * bearing; part of the one structures mesh.
 */
function buildSlipway(s: SlipwayDef, parts: THREE.BufferGeometry[]): void {
  const h = (s.headingDeg * Math.PI) / 180;
  const m = new THREE.Matrix4().makeRotationY(-h).setPosition(s.x, 0, s.z);
  const local: THREE.BufferGeometry[] = [];
  const surface = (d: number) => s.top - s.slope * d;
  // A box along the slip with its top face laid on the slope and its bottom on the seabed.
  const sloped = (w: number, x: number, z0: number, z1: number, above: number, below: number) => {
    const g = new THREE.BoxGeometry(w, 1, z1 - z0).translate(x, 0, (z0 + z1) / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) > 0 ? surface(p.getZ(i)) + above : below);
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  };
  local.push(paintLocal(part(sloped(s.width, 0, 0, s.length, 0, -6), CONCRETE, 'concrete')));
  for (const side of [-1, 1]) local.push(paintLocal(part(sloped(0.3, side * (s.width / 2 + 0.15), 0, s.length, 0.15, -6), 0x8a8882, 'concrete')));
  // Grooves across for grip (a wheel, a boot), down to the water.
  for (let d = 1; d < s.length; d += 0.8) {
    if (surface(d) < -0.3) break;
    local.push(part(new THREE.BoxGeometry(s.width - 0.2, 0.02, 0.06).translate(0, surface(d) + 0.005, d), 0x7a7872));
  }
  local.push(part(new THREE.BoxGeometry(s.width, 0.02, 0.15).translate(0, s.top + 0.01, 0.1), 0xf2c200));
  for (const g of local) parts.push(g.applyMatrix4(m));
}

/** Rubble-mound breakwater: a trapezoid of rough rock armour along the segment, round heads. */
function buildBreakwater(ax: number, az: number, bx: number, bz: number, crest: number, halfW: number, slope: number, parts: THREE.BufferGeometry[]): void {
  const base = -4;
  const baseHalf = halfW + (crest - base) / slope;
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const px = -uz;
  const pz = ux;
  const n = Math.max(2, Math.ceil(len / 3));
  // Cross-section profile (across offset, height), jittered per ring.
  const profile: [number, number][] = [
    [-baseHalf, base],
    [-halfW - 0.6 * (baseHalf - halfW), crest - 0.6 * (crest - base)],
    [-halfW, crest],
    [halfW, crest],
    [halfW + 0.6 * (baseHalf - halfW), crest - 0.6 * (crest - base)],
    [baseHalf, base],
  ];
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len;
    rings.push(
      profile.map(([o, y], k) => {
        const j = (hash(i * 7.1 + k, ax + az) - 0.5) * 0.9;
        const jy = (hash(i * 3.3 + k * 1.7, bx) - 0.5) * 0.6;
        return new THREE.Vector3(ax + ux * t + px * (o + j), y + (k === 0 || k === 5 ? 0 : jy), az + uz * t + pz * (o + j));
      }),
    );
  }
  const pos: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < profile.length - 1; k++) {
      const a = rings[i][k];
      const b = rings[i][k + 1];
      const c = rings[i + 1][k];
      const d = rings[i + 1][k + 1];
      // Counter-clockwise seen from outside the mound.
      pushTri(a, b, c);
      pushTri(b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // merging needs the same attributes as the other parts
  parts.push(part(g, 0x7d7a74, 'stone'));
  // Round heads at both ends.
  for (const [x, z] of [
    [ax, az],
    [bx, bz],
  ]) {
    const head = new THREE.IcosahedronGeometry(1, 1);
    head.scale(baseHalf, crest - base, baseHalf).translate(x, base, z);
    parts.push(part(head, 0x75726c, 'stone'));
  }
}

function buildBuilding(bd: BuildingDef, parts: THREE.BufferGeometry[], plain = false): void {
  const yaw = (bd.yawDeg * Math.PI) / 180;
  const hw = bd.width / 2;
  const hd = bd.depth / 2;
  // Sit on the lowest corner (on the quay apron if it stands on one), walls sunk 2 m.
  let base = Infinity;
  for (const [cx, cz] of [
    [-hw, -hd],
    [hw, -hd],
    [-hw, hd],
    [hw, hd],
  ]) {
    const x = bd.x + cx * Math.cos(yaw) - cz * Math.sin(yaw);
    const z = bd.z + cx * Math.sin(yaw) + cz * Math.cos(yaw);
    base = Math.min(base, Math.max(standingHeight(x, z), groundHeight(x, z)));
  }
  // A coast region's buildings are the house kit's (by type, from the pipeline: houseKit.ts).
  if (isKitBuilding(bd)) return buildKitHouse(bd, base, parts);
  const m = new THREE.Matrix4().makeRotationY(-yaw).setPosition(bd.x, base, bd.z);
  const walls = new THREE.BoxGeometry(bd.width, bd.height + 2, bd.depth).translate(0, bd.height / 2 - 1, 0);
  // Gable roof: a triangular prism along the width, with a little overhang.
  const rh = bd.width * 0.35;
  const shape = new THREE.Shape([new THREE.Vector2(-hw - 0.4, 0), new THREE.Vector2(hw + 0.4, 0), new THREE.Vector2(0, rh)]);
  const roof = new THREE.ExtrudeGeometry(shape, { depth: bd.depth + 0.8, bevelEnabled: false });
  roof.translate(0, bd.height, -hd - 0.4);
  // Door and window on the front (+z) face: a planked door, and a window painted with its
  // frame, glazing bars and panes (one picture to its face).
  const door = new THREE.BoxGeometry(1.1, 2.1, 0.1).translate(-hw * 0.4, 1.05, hd + 0.03);
  const win = new THREE.BoxGeometry(1.2, 1.0, 0.1).translate(hw * 0.35, bd.height * 0.55, hd + 0.03);
  // Pixel paint, set in the building's own frame before it's turned to its bearing: the
  // cladding on the walls; slates on the roof, or sheet on a shed's (turned to run down the slope).
  const cladding = bd.cladding ?? 'render';
  parts.push(paintLocal(part(walls, bd.wall, cladding)).applyMatrix4(m), paintLocal(part(roof, bd.roof, cladding === 'sheet' ? 'sheet' : 'slates'), true).applyMatrix4(m));
  if (!plain) parts.push(paintLocal(part(door, 0x3a2a22, 'wood')).applyMatrix4(m), fitPaint(part(win, 0x6a7a88, 'window')).applyMatrix4(m));
}

/**
 * A boatyard's yard (YardDef): its crane and the boats laid up there. Merged with the rest of
 * the region's structures (one draw call); original, generic shapes.
 *   crane  a concrete pad, a yellow steel mast with a slewing head, a jib up at 20° toward
 *          `jibDeg` with a counterweight behind, a wire and hook block at the jib's end;
 *   boat   a hard-chine hull (pointed bow, square transom) in rust, a faded band of old paint
 *          along her sheer, perhaps a wheelhouse aft, on three keel blocks with a shore each side.
 */
function buildYard(y: YardDef, parts: THREE.BufferGeometry[]): void {
  const DEG = Math.PI / 180;
  // Crane: built with its jib along local -z, then turned to the compass bearing.
  {
    const c = y.crane;
    const base = Math.max(standingHeight(c.x, c.z), groundHeight(c.x, c.z));
    const m = new THREE.Matrix4().makeRotationY(-c.jibDeg * DEG).setPosition(c.x, base, c.z);
    const H = 6.5;
    const jib = 6;
    const lift = 20 * DEG;
    const yellow = 0xd8a820;
    const local: THREE.BufferGeometry[] = [
      part(new THREE.BoxGeometry(1.8, 0.4, 1.8).translate(0, 0.2, 0), CONCRETE, 'concrete'),
      part(new THREE.BoxGeometry(0.4, H, 0.4).translate(0, 0.4 + H / 2, 0), yellow, 'worn'),
      part(new THREE.BoxGeometry(0.8, 0.6, 1.1).translate(0, H + 0.6, 0.1), yellow, 'worn'),
      part(new THREE.BoxGeometry(0.28, 0.32, jib).translate(0, 0, -jib / 2).rotateX(lift).translate(0, H + 0.8, -0.3), yellow, 'worn'),
      part(new THREE.BoxGeometry(0.9, 0.7, 0.6).translate(0, H + 0.75, 0.95), 0x3a3e44, 'worn'),
    ];
    // The jib's end, the wire hanging from it, and the hook block at the bottom.
    const endY = H + 0.8 + Math.sin(lift) * jib;
    const endZ = -0.3 - Math.cos(lift) * jib;
    const drop = endY - 2.2;
    local.push(part(new THREE.CylinderGeometry(0.02, 0.02, drop, 4).translate(0, endY - drop / 2, endZ), 0x202224));
    local.push(part(new THREE.BoxGeometry(0.3, 0.4, 0.2).translate(0, 2.0, endZ), 0x2a2c30, 'worn'));
    for (const g of local) parts.push(g.applyMatrix4(m));
  }
  // Boats laid up: bow along local -z, then turned to her heading.
  for (const b of y.boats) {
    const base = Math.max(standingHeight(b.x, b.z), groundHeight(b.x, b.z));
    const keel = 0.55; // on blocks
    const m = new THREE.Matrix4().makeRotationY(-b.headingDeg * DEG).multiply(new THREE.Matrix4().makeRotationZ(0.05)).setPosition(b.x, base + keel, b.z);
    const L = b.length;
    const hb = b.beam / 2;
    // Her plan (x across, y along: + aft), extruded up her depth, the bottom narrowed (a chine).
    const plan = new THREE.Shape([
      new THREE.Vector2(-hb, L / 2),
      new THREE.Vector2(hb, L / 2),
      new THREE.Vector2(hb, -L * 0.1),
      new THREE.Vector2(hb * 0.55, -L * 0.38),
      new THREE.Vector2(0, -L / 2),
      new THREE.Vector2(-hb * 0.55, -L * 0.38),
      new THREE.Vector2(-hb, -L * 0.1),
    ]);
    const hull = new THREE.ExtrudeGeometry(plan, { depth: b.depth, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, b.depth, 0);
    // (rotateX(90°): the plan's y to world z, the extrusion down to -y; lifted back up by her depth.)
    const local: THREE.BufferGeometry[] = [paintLocal(part(hull, 0x8a4a26, 'rust'))];
    // A faded band of old paint along her sheer, each side.
    for (const s of [-1, 1]) local.push(part(new THREE.BoxGeometry(0.04, 0.22, L * 0.6).translate(s * (hb + 0.02), b.depth - 0.2, L * 0.15), 0x3e5a64, 'worn'));
    if (b.house) {
      local.push(paintLocal(part(new THREE.BoxGeometry(b.beam * 0.62, 1.5, L * 0.22).translate(0, b.depth + 0.75, L * 0.22), 0xb0a894, 'rust')));
      local.push(part(new THREE.BoxGeometry(b.beam * 0.5, 0.45, 0.04).translate(0, b.depth + 1.05, L * 0.11 - 0.01), 0x2a3038));
    }
    // Keel blocks (timber) under her, and a shore under each bilge.
    for (const z of [-L * 0.3, 0, L * 0.3]) local.push(part(new THREE.BoxGeometry(0.6, keel, 0.6).translate(0, -keel / 2, z), TIMBER, 'wood'));
    for (const s of [-1, 1]) local.push(part(new THREE.BoxGeometry(0.12, 1.3, 0.12).rotateZ(s * 0.5).translate(s * (hb + 0.25), 0.15, 0), TIMBER, 'wood'));
    for (const g of local) parts.push(g.applyMatrix4(m));
  }
}

/**
 * A landmark hill's cairn (regions): a heap of stones on the summit with a trig pillar
 * beside it, the thing you steer for from the next region. The summit is the highest
 * ground within 60 m of the landmark's position.
 */
function buildCairn(x: number, z: number, parts: THREE.BufferGeometry[]): void {
  const top = summitNear(x, z);
  const stone = 0x6e6a62;
  parts.push(part(new THREE.ConeGeometry(1.6, 2.6, 7).translate(top.x, top.h + 1.1, top.z), stone, 'stone'));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + hash(i, top.x);
    const r = 1.4 + 0.5 * hash(top.z, i);
    parts.push(part(new THREE.DodecahedronGeometry(0.35 + 0.2 * hash(i, i), 0).translate(top.x + Math.cos(a) * r, top.h + 0.1, top.z + Math.sin(a) * r), stone, 'stone'));
  }
  // The pillar: concrete, 1.2 m, a little way off the heap.
  parts.push(part(new THREE.CylinderGeometry(0.22, 0.28, 1.2, 4).translate(top.x + 2.6, top.h + 0.55, top.z + 1.2), 0xd8d4cc, 'concrete'));
}

/**
 * A radio mast on a peak (a `mast` landmark; the Narrows): a slim three-sided lattice,
 * CONFIG.regions.mastHeight tall, banded red and white for aircraft, an equipment hut at its
 * foot. Its red light is one of the region's lights (at the same summit, the mast's height up).
 */
function buildMast(x: number, z: number, parts: THREE.BufferGeometry[]): void {
  const top = summitNear(x, z);
  const H = CONFIG.regions.mastHeight;
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const r0 = 1.1 - (0.8 * i) / bands;
    const r1 = 1.1 - (0.8 * (i + 1)) / bands;
    const h = H / bands;
    parts.push(part(new THREE.CylinderGeometry(r1, r0, h, 3, 1, true).translate(top.x, top.h + h * (i + 0.5), top.z), i % 2 ? 0xf0eee8 : 0xc0281e));
  }
  parts.push(part(new THREE.BoxGeometry(3, 2.4, 2.2).translate(top.x + 3.5, top.h + 1.1, top.z), 0x9aa0a4, 'sheet'));
}

function buildLightTower(x: number, z: number, lampY: number, color: string, tower: string, parts: THREE.BufferGeometry[]): void {
  if (tower === 'none') return;
  const ground = groundHeight(x, z);
  if (tower === 'post') {
    const c = color === 'red' ? 0xc8281e : color === 'green' ? 0x1f8a3a : color === 'yellow' ? 0xe8c020 : 0xe8e8e0;
    const h = lampY - ground - 0.4;
    parts.push(part(new THREE.CylinderGeometry(0.45, 0.6, h, 8).translate(x, ground + h / 2, z), c, 'worn'));
    parts.push(part(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8).translate(x, lampY, z), 0xf0f0e8));
  } else {
    const h = lampY - ground - 1.5;
    parts.push(part(new THREE.CylinderGeometry(1.4, 2.2, h, 10).translate(x, ground + h / 2, z), 0xf2f0ea, 'render'));
    parts.push(part(new THREE.CylinderGeometry(1.75, 1.9, 1.6, 10).translate(x, ground + h * 0.55, z), 0xb8241c, 'worn'));
    parts.push(part(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 10).translate(x, lampY, z), 0xfff0c0));
    parts.push(part(new THREE.ConeGeometry(1.3, 1.4, 10).translate(x, lampY + 1.5, z), 0x2a2a2a));
    parts.push(part(new THREE.CylinderGeometry(1.8, 1.8, 0.2, 10).translate(x, lampY - 0.9, z), 0x2a2a2a));
  }
}

/**
 * A waterfall (FallDef): a ribbon of white water down the ground from the heights to the
 * water's edge, kept a few metres off the rock (the drawn terrain is coarse on the walls) and
 * seen from both sides, with a patch of foam where it lands.
 */
function buildFall(f: FallDef, parts: THREE.BufferGeometry[]): void {
  const dx = f.toX - f.x;
  const dz = f.toZ - f.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  // Across the ribbon (horizontal), and the push off the wall toward the water.
  const cx = -uz * (f.width / 2);
  const cz = ux * (f.width / 2);
  const off = CONFIG.regions.fallStandOff;
  const n = Math.max(2, Math.ceil(len / 6));
  const pos: number[] = [];
  const pt = (i: number): [number, number, number] => {
    const t = i / n;
    const x = f.x + dx * t + ux * off;
    const z = f.z + dz * t + uz * off;
    return [x, Math.max(groundHeight(x - ux * off, z - uz * off, false), 0.2) + 0.6, z];
  };
  for (let i = 0; i < n; i++) {
    const [ax, ay, az] = pt(i);
    const [bx, by, bz] = pt(i + 1);
    const q = [
      [ax - cx, ay, az - cz],
      [ax + cx, ay, az + cz],
      [bx - cx, by, bz - cz],
      [bx + cx, by, bz + cz],
    ];
    // Both windings: seen from either side.
    for (const tri of [
      [0, 2, 1],
      [1, 2, 3],
      [0, 1, 2],
      [1, 3, 2],
    ])
      for (const k of tri) pos.push(...q[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  parts.push(part(g, 0xe4f0f2));
  // The foam where it lands.
  const [ex, , ez] = pt(n);
  parts.push(part(new THREE.CircleGeometry(f.width * 1.4, 10).rotateX(-Math.PI / 2).translate(ex, 0.12, ez), 0xf2f6f6));
}

/**
 * A fish farm (FarmDef). Cages: each ring a black float pipe with a handrail on stanchions
 * and the net's jump fence above the water, orange buoys at the grid's corners (a couple of
 * hundred triangles a ring). Mussel lines (a coast map's, C2): a row of black floats every
 * `lineFloat` m along each line, an orange buoy at each end. A coast map's lease also has a
 * yellow special mark at each corner (a can with an X topmark; its light, Fl Y 5s, is one of
 * the region's lights). The solid parts are low blocks (farms.ts), in the collision.
 */
function buildFarm(f: FarmDef, parts: THREE.BufferGeometry[]): void {
  for (const [x, z] of f.corners ?? []) {
    parts.push(part(new THREE.CylinderGeometry(0.55, 0.65, 1.6, 8).translate(x, 0.6, z), 0xe8c020));
    parts.push(part(new THREE.BoxGeometry(0.9, 0.12, 0.12).rotateZ(Math.PI / 4).translate(x, 1.75, z), 0xe8c020));
    parts.push(part(new THREE.BoxGeometry(0.9, 0.12, 0.12).rotateZ(-Math.PI / 4).translate(x, 1.75, z), 0xe8c020));
  }
  if (f.kind === 'lines') {
    for (const [[x0, z0], [x1, z1]] of lineEnds(f)) {
      const L = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.floor(L / CONFIG.regions.lineFloat));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const end = k === 0 || k === n;
        parts.push(part(new THREE.CylinderGeometry(end ? 0.5 : 0.32, end ? 0.5 : 0.32, end ? 0.8 : 0.5, 6).translate(x0 + (x1 - x0) * t, 0.15, z0 + (z1 - z0) * t), end ? 0xe8701a : 0x1a1c1e));
      }
    }
    return;
  }
  const r = f.ringRadius;
  const centres = ringCentres(f);
  for (const [x, z] of centres) {
    parts.push(part(new THREE.TorusGeometry(r, 0.28, 4, 18).rotateX(Math.PI / 2).translate(x, 0.25, z), 0x1a1c1e));
    parts.push(part(new THREE.TorusGeometry(r + 0.9, 0.22, 4, 18).rotateX(Math.PI / 2).translate(x, 0.2, z), 0x1a1c1e));
    parts.push(part(new THREE.TorusGeometry(r + 0.45, 0.05, 3, 18).rotateX(Math.PI / 2).translate(x, 1.15, z), 0x2a2d30));
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      parts.push(part(new THREE.BoxGeometry(0.08, 0.95, 0.08).translate(x + Math.cos(a) * (r + 0.45), 0.7, z + Math.sin(a) * (r + 0.45)), 0x2a2d30));
    }
    // The net's jump fence inside the ring (seen from outside; inside, the net is under water).
    parts.push(part(new THREE.CylinderGeometry(r - 0.2, r - 0.2, 0.9, 18, 1, true).translate(x, 0.75, z), 0x2b3534));
  }
  // Corner buoys of the mooring grid, a ring's spacing out from the corner rings.
  const corners = [centres[0], centres[f.cols - 1], centres[centres.length - f.cols], centres[centres.length - 1]];
  const mx = centres.reduce((s, c) => s + c[0], 0) / centres.length;
  const mz = centres.reduce((s, c) => s + c[1], 0) / centres.length;
  for (const [x, z] of corners) {
    const d = Math.hypot(x - mx, z - mz) || 1;
    const bx = x + ((x - mx) / d) * f.spacing * 0.6;
    const bz = z + ((z - mz) / d) * f.spacing * 0.6;
    parts.push(part(new THREE.SphereGeometry(0.55, 8, 5).translate(bx, 0.2, bz), 0xe8701a));
  }
}

// ── Trees ────────────────────────────────────────────────────────────────────────

let conifer: THREE.BufferGeometry | null = null;
/** Lean low-poly conifer (~16 triangles): open-ended cones, three-sided trunk. Shared by every region. */
function coniferGeometry(): THREE.BufferGeometry {
  conifer ??= mergeParts([
    part(new THREE.CylinderGeometry(0.18, 0.25, 1.6, 3, 1, true).translate(0, 0.8, 0), 0x5a4030),
    part(new THREE.ConeGeometry(1.6, 3.6, 5, 1, true).translate(0, 2.8, 0), 0xffffff),
    part(new THREE.ConeGeometry(1.15, 2.8, 5, 1, true).translate(0, 4.6, 0), 0xffffff),
  ]);
  return conifer;
}

/** A region's trees as one instanced mesh, from their places (terrainMesh.ts treeSpots: x, y, z, scale each). */
function buildTreesMesh(spots: Float32Array): THREE.InstancedMesh {
  const n = spots.length / 4;
  const mesh = new THREE.InstancedMesh(coniferGeometry(), flatVertexColorMaterial(), n);
  mesh.name = 'trees';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const [x, y, z, sc] = [spots[i * 4], spots[i * 4 + 1], spots[i * 4 + 2], spots[i * 4 + 3]];
    q.setFromAxisAngle(up, hash(x, y) * Math.PI * 2);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc * (0.85 + 0.3 * hash(z, y)), sc));
    mesh.setMatrixAt(i, m);
    // Instance colour tints the (white) foliage; the trunk is dark enough not to matter.
    c.setRGB(0.18 + 0.08 * hash(x, z), 0.36 + 0.1 * hash(z, x), 0.16 + 0.05 * hash(y, x));
    mesh.setColorAt(i, c);
  }
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * A wreck (archipelago.ts WRECKS): a small coaster on her side, sunk until only the top of
 * her hull, the edge of her wheelhouse and her mast lie above the water. Rust and old paint,
 * flat-shaded, merged with the rest of the world's static parts. Her solid part, for running
 * into, is a ridge in RIDGES (`drawn: false`) along her length.
 */
function buildWreck(w: WreckDef, parts: THREE.BufferGeometry[]): void {
  const L = w.length;
  const B = L * 0.23;
  const D = L * 0.14;
  const hull = 0x5a3424;
  const rust = 0x8a4a28;
  const paint = 0x3a4a52;
  const local: THREE.BufferGeometry[] = [
    part(new THREE.BoxGeometry(B, D, L * 0.86).translate(0, D / 2, 0.02 * L), hull, 'worn'), // hull
    part(new THREE.CylinderGeometry(B / 2, B / 2, D, 3).rotateY(Math.PI).scale(1, 1, 0.9).translate(0, D / 2, -L * 0.47), hull), // bow
    part(new THREE.BoxGeometry(B * 1.01, D * 0.25, L * 0.87).translate(0, D * 0.88, 0.02 * L), rust, 'worn'), // a rust band along the top
    part(new THREE.BoxGeometry(B * 0.7, D * 0.9, L * 0.16).translate(0, D * 1.45, L * 0.3), paint, 'worn'), // wheelhouse aft
    part(new THREE.CylinderGeometry(0.5, 0.6, D * 0.8, 8).translate(0, D * 1.4, L * 0.4), rust), // funnel
    part(new THREE.CylinderGeometry(0.18, 0.25, L * 0.32, 6).translate(0, D + L * 0.16, -L * 0.22), rust), // mast
    part(new THREE.BoxGeometry(0.12, 0.12, L * 0.18).translate(0, D + L * 0.26, -L * 0.22), rust), // a cross-tree
  ];
  // Lie her over, turn her to her heading, then sink her until the top of her hull (her
  // upper side, lying over) is 0.9 m above the water; the wheelhouse and mast stick out.
  const lay = new THREE.Matrix4().makeRotationY((-w.headingDeg * Math.PI) / 180).multiply(new THREE.Matrix4().makeRotationZ((-w.listDeg * Math.PI) / 180));
  const hullTop = local[0].clone().applyMatrix4(lay);
  hullTop.computeBoundingBox();
  const g = mergeParts(local);
  g.userData.paintUvFixed = true; // her paint stays where it fell in her own frame
  g.applyMatrix4(lay);
  g.translate(w.x, 0.9 - hullTop.boundingBox!.max.y, w.z);
  parts.push(g);
}

// ── Lights ───────────────────────────────────────────────────────────────────────

const LIGHT_COLORS = { red: 0xff3020, green: 0x30ff60, white: 0xfff4d8, yellow: 0xffd020 };

/**
 * Harbour and lighthouse lights: one Points draw call with a constant on-screen size (so a
 * lighthouse is visible as a point miles off), flashing per their characteristic
 * (Fl = a 0.6 s flash every `period` s, F = fixed). Brighter and bigger at night.
 */
export class HarbourLights {
  readonly points: THREE.Points;
  private readonly material: LightPointsMaterial;
  private readonly colors: THREE.BufferAttribute;
  private readonly base: Float32Array;

  constructor() {
    const pos = new Float32Array(LIGHTS.length * 3);
    this.base = new Float32Array(LIGHTS.length * 3);
    const c = new THREE.Color();
    LIGHTS.forEach((l, i) => {
      pos.set([l.x, l.y + (l.tower === 'lighthouse' ? 0 : 0.35), l.z], i * 3);
      c.set(LIGHT_COLORS[l.color]);
      this.base.set([c.r, c.g, c.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.colors = new THREE.BufferAttribute(this.base.slice(), 3);
    geo.setAttribute('color', this.colors);
    this.material = new LightPointsMaterial(glowSprite());
    this.points = new THREE.Points(geo, this.material);
    this.points.name = 'harbourLights';
    this.points.frustumCulled = false;
  }

  /**
   * @param time       seconds
   * @param darkness   0 (noon) .. 1 (night)
   * @param viewer     where you are: a light is seen out to its sight distance (its height)
   *                   or the visibility, whichever is less, fading over the last fifth (sight.ts)
   * @param visibility today's visibility where you are (m)
   */
  update(time: number, darkness: number, viewer?: THREE.Vector3, visibility = Infinity): void {
    const col = this.colors.array as Float32Array;
    LIGHTS.forEach((l, i) => {
      const on = l.period === 0 || time % l.period < 0.6;
      let seen = 1;
      if (viewer) {
        const range = seenRange(l.y, visibility, CONFIG.regions.lightVisFactor);
        const d = Math.hypot(viewer.x - l.x, viewer.z - l.z);
        seen = Math.min(1, Math.max(0, (range - d) / (0.2 * range)));
      }
      for (let k = 0; k < 3; k++) col[i * 3 + k] = on ? this.base[i * 3 + k] * seen : 0;
    });
    this.colors.needsUpdate = true;
    this.material.set(CONFIG.lightPoints.size * (0.6 + 1.0 * darkness), 0.35 + 0.65 * darkness);
  }
}

export function glowTexture(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(g.canvas);
}

// ── Port lighting ────────────────────────────────────────────────────────────────

/**
 * Night lighting for the ports, frame-rate friendly:
 *  - every lamp post's head glows (one Points draw call, warm, world-sized sprites);
 *  - ONE real PointLight - the floodlight of the nearest port within `activeRange` - lights
 *    the quay, the boat and (in the ocean shader) the water near you. Moving between ports
 *    moves the light. It's hidden from dawn to dusk, so by day no shader pays for it (it
 *    comes into the shaders once at dusk and leaves once at dawn: one recompile each).
 */
export class PortLighting {
  readonly root = new THREE.Group();
  readonly flood: THREE.PointLight;
  private readonly glow: THREE.Points;
  private readonly glowMat: THREE.PointsMaterial;

  constructor() {
    const c = CONFIG.portLights;
    const pos = new Float32Array(LAMPS.length * 3);
    LAMPS.forEach((l, i) => pos.set([l.x, l.y - 0.12, l.z], i * 3));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.glowMat = new THREE.PointsMaterial({
      color: c.lampColor,
      size: 2.2,
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.glow = new THREE.Points(geo, this.glowMat);
    this.glow.name = 'lampGlow';
    this.glow.frustumCulled = false;
    this.flood = new THREE.PointLight(c.lampColor, 0, c.floodDistance, 2);
    this.flood.name = 'portFlood';
    this.root.add(this.glow, this.flood);
  }

  /**
   * @param near     a point near the action (the boat or the viewer)
   * @param darkness 0 (noon) .. 1 (night); lamps come on at dusk
   */
  update(near: THREE.Vector3, darkness: number): void {
    const c = CONFIG.portLights;
    const on = Math.min(1, Math.max(0, (darkness - 0.25) / 0.3));
    this.glow.visible = on > 0.01;
    this.glowMat.opacity = on;
    let best: (typeof PORT_FLOODS)[number] | null = null;
    let bestD = c.activeRange;
    for (const f of PORT_FLOODS) {
      const d = Math.hypot(near.x - f.x, near.z - f.z);
      if (d < bestD) [best, bestD] = [f, d];
    }
    if (best) this.flood.position.set(best.x, best.y, best.z);
    this.flood.intensity = best ? c.floodIntensity * on : 0;
    // In the scene's lights only from dusk to dawn (changes twice a day: one recompile each),
    // so in daylight no shader pays for it.
    this.flood.visible = on > 0.01;
    // Static group: refresh the moved light's matrix by hand.
    this.flood.updateMatrix();
    this.flood.updateMatrixWorld(true);
  }
}
