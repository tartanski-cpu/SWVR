/**
 * A Shipyard design (owner, Oct 2026): the choices you make in the Shipyard page, and their
 * short code. The code holds the choices, not the boat: the game rebuilds exactly the same
 * boat from them (shipyard/build.ts), so it stays short enough to type in VR and needs no
 * server. A code is tied to its `version` of the building rules: when the rules change,
 * the version goes up and older codes are upgraded (or refused with a reason).
 *
 * Every choice is a whole number on a fixed scale (its `steps`), so the code is exact. The
 * choices are packed as one number in mixed radix (each choice uses exactly its own number
 * of steps: a 3-way choice takes log2 3 = 1.6 bits, not 2), written in Crockford base 32
 * (digits and letters without I, L, O and U, so nothing looks like anything else), with a
 * check character after them (a weighted sum: any one mistyped character is caught).
 *
 * Version 10 (the working deck gear: tow winch, stern roller, A-frame and trawl, life ring
 * and boat hook, a side door; and gear placed by hand; this one): 16 characters of choices
 * (80 bits) and the check: 17 characters, shown as K7P4Q-2ZX9D-MR3XA-7Q. Its number is the
 * choices' number. Gear placed by hand (PLACE_FIELDS: a pin puts it where you click, on a
 * 25 cm grid) follows those 16 characters as one more number, only when there is some:
 * which pieces are placed (4 bits), then each one's grid cell and facing. So a boat with
 * nothing placed by hand keeps a 17-character code; each placed piece adds 2 to 3 characters.
 * A deckhouse (DECKHOUSE_FIELDS; owner, Oct 2026) rides in the same extension, as its most
 * significant number (so every earlier code reads as before, without one): about 2 more.
 * Version 12 (hull protection: fenders, a rubbing strake, tyres; owner) puts its choice above
 * the deckhouse's, the most significant of all: 0 (none) leaves every earlier code as it was,
 * and a boat with one adds a character or two.
 * Version 13 (no handrails, owner) puts that choice above hull protection's, the same way:
 * 0 (handrails, as every boat had) leaves every earlier code as it was.
 * Version 14 (a deckhouse as wide as the wheelhouse, owner) puts that above the rails, again so.
 * Version 15 (the anchor and the skiff with her crane, owner) puts those above it: 0 (an
 * anchor, as every boat should have; no skiff) leaves every earlier code as it was, so older
 * designs now carry an anchor.
 * Version 16 (the small tug, a fifth hull type, owner) puts the hull types after the first
 * four above those (MORE_HULLS): 0 leaves every earlier code as it was (its hull is the one
 * in its first 16 characters, which only hold four); 1 is the tug (the first 16 hold 0).
 * Version 17 (a three-facet front, owner) puts that above the hull types, again 0 (flat) as before.
 * Version 18 (the slow-revving tug engine, a fourth engine, owner) puts the engines after the
 * first three above that (MORE_ENGINES), as the hull types: 0 leaves every earlier code as it
 * was; 1 is the tug engine (the first 16 characters hold engine 0).
 *
 * Version 9 (a chart table): 14 characters of choices (70 bits) and the check:
 * 15 characters. Its number is 2^69 + the choices' number. Read with none of version 10's gear.
 *
 * Version 8 (the searchlight and the fire monitor, each on the roof or on a deck pole): 15
 * characters too, its number the choices' number (below 2^67). Read with no chart table.
 *
 * Version 7 (a deck crane): 13 characters of choices (65 bits) and the check: 14
 * characters. Its number is 2^64 + the choices' number. Read with the searchlight on the
 * roof if it had the advanced controls (they carried it then), none if basic; no monitor.
 *
 * Version 6 (the roof's colour): 14 characters too, its number the choices' number (below
 * 2^64). Read with no deck crane. Codes may
 * grow when choices are added (owner: as many variations as possible; what matters is an
 * easy way to carry a code into VR).
 *
 * Version 5 (the roof as one slab: its thickness and front edge): 13 characters, its number
 * 2^59 + the choices' number. Read with the roof the hull's colour.
 *
 * Version 4 (the wheelhouse's shape, with a raked roof): 13 characters too, its number the
 * choices' number (below 2^59). Read with the roof 0.1 m thick and its front edge square.
 *
 * Version 3 (twin engines): 11 characters (10 and the check), its number the choices' number,
 * with the house as a box and a step-down floor or not (read as floor heights -0.2 / 0 m).
 *
 * The 10-character codes of earlier versions (9 characters and the check) still read, with
 * single engines. Each owned a range of their 45-bit numbers:
 *   - version 1 (the first Shipyard, no bow choice; each choice in whole bits): 2^42 .. 2^43.
 *     Read with the bow at the middle step (a 25 deg stem); before the bow became a stem
 *     angle that step was each hull's own bow, so their bows differ a little;
 *   - version 2 (the bow choice): from 2^43, its ~1.65 x 10^13 combinations (the 4th hull
 *     type, the pilot boat, added ~0.41 x 10^13 at the top of it).
 * Twin engines didn't fit in what was left of the 45 bits, so version 3 went to 11.
 */

/** The building rules this code was made with (18: a fourth engine, the slow-revving tug diesel; 17: a three-facet front; 16: a fifth hull type, the small tug; 15: the anchor and the skiff; 14: a deckhouse as wide as the house; 13: no handrails; 12: hull protection; all in version 10's extension). */
export const DESIGN_VERSION = 18;

/**
 * How many hull types there are (build.ts DESIGN_HULLS). The code's first 16 characters
 * hold the first four; the rest ride in its extension (MORE_HULLS, version 16).
 */
export const HULL_TYPES = 5;
/** Hull types the first 16 characters hold. */
const BASE_HULLS = 4;
/** The extension's hull number: 0 for one of the first four, n for type BASE_HULLS - 1 + n. */
const MORE_HULLS = HULL_TYPES - BASE_HULLS + 1;

