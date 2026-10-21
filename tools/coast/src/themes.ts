import type { HouseStyle } from './houses.ts';

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
  /** Buildings near harbours: colours, floors and roofs by type (houses.ts). */
  houses: HouseStyle;
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
  // West Highland towns: white and cream harling, grey granite, slate roofs; the odd painted
  // harbour front (Tobermory); grey, green or red corrugated sheds; cottages a storey and a
  // half under steep slate gables; terraces two or three storeys.
  houses: {
    walls: [0xf0eee6, 0xf0eee6, 0xf0eee6, 0xe8e0c8, 0xd8d4cc, 0x9a958c, 0xc9b9a0],
    painted: [0x2f5d8a, 0xc23b2e, 0xe7c34a, 0x3f8a5a, 0xe58fa8, 0x7fb8d8, 0xf0eee6, 0x8a4fa0],
    doors: [0x2a3a5a, 0x7a2a22, 0x2f4a30, 0x1e1e1e, 0x5a3a28],
    signs: [0x1e3a5a, 0x6a1e1e, 0x1e4a2a, 0x2a2a2a],
    roofs: [0x4a4e54, 0x3e4248, 0x55595e],
    shedWalls: [0x8c9294, 0x5f7a5c, 0x9aa0a0, 0x8a3a2e],
    shedRoofs: [0x6a7072, 0x5a6064, 0x7a3a30],
    stone: [0x8a8680, 0x9a9488, 0x7a7670],
    levels: { cottage: 1.5, house: 2, terrace: 2, shed: 1, church: 2.5, warehouse: 2, boathouse: 1, castle: 4, ruin: 2 },
    roofShapes: { cottage: 'gabled', house: [['gabled', 4], ['hipped', 1]], terrace: 'gabled', shed: 'gabled', church: 'gabled', warehouse: 'gabled', boathouse: 'gabled', castle: 'flat', ruin: 'flat' },
    paintedShare: 0.5,
  },
};

// The Aegean (Syros): dry hills of thyme and phrygana scrub, terraced slopes, bare marble
// and schist, pine and olive in the valleys, white towns; bright sand under clear water.
const AEGEAN: Theme = {
  cover: {
    10: 0x56683a, // tree cover: pine and olive groves
    20: 0x9a9060, // shrubland: phrygana, grey-green scrub
    30: 0x9e9158, // grassland: dry, straw-coloured most of the year
    40: 0x9a8055, // cropland: terraces and fields
    50: 0xb3a994, // built-up: pale stone and dust (bright white over a whole town reads as snow)
    60: 0xa89a84, // bare / sparse: rock
    70: 0xeef2f4, // snow (not here)
    80: 0x3f7f9a, // permanent water
    90: 0x8a8a5a, // herbaceous wetland
    95: 0x4a6a3a, // mangroves (not here)
    100: 0x9a9a7a, // moss and lichen
  },
  rock: 0x9b8b74,
  sand: 0xe6d6a8,
  // Higher up, the dry hills go stony grey-brown.
  moor: { from: 120, to: 380, colour: 0x9c8f78 },
  shallow: 0xd0c8a0,
  deep: 0x2f5f78,
  // Ermoupoli's neoclassical town (ochre, cream, pink, terracotta hipped roofs) and the
  // Cyclades' white flat-roofed cubes with blue doors.
  houses: {
    walls: [0xf4f2ec, 0xf4f2ec, 0xf4f2ec, 0xf0ece0, 0xe8d6a8, 0xd8b88a, 0xe2c8b0],
    painted: [0xe8c890, 0xd89a78, 0xe8b8a8, 0xc8d8c0, 0xf0e0b0, 0xd8a868],
    doors: [0x2a5a9a, 0x3a7ab8, 0x6a3a28, 0x2f6a4a],
    signs: [0x2a5a9a, 0x8a2a2a, 0x2a2a2a],
    roofs: [0xa8553a, 0xb86a48, 0x9a5038],
    shedWalls: [0xd8d2c4, 0xb8b0a0, 0xe8e4dc],
    shedRoofs: [0x8a8a84, 0xa8553a],
    stone: [0xc8b89a, 0xb8a888, 0xd8c8aa],
    levels: { cottage: 1, house: 2, terrace: 2, shed: 1, church: 2.5, warehouse: 2, boathouse: 1, castle: 4, ruin: 2 },
    roofShapes: { cottage: 'flat', house: [['flat', 3], ['hipped', 2]], terrace: [['flat', 1], ['hipped', 1]], shed: 'flat', church: 'gabled', warehouse: 'gabled', boathouse: 'flat', castle: 'flat', ruin: 'flat' },
    paintedShare: 0.6,
  },
};

export const THEMES: Record<string, Theme> = { 'north-hebridean': NORTH_HEBRIDEAN, aegean: AEGEAN };
