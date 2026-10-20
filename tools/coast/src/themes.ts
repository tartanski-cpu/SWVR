/**
 * Region themes: the colours a region's ground takes from its land cover (ESA WorldCover
 * classes), flat per face, no textures. One per family of places; the request names it.
 */
export interface Theme {
  /** WorldCover class -> colour (hex). */
  cover: Record<number, number>;
  rock: number;
  sand: number;
  /**
   * Grassland shading to moor with height: WorldCover calls most open hill "grassland",
   * though above the fields it is heather and rough grazing. From `from` m to `to` m the
   * grass colour blends into `colour`.
   */
  moor?: { from: number; to: number; colour: number };
  /** The seabed: shallow (sand) to deep. */
  shallow: number;
  deep: number;
  /** Buildings near harbours: house walls and roofs (one picked per building), and sheds'. */
  buildings: { walls: number[]; roofs: number[]; shedWalls: number[]; shedRoof: number };
}

const NORTH_HEBRIDEAN: Theme = {
  cover: {
    10: 0x2f5a2c, // tree cover: conifer plantations and oak woods, dark
    20: 0x6e5c48, // shrubland: heather moor, brown-purple
    30: 0x6f9445, // grassland
    40: 0x8faf55, // cropland
    50: 0x8b8a84, // built-up
    60: 0x8a857a, // bare / sparse: rock
    70: 0xeef2f4, // snow and ice
    80: 0x3f6f8a, // permanent water (inland lochs drawn as land for now)
    90: 0x6f7d4a, // herbaceous wetland: bog
    95: 0x4a6a3a, // mangroves (not here)
    100: 0x8a9a6a, // moss and lichen
  },
  rock: 0x77736b,
  sand: 0xd9c99a,
  moor: { from: 40, to: 160, colour: 0x7a6e4e },
  shallow: 0xa99a70,
  deep: 0x3e5a58,
  // West Highland towns: white and cream harling, grey granite, slate roofs; grey or green sheds.
  buildings: { walls: [0xf0eee6, 0xf0eee6, 0xe8e0c8, 0xd8d4cc, 0x9a958c, 0xc9b9a0], roofs: [0x4a4e54, 0x3e4248, 0x55595e], shedWalls: [0x8c9294, 0x5f7a5c, 0x9aa0a0], shedRoof: 0x6a7072 },
};

export const THEMES: Record<string, Theme> = { 'north-hebridean': NORTH_HEBRIDEAN };