/** How many engines there are (build.ts ENGINES); the first 16 characters hold the first three, the rest ride in the extension (version 18). */
export const ENGINE_TYPES = 4;
const BASE_ENGINES = 3;
/** The extension's engine number: 0 for one of the first three, n for engine BASE_ENGINES - 1 + n. */
const MORE_ENGINES = ENGINE_TYPES - BASE_ENGINES + 1;
/** Engines that only go in singly (owner: the slow-revving tug diesel is a single installation): a twin choice is built with one. */
export const SINGLE_ONLY_ENGINES: readonly number[] = [3];

/** One choice: its index on its scale, 0 .. steps-1. */
export interface ShipDesign {
  /** The base hull (DESIGN_HULLS). */
  hull: number;
  /** Hull length, beam and depth, each scaled (SCALES). */
  length: number;
  beam: number;
  depth: number;
  /** Bulwark height. */
  bulwark: number;
  /** Bow: the stem's rake, 0 plumb .. 4 raked 50 deg (SCALES.bow). */
  bow: number;
  /** Wheelhouse: where along the deck (aft .. forward), its length, its width, its headroom. */
  housePos: number;
  houseLength: number;
  houseWidth: number;
  headroom: number;
  /** Floor height about the deck (SCALES.floor): sunk below it (a step down in) .. raised above it (steps up), to see over a bow or a ramp. */
  floor: number;
  /** Roof, one flat slab: how far it reaches forward over the front windows (SCALES.visor), its thickness (SCALES.roofThickness) and its front edge (SCALES.roofEdge). */
  visor: number;
  roofThickness: number;
  roofEdge: number;
  /** The roof's colour (ROOF_PAINTS): the hull's topsides colour, or one of its own (an orange roof is common on workboats, owner). */
  roofPaint: number;
  /** A deck crane for cargo (owner): 0 none, 1 on the foredeck, 2 on the aft deck. */
  deckCrane: number;
  /** The searchlight and the fire monitor (owner): 0 none, 1 on the wheelhouse roof, 2 on a pole on the foredeck, 3 on a pole on the aft deck. */
  searchlight: number;
  fireMonitor: number;
  /** A drop-leaf chart table along the wheelhouse's port wall, aft (owner: its own choice, not in the advanced package): 0 none, 1 fitted. */
  chartTable: number;
  /**
   * The working deck gear (owner: placeable in the Shipyard, version 10):
   *   towWinch     0 none, 1 on the aft deck centreline, forward of the transom;
   *   sternRoller  0 none, 1 in the transom bulwark: her tow point;
   *   aFrame       0 none, 1 the trawl A-frame over the transom, with the net (its warps lead
   *                off the tow winch, so it brings the winch with it);
   *   lifeRing     0 none, 1 port, 2 starboard: the life ring on the house's aft wall, its
   *                line on that quarter's cleat, and the boat-hook clips on that bulwark;
   *   sideDoor     0 none, 1 a sliding door in the wheelhouse's port wall (the game's side
   *                door is a port one).
   * (Pots are hauled by hand: no pot hauler, owner.)
   */
  towWinch: number;
  sternRoller: number;
  aFrame: number;
  lifeRing: number;
  sideDoor: number;
  /**
   * Gear placed by hand (owner: put exactly where the pin is, snapped to a 25 cm grid), each
   * 0 for its usual place (the choice above), else its grid cell and facing (`placeOf`):
   * the deck crane, the searchlight and the fire monitor (on a pole on deck, or on the
   * wheelhouse roof if the cell's on it), the tow winch.
   */
  craneAt: number;
  lampAt: number;
  monitorAt: number;
  winchAt: number;
  /**
   * A deckhouse under the wheelhouse (owner: pilot and rescue boats; vessel/deckhouse.ts):
   * how far it reaches forward of the wheelhouse (0: none; SCALES.dhLength), its height over
   * the deck (dhHeight), its width (dhWidth: out to her sides, or set in leaving side decks),
   * its front's rake (dhRake).
   */
  dhLength: number;
  dhHeight: number;
  dhWidth: number;
  dhRake: number;
  /** The deckhouse only as wide as the wheelhouse, forward of it (owner: leaves her side decks, so a side door): 1, else 0 (dhWidth rules). */
  dhNarrow: number;
  /** No anchor (1), else (0) an anchor and windlass: at the bow roller, or a kedge at the stern on a ramp-bow boat. */
  noAnchor: number;
  /** The skiff in her cradle with its crane (SKIFFS): none, or on the foredeck or aft deck with the crane's column to starboard or port. */
  skiff: number;
  /** The front windows (owner): 0 flat across, 1 three facets (the middle pane square across, the outer two angled back to the sides). */
  facets: number;
  /**
   * Hull protection (owner), what keeps her sides off a quay (GUARDS): 0 none, 1 the crew's
   * fenders (a basket on deck; the cheapest), 2 a rubber rubbing strake all round, 3 tyres
   * along her sides, 4 the strake and fenders. The strake and tyres are fixed; the fenders
   * go over the side and come in again by hand.
   */
  guard: number;
  /** Her deck edge (RAILS): 0 handrails on the bulwarks (as every boat had), 1 none (bulwarks only). */
  rails: number;
  /** Front windows' rake (SCALES.windowRake): leaning aft (a fast patrol boat) .. upright .. leaning forward (a pilot house). */
  windowRake: number;
  /**
   * The front below the windows: upright .. leaning forward at the top (SCALES.lowerFront).
   * Not offered now (owner: not what he wanted; left for later): always 0, and read as 0
   * from any code, its place in the code kept.
   */
  lowerFront: number;
  /** Twin engines (two of the engine package, side by side, in lockstep): 0 single, 1 twin. */
  twin: number;
  /** Engine package (ENGINES), and the gearbox ratio matched to it (by sea trial in the Shipyard). */
  engine: number;
  gear: number;
  /** Controls package: 0 basic, 1 advanced. */
  controls: number;
  /** Paint (LIVERIES). */
  paint: number;
}

/**
 * The grid gear is placed on by hand: `step` m squares, measured from the transom forward
 * (cells 0 .. nz-1) and from the centreline out (-halfX .. halfX), so a piece stays where
 * it was put, in metres from her stern, when her hull is stretched. Part of the code's format.
 */
