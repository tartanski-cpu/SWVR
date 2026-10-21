/**
 * What kind of building each OpenStreetMap footprint is, for the game's house kit (the
 * settlements brief, Part A): read from its tags where it has them, else inferred from its
 * footprint and what's round it. Pure functions, no files (harbours.ts calls them; the game's
 * tests check them).
 *
 * Tags read: building=* (the type), building:levels / height / roof:height (heights),
 * roof:shape, building:colour / roof:colour, building:material, amenity / shop / tourism /
 * historic (a pub, a shop, a hotel, a church, a castle, a ruin).
 *
 * The rules, for the many tagged only building=yes (3,337 of Oban's 3,900):
 *   - a big footprint on or beside a quay: a warehouse or fish store; a small one by the
 *     shore: a boathouse;
 *   - in a farmyard: a barn or shed (a small one: the farmhouse); in an industrial area: a
 *     warehouse or shed;
 *   - a tiny footprint: a shed or garage;
 *   - sharing a wall with its neighbours (OpenStreetMap draws terraced houses on shared
 *     nodes), or long and thin in a residential street: a terrace;
 *   - small and near square: a cottage; very big: a warehouse; else a house.
 * Levels, roof shapes and colours default by type and by the region's theme (themes.ts
 * `houses`), picked with a seeded random so a town is varied but the same every build.
 */

export type HouseType = 'cottage' | 'house' | 'terrace' | 'shed' | 'church' | 'warehouse' | 'boathouse' | 'castle' | 'ruin';
export type RoofShape = 'gabled' | 'hipped' | 'flat' | 'pyramidal' | 'skillion';
export const HOUSE_TYPES: HouseType[] = ['cottage', 'house', 'terrace', 'shed', 'church', 'warehouse', 'boathouse', 'castle', 'ruin'];

/** A theme's houses: colours to pick from, and each type's floors and roof (themes.ts). */
export interface HouseStyle {
  /** House and cottage walls; painted fronts (terraces on a harbour front, pubs and shops); doors; signs. */
  walls: number[];
  painted: number[];
  doors: number[];
  signs: number[];
  /** Roofs of houses; sheds' and warehouses' walls and roofs; stone (churches, castles). */
  roofs: number[];
  shedWalls: number[];
  shedRoofs: number[];
  stone: number[];
  /** Floors by type (a fraction: 1.5 is a storey and a half, rooms in the roof). */
  levels: Record<HouseType, number>;
  /** Roof by type: one shape, or shapes with weights picked per building. */
  roofShapes: Record<HouseType, RoofShape | [RoofShape, number][]>;
  /** Share of a town's terraces given painted fronts (Tobermory), the rest from `walls`. */
  paintedShare: number;
}

export interface Footprint {
  area: number;
  /** Along its long axis, and across (m). */
  length: number;
  width: number;
}

export interface Surroundings {
  /** OpenStreetMap landuse under its middle, if any. */
  landuse?: string;
  /** On or beside a quay, pier or pontoon (m from its edge, within the caller's reach). */
  nearQuay: boolean;
  /** Within a few tens of metres of the water. */
  nearShore: boolean;
  /** Shares at least a wall (two nodes) with another building. */
  sharesWalls: boolean;
}

export interface Classified {
  type: HouseType;
  /** Where the type came from: its tags, or the rules. */
  source: 'tag' | 'rule';
  levels: number;
  roof: RoofShape;
  /** Wall height to the eaves (m), and the roof's rise above them (m) when tagged. */
  height: number;
  roofHeight?: number;
  /** A pub, shop, hotel or café: a sign over the door, a brighter front. */
  special?: 'pub' | 'shop' | 'hotel' | 'cafe';
  /** Colours given by tags (else the caller picks from the theme). */
  wallColour?: number;
  roofColour?: number;
  /** Walls of stone, boards, render or sheet (a material tag, else by type). */
  material: 'render' | 'stone' | 'boards' | 'sheet';
}

/** Metres per storey (the brief: about 2.8 m a level; the facade's windows repeat every 3 m). */
export const STOREY = 3;

