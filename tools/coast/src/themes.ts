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
  /**
   * The shore where the map says what it is (shore.ts; the coast extras plan, C3): shingle
   * and pebbles, cliff faces; and the mapped fields (farmland, meadow) on open grassland.
   * (Sand and rock are `sand` and `rock`.)
   */
  shingle: number;
  cliff: number;
  fields: number;
  /** Low shore by the water the map says nothing about (not drawn as a beach: you can't count on landing there). */
  foreshore: number;
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
  // Grey West Highland shingle; dark wet schist cliffs; improved pasture greener than the rough grazing.
  shingle: 0x8e8a80,
  cliff: 0x55524a,
  fields: 0x6e9a46,
  // Weed-brown, stony West Highland foreshore.
  foreshore: 0x9a8e70,
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
  // Pale marble shingle; sun-bleached schist cliffs; terraced fields, dry gold-green.
  shingle: 0xb4ab96,
  cliff: 0x8a7c66,
  fields: 0x9c9858,
  // Pale stony Aegean foreshore.
  foreshore: 0xc6b994,
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

// The Baltic (Turku and the Archipelago Sea): low islands of ice-smoothed grey and pink
// granite, pine on the rock, spruce and birch in the hollows, reed beds in the bays, hay
// fields on the clay; wooden houses painted red ochre or yellow with white trim and metal
// roofs; Turku's stone and rendered city blocks. A dark, muddy seabed in brackish water.
const BALTIC: Theme = {
  cover: {
    10: 0x2e4a2c, // tree cover: pine and spruce, dark
    20: 0x5e6440, // shrubland: juniper and young birch on the rock
    30: 0x7a9a4c, // grassland: hay meadows and pasture
    40: 0x9aa858, // cropland: fields on the clay plains
    50: 0x8c8884, // built-up
    60: 0x948884, // bare / sparse: bare granite
    70: 0xeef2f4, // snow and ice
    80: 0x3a5a6a, // permanent water (lakes drawn as land for now)
    90: 0x86885a, // herbaceous wetland: reed beds
    95: 0x4a6a3a, // mangroves (not here)
    100: 0x86906c, // moss and lichen on the outer skerries
  },
  // Grey-pink granite, rounded by the ice.
  rock: 0x938680,
  sand: 0xd6c8a0,
  shallow: 0x857c60,
  deep: 0x2e454c,
  // Grey granite gravel; low dark granite faces (no high cliffs here); fields a yellow-green.
  shingle: 0x8a847c,
  cliff: 0x6c625e,
  fields: 0x98a85a,
  // Rock and reeds at the water's edge.
  foreshore: 0x847c62,
  // Archipelago houses and summer cottages in red ochre and yellow, some white or pale grey,
  // with white corners and window frames; dark sheet-metal or red roofs; red-ochre boathouses
  // and sheds; Turku's blocks rendered in cream, yellow and grey.
  houses: {
    walls: [0x8e2a20, 0x8e2a20, 0x8e2a20, 0xd8b45a, 0xd8b45a, 0xf0ede4, 0xc4ccd0, 0xe6d8a4],
    painted: [0xd8b45a, 0xe8c8a0, 0xc8d0c0, 0x8e2a20, 0xf0ede4, 0x9ab0c0, 0xd8a060],
    doors: [0x2a3a4a, 0x5a2a1e, 0x2f4a30, 0xf0ede4, 0x3a3a3a],
    signs: [0x1e3a5a, 0x6a1e1e, 0x2a2a2a],
    roofs: [0x3e4246, 0x34383c, 0x8a3a2e, 0x4a4e52],
    shedWalls: [0x8a2e24, 0x8a2e24, 0x8c9294, 0xd8b45a],
    shedRoofs: [0x3e4246, 0x5a5e62, 0x8a3a2e],
    stone: [0x9a8e88, 0x8a807c, 0xa89a92],
    levels: { cottage: 1.5, house: 2, terrace: 3, shed: 1, church: 2.5, warehouse: 2, boathouse: 1, castle: 4, ruin: 2 },
    roofShapes: { cottage: 'gabled', house: [['gabled', 4], ['hipped', 1]], terrace: [['flat', 1], ['gabled', 1]], shed: 'gabled', church: 'gabled', warehouse: 'gabled', boathouse: 'gabled', castle: 'flat', ruin: 'flat' },
    paintedShare: 0.4,
  },
  // Finnish woods: Scots pine on the rock and the dry ridges, spruce in the damp hollows,
  // birch everywhere at the edges; juniper scrub on the outer islands. Managed forest, not
  // planted in rows. The land is low, so no treeline to speak of; bare rock only where steep.
  forest: {
    treeline: 250,
    steep: 1.3,
    thin: 0.8,
    forestIs: 'mixed',
    woodIs: 'mixed',
    kinds: {
      plantation: { spacing: 5.5, species: [['pine', 3], ['conifer', 3], ['birch', 1]] },
      broadleaf: { spacing: 7, species: [['birch', 5], ['broadleaf', 3]] },
      mixed: { spacing: 6.5, species: [['pine', 4], ['conifer', 3], ['birch', 3]] },
      natural: { spacing: 8, species: [['pine', 4], ['birch', 3], ['conifer', 2]] },
      scrub: { spacing: 7, species: [['scrub', 3], ['birch', 2], ['pine', 1]] },
      orchard: { spacing: 7, rows: true, species: [['broadleaf', 1]] },
    },
    colours: {
      conifer: [0x22402a, 0x274630, 0x1e3a26],
      broadleaf: [0x4e7034, 0x587a3a],
      birch: [0x7a9a48, 0x88a650, 0x6e9042],
      scrub: [0x46583a, 0x52623e, 0x5e6a40],
      pine: [0x38542f, 0x425e36, 0x324c2c],
      olive: [0x7a8a6a],
    },
  },
  // Archipelago harbours: motor cruisers and day boats at the guest-harbour pontoons, sailing
  // yachts, open aluminium boats; few swinging moorings (boats lie bow-to the pontoons on a
  // stern buoy), more yachts at anchor in the sheltered sounds.
  boats: {
    alongside: [['cruiser', 4], ['yacht', 3], ['rib', 2], ['creel', 1]],
    moored: [['yacht', 3], ['cruiser', 2]],
    anchored: [['yacht', 2], ['cruiser', 1]],
    moorings: 0.4,
    hulls: [0xf2f0ea, 0xf2f0ea, 0xf2f0ea, 0x1e2f4a, 0x8a2a24, 0x9a7a4a, 0x3a4a5a],
  },
};