export const PLACE_GRID = { step: 0.25, halfX: 12, nz: 72 };
const CELLS = (2 * PLACE_GRID.halfX + 1) * PLACE_GRID.nz;
export type PlaceKey = 'craneAt' | 'lampAt' | 'monitorAt' | 'winchAt';
/** The placed-by-hand fields, in the code's order: a cell each, and a facing (4 ways) for the crane and the winch. */
export const PLACE_FIELDS: { key: PlaceKey; steps: number; faces: number }[] = [
  { key: 'craneAt', steps: 1 + CELLS * 4, faces: 4 },
  { key: 'lampAt', steps: 1 + CELLS, faces: 1 },
  { key: 'monitorAt', steps: 1 + CELLS, faces: 1 },
  { key: 'winchAt', steps: 1 + CELLS * 4, faces: 4 },
];

/**
 * A placed-by-hand field's value as where it is: `x` m from the centreline (+ starboard),
 * `fromTransom` m forward of the transom, and its facing in quarter turns (0: as usual).
 * Null for 0 (its usual place).
 */
export function placeOf(key: PlaceKey, v: number): { x: number; fromTransom: number; face: number } | null {
  if (!v) return null;
  const faces = PLACE_FIELDS.find((f) => f.key === key)!.faces;
  const n = v - 1;
  const face = n % faces;
  const cell = Math.floor(n / faces);
  const nx = 2 * PLACE_GRID.halfX + 1;
  return { x: ((cell % nx) - PLACE_GRID.halfX) * PLACE_GRID.step, fromTransom: Math.floor(cell / nx) * PLACE_GRID.step, face };
}

/** Where a point is (m from the centreline, m forward of the transom) as a placed-by-hand value, snapped to the grid and kept on it. */
export function placeValue(key: PlaceKey, x: number, fromTransom: number, face = 0): number {
  const faces = PLACE_FIELDS.find((f) => f.key === key)!.faces;
  const xi = Math.max(-PLACE_GRID.halfX, Math.min(PLACE_GRID.halfX, Math.round(x / PLACE_GRID.step)));
  const zi = Math.max(0, Math.min(PLACE_GRID.nz - 1, Math.round(fromTransom / PLACE_GRID.step)));
  return 1 + ((zi * (2 * PLACE_GRID.halfX + 1) + xi + PLACE_GRID.halfX) * faces + (((face % faces) + faces) % faces));
}

/** Version 10's choices, which earlier versions read as none. */
type V10Gear = 'towWinch' | 'sternRoller' | 'aFrame' | 'lifeRing' | 'sideDoor' | PlaceKey | DeckhouseKey | 'guard' | 'rails' | 'dhNarrow' | 'noAnchor' | 'skiff' | 'facets';
/** None of version 10's gear (what an older code reads as). */
const NO_V10_GEAR: Pick<ShipDesign, V10Gear> = { towWinch: 0, sternRoller: 0, aFrame: 0, lifeRing: 0, sideDoor: 0, craneAt: 0, lampAt: 0, monitorAt: 0, winchAt: 0, dhLength: 0, dhHeight: 0, dhWidth: 0, dhRake: 0, guard: 0, rails: 0, dhNarrow: 0, noAnchor: 0, skiff: 0, facets: 0 };

/** A design as earlier versions held it: a step-down floor or not, rather than its height and the house's shape. */
export type OldDesign = Omit<ShipDesign, V10Gear | 'chartTable' | 'searchlight' | 'fireMonitor' | 'floor' | 'visor' | 'roofThickness' | 'roofEdge' | 'roofPaint' | 'deckCrane' | 'windowRake' | 'lowerFront'> & { sunk: number };
/** A design as version 4 held it: a raked roof rather than its thickness and front edge. */
export type V4Design = Omit<ShipDesign, V10Gear | 'chartTable' | 'searchlight' | 'fireMonitor' | 'roofThickness' | 'roofEdge' | 'roofPaint' | 'deckCrane'> & { roofRake: number };
/** A design as version 5 held it: no roof colour. */
export type V5Design = Omit<ShipDesign, V10Gear | 'chartTable' | 'searchlight' | 'fireMonitor' | 'roofPaint' | 'deckCrane'>;
/** A design as version 6 held it: no deck crane. */
export type V6Design = Omit<ShipDesign, V10Gear | 'chartTable' | 'searchlight' | 'fireMonitor' | 'deckCrane'>;
/** A design as version 7 held it: the searchlight with the advanced controls, no fire monitor. */
export type V7Design = Omit<ShipDesign, V10Gear | 'searchlight' | 'fireMonitor' | 'chartTable'>;
/** A design as version 9 held it: none of the working deck gear. */
export type V9Design = Omit<ShipDesign, V10Gear>;
/** A design as version 8 held it: no chart table. */
export type V8Design = Omit<ShipDesign, V10Gear | 'chartTable'>;

/** Version 2's choices, in its code's order (the hull type first, most significant). */
const V2_FIELDS: { key: keyof OldDesign; steps: number }[] = [
  // The hull type first (most significant): its range grows at the top, so adding a type
  // (the pilot boat, the 4th) leaves every earlier code meaning the same boat.
  { key: 'hull', steps: 4 },
  { key: 'length', steps: 16 },
  { key: 'beam', steps: 16 },
  { key: 'depth', steps: 16 },
  { key: 'bulwark', steps: 8 },
  { key: 'bow', steps: 5 },
  { key: 'housePos', steps: 16 },
  { key: 'houseLength', steps: 16 },
  { key: 'houseWidth', steps: 8 },
  { key: 'headroom', steps: 8 },
  { key: 'sunk', steps: 2 },
  { key: 'engine', steps: 3 },
  { key: 'gear', steps: 16 },
  { key: 'controls', steps: 2 },
  { key: 'paint', steps: 8 },
];

/** Version 3's choices: twin engines, then version 2's. */
const V3_FIELDS: { key: keyof OldDesign; steps: number }[] = [{ key: 'twin', steps: 2 }, ...V2_FIELDS];