const BY_TAG: Record<string, HouseType> = {
  house: 'house', detached: 'house', semidetached_house: 'house', residential: 'house', apartments: 'house', farm: 'house', hotel: 'house',
  school: 'house', public: 'house', civic: 'house', government: 'house', hospital: 'house', retail: 'house', commercial: 'house', office: 'house',
  bungalow: 'cottage', cottage: 'cottage', hut: 'cottage', cabin: 'cottage',
  terrace: 'terrace',
  church: 'church', chapel: 'church', cathedral: 'church', mosque: 'church', temple: 'church', religious: 'church',
  warehouse: 'warehouse', industrial: 'warehouse', hangar: 'warehouse', manufacture: 'warehouse', fish_store: 'warehouse',
  barn: 'shed', farm_auxiliary: 'shed', cowshed: 'shed', stable: 'shed', shed: 'shed', roof: 'shed', greenhouse: 'shed', static_caravan: 'shed', storage_tank: 'shed', kiosk: 'shed', service: 'shed',
  boathouse: 'boathouse', garage: 'boathouse', garages: 'boathouse', carport: 'boathouse', boat_store: 'boathouse',
  ruins: 'ruin', castle: 'castle', tower: 'castle',
};

const ROOF_TAG: Record<string, RoofShape> = {
  gabled: 'gabled', saltbox: 'gabled', gambrel: 'gabled', round: 'gabled',
  hipped: 'hipped', 'half-hipped': 'hipped', side_hipped: 'hipped', mansard: 'hipped',
  flat: 'flat', pyramidal: 'pyramidal', dome: 'pyramidal', onion: 'pyramidal', cone: 'pyramidal',
  skillion: 'skillion', lean_to: 'skillion',
};

/** A few colour names OpenStreetMap uses, and #rgb / #rrggbb. */
const NAMED: Record<string, number> = {
  white: 0xf2f0ea, black: 0x2a2a2a, grey: 0x8c8c88, gray: 0x8c8c88, darkgrey: 0x55585a, lightgrey: 0xc0c0bc, red: 0xa83a2c, darkred: 0x6e2a22, brown: 0x6e5038,
  yellow: 0xe8cf6a, cream: 0xefe6cc, beige: 0xd8c8a4, blue: 0x4a6a9a, lightblue: 0x9ab8d0, green: 0x4f7a4a, darkgreen: 0x2f4a30, orange: 0xd8823a, pink: 0xe2a8a8,
  terracotta: 0xb05a3c, maroon: 0x6a2a2a, silver: 0xb8b8b4, sandybrown: 0xd8a868, tan: 0xcfb48a,
};
export function parseColour(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase().replace(/[\s_-]/g, '');
  if (s in NAMED) return NAMED[s];
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return Number.parseInt(h, 16);
}

/** A seeded pick: `k` in [0, 1) chooses from a list, or by weights. */
export function pick<T>(list: readonly T[], k: number): T {
  return list[Math.min(list.length - 1, Math.floor(k * list.length))];
}
function pickWeighted<T>(list: [T, number][], k: number): T {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let at = k * total;
  for (const [v, w] of list) if ((at -= w) < 0) return v;
  return list[list.length - 1][0];
}

/** The rules, for a footprint with no useful building tag. */
function inferType(fp: Footprint, s: Surroundings): HouseType {
  const aspect = fp.length / Math.max(1, fp.width);
  if (s.nearQuay && fp.area > 150) return 'warehouse';
  if ((s.nearQuay || s.nearShore) && fp.area < 70 && fp.area > 12) return 'boathouse';
  if (s.landuse === 'farmyard' || s.landuse === 'farmland') return fp.area > 110 ? 'shed' : 'house';
  if (s.landuse === 'industrial' || s.landuse === 'port' || s.landuse === 'harbour') return fp.area > 100 ? 'warehouse' : 'shed';
  if (fp.area < 22) return 'shed';
  if (s.sharesWalls && fp.area < 400) return 'terrace';
  if (aspect > 2.6 && fp.area > 110 && fp.area < 700 && (s.landuse === 'residential' || s.landuse === 'retail' || s.landuse === 'commercial')) return 'terrace';
  if (fp.area < 75 && aspect < 1.8) return 'cottage';
  if (fp.area > 600) return 'warehouse';
  return 'house';
}

/**
 * Classify one footprint. `k` is its seeded random number in [0, 1) (from its id and the
 * region's), used for every choice so the same building comes out the same every build.
 */
