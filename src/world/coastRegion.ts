/**
 * A coast region (the coast pipeline's milestone 4): a region made by tools/coast from open
 * map data, in the game's own shapes. The pipeline's package (src/world/regions/<id>.coast.json,
 * written by tools/coast/src/package.ts) is in the region's own metres about its box's
 * centre; `fromCoastPackage` places it in the world at (x, z) and makes a RegionDef like any
 * other. Its ground is its mesh (coastTerrain.ts), fetched at start: `loadCoastTerrains`.
 *
 * No code of the region's own: the region's file is its package plus where it goes.
 */
import type { CoastFeaturesRef } from './coastFeatures';
import { registerShore, type ShoreLayout } from './coastShore';
import type { BerthDef, BlockDef, BridgeDef, BuildingDef, CurrentZoneDef, FarmDef, FerryRouteDef, FishingGroundDef, FollyDef, GantryDef, HarbourBoatsDef, LampDef, LandmarkDef, LightDef, MarkDef, PortDef, PlaceDef, PortFloodDef, PottingGround, RegionDef, ShelterDef, SkylineDef, SlipwayDef } from './defs';
import { registerChunkedCoast, registerCoastTerrain, type ChunkedCoastLayout, type CoastTerrainLayout } from './coastTerrain';
import { registerForest, type ForestLayout } from './forest';

export type WholeCoastTerrain = CoastTerrainLayout & { dir: string; file: string; chunked?: undefined };
export type ChunkedCoastTerrain = ChunkedCoastLayout & { dir: string };

/** The package's shape (tools/coast/src/package.ts). */
export interface CoastPackage {
  format: string;
  id: string;
  name: string;
  /** Its box in degrees (lon/lat min, max), for latitude and longitude (coastGeo.ts); absent in an older package. */
  bbox?: [number, number, number, number];
  /** A whole region's terrain.bin layout, or a chunked region's coarse grid and chunk files. */
  terrain: WholeCoastTerrain | ChunkedCoastTerrain;
  /** Its forest map (tools/coast trees.ts), for the trees; absent in an older package. */
  trees?: ForestLayout;
  /** Its harbour boats' moorings and anchor spots (tools/coast boats.ts); absent in an older package. */
  boats?: HarbourBoatsDef;
  /** Its fish farms, and its skyline (castles, masts, turbines...), from the features stage (C2); absent in an older package. */
  farms?: FarmDef[];
  skyline?: SkylineDef[];
  skylineStyle?: string;
  /** Its place names (C4); absent in an older package. */
  places?: PlaceDef[];
  /** Its ferry routes (C7); absent in an older package. */
  ferries?: FerryRouteDef[];
  /** Its bridges over the sea and follies (the landmarks and bridges pass); absent in an older package. */
  bridges?: BridgeDef[];
  follies?: FollyDef[];
  gantries?: GantryDef[];
  /** Its features file (tools/coast features.ts: farms, landmarks, shore, names...); fetched by the milestones that use it. */
  features?: CoastFeaturesRef;
  /** What its shore is made of (tools/coast shore.ts): the map's layout; absent in an older package. */
  shore?: ShoreLayout;
  box: { x0: number; x1: number; z0: number; z1: number };
  credits: string;
  licence: string;
  landmarks: LandmarkDef[];
  blocks: BlockDef[];
  buildings: BuildingDef[];
  marks: MarkDef[];
  lights: LightDef[];
  shelters: ShelterDef[];
  ports: PortDef[];
  berths: BerthDef[];
  slipways: SlipwayDef[];
  lamps: LampDef[];
  portFloods: PortFloodDef[];
  pottingGrounds: PottingGround[];
  fishingGrounds: FishingGroundDef[];
  currents: CurrentZoneDef[];
}

/** Where a coast region sits, and what it brings beyond the package (its weather, jobs...). */
export type CoastPlacement = { x: number; z: number } & Partial<Pick<RegionDef, 'weather' | 'jobs' | 'theme' | 'fogBanks'>>;

/** A RegionDef's `coast`: the package's terrain and where its origin is in the world. */
export interface RegionCoast {
  pkg: CoastPackage;
  x: number;
  z: number;
}

const shift = <T extends { x: number; z: number }>(list: T[], dx: number, dz: number): T[] => list.map((o) => ({ ...o, x: o.x + dx, z: o.z + dz }));