/** Version 4's choices. */
const V4_FIELDS: { key: keyof V4Design; steps: number }[] = [
  { key: 'hull', steps: 4 },
  { key: 'length', steps: 16 },
  { key: 'beam', steps: 16 },
  { key: 'depth', steps: 16 },
  { key: 'bulwark', steps: 8 },
  { key: 'bow', steps: 5 },
  { key: 'housePos', steps: 16 },
  { key: 'houseLength', steps: 16 },
  { key: 'houseWidth', steps: 8 },
  { key: 'headroom', steps: 8 },
  { key: 'floor', steps: 8 },
  { key: 'visor', steps: 5 },
  { key: 'roofRake', steps: 5 },
  { key: 'windowRake', steps: 9 },
  { key: 'lowerFront', steps: 5 },
  { key: 'twin', steps: 2 },
  { key: 'engine', steps: 3 },
  { key: 'gear', steps: 16 },
  { key: 'controls', steps: 2 },
  { key: 'paint', steps: 8 },
];

/** Version 5's choices. */
const V5_FIELDS: { key: keyof V5Design; steps: number }[] = [
  { key: 'hull', steps: 4 },
  { key: 'length', steps: 16 },
  { key: 'beam', steps: 16 },
  { key: 'depth', steps: 16 },
  { key: 'bulwark', steps: 8 },
  { key: 'bow', steps: 5 },
  { key: 'housePos', steps: 16 },
  { key: 'houseLength', steps: 16 },
  { key: 'houseWidth', steps: 8 },
  { key: 'headroom', steps: 8 },
  { key: 'floor', steps: 8 },
  { key: 'visor', steps: 5 },
  { key: 'roofThickness', steps: 3 },
  { key: 'roofEdge', steps: 4 },
  { key: 'windowRake', steps: 9 },
  { key: 'lowerFront', steps: 5 },
  { key: 'twin', steps: 2 },
  { key: 'engine', steps: 3 },
  { key: 'gear', steps: 16 },
  { key: 'controls', steps: 2 },
  { key: 'paint', steps: 8 },
];

/** Version 6's choices: version 5's, then the roof's colour. */
const V6_FIELDS: { key: keyof V6Design; steps: number }[] = [...V5_FIELDS, { key: 'roofPaint', steps: 5 }];

/** Version 7's choices: version 6's, then the deck crane. */
const V7_FIELDS: { key: keyof V7Design; steps: number }[] = [...V6_FIELDS, { key: 'deckCrane', steps: 3 }];

/** Version 8's choices: version 7's, then the searchlight and the fire monitor. */
const V8_FIELDS: { key: keyof V8Design; steps: number }[] = [...V7_FIELDS, { key: 'searchlight', steps: 4 }, { key: 'fireMonitor', steps: 4 }];

/** Version 9's choices: version 8's, then the chart table. */
const V9_FIELDS: { key: keyof V9Design; steps: number }[] = [...V8_FIELDS, { key: 'chartTable', steps: 2 }];

/** Each choice's number of steps, in the code's order (version 10: version 9's, then the working deck gear). */
export const FIELDS: { key: keyof ShipDesign; steps: number }[] = [
  ...V9_FIELDS,
  { key: 'towWinch', steps: 2 },
  { key: 'sternRoller', steps: 2 },
  { key: 'aFrame', steps: 2 },
  { key: 'lifeRing', steps: 3 },
  { key: 'sideDoor', steps: 2 },
];

/** The deckhouse's choices (in the code's extension, when there's a deckhouse: dhLength over 0). */
export type DeckhouseKey = 'dhLength' | 'dhHeight' | 'dhWidth' | 'dhRake';
export const DECKHOUSE_FIELDS: { key: DeckhouseKey; steps: number }[] = [
  { key: 'dhLength', steps: 8 },
  { key: 'dhHeight', steps: 5 },
  { key: 'dhWidth', steps: 4 },
  { key: 'dhRake', steps: 3 },
];
const DECKHOUSE_COMBINATIONS = DECKHOUSE_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);

/** Hull protection's choices, in order (design.guard), as the page names them. */
export const GUARDS = ['None', 'Fenders', 'Rubbing strake', 'Tyres', 'Strake and fenders'] as const;
/** Hull protection in the code's extension (version 12), above the deckhouse. */
const GUARD_FIELD: { key: 'guard'; steps: number } = { key: 'guard', steps: GUARDS.length };
/** Her deck edge's choices (design.rails), as the page names them. */
export const RAILS = ['Handrails', 'None'] as const;
const RAIL_FIELD: { key: 'rails'; steps: number } = { key: 'rails', steps: RAILS.length };
const NARROW_FIELD: { key: 'dhNarrow'; steps: number } = { key: 'dhNarrow', steps: 2 };
const NO_ANCHOR_FIELD: { key: 'noAnchor'; steps: number } = { key: 'noAnchor', steps: 2 };
/** The skiff's choices (design.skiff), as the page names them. */
export const SKIFFS = ['None', 'Foredeck, crane to starboard', 'Foredeck, crane to port', 'Aft deck, crane to starboard', 'Aft deck, crane to port'] as const;
const SKIFF_FIELD: { key: 'skiff'; steps: number } = { key: 'skiff', steps: SKIFFS.length };
const FACETS_FIELD: { key: 'facets'; steps: number } = { key: 'facets', steps: 2 };
/** What a guard choice fits: the crew's fenders, and a fixed strake or tyres. */
export function guardParts(guard: number): { fenders: boolean; side: 'strake' | 'tyres' | null } {
  return { fenders: guard === 1 || guard === 4, side: guard === 2 || guard === 4 ? 'strake' : guard === 3 ? 'tyres' : null };
}

/** Every choice with its number of steps, the placed-by-hand ones, the deckhouse's and hull protection too (for checking and merging designs). */
export const ALL_FIELDS: { key: keyof ShipDesign; steps: number }[] = [...FIELDS.map((f) => (f.key === 'hull' ? { ...f, steps: HULL_TYPES } : f.key === 'engine' ? { ...f, steps: ENGINE_TYPES } : f)), ...PLACE_FIELDS, ...DECKHOUSE_FIELDS, GUARD_FIELD, RAIL_FIELD, NARROW_FIELD, NO_ANCHOR_FIELD, SKIFF_FIELD, FACETS_FIELD];