export function classify(tags: Record<string, string>, fp: Footprint, s: Surroundings, style: HouseStyle, k: number): Classified {
  const b = tags.building ?? 'yes';
  let type: HouseType | undefined = BY_TAG[b];
  if (tags.historic === 'castle') type = 'castle';
  else if (tags.historic === 'ruins' || b === 'ruins') type = 'ruin';
  else if (tags.amenity === 'place_of_worship' && fp.area > 40) type = 'church';
  const source: Classified['source'] = type ? 'tag' : 'rule';
  type ??= inferType(fp, s);
  const special = tags.amenity === 'pub' || tags.amenity === 'bar' ? 'pub' : tags.amenity === 'cafe' || tags.amenity === 'restaurant' ? 'cafe' : tags.tourism === 'hotel' || tags.tourism === 'guest_house' || b === 'hotel' ? 'hotel' : tags.shop ? 'shop' : undefined;

  // Floors: tagged, or from a tagged height, else the theme's for the type (a terrace in a
  // town a floor higher half the time; a few houses a floor higher).
  const tagLevels = Number.parseFloat(tags['building:levels'] ?? '');
  const tagHeight = Number.parseFloat(tags.height ?? '');
  const roofHeight = Number.parseFloat(tags['roof:height'] ?? '');
  let levels = tagLevels > 0 ? tagLevels : tagHeight > 0 ? Math.max(1, (tagHeight - (roofHeight > 0 ? roofHeight : 0)) / STOREY) : style.levels[type];
  if (!(tagLevels > 0) && !(tagHeight > 0)) {
    if (type === 'terrace' && (k * 13) % 1 < 0.5) levels += 1;
    if (type === 'house' && (k * 17) % 1 < 0.2) levels += 1;
    if (special) levels = Math.max(levels, 2);
  }
  levels = Math.min(12, Math.max(1, levels));
  const height = Math.min(36, tagHeight > 0 ? tagHeight - (roofHeight > 0 ? roofHeight : 0) : levels * STOREY);

  const tagRoof = ROOF_TAG[tags['roof:shape'] ?? ''];
  const def = style.roofShapes[type];
  const roof = tagRoof ?? (typeof def === 'string' ? def : pickWeighted(def, (k * 29) % 1));

  const mat = tags['building:material'] ?? tags['building:facade:material'];
  const material: Classified['material'] =
    mat === 'stone' || mat === 'sandstone' || mat === 'granite' || mat === 'brick' ? 'stone' : mat === 'wood' || mat === 'timber_framing' ? 'boards' : mat === 'metal' || mat === 'steel' ? 'sheet' : type === 'shed' ? 'sheet' : type === 'boathouse' ? 'boards' : type === 'church' || type === 'castle' || type === 'ruin' ? 'stone' : 'render';

  return {
    type,
    source,
    levels,
    roof,
    height: Math.max(2.5, height),
    roofHeight: roofHeight > 0 ? roofHeight : undefined,
    special,
    wallColour: parseColour(tags['building:colour']),
    roofColour: parseColour(tags['roof:colour']),
    material,
  };
}

/** The colours for a classified building, from its tags or its theme. */
export function colours(c: Classified, style: HouseStyle, k: number, onFront: boolean): { wall: number; roof: number; door: number; sign?: number } {
  const k1 = (k * 7) % 1;
  const k2 = (k * 11) % 1;
  const k3 = (k * 19) % 1;
  const shedLike = c.type === 'shed' || c.type === 'warehouse';
  const stoneLike = c.type === 'church' || c.type === 'castle' || c.type === 'ruin';
  const painted = (c.special || (c.type === 'terrace' && onFront)) && k3 < (c.special ? 1 : style.paintedShare);
  const wall = c.wallColour ?? (stoneLike ? pick(style.stone, k1) : shedLike ? pick(style.shedWalls, k1) : painted ? pick(style.painted, k1) : pick(style.walls, k1));
  const roof = c.roofColour ?? (shedLike ? pick(style.shedRoofs, k2) : pick(style.roofs, k2));
  return { wall, roof, door: pick(style.doors, k3), sign: c.special ? pick(style.signs, k2) : undefined };
}