export function fromCoastPackage(pkg: CoastPackage, at: CoastPlacement): RegionDef {
  const { x: dx, z: dz } = at;
  return {
    id: pkg.id,
    name: pkg.name,
    bounds: { x0: pkg.box.x0 + dx, x1: pkg.box.x1 + dx, z0: pkg.box.z0 + dz, z1: pkg.box.z1 + dz },
    landmarks: shift(pkg.landmarks, dx, dz),
    islands: [],
    cuts: [],
    flats: [],
    ridges: [],
    blocks: shift(pkg.blocks, dx, dz),
    buildings: shift(pkg.buildings, dx, dz),
    marks: shift(pkg.marks, dx, dz),
    wrecks: [],
    lights: shift(pkg.lights, dx, dz),
    shelters: shift(pkg.shelters, dx, dz),
    ports: pkg.ports.map((p) => ({
      ...p,
      x: p.x + dx,
      z: p.z + dz,
      ...(p.fuel ? { fuel: { ...p.fuel, x: p.fuel.x + dx, z: p.fuel.z + dz, pumpX: p.fuel.pumpX + dx, pumpZ: p.fuel.pumpZ + dz } } : {}),
      cargo: {
        ...p.cargo,
        ...(p.cargo.berth ? { berth: { ...p.cargo.berth, x: p.cargo.berth.x + dx, z: p.cargo.berth.z + dz } } : {}),
        ...(p.cargo.anchorage ? { anchorage: { ...p.cargo.anchorage, x: p.cargo.anchorage.x + dx, z: p.cargo.anchorage.z + dz } } : {}),
        stackX: p.cargo.stackX + dx,
        stackZ: p.cargo.stackZ + dz,
      },
    })),
    berths: shift(pkg.berths, dx, dz),
    slipways: shift(pkg.slipways, dx, dz),
    lamps: shift(pkg.lamps, dx, dz),
    portFloods: shift(pkg.portFloods, dx, dz),
    pottingGrounds: shift(pkg.pottingGrounds, dx, dz),
    fishingGrounds: shift(pkg.fishingGrounds, dx, dz),
    fogBanks: at.fogBanks ?? [],
    currents: shift(pkg.currents, dx, dz),
    ...(at.weather ? { weather: at.weather } : {}),
    ...(at.jobs ? { jobs: at.jobs } : {}),
    ...(at.theme ? { theme: at.theme } : {}),
    ...(pkg.farms?.length ? { farms: pkg.farms.map((f) => ({ ...f, x: f.x + dx, z: f.z + dz, ...(f.corners ? { corners: f.corners.map(([x, z]) => [x + dx, z + dz] as [number, number]) } : {}) })) } : {}),
    ...(pkg.places?.length ? { places: shift(pkg.places, dx, dz) } : {}),
    ...(pkg.bridges?.length ? { bridges: pkg.bridges.map((b) => ({ ...b, path: b.path.map(([x, z]) => [x + dx, z + dz] as [number, number]) })) } : {}),
    ...(pkg.gantries?.length ? { gantries: pkg.gantries.map((g) => ({ ...g, x: g.x + dx, z: g.z + dz })) } : {}),
    ...(pkg.follies?.length ? { follies: pkg.follies.map((f) => ({ ...f, outline: f.outline.map(([x, z]) => [x + dx, z + dz] as [number, number]) })) } : {}),
    ...(pkg.ferries?.length ? { ferries: pkg.ferries.map((f) => ({ ...f, path: f.path.map(([x, z]) => [x + dx, z + dz] as [number, number]) })) } : {}),
    ...(pkg.skyline?.length ? { skyline: shift(pkg.skyline, dx, dz), skylineStyle: pkg.skylineStyle } : {}),
    ...(pkg.boats ? { harbourBoats: { style: pkg.boats.style, spots: shift(pkg.boats.spots, dx, dz) } } : {}),
    coast: { pkg, x: dx, z: dz },
  };
}

/**
 * Fetch every coast region's terrain and register it (main.ts, before the world starts): a
 * whole region's mesh, or a chunked region's coarse grid (its chunks stream in later,
 * coastStream.ts). `base` is the site's root (import.meta.env.BASE_URL).
 */
export async function loadCoastTerrains(regions: readonly RegionDef[], base: string): Promise<void> {
  await Promise.all(
    regions.map(async (r) => {
      const c = r.coast;
      if (!c) return;
      const t = c.pkg.terrain;
      const res = await fetch(`${base}${t.dir}${t.chunked ? t.coarse.file : t.file}`);
      if (!res.ok) throw new Error(`coast region ${r.id}: terrain ${res.status}`);
      const bin = await res.arrayBuffer();
      if (t.chunked) registerChunkedCoast(r.id, bin, t, c.pkg.box, c.x, c.z);
      else registerCoastTerrain(r.id, bin, t, c.pkg.box, c.x, c.z);
      // What its shore is made of (the physics reads it: a bow-ramp boat beaches on sand).
      const shore = c.pkg.shore;
      if (shore) {
        const f = await fetch(`${base}${t.dir}${shore.file}`).catch(() => null);
        if (f?.ok) registerShore(r.id, await f.arrayBuffer(), shore, c.x, c.z);
      }
      // Its woods (drawing only: a missing map just means no trees).
      const trees = c.pkg.trees;
      if (trees) {
        const f = await fetch(`${base}${t.dir}${trees.file}`).catch(() => null);
        if (f?.ok) registerForest(r.id, await f.arrayBuffer(), trees, c.x, c.z);
      }
    }),
  );
}

/**
 * A big Voyage map's package (the Clyde: public/regions/<id>/package.json) is fetched when
 * the map is chosen (main.ts), not built into the game, so Career mode never carries it. It
 * is kept here, by region id, until the region is made from it (world/maps.ts).
 */
const REMOTE = new Map<string, CoastPackage>();
export function setRemotePackage(pkg: CoastPackage): void {
  REMOTE.set(pkg.id, pkg);
}
export function remotePackage(id: string): CoastPackage | undefined {
  return REMOTE.get(id);
}
