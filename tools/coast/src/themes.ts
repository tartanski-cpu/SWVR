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
};

export const THEMES: Record<string, Theme> = { 'north-hebridean': NORTH_HEBRIDEAN };
