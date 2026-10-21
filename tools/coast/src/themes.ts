import type { HouseStyle } from './houses.ts';

/** The tree models the game has (world/view/treesView.ts). */
export type TreeSpecies = 'conifer' | 'broadleaf' | 'birch' | 'scrub' | 'pine' | 'olive';

/**
 * A theme's woods (trees.ts writes the forest map; the game scatters the trees): what each
 * kind of wood is made of, how far apart its trees stand, and their colours.
 *   plantation  landuse=forest (needle-leaved, or untagged where `forestIs` says so): planted in rows
 *   broadleaf   natural=wood or forest, broad-leaved
 *   mixed       mixed, or untagged natural=wood
 *   natural     tree cover in the satellite land cover with no wood mapped (scattered woods, gardens)
 *   scrub       natural=scrub, and the land cover's shrubland (sparser)
 *   orchard     landuse=orchard (olive groves on Syros)
 */
export interface ForestStyle {
  /** No trees above this height (m), nor on slopes steeper than `steep` (rise over run), thinned from `thin`. */
  treeline: number;
  steep: number;
  thin: number;
  /** What an untagged landuse=forest and natural=wood are here. */
  forestIs: 'plantation' | 'mixed' | 'broadleaf';
  woodIs: 'mixed' | 'broadleaf';
  /** Each kind: its trees' spacing (m, the closest two stand), in rows or scattered, and its species mix (weights). */
  kinds: Record<'plantation' | 'broadleaf' | 'mixed' | 'natural' | 'scrub' | 'orchard', { spacing: number; rows?: boolean; species: [TreeSpecies, number][] }>;
  /** Crown colours per species (one picked per tree, and shaded a little). */
  colours: Record<TreeSpecies, number[]>;
}

/** The game's harbour-boat designs (world/view/harbourBoatKit.ts): original small craft, not copies of real ones. */
export type HarbourBoatKind = 'creel' | 'yacht' | 'cruiser' | 'rib' | 'caique';

/**
 * A theme's harbour boats (the settlements brief, Part C; boats.ts): which kinds lie where,
 * by weight, and their hull colours (one picked per boat).
 *   alongside  at the pontoons and quays (the game fills a share of the berths)
 *   moored     on the swinging moorings in the harbours' sheltered water
 *   anchored   at anchor in the anchorages
 */
export interface BoatStyle {
  alongside: [HarbourBoatKind, number][];
  moored: [HarbourBoatKind, number][];
  anchored: [HarbourBoatKind, number][];
  hulls: number[];
  /**
   * How many swinging moorings a harbour has here, as a share of boats.ts's full field (1):
   * a West Highland bay is full of them; Aegean boats mostly lie stern-to along the quays.
   */
  moorings: number;
}

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
  forest: ForestStyle;
  boats: BoatStyle;
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
  // West Highland woods: dark Sitka and larch plantations in blocks and rows; oak, birch and
  // rowan in the gullies and along the shore, some Scots pine; gorse and birch scrub. Exposed
  // to the Atlantic, the trees give out low (about 300 m).
  forest: {
    treeline: 320,
    steep: 1.1,
    thin: 0.7,
    forestIs: 'plantation',
    woodIs: 'mixed',
    kinds: {
      plantation: { spacing: 6, rows: true, species: [['conifer', 1]] },
      broadleaf: { spacing: 7.5, species: [['broadleaf', 5], ['birch', 4], ['conifer', 1]] },
      mixed: { spacing: 7.5, species: [['conifer', 4], ['broadleaf', 3], ['birch', 3]] },
      natural: { spacing: 9, species: [['birch', 5], ['broadleaf', 4], ['conifer', 1.5]] },
      scrub: { spacing: 7, species: [['scrub', 6], ['birch', 1]] },
      orchard: { spacing: 8, rows: true, species: [['broadleaf', 1]] },
    },
    colours: {
      conifer: [0x2a4a2e, 0x2f5233, 0x26422a, 0x3a5a34],
      broadleaf: [0x4a6e32, 0x557a38, 0x3f6430, 0x5e7e3a],
      birch: [0x7a9a44, 0x86a24a, 0x6e9040],
      scrub: [0x4e6a34, 0x5a7238, 0x7a7a3a, 0xa89a3a],
      pine: [0x3a5a34, 0x46663a],
      olive: [0x7a8a6a, 0x8a9a78],
    },
  },
  // West Highland harbours: creel boats at the quays, yachts on the moorings and at the
  // marina pontoons, a few motor cruisers and RIBs.
  boats: {
    alongside: [['creel', 3], ['yacht', 3], ['cruiser', 2], ['rib', 2]],
    moored: [['yacht', 6], ['creel', 2], ['cruiser', 1], ['rib', 1]],
    anchored: [['yacht', 1]],
    moorings: 1,
    hulls: [0xf2f0ea, 0xf2f0ea, 0x1e2f4a, 0x2a4a3a, 0x8a2a24, 0x2a2a2e, 0x3a5a7a],
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
  // The Aegean: Aleppo and stone pines in the valleys and on the north slopes, olive groves
  // in rows on the terraces, grey-green phrygana scrub everywhere else.
  forest: {
    treeline: 700,
    steep: 0.9,
    thin: 0.6,
    forestIs: 'mixed',
    woodIs: 'mixed',
    kinds: {
      plantation: { spacing: 7, rows: true, species: [['pine', 1]] },
      broadleaf: { spacing: 8, species: [['olive', 2], ['pine', 1]] },
      mixed: { spacing: 8, species: [['pine', 3], ['olive', 1]] },
      natural: { spacing: 10, species: [['pine', 2], ['olive', 2], ['scrub', 1]] },
      scrub: { spacing: 7, species: [['scrub', 1]] },
      orchard: { spacing: 7, rows: true, species: [['olive', 1]] },
    },
    colours: {
      conifer: [0x3a5a34],
      broadleaf: [0x5e7a40],
      birch: [0x7a9a44],
      scrub: [0x7a7a52, 0x8a8a5a, 0x6e7048],
      pine: [0x3e5c32, 0x4a6838, 0x36522e],
      olive: [0x7a8a68, 0x86967a, 0x6e7e60],
    },
  },
  // Aegean harbours: painted wooden caiques at the quays and on the moorings, charter yachts
  // at the marina pontoons and at anchor in the bays.
  boats: {
    alongside: [['caique', 4], ['yacht', 3], ['cruiser', 2], ['rib', 2]],
    moored: [['caique', 3], ['yacht', 4], ['rib', 1]],
    anchored: [['yacht', 3], ['cruiser', 1]],
    moorings: 0.35,
    hulls: [0xf4f2ec, 0xf4f2ec, 0x2a5a9a, 0x3a7ab8, 0xb83a2a, 0x3a7a5a, 0xd8a83a],
  },
};

export const THEMES: Record<string, Theme> = { 'north-hebridean': NORTH_HEBRIDEAN, aegean: AEGEAN };