/** Version 1's choices, each in whole bits (for reading its codes). */
const V1_FIELDS: { key: keyof OldDesign; bits: number; steps: number }[] = [
  { key: 'hull', bits: 2, steps: 3 },
  { key: 'length', bits: 4, steps: 16 },
  { key: 'beam', bits: 4, steps: 16 },
  { key: 'depth', bits: 4, steps: 16 },
  { key: 'bulwark', bits: 3, steps: 8 },
  { key: 'housePos', bits: 4, steps: 16 },
  { key: 'houseLength', bits: 4, steps: 16 },
  { key: 'houseWidth', bits: 3, steps: 8 },
  { key: 'headroom', bits: 3, steps: 8 },
  { key: 'sunk', bits: 1, steps: 2 },
  { key: 'engine', bits: 2, steps: 3 },
  { key: 'gear', bits: 4, steps: 16 },
  { key: 'controls', bits: 1, steps: 2 },
  { key: 'paint', bits: 3, steps: 8 },
];

/** What the steps mean (the build reads these; the page labels its sliders with them). */
export const SCALES = {
  /** Length, beam and depth: x0.80 .. x1.175 of the base hull, in 2.5 % steps (index 8 = x1). */
  scale: (i: number) => 0.8 + 0.025 * i,
  /** The deckhouse: forward of the wheelhouse (m; 0 none), height over the deck (m), the side deck left beside it (m; 0 out to her sides), front rake (deg from the vertical). */
  dhLength: (i: number) => [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5][i],
  // Height: low for small boats, taller for big ones (owner, Oct 2026). It was 0.8 to 1.4 m,
  // then 0.4 to 1 m, so a deckhouse code from before then reads with a different deckhouse.
  dhHeight: (i: number) => [0.5, 0.8, 1.0, 1.2, 1.5][i],
  dhWidth: (i: number) => [0, 0.3, 0.5, 0.7][i],
  dhRake: (i: number) => [0, 30, 50][i],
  /** Bulwark height (m): 0.3 .. 1.0. */
  bulwark: (i: number) => 0.3 + 0.1 * i,
  /** Wheelhouse position: 0 right aft .. 1 right forward, within the deck that's free for it. */
  housePos: (i: number) => i / 15,
  /** Wheelhouse length (m): 2.4 .. 5.4. */
  houseLength: (i: number) => 2.4 + 0.2 * i,
  /** Wheelhouse width: 65 .. 100 % of what the deck leaves between side decks. */
  houseWidth: (i: number) => 0.65 + 0.05 * i,
  /** Headroom, floor to roof (m): 1.9 .. 2.6. */
  headroom: (i: number) => 1.9 + 0.1 * i,
  /** Bow: the stem's rake from vertical (deg), 0 (plumb) .. 50 (owner: no further). */
  bow: (i: number) => 12.5 * i,
  /** Floor height about the deck (m): -0.6 (sunk) .. +0.8 (raised), in 0.2 m steps (index 3 = level with the deck). */
  floor: (i: number) => -0.6 + 0.2 * i,
  /** Roof visor: how far the roof reaches forward of the top of the front windows (m): 0.15 .. 0.75 (owner: always overhanging, hiding the wipers' works). */
  visor: (i: number) => 0.15 + 0.15 * i,
  /** Roof thickness (m): 0.1, 0.2, 0.3. */
  roofThickness: (i: number) => [0.1, 0.2, 0.3][i],
  /**
   * The roof's front face, raked back as it rises (deg from vertical): 30, 45, 60. Index 0
   * was square until the owner dropped it (never square): it reads as 30.
   */
  roofEdge: (i: number) => [30, 30, 45, 60][i],
  /** Front windows' rake from vertical (deg): -30 (leaning aft at the top: a fast patrol boat) .. 0 .. +30 (leaning forward: a pilot house's reverse rake). */
  windowRake: (i: number) => -30 + 7.5 * i,
  /** The front below the windows, its lean from vertical (deg): 0 (upright) .. 30 (leaning forward at the top, under the windows). */
  lowerFront: (i: number) => 7.5 * i,
  /** Gearbox ratio: 1.0 .. 4.18, each step 10 % more than the last (rounded to 0.01). */
  gear: (i: number) => Math.round(100 * 1.1 ** i) / 100,
};

/** The page's starting point: the landing craft much as she is. */
export const DEFAULT_DESIGN: ShipDesign = {
  hull: 0,
  length: 8,
  beam: 8,
  depth: 8,
  bulwark: 2,
  bow: 2,
  housePos: 4,
  houseLength: 2,
  houseWidth: 7,
  headroom: 3,
  floor: 2,
  visor: 1,
  roofThickness: 0,
  roofEdge: 1,
  roofPaint: 0,
  deckCrane: 0,
  searchlight: 1,
  fireMonitor: 0,
  chartTable: 0,
  ...NO_V10_GEAR,
  // The crew's fenders: what every boat has, at the least.
  guard: 1,
  windowRake: 4,
  lowerFront: 0,
  twin: 0,
  engine: 1,
  gear: 2,
  controls: 1,
  paint: 0,
};

/** The characters a design's code is written in (no I, L, O or U: read as 1, 1, 0, and kept out). */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Every combination of version 10's choices: its codes are the numbers 0 .. this - 1. */
export const COMBINATIONS = FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);
const V9_COMBINATIONS = V9_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);
const V9_BASE = 1n << 69n;
const V8_COMBINATIONS = V8_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);
const V7_COMBINATIONS = V7_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);
const V7_BASE = 1n << 64n;
const V6_COMBINATIONS = V6_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);
/** Where version 5's codes start (13 characters), and how many there are. */
const V5_BASE = 1n << 59n;
const V5_COMBINATIONS = V5_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);
const V4_COMBINATIONS = V4_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);
const V3_COMBINATIONS = V3_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);
/** Where version 2's codes start, and how many there are. */
const V2_BASE = 1n << 43n;
const V2_COMBINATIONS = V2_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);