// The Hanseatic port (Hamburg): a river port on the Elbe, flat marsh and dikes, the city on its
// low hills; red-brick warehouses with their gables (the Speicherstadt), rendered city blocks,
// green copper and slate roofs; the docks' grey and blue sheds and the open concrete of the
// terminals; broadleaf parks and avenues; the Elbe's muddy water, stone revetments and the
// sand of the Elbstrand. Harbour launches and motor cruisers in the marinas.
const HANSEATIC: Theme = {
  cover: {
    10: 0x3a5a32, // tree cover: parks, the Elbe slope's woods
    20: 0x66704a, // shrubland
    30: 0x7a9a50, // grassland: dikes and marsh pasture
    40: 0x94a858, // cropland: the Vier- und Marschlande
    50: 0x86827c, // built-up: the terminals' concrete, the city
    60: 0x98948c, // bare / sparse
    70: 0xeef2f4, // snow
    80: 0x3a5058, // permanent water
    90: 0x788456, // herbaceous wetland: reed and marsh
    95: 0x4a6a3a, // mangroves (not here)
    100: 0x86906c, // moss and lichen
  },
  // Stone revetments along the banks; the Elbstrand's pale sand.
  rock: 0x86827a,
  sand: 0xd8caa0,
  shallow: 0x6c6854,
  deep: 0x2c3c40,
  shingle: 0x8a857a,
  cliff: 0x6a6560,
  fields: 0x8aa452,
  // The tidal river's mud at the water's edge.
  foreshore: 0x7c7460,
  houses: {
    walls: [0x8e3a2a, 0x8e3a2a, 0x7a3226, 0x9a4a32, 0xe6dcc6, 0xf0ece4, 0xb8b4ac],
    painted: [0xe6dcc6, 0xd8c08a, 0xc8d0d4, 0x8e3a2a, 0x9aa8b0, 0xf0ece4],
    doors: [0x2f4a3a, 0x2a2a2a, 0x5a2a1e, 0x1e2f4a],
    signs: [0x1e3a5a, 0x6a1e1e, 0x2a2a2a],
    roofs: [0x3a3e42, 0x4a4e52, 0x5a8a78, 0x8a3a2e],
    shedWalls: [0x8c9294, 0x3a5a8a, 0xb0b4b4, 0x8e3a2a],
    shedRoofs: [0x6a7072, 0x5a6064],
    stone: [0x8e3a2a, 0x7a3428, 0x9a8e86],
    levels: { cottage: 1.5, house: 3, terrace: 5, shed: 1, church: 3, warehouse: 5, boathouse: 1, castle: 4, ruin: 2 },
    roofShapes: { cottage: 'gabled', house: [['gabled', 2], ['hipped', 1], ['flat', 1]], terrace: [['flat', 2], ['gabled', 1]], shed: 'gabled', church: 'gabled', warehouse: 'gabled', boathouse: 'gabled', castle: 'flat', ruin: 'flat' },
    paintedShare: 0.3,
  },
  // City parks and avenues: lime, oak, plane and birch; a few conifers.
  forest: {
    treeline: 200,
    steep: 1.2,
    thin: 0.8,
    forestIs: 'mixed',
    woodIs: 'broadleaf',
    kinds: {
      plantation: { spacing: 6, species: [['conifer', 2], ['broadleaf', 2]] },
      broadleaf: { spacing: 8, species: [['broadleaf', 4], ['birch', 1]] },
      mixed: { spacing: 7, species: [['broadleaf', 3], ['conifer', 2], ['birch', 1]] },
      natural: { spacing: 10, species: [['broadleaf', 3], ['birch', 1]] },
      scrub: { spacing: 7, species: [['scrub', 3], ['birch', 1]] },
      orchard: { spacing: 7, rows: true, species: [['broadleaf', 1]] },
    },
    colours: {
      conifer: [0x2a4a2e, 0x2f5233],
      broadleaf: [0x4a6e32, 0x557a38, 0x3f6430, 0x5e7e3a],
      birch: [0x7a9a44, 0x86a24a],
      scrub: [0x4e6a34, 0x5a7238],
      pine: [0x3a5a34],
      olive: [0x7a8a6a],
    },
  },
  // Harbour launches (the Barkassen) and motor cruisers in the marinas and city harbours, a
  // few yachts; hardly any swinging moorings on a busy tidal river.
  boats: {
    alongside: [['cruiser', 3], ['rib', 2], ['yacht', 2], ['creel', 1]],
    moored: [['yacht', 2], ['cruiser', 1]],
    anchored: [['yacht', 1]],
    moorings: 0.2,
    hulls: [0xf2f0ea, 0xf2f0ea, 0x1e2f4a, 0x8a2a24, 0x2a2a2e, 0x2a4a3a],
  },
};

export const THEMES: Record<string, Theme> = { 'north-hebridean': NORTH_HEBRIDEAN, aegean: AEGEAN, baltic: BALTIC, hanseatic: HANSEATIC };
