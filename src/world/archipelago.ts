/**
 * The world's level data, not tunables: every region's islands, dredged basins,
 * breakwaters, quays/piers, buildings, lights, sea marks, ports and sheltered water, joined
 * into one flat list of each (home's first). The regions themselves live in regions/, one
 * file each (regions/home.ts is the original archipelago); the shapes are in defs.ts.
 * Nothing else in the game needs to know which region a thing belongs to: it reads these
 * lists as it always did. To add a region, add its file to regions/index.ts.
 *
 * World axes: +X east, -Z north, metres; heights above mean sea level (MSL = y 0).
 */
import { REGIONS } from './regions';
import type {
  BerthDef,
  BlockDef,
  BuildingDef,
  CutDef,
  FishingGroundDef,
  FlatDef,
  FogBankDef,
  IslandDef,
  LampDef,
  LightDef,
  MarkDef,
  PortDef,
  PortFloodDef,
  PottingGround,
  RidgeDef,
  ShelterDef,
  SlipwayDef,
  WreckDef,
} from './defs';

export * from './defs';

export const ISLANDS: IslandDef[] = REGIONS.flatMap((r) => r.islands);
export const CUTS: CutDef[] = REGIONS.flatMap((r) => r.cuts);
export const FLATS: FlatDef[] = REGIONS.flatMap((r) => r.flats);
export const RIDGES: RidgeDef[] = REGIONS.flatMap((r) => r.ridges);
export const BLOCKS: BlockDef[] = REGIONS.flatMap((r) => r.blocks);
export const BUILDINGS: BuildingDef[] = REGIONS.flatMap((r) => r.buildings);
export const MARKS: MarkDef[] = REGIONS.flatMap((r) => r.marks);
export const WRECKS: WreckDef[] = REGIONS.flatMap((r) => r.wrecks);
export const LIGHTS: LightDef[] = REGIONS.flatMap((r) => r.lights);
export const SHELTERS: ShelterDef[] = REGIONS.flatMap((r) => r.shelters);
export const PORTS: PortDef[] = REGIONS.flatMap((r) => r.ports);
export const BERTHS: BerthDef[] = REGIONS.flatMap((r) => r.berths);
export const SLIPWAYS: SlipwayDef[] = REGIONS.flatMap((r) => r.slipways);
export const LAMPS: LampDef[] = REGIONS.flatMap((r) => r.lamps);
export const PORT_FLOODS: PortFloodDef[] = REGIONS.flatMap((r) => r.portFloods);
export const POTTING_GROUNDS: PottingGround[] = REGIONS.flatMap((r) => r.pottingGrounds);
export const FISHING_GROUNDS: FishingGroundDef[] = REGIONS.flatMap((r) => r.fishingGrounds);
export const FOG_BANKS: FogBankDef[] = REGIONS.flatMap((r) => r.fogBanks);

/** Deepest water anywhere (m): the open sea floor. */
export const MAX_DEPTH = 40;
/** Seabed shelf: depth reaches ~63 % of MAX_DEPTH this far offshore (m). */
export const SHELF = 55;