/** The choices as one mixed-radix number, the first choice most significant. */
function pack<D>(d: D, fields: readonly { key: keyof D; steps: number }[]): bigint {
  let n = 0n;
  for (const f of fields) {
    const v = d[f.key] as number;
    if (!Number.isInteger(v) || v < 0 || v >= f.steps) throw new Error(`design ${String(f.key)} ${v} is off its scale (0..${f.steps - 1})`);
    n = n * BigInt(f.steps) + BigInt(v);
  }
  return n;
}

/** A number as `count` base-32 characters and the check, grouped in fives. */
function write(all: bigint, count: number): string {
  const syms: number[] = [];
  for (let k = count - 1; k >= 0; k--) syms.push(Number((all >> BigInt(5 * k)) & 31n));
  syms.push(check(syms));
  const s = syms.map((v) => ALPHABET[v]).join('');
  return s.match(/.{1,5}/g)!.join('-');
}

/** The design as its code, e.g. 'K7P4Q-2ZX9D-MR3XA-7Q' (version 10, 17 characters; longer with gear placed by hand). */
export function encodeDesign(d: ShipDesign): string {
  if (!Number.isInteger(d.hull) || d.hull < 0 || d.hull >= HULL_TYPES) throw new Error(`design hull ${d.hull} is off its scale (0..${HULL_TYPES - 1})`);
  // A hull type after the first four: 0 in the first 16 characters, its number in the extension.
  const more = d.hull >= BASE_HULLS ? d.hull - BASE_HULLS + 1 : 0;
  // An engine after the first three: the same way.
  if (!Number.isInteger(d.engine) || d.engine < 0 || d.engine >= ENGINE_TYPES) throw new Error(`design engine ${d.engine} is off its scale (0..${ENGINE_TYPES - 1})`);
  const moreEngine = d.engine >= BASE_ENGINES ? d.engine - BASE_ENGINES + 1 : 0;
  const base = pack({ ...d, ...(more ? { hull: 0 } : {}), ...(moreEngine ? { engine: 0 } : {}) }, FIELDS);
  // No handrails first (most significant: 0 with them), hull protection (0 without any), the deckhouse (0 without one),
  // then each piece of gear placed by hand, then which are placed (least significant).
  const guard = d.guard ?? 0;
  if (!Number.isInteger(guard) || guard < 0 || guard >= GUARD_FIELD.steps) throw new Error(`design guard ${guard} is off its scale (0..${GUARD_FIELD.steps - 1})`);
  const rails = d.rails ?? 0;
  if (!Number.isInteger(rails) || rails < 0 || rails >= RAIL_FIELD.steps) throw new Error(`design rails ${rails} is off its scale (0..${RAIL_FIELD.steps - 1})`);
  const narrow = d.dhNarrow ?? 0;
  if (narrow !== 0 && narrow !== 1) throw new Error(`design dhNarrow ${narrow} is off its scale (0..1)`);
  const noAnchor = d.noAnchor ?? 0;
  const skiff = d.skiff ?? 0;
  if (noAnchor !== 0 && noAnchor !== 1) throw new Error(`design noAnchor ${noAnchor} is off its scale (0..1)`);
  if (!Number.isInteger(skiff) || skiff < 0 || skiff >= SKIFF_FIELD.steps) throw new Error(`design skiff ${skiff} is off its scale (0..${SKIFF_FIELD.steps - 1})`);
  const facets = d.facets ?? 0;
  if (facets !== 0 && facets !== 1) throw new Error(`design facets ${facets} is off its scale (0..1)`);
  // From the top: a later engine, the facets, a later hull type, the skiff, no anchor, the narrow deckhouse,
  // no rails, protection (each 0: as before).
  const top = (((((BigInt(moreEngine) * BigInt(FACETS_FIELD.steps) + BigInt(facets)) * BigInt(MORE_HULLS) + BigInt(more)) * BigInt(SKIFF_FIELD.steps) + BigInt(skiff)) * 2n + BigInt(noAnchor)) * 2n + BigInt(narrow)) * BigInt(RAIL_FIELD.steps) + BigInt(rails);
  let ext = (top * BigInt(GUARD_FIELD.steps) + BigInt(guard)) * (DECKHOUSE_COMBINATIONS + 1n);
  if (d.dhLength) ext += 1n + pack(d, DECKHOUSE_FIELDS);
  let which = 0;
  PLACE_FIELDS.forEach((f, i) => {
    const v = d[f.key] ?? 0;
    if (!Number.isInteger(v) || v < 0 || v >= f.steps) throw new Error(`design ${f.key} ${v} is off its scale (0..${f.steps - 1})`);
    if (!v) return;
    ext = ext * BigInt(f.steps) + BigInt(v);
    which |= 1 << i;
  });
  if (!which && !ext) return write(base, 16);
  ext = (ext << BigInt(PLACE_FIELDS.length)) | BigInt(which);
  let count = 1;
  while (ext >> BigInt(5 * count) > 0n) count++;
  return write((base << BigInt(5 * count)) | ext, 16 + count);
}

