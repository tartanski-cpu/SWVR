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
import { farmBlocks } from './farms';
import { windFarmBlocks } from './windFarm';
import type {
  BerthDef,
  BlockDef,
  BuildingDef,
  ChannelDef,
  CurrentZoneDef,
  CutDef,
  FishingGroundDef,
  FarmDef,
  FerryRouteDef,
  FlatDef,
  FogBankDef,
  ShoalDef,
  GustZoneDef,
  IslandDef,
  LampDef,
  LightDef,
  MarkDef,
  PlaceDef,
  PortDef,
  PortFloodDef,
  PottingGround,
  RidgeDef,
  ShelterDef,
  SkylineDef,
  SlipwayDef,
  WreckDef,
  WindFarmDef,
} from './defs';

export * from './defs';

export const ISLANDS: IslandDef[] = REGIONS.flatMap((r) => r.islands);
export const CUTS: CutDef[] = REGIONS.flatMap((r) => r.cuts);
export const FLATS: FlatDef[] = REGIONS.flatMap((r) => r.flats);
export const RIDGES: RidgeDef[] = REGIONS.flatMap((r) => r.ridges);
/** Quays, piers and barges, and the fish farms' cage rings (farms.ts: solid to a boat, drawn by the farm). */
export const BLOCKS: BlockDef[] = REGIONS.flatMap((r) => [...r.blocks, ...(r.farms ?? []).flatMap(farmBlocks), ...(r.windFarms ?? []).flatMap(windFarmBlocks)]);
/** Offshore wind farms (world/windFarm.ts: solid to a boat, a boat landing on each turbine). */
export const WIND_FARMS: WindFarmDef[] = REGIONS.flatMap((r) => r.windFarms ?? []);
export const CHANNELS: ChannelDef[] = REGIONS.flatMap((r) => r.channels ?? []);
export const SHOALS: ShoalDef[] = REGIONS.flatMap((r) => r.shoals ?? []);
export const FARMS: FarmDef[] = REGIONS.flatMap((r) => r.farms ?? []);
/** What stands against a coast map's sky (castles, masts, turbines...: world/view/skylineView.ts). */
export const SKYLINE: SkylineDef[] = REGIONS.flatMap((r) => r.skyline ?? []);
/** A coast map's place names (charts, radio calls: world/places.ts). */
export const PLACES: PlaceDef[] = REGIONS.flatMap((r) => r.places ?? []);
/** A coast map's ferry routes (traffic/ferries.ts). */
export const FERRY_ROUTES: FerryRouteDef[] = REGIONS.flatMap((r) => r.ferries ?? []);
export const SKYLINE_STYLE: string | undefined = REGIONS.find((r) => r.skylineStyle)?.skylineStyle;
export const GUSTS: GustZoneDef[] = REGIONS.flatMap((r) => r.gusts ?? []);
export const BUILDINGS: BuildingDef[] = REGIONS.flatMap((r) => r.buildings);
export const MARKS: MarkDef[] = REGIONS.flatMap((r) => r.marks);
export const WRECKS: WreckDef[] = REGIONS.flatMap((r) => r.wrecks);
export const LIGHTS: LightDef[] = REGIONS.flatMap((r) => r.lights);
export const SHELTERS: ShelterDef[] = REGIONS.flatMap((r) => r.shelters);
export const PORTS: PortDef[] = REGIONS.flatMap((r) => r.ports);

/** A port with no quay to come alongside, only an anchorage (goods go ashore by skiff, or by swimming). */
export function anchorageOnly(portId: string | null | undefined): boolean {
  const p = PORTS.find((x) => x.id === portId);
  return !!p?.cargo.anchorage && !p.cargo.berth;
}
export const BERTHS: BerthDef[] = REGIONS.flatMap((r) => r.berths);
export const SLIPWAYS: SlipwayDef[] = REGIONS.flatMap((r) => r.slipways);
export const LAMPS: LampDef[] = REGIONS.flatMap((r) => r.lamps);
export const PORT_FLOODS: PortFloodDef[] = REGIONS.flatMap((r) => r.portFloods);
export const POTTING_GROUNDS: PottingGround[] = REGIONS.flatMap((r) => r.pottingGrounds);
export const FISHING_GROUNDS: FishingGroundDef[] = REGIONS.flatMap((r) => r.fishingGrounds);
export const FOG_BANKS: FogBankDef[] = REGIONS.flatMap((r) => r.fogBanks);
export const CURRENTS: CurrentZoneDef[] = REGIONS.flatMap((r) => r.currents);

/** Deepest water anywhere (m): the open sea floor. */
export const MAX_DEPTH = 40;
/** Seabed shelf: depth reaches ~63 % of MAX_DEPTH this far offshore (m). */
export const SHELF = 55;