/** The placed-by-hand gear from a code's extension (the number after its first 16 characters). */
function unpackPlaces(ext: bigint): (Pick<ShipDesign, PlaceKey | DeckhouseKey | 'guard' | 'rails' | 'dhNarrow' | 'noAnchor' | 'skiff' | 'facets'> & { more: number; moreEngine: number }) | { error: string } {
  const out = { craneAt: 0, lampAt: 0, monitorAt: 0, winchAt: 0, dhLength: 0, dhHeight: 0, dhWidth: 0, dhRake: 0, guard: 0, rails: 0, dhNarrow: 0, noAnchor: 0, skiff: 0, facets: 0, more: 0, moreEngine: 0 };
  const which = Number(ext & BigInt((1 << PLACE_FIELDS.length) - 1));
  let n = ext >> BigInt(PLACE_FIELDS.length);
  for (let i = PLACE_FIELDS.length - 1; i >= 0; i--) {
    if (!(which & (1 << i))) continue;
    const f = PLACE_FIELDS[i];
    out[f.key] = Number(n % BigInt(f.steps));
    n /= BigInt(f.steps);
    if (!out[f.key]) return { error: 'that code is off the scales (no design has it)' };
  }
  // What's left: no handrails over hull protection over the deckhouse (each 0: as before).
  if (n === 0n) return which ? out : { error: 'that code is off the scales (no design has it)' };
  const top = n / (DECKHOUSE_COMBINATIONS + 1n);
  const dhPart = n % (DECKHOUSE_COMBINATIONS + 1n);
  const guard = top % BigInt(GUARD_FIELD.steps);
  let up = top / BigInt(GUARD_FIELD.steps);
  const rails = up % BigInt(RAIL_FIELD.steps);
  up /= BigInt(RAIL_FIELD.steps);
  const narrow = up % 2n;
  up /= 2n;
  const noAnchor = up % 2n;
  up /= 2n;
  const skiff = up % BigInt(SKIFF_FIELD.steps);
  up /= BigInt(SKIFF_FIELD.steps);
  const more = up % BigInt(MORE_HULLS);
  up /= BigInt(MORE_HULLS);
  const facets = up % BigInt(FACETS_FIELD.steps);
  const moreEngine = up / BigInt(FACETS_FIELD.steps);
  if (moreEngine >= BigInt(MORE_ENGINES)) return { error: `that code is from a newer Shipyard than this game (it reads versions 1 to ${DESIGN_VERSION})` };
  out.more = Number(more);
  out.moreEngine = Number(moreEngine);
  out.facets = Number(facets);
  out.guard = Number(guard);
  out.rails = Number(rails);
  out.dhNarrow = Number(narrow);
  out.noAnchor = Number(noAnchor);
  out.skiff = Number(skiff);
  if (dhPart === 0n) return out;
  const dh = unpack<Pick<ShipDesign, DeckhouseKey>>(dhPart - 1n, DECKHOUSE_FIELDS);
  if (!('design' in dh) || !dh.design.dhLength) return { error: 'that code is off the scales (no design has it)' };
  return { ...out, ...dh.design };
}

/** A version 9 design as its code: for checking old codes still read. */
export function encodeDesignV9(d: V9Design): string {
  return write(V9_BASE + pack(d, V9_FIELDS), 14);
}

/** A version 8 design as its code: for checking old codes still read. */
export function encodeDesignV8(d: V8Design): string {
  return write(pack(d, V8_FIELDS), 14);
}

/** A version 7 design as its code: for checking old codes still read. */
export function encodeDesignV7(d: V7Design): string {
  return write(V7_BASE + pack(d, V7_FIELDS), 13);
}

/** A version 6 design as its code: for checking old codes still read. */
export function encodeDesignV6(d: V6Design): string {
  return write(pack(d, V6_FIELDS), 13);
}

/** A version 5 design as its code: for checking old codes still read. */
export function encodeDesignV5(d: V5Design): string {
  return write(V5_BASE + pack(d, V5_FIELDS), 12);
}

/** A version 4 design as its code: for checking old codes still read. */
export function encodeDesignV4(d: V4Design): string {
  return write(pack(d, V4_FIELDS), 12);
}

/** An old-style design (single engine, step-down floor or not) as a version 2 code (10 characters): for checking old codes still read. */
export function encodeDesignV2(d: OldDesign): string {
  return write(V2_BASE + pack(d, V2_FIELDS), 9);
}

/** An old-style design as a version 3 code (11 characters): for checking old codes still read. */
export function encodeDesignV3(d: OldDesign): string {
  return write(pack(d, V3_FIELDS), 10);
}

/**
 * An earlier version's design in today's choices: a step-down floor as a floor 0.2 m below
 * the deck, none as level with it; the house's shape as the old box (visor 0.15 m, the
 * roof's old overhang; roof, windows and the front below them upright).
 */
function upgrade(d: OldDesign): V7Design {
  const { sunk, ...rest } = d;
  return { ...rest, floor: sunk ? 2 : 3, visor: 1, roofThickness: 0, roofEdge: 1, roofPaint: 0, deckCrane: 0, windowRake: 4, lowerFront: 0 };
}

/**
 * A code back to its design, or why it can't be read. Forgiving as typed: any case, with
 * or without the dashes or spaces, and I / L read as 1, O as 0. 17 characters (version 10), 15 (versions 8 and 9), 14 (versions 6 and 7),
 * 13 (versions 4 and 5), 11 (version 3), or 10 (versions 1 and 2: single engines).
 */
export function decodeDesign(code: string): { design: ShipDesign } | { error: string } {
  const s = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  const tidy = <D extends { roofEdge: number }>(d: D) => ({ ...d, lowerFront: 0, roofEdge: Math.max(1, d.roofEdge) });
  if (s.length >= 17) {
    // Version 10: 16 characters of choices, then (if longer) the gear placed by hand.
    const all = readCode(s);
    if (typeof all !== 'bigint') return all;
    const extBits = BigInt(5 * (s.length - 17));
    const base = all >> extBits;
    if (base >= COMBINATIONS) return { error: `that code is from a newer Shipyard than this game (it reads versions 1 to ${DESIGN_VERSION})` };
    const read = s.length > 17 ? unpackPlaces(all & ((1n << extBits) - 1n)) : { craneAt: 0, lampAt: 0, monitorAt: 0, winchAt: 0, dhLength: 0, dhHeight: 0, dhWidth: 0, dhRake: 0, guard: 0, rails: 0, dhNarrow: 0, noAnchor: 0, skiff: 0, facets: 0, more: 0, moreEngine: 0 };
    if ('error' in read) return read;
    const { more, moreEngine, ...places } = read;
    type Base = Omit<ShipDesign, PlaceKey | DeckhouseKey | 'guard' | 'rails' | 'dhNarrow' | 'noAnchor' | 'skiff' | 'facets'>;
    const v10 = unpack<Base>(base, FIELDS as { key: keyof Base; steps: number }[]);
    if (!('design' in v10)) return v10;
    // A later hull type: its first 16 characters hold hull 0.
    if (more && v10.design.hull !== 0) return { error: 'that code is off the scales (no design has it)' };
    // A later engine: its first 16 characters hold engine 0.
    if (moreEngine && v10.design.engine !== 0) return { error: 'that code is off the scales (no design has it)' };
    return { design: { ...tidy(v10.design), ...places, ...(more ? { hull: BASE_HULLS - 1 + more } : {}), ...(moreEngine ? { engine: BASE_ENGINES - 1 + moreEngine } : {}) } };
  }
  if (s.length !== 15) {
    // Before version 8: the searchlight came with the advanced controls, on the roof; no monitor.
    const old = decodeBefore8(s);
    return 'design' in old ? { design: { ...old.design, searchlight: old.design.controls ? 1 : 0, fireMonitor: 0, chartTable: 0, ...NO_V10_GEAR } } : old;
  }
  const all = readCode(s);
  if (typeof all !== 'bigint') return all;
  if (all >= V9_BASE) {
    if (all - V9_BASE >= V9_COMBINATIONS) return { error: 'that isn’t a Shipyard code' };
    const v9 = unpack<V9Design>(all - V9_BASE, V9_FIELDS);
    return 'design' in v9 ? { design: { ...tidy(v9.design), ...NO_V10_GEAR } } : v9;
  }
  // Version 8: no chart table.
  if (all >= V8_COMBINATIONS) return { error: 'that isn’t a Shipyard code' };
  const v8 = unpack<V8Design>(all, V8_FIELDS);
  return 'design' in v8 ? { design: { ...tidy(v8.design), chartTable: 0, ...NO_V10_GEAR } } : v8;
}

/** A code's characters (tidied, as typed) as its number, its check checked. */
function readCode(s: string): bigint | { error: string } {
  const syms: number[] = [];
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return { error: `'${ch}' isn't used in design codes` };
    syms.push(v);
  }
  const body = syms.slice(0, -1);
  if (check(body) !== syms[syms.length - 1]) return { error: 'that code has a mistyped character (its check doesn’t match)' };
  let all = 0n;
  for (const v of body) all = (all << 5n) | BigInt(v);
  return all;
}

/** A code from before version 8: 14 characters (versions 6 and 7), 13 (4 and 5), 11 (3) or 10 (1 and 2). */
function decodeBefore8(s: string): { design: V7Design } | { error: string } {
  if (![14, 13, 11, 10].includes(s.length)) return { error: `a design code has 17 characters (this has ${s.length})` };
  const all = readCode(s);
  if (typeof all !== 'bigint') return all;
  if (s.length === 14) {
    if (all >= V7_BASE) {
      if (all - V7_BASE >= V7_COMBINATIONS) return { error: 'that isn’t a Shipyard code' };
      const v7 = unpack<V7Design>(all - V7_BASE, V7_FIELDS);
      return 'design' in v7 ? { design: { ...v7.design, lowerFront: 0, roofEdge: Math.max(1, v7.design.roofEdge) } } : v7;
    }
    if (all >= V6_COMBINATIONS) return { error: 'that isn’t a Shipyard code' };
    const v6 = unpack<V6Design>(all, V6_FIELDS);
    return 'design' in v6 ? { design: { ...v6.design, lowerFront: 0, roofEdge: Math.max(1, v6.design.roofEdge), deckCrane: 0 } } : v6;
  }
  if (s.length === 13) {
    if (all >= V5_BASE) {
      if (all - V5_BASE >= V5_COMBINATIONS) return { error: 'that isn’t a Shipyard code' };
      const v5 = unpack<V5Design>(all - V5_BASE, V5_FIELDS);
      return 'design' in v5 ? { design: { ...v5.design, lowerFront: 0, roofEdge: Math.max(1, v5.design.roofEdge), roofPaint: 0, deckCrane: 0 } } : v5;
    }
    if (all >= V4_COMBINATIONS) return { error: 'that isn’t a Shipyard code' };
    // Version 4: its raked roof becomes the thinnest flat slab, square at the front.
    const v4 = unpack<V4Design>(all, V4_FIELDS);
    if (!('design' in v4)) return v4;
    const { roofRake: _r, ...rest } = v4.design;
    return { design: { ...rest, lowerFront: 0, roofThickness: 0, roofEdge: 1, roofPaint: 0, deckCrane: 0 } };
  }
  const old = s.length === 11 ? (all >= V3_COMBINATIONS ? { error: 'that isn’t a Shipyard code' } : unpack<OldDesign>(all, V3_FIELDS)) : decodeV12(all);
  return 'design' in old ? { design: upgrade(old.design) } : old;
}

/** A 10-character code: version 1 or 2 (single engines). */
function decodeV12(all: bigint): { design: OldDesign } | { error: string } {
  if (all >> 42n === 1n) return decodeV1(all);
  if (all < V2_BASE || all - V2_BASE >= V2_COMBINATIONS) return { error: 'that isn’t a Shipyard code' };
  const v2 = unpack<OldDesign>(all - V2_BASE, V2_FIELDS);
  return 'design' in v2 ? { design: { ...v2.design, twin: 0 } } : v2;
}

/** A mixed-radix number back to its choices, the last choice least significant. */
function unpack<D>(n: bigint, fields: readonly { key: keyof D; steps: number }[]): { design: D } | { error: string } {
  const d = {} as Record<keyof D, number>;
  for (const f of [...fields].reverse()) {
    d[f.key] = Number(n % BigInt(f.steps));
    n /= BigInt(f.steps);
  }
  if (n !== 0n) return { error: 'that code is off the scales (no design has it)' };
  return { design: d as D };
}

/** A version 1 code (each choice in whole bits, no bow choice): the same boat, its stem raked 25 deg (the middle step). */
function decodeV1(all: bigint): { design: OldDesign } | { error: string } {
  let shift = 42;
  const d = { bow: 2, twin: 0 } as OldDesign;
  for (const f of V1_FIELDS) {
    shift -= f.bits;
    const v = Number((all >> BigInt(shift)) & BigInt((1 << f.bits) - 1));
    if (v >= f.steps) return { error: `that code's ${f.key} is off its scale` };
    d[f.key] = v;
  }
  return { design: d };
}

/**
 * The check character: the characters weighted 1, 3, 5 ..., summed mod 32. Odd weights have an
 * inverse mod 32, so changing any one character always changes the sum.
 */
function check(syms: number[]): number {
  let a = 0;
  for (let i = 0; i < syms.length; i++) a = (a + (2 * i + 1) * syms[i]) % 32;
  return a;
}
