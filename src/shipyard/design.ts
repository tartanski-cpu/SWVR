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
 * Version 19 (windows raked out all round, owner: a tug's or supply vessel's bridge) puts that
 * above the later engines, again 0 (upright, as before) leaving earlier codes as they were;
 * and the window sills (owner) above that: 0 level all round (owner: always one height all
 * round now; earlier codes' fronts come down to the sides' height), 1 low all round.
 * Version 20 (outboards, owner: 2, 3 or 4 petrol V8 outboards on a bracket off the transom)
 * puts that choice above the sills, the most significant: 0 (an inboard, as every boat had)
 * leaves every earlier code as it was.
 * Version 21 (the hull's material, owner: the workboat hull in aluminium or steel) puts that
 * above the outboards: 0 (aluminium) leaves every earlier code as it was.
 * Version 22 (stern drives, owner) puts that above the material: 0 (a shaft) leaves every
 * earlier code as it was.
 * Version 24 (a Kort nozzle round the propeller, owner: a tug's) puts that above the saloon's
 * floor, the most significant: 0 (an open propeller) leaves every earlier code as it was.
 * Version 26 (a fishing rod rack on the house's aft wall, owner) puts that above version 25's
 * roof choices, the most significant: 0 (none) leaves every earlier code as it was.
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

/** The building rules this code was made with (32: the wheelhouse's colour and its window frames'; 31: the wheelhouse floor; 30: the wheelhouse's interior finish; 29: a tug's exhaust stacks straight or raked; 28: pod drives; 27: the console to port, centre or starboard; 26: a fishing rod rack; 25: the saloon's own lower roof, and the roof's inset top in a second colour; 24: a Kort nozzle; 23: a saloon aft of the wheelhouse; 22: stern drives; 21: the hull's material; 20: outboards; 19: windows raked out all round, and the window sills; 18: a fourth engine, the slow-revving tug diesel; 17: a three-facet front; 16: a fifth hull type, the small tug; 15: the anchor and the skiff; 14: a deckhouse as wide as the house; 13: no handrails; 12: hull protection; all in version 10's extension). */
export const DESIGN_VERSION = 32;

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
export interface ShipDesign extends Record<FurnitureKey, number>, Record<ConsoleKey, number> {
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
  /** Wheelhouse (values, not steps: MEASURES): where along the deck (0 aft .. 1 forward), its length (m), its width (a fraction of the room), its headroom (m). */
  housePos: number;
  houseLength: number;
  houseWidth: number;
  headroom: number;
  /** Floor height about the deck (m, MEASURES): sunk below it (a step down in) .. raised above it (steps up), to see over a bow or a ramp. */
  floor: number;
  /** Roof, one flat slab: how far it reaches forward over the front windows (SCALES.visor), its thickness (m) and its front edge (degrees back; both MEASURES). */
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
  /** The side and aft windows (owner): 0 upright, 1 raked out all round (leaning out to the roof, like a tug's or supply vessel's bridge; the doors stay upright). */
  flare: number;
  /** The window sills, the same all round (owner): 0 at the standard height, 1 low (below the console, its upright panel off, the screens on stalks). */
  sills: number;
  /**
   * Outboards instead of the inboard (owner, Oct 2026; OUTBOARDS): 0 none (the engine
   * package and twin choice above), 1 two, 2 three, 3 four petrol V8 outboards on a bracket
   * off the transom (propulsion.outboard), steered by swinging them: no rudder.
   */
  outboards: number;
  /**
   * What her hull and houses are built of (owner, Oct 2026; MATERIALS): 0 aluminium, 1 steel.
   * A choice on the workboat hull only; the other hulls are built of their own (build.ts
   * DESIGN_HULLS `material`): the gillnetter and the tug steel, the landing craft and the
   * pilot boat aluminium. Steel is heavier and cheaper to build.
   */
  material: number;
  /**
   * Stern drives (owner, Oct 2026): 0 the engine on a shaft (a propeller and rudder under her),
   * 1 the engine against the transom driving an outdrive leg that swings to steer (a leg each
   * for twins). Not the slow tug diesel; outboards, if chosen, instead of either.
   */
  sternDrive: number;
  /**
   * A saloon aft of the wheelhouse (parametric boats P2b; owner: a pilothouse and a saloon in
   * a row): its length (SCALES.saloon; 0 none). The house runs on aft that much, one house
   * with one roof, its aft door in the saloon's aft wall.
   */
  saloon: number;
  /** The saloon's floor (SCALES.saloonFloor): level with the wheelhouse's, or 1 to 3 steps down from it. */
  saloonFloor: number;
  /** A Kort nozzle round the propeller (CONFIG.nozzle; owner: a tug's): 1, or 0 an open propeller. On a shaft only. */
  nozzle: number;
  /** A rack of fishing rods on the wheelhouse (modules/rodRack; owner): 0 none, 1 aft wall port, 2 aft wall starboard, 3 port wall, 4 starboard wall. */
  rodRack: number;
  /**
   * Where the helm console stands across the wheelhouse (CONSOLE_SIDES; owner, Oct 2026): 0 in
   * the middle, 1 against the port wall, 2 against the starboard wall. It's no wider than
   * CONFIG.shipyard.helm.maxConsole, so on a wide wheelhouse there's floor and glass beside it.
   */
  consoleSide: number;
  /**
   * Pod drives (owner, Oct 2026; CONFIG.modules.pods): 1 two steerable pods under her bottom,
   * their propellers at the front, each driven by its own engine (twin always), with a helm
   * joystick for berthing if she has the advanced controls; 0 none. On a planing hull, not
   * the slow tug diesel; outboards, if chosen, instead.
   */
  pods: number;
  /** A tug's exhaust stacks (STACK_STYLES; owner, Oct 2026): 0 raked aft with their tops cut on a slant, 1 straight up. One per engine. */
  stackStyle: number;
  /** The wheelhouse's finish inside (CONFIG.interiors; owner, Oct 2026): 0 the wood lining, then a light or dark headliner with wooden beams across, light all round with beams, painted steel, bare aluminium. */
  interior: number;
  /** The wheelhouse floor (CONFIG.cabinFloors; owner, Oct 2026): 0 matting, 1 teak planks, 2 grippy utility. */
  cabinFloor: number;
  /** The wheelhouse's colour outside (HOUSE_PAINTS; owner, Oct 2026): 0 her paint's own. */
  houseColour: number;
  /** Its window frames, mullions and posts (FRAME_COLOURS): 0 black, 1 white. */
  frames: number;
  /**
   * The helm assist panel (owner, Oct 2026; modules/helmAssist): 0 none, 1 a small box by the
   * breaker panel with AUTO START, DOCK and AUTOPILOT (holds her compass heading). With the
   * advanced controls only. Not in the short code: a design with it travels as a link or file.
   */
  helmAssist: number;
  /**
   * A cockpit overhead (parametric boats P2b; owner): the house's aft roof carried on aft over
   * the working deck this far (SCALES.overhead: 0 none, then 0.25 m steps to 4 m), on a wing
   * each side. Not in the short code: a design with it travels as a link or file.
   */
  overhead: number;
  /** More sheer (owner, Oct 2026): her deck line raised forward, to SCALES.sheer m more at the stem (0 her type's own). Not in the code. */
  sheer: number;
  /**
   * A raised foredeck (owner, Oct 2026: the fishing boat's, from a photo of a trawler): her
   * deck stepped up forward of a break `fcLength` aft of the stem (SCALES.fcLength; 0 none),
   * `fcHeight` higher (SCALES.fcHeight), steps up at the break. Not in the code.
   */
  fcLength: number;
  fcHeight: number;
  /**
   * The deckhouse's top walked (parametric boats P2b; owner: a pilothouse raised on a walkable
   * deckhouse): 1, a deck round the wheelhouse with a rail along its edge and a ladder up to it
   * from the main deck (a side door in the wheelhouse can then open onto it); 0, solid, not
   * walked. Only with a deckhouse. Not in the short code: she travels as a link or file.
   */
  dhWalk: number;
  /**
   * A cabin below (parametric boats P2c; owner): 1, under the deckhouse forward of the
   * wheelhouse, its sole sunk into the hull, a companionway down from the wheelhouse floor
   * and a V-berth forward; 0, the deckhouse solid. Only with a deckhouse. Not in the short
   * code: she travels as a link or file.
   */
  foreCabin: number;
  /**
   * A fish hold (owner, Oct 2026: "to have a fish hold", step 1 toward a trawler): 1, an
   * insulated hold in her hull under the working deck, its hatch in the deck, the catch going
   * down into it in boxes (shipyard/parts/hold.ts, modules/fishHold); 0, none. Not in the short
   * code: she travels as a link or file.
   */
  fishHold: number;
  /*
   * Furniture (parametric boats P5; owner): FurnitureKey's fields (berthAt, berthAt2 ... headAt,
   * below), each piece where it's placed, a cell of the deck's 25 cm grid (furnitureCell: 0
   * none, else 1 + its cell), on the floor it lands on (the wheelhouse's, the saloon's, the
   * cabin below's sole); the builder puts it against the nearest wall there, clear of what's in
   * the way (shipyard/parts/furniture.ts). Not in the short code: she travels as a link or file.
   */
  /**
   * The saloon's roof (SCALES.saloonRoof; parametric boats P2b): as high as the wheelhouse's
   * (one roof), or 1 to 3 steps of 0.2 m lower, its own roof aft of a step in the roofline (the
   * raised pilothouse look). Its windows come down with it.
   */
  saloonRoof: number;
  /**
   * The roof's top (ROOF_TOPS, build.ts; owner: the eyebrow): one colour, or a panel set in
   * from its edges in a second colour, so the roof's edge shows as a band round it.
   */
  roofTop: number;
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
  /**
   * Old school (owner, Oct 2026: "three tiers of instruments, old school (analogue), basic
   * electronic, and then advanced"): with the basic controls (`controls` 0), 1 puts round
   * analogue gauges in place of the screens (a compass, the log, depth, the chain counter,
   * revs, temperature and fuel); 0 the basic electronic screens. Ignored with the advanced
   * controls. Not in the short code: a design with it travels as a link or file.
   */
  oldSchool: number;
  /**
   * Touchscreens (owner, Oct 2026: "with the advanced package ... just one screen that you have
   * tabs that you have to flip between"): with the advanced controls, 0 her separate screens;
   * 1 one touchscreen with tabs in their place, 2 two side by side. Ignored with the basic
   * controls. Not in the short code: a link or file.
   */
  touch: number;
  /**
   * The console's length (CS6; owner, Oct 2026: "an option that allows you to make a more narrow
   * console, so we can have more narrow wheelhouses"): 0 as long as the wheelhouse allows (up to
   * CONFIG.shipyard.helm.maxConsole), as before; k a console of `consoleLengthM` metres, no longer
   * than the wheelhouse is wide. Not in the short code: a link or file.
   */
  consoleLen: number;
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

/** The choices after the first code's: none of them in a new design (DEFAULT_DESIGN takes them from here). */
type V10Gear = 'towWinch' | 'sternRoller' | 'aFrame' | 'lifeRing' | 'sideDoor' | PlaceKey | DeckhouseKey | 'guard' | 'rails' | 'dhNarrow' | 'noAnchor' | 'skiff' | 'facets' | 'flare' | 'sills' | 'outboards' | 'material' | 'sternDrive' | 'saloon' | 'saloonFloor' | 'nozzle' | 'saloonRoof' | 'roofTop' | 'rodRack' | 'consoleSide' | 'pods' | 'stackStyle' | 'interior' | 'cabinFloor' | 'houseColour' | 'frames';
/** None of them. */
const NO_V10_GEAR: Pick<ShipDesign, V10Gear> = { towWinch: 0, sternRoller: 0, aFrame: 0, lifeRing: 0, sideDoor: 0, craneAt: 0, lampAt: 0, monitorAt: 0, winchAt: 0, dhLength: 0, dhHeight: 0, dhWidth: 0, dhRake: 0, guard: 0, rails: 0, dhNarrow: 0, noAnchor: 0, skiff: 0, facets: 0, flare: 0, sills: 0, outboards: 0, material: 0, sternDrive: 0, saloon: 0, saloonFloor: 0, nozzle: 0, saloonRoof: 0, roofTop: 0, rodRack: 0, consoleSide: 0, pods: 0, stackStyle: 0, interior: 0, cabinFloor: 0, houseColour: 0, frames: 0 };

/** Each choice's number of steps, in the code's order. (The hull type first, most significant: four types in the first 16 characters; later ones ride in the extension, MORE_HULLS.) */
export const FIELDS: { key: keyof ShipDesign; steps: number }[] = [
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
  { key: 'roofPaint', steps: 5 },
  { key: 'deckCrane', steps: 3 },
  { key: 'searchlight', steps: 4 },
  { key: 'fireMonitor', steps: 4 },
  { key: 'chartTable', steps: 2 },
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
const FLARE_FIELD: { key: 'flare'; steps: number } = { key: 'flare', steps: 2 };
/** The window sills' choices (design.sills), as the page names them. */
export const SILLS = ['Standard', 'Low (below the console)'] as const;
const SILLS_FIELD: { key: 'sills'; steps: number } = { key: 'sills', steps: SILLS.length };
/** The outboards' choices (design.outboards), as the page names them: how many there are (0: the inboard). */
export const OUTBOARDS = ['None (the inboard above)', 'Two outboards', 'Three outboards', 'Four outboards'] as const;
const OUTBOARDS_FIELD: { key: 'outboards'; steps: number } = { key: 'outboards', steps: OUTBOARDS.length };
/** What her hull is built of (design.material), as the page names it. */
export const MATERIALS = ['Aluminium', 'Steel'] as const;
const MATERIAL_FIELD: { key: 'material'; steps: number } = { key: 'material', steps: MATERIALS.length };
const STERN_DRIVE_FIELD: { key: 'sternDrive'; steps: number } = { key: 'sternDrive', steps: 2 };
const SALOON_FIELD: { key: 'saloon'; steps: number } = { key: 'saloon', steps: 9 };
/** The saloon floor's choices (design.saloonFloor), as the page names them. */
export const SALOON_FLOORS = ['Level with the wheelhouse', 'One step down', 'Two steps down', 'Three steps down'] as const;
const SALOON_FLOOR_FIELD: { key: 'saloonFloor'; steps: number } = { key: 'saloonFloor', steps: SALOON_FLOORS.length };
const NOZZLE_FIELD: { key: 'nozzle'; steps: number } = { key: 'nozzle', steps: 2 };
/** The saloon roof's choices (design.saloonRoof), as the page names them. */
export const SALOON_ROOFS = ['As high as the wheelhouse', 'One step lower', 'Two steps lower', 'Three steps lower'] as const;
const SALOON_ROOF_FIELD: { key: 'saloonRoof'; steps: number } = { key: 'saloonRoof', steps: SALOON_ROOFS.length };
/** How many roof-top choices there are (build.ts ROOF_TOPS: one colour, then the second colours). */
const ROOF_TOP_FIELD: { key: 'roofTop'; steps: number } = { key: 'roofTop', steps: 5 };
/** The rod rack's places (design.rodRack), as the page names them. */
export const ROD_RACKS = ['', 'aft wall, port', 'aft wall, starboard', 'port wall', 'starboard wall'] as const;
const ROD_RACK_FIELD: { key: 'rodRack'; steps: number } = { key: 'rodRack', steps: ROD_RACKS.length };
/** Where the helm console stands (design.consoleSide), as the page names it. */
export const CONSOLE_SIDES = ['Middle', 'Port', 'Starboard'] as const;
const CONSOLE_SIDE_FIELD: { key: 'consoleSide'; steps: number } = { key: 'consoleSide', steps: CONSOLE_SIDES.length };
const PODS_FIELD: { key: 'pods'; steps: number } = { key: 'pods', steps: 2 };
/** A tug's exhaust stacks (design.stackStyle), as the page names them. */
export const STACK_STYLES = ['Raked', 'Straight'] as const;
const STACK_STYLE_FIELD: { key: 'stackStyle'; steps: number } = { key: 'stackStyle', steps: STACK_STYLES.length };
/** The wheelhouse's interior finish (design.interior): as many as CONFIG.interiors has (a test keeps them the same). */
export const INTERIOR_FIELD: { key: 'interior'; steps: number } = { key: 'interior', steps: 6 };
/** The wheelhouse floor (design.cabinFloor): as many as CONFIG.cabinFloors has (a test keeps them the same). */
export const CABIN_FLOOR_FIELD: { key: 'cabinFloor'; steps: number } = { key: 'cabinFloor', steps: 3 };
/** The wheelhouse's colour (design.houseColour) and its frames' (design.frames): as many as HOUSE_PAINTS and FRAME_COLOURS have (a test keeps them the same). */
export const HOUSE_COLOUR_FIELD: { key: 'houseColour'; steps: number } = { key: 'houseColour', steps: 10 };
export const FRAMES_FIELD: { key: 'frames'; steps: number } = { key: 'frames', steps: 2 };
/** The helm assist panel (design.helmAssist): none, or fitted. Not in the code. */
const HELM_ASSIST_FIELD: { key: 'helmAssist'; steps: number } = { key: 'helmAssist', steps: 2 };
/** Old school instruments (design.oldSchool): 0 the screens, 1 analogue gauges. Not in the code. */
const OLD_SCHOOL_FIELD: { key: 'oldSchool'; steps: number } = { key: 'oldSchool', steps: 2 };
/** The console's length (design.consoleLen): 0 full, else k: CONSOLE_LEN_M(k) metres. Not in the code. */
const CONSOLE_LEN_FIELD: { key: 'consoleLen'; steps: number } = { key: 'consoleLen', steps: 28 };
/** A console length step in metres (k >= 1): 0.8 m to 2.15 m by 5 cm; null for 0 (as long as she allows). */
export const consoleLengthM = (k: number): number | null => (k > 0 ? Math.round((0.75 + 0.05 * k) * 100) / 100 : null);
/** Touchscreens (design.touch): 0 separate screens, 1 or 2 touchscreens. Not in the code. */
const TOUCH_FIELD: { key: 'touch'; steps: number } = { key: 'touch', steps: 3 };
/** The cockpit overhead (design.overhead, SCALES.overhead): none, or 0.25 .. 4 m. Not in the code. */
const OVERHEAD_FIELD: { key: 'overhead'; steps: number } = { key: 'overhead', steps: 17 };
/** More sheer (design.sheer, SCALES.sheer: 0.15 m steps, to 1.2 m at the stem). Not in the code. */
const SHEER_FIELD: { key: 'sheer'; steps: number } = { key: 'sheer', steps: 9 };
/** A raised foredeck (design.fcLength, fcHeight; SCALES). Not in the code. */
const FC_LENGTH_FIELD: { key: 'fcLength'; steps: number } = { key: 'fcLength', steps: 16 };
const FC_HEIGHT_FIELD: { key: 'fcHeight'; steps: number } = { key: 'fcHeight', steps: 4 };
/** The deckhouse's top walked (design.dhWalk): 0 solid, 1 walked. Not in the code. */
const DH_WALK_FIELD: { key: 'dhWalk'; steps: number } = { key: 'dhWalk', steps: 2 };
/**
 * Furniture's places (design.berthAt and the rest): 0 none, else 1 + a cell of the grid. Not in
 * the code. Several of a piece (owner, Oct 2026: "the furniture should be allowed to place
 * multiple"): a field each, the first as it always was (berthAt), the rest numbered (berthAt2,
 * berthAt3, berthAt4). Up to four of each; one head (its door is the boat's one head door).
 */
export type FurniturePiece = 'berth' | 'settee' | 'galley' | 'seat' | 'locker' | 'head' | 'bunk' | 'mess' | 'shower';
export type FurnitureKey = `${FurniturePiece}At${'' | '2' | '3' | '4'}`;
/** Each piece's fields, the first first. */
export const FURNITURE_SLOTS: Record<FurniturePiece, FurnitureKey[]> = {
  berth: ['berthAt', 'berthAt2', 'berthAt3', 'berthAt4'],
  settee: ['setteeAt', 'setteeAt2', 'setteeAt3', 'setteeAt4'],
  galley: ['galleyAt', 'galleyAt2', 'galleyAt3', 'galleyAt4'],
  seat: ['seatAt', 'seatAt2', 'seatAt3', 'seatAt4'],
  locker: ['lockerAt', 'lockerAt2', 'lockerAt3', 'lockerAt4'],
  head: ['headAt'],
  // Crew accommodation (owner, Oct 2026): two-high bunks, a mess table, a shower (one).
  bunk: ['bunkAt', 'bunkAt2', 'bunkAt3', 'bunkAt4'],
  mess: ['messAt', 'messAt2'],
  shower: ['showerAt'],
};
/** Every furniture field (a design's other head fields, headAt2 and on, are always 0). */
export const FURNITURE_KEYS = Object.values(FURNITURE_SLOTS).flat();
/** The spare fields of a piece with fewer than four (one head, one shower, two messes): never set, but the type has them. */
const SPARE_SLOTS: FurnitureKey[] = (Object.keys(FURNITURE_SLOTS) as FurniturePiece[]).flatMap((p) => (['', '2', '3', '4'] as const).map((n) => `${p}At${n}` as FurnitureKey)).filter((k) => !FURNITURE_KEYS.includes(k));
export const FURNITURE_FIELDS: { key: FurnitureKey; steps: number }[] = [...FURNITURE_KEYS.map((key) => ({ key, steps: 1 + CELLS })), ...SPARE_SLOTS.map((key) => ({ key, steps: 1 }))];
/** No furniture: every field 0. */
export const NO_FURNITURE = Object.fromEntries(FURNITURE_FIELDS.map((f) => [f.key, 0])) as Record<FurnitureKey, number>;
/** A cell of the grid as a furniture pin's value (`x` m from the centreline, `fromTransom` m forward of the transom). */
export function furnitureCell(x: number, fromTransom: number): number {
  const xi = Math.max(-PLACE_GRID.halfX, Math.min(PLACE_GRID.halfX, Math.round(x / PLACE_GRID.step)));
  const zi = Math.max(0, Math.min(PLACE_GRID.nz - 1, Math.round(fromTransom / PLACE_GRID.step)));
  return 1 + zi * (2 * PLACE_GRID.halfX + 1) + xi + PLACE_GRID.halfX;
}
/** A furniture pin's value as where it is (null: none). */
export function furnitureAt(v: number): { x: number; fromTransom: number } | null {
  if (!v) return null;
  const nx = 2 * PLACE_GRID.halfX + 1;
  return { x: (((v - 1) % nx) - PLACE_GRID.halfX) * PLACE_GRID.step, fromTransom: Math.floor((v - 1) / nx) * PLACE_GRID.step };
}
/**
 * The console placed by hand (dynamic console sockets CS3; owner, Oct 2026: "so we can
 * eventually place the instruments where we want"; shipyard/parts/consoleGrid.ts). Each
 * screen's cell on the dash (0 automatic, else 1 + column x 2 + row, row 0 the top) and each
 * switch group's first cell along the panel (0 automatic, else 1 + cell), in the console's
 * grids from its port end. Not in the code: a boat placed by hand travels as a link or file.
 */
export const DASH_SLOTS = { speed: 'dashSpeed', anchorScreen: 'dashAnchor', heading: 'dashHeading', rpm: 'dashRpm', engineMonitor: 'dashMonitor', towline: 'dashTow', dialCompass: 'dashCompass', dialSpeed: 'dashLog', dialDepth: 'dashDepth', dialChain: 'dashChain', dialRpm: 'dashTacho', dialTemp: 'dashTemp', dialFuel: 'dashFuel', clock: 'dashClock', dialClock: 'dashClockDial', touch1: 'dashTouch1', touch2: 'dashTouch2' } as const;
export const PANEL_SLOTS = { LIGHTS: 'panelLights', SEARCH: 'panelSearch', horn: 'panelHorn', ENGINE: 'panelEngine', DECK: 'panelDeck' } as const;
export type ConsoleKey = (typeof DASH_SLOTS)[keyof typeof DASH_SLOTS] | (typeof PANEL_SLOTS)[keyof typeof PANEL_SLOTS];
/** The most columns a dash's grid has, and cells a panel's (a console's longest, 2.2 m, has fewer). */
export const DASH_COLS_MAX = 24;
export const PANEL_CELLS_MAX = 40;
export const CONSOLE_FIELDS: { key: ConsoleKey; steps: number }[] = [
  ...Object.values(DASH_SLOTS).map((key) => ({ key, steps: 1 + 2 * DASH_COLS_MAX })),
  ...Object.values(PANEL_SLOTS).map((key) => ({ key, steps: 1 + PANEL_CELLS_MAX })),
];
/** Everything automatic. */
export const CONSOLE_AUTO = Object.fromEntries(CONSOLE_FIELDS.map((f) => [f.key, 0])) as Record<ConsoleKey, number>;
/** A screen's cell as its field's value, and back (null: automatic). */
export const dashValue = (col: number, row: number) => 1 + col * 2 + row;
export const dashCell = (v: number) => (v ? { col: Math.floor((v - 1) / 2), row: (v - 1) % 2 } : null);
/** A cabin below the deckhouse (design.foreCabin): 0 none, 1 fitted. Not in the code. */
const FORE_CABIN_FIELD: { key: 'foreCabin'; steps: number } = { key: 'foreCabin', steps: 2 };
/** A fish hold (design.fishHold): 0 none, 1 fitted. Not in the code. */
const FISH_HOLD_FIELD: { key: 'fishHold'; steps: number } = { key: 'fishHold', steps: 2 };
/** How many outboards a design has (0: an inboard). */
export const outboardCount = (d: Pick<ShipDesign, 'outboards'>): number => (d.outboards ? d.outboards + 1 : 0);
/** What a guard choice fits: the crew's fenders, and a fixed strake or tyres. */
export function guardParts(guard: number): { fenders: boolean; side: 'strake' | 'tyres' | null } {
  return { fenders: guard === 1 || guard === 4, side: guard === 2 || guard === 4 ? 'strake' : guard === 3 ? 'tyres' : null };
}

/** Every choice with its number of steps, the placed-by-hand ones, the deckhouse's and hull protection too (for checking and merging designs). */
export const ALL_FIELDS: { key: keyof ShipDesign; steps: number }[] = [...FIELDS.map((f) => (f.key === 'hull' ? { ...f, steps: HULL_TYPES } : f.key === 'engine' ? { ...f, steps: ENGINE_TYPES } : f)), ...PLACE_FIELDS, ...DECKHOUSE_FIELDS, GUARD_FIELD, RAIL_FIELD, NARROW_FIELD, NO_ANCHOR_FIELD, SKIFF_FIELD, FACETS_FIELD, FLARE_FIELD, SILLS_FIELD, OUTBOARDS_FIELD, MATERIAL_FIELD, STERN_DRIVE_FIELD, SALOON_FIELD, SALOON_FLOOR_FIELD, SALOON_ROOF_FIELD, ROOF_TOP_FIELD, NOZZLE_FIELD, ROD_RACK_FIELD, CONSOLE_SIDE_FIELD, PODS_FIELD, STACK_STYLE_FIELD, INTERIOR_FIELD, CABIN_FLOOR_FIELD, HOUSE_COLOUR_FIELD, FRAMES_FIELD, HELM_ASSIST_FIELD, OLD_SCHOOL_FIELD, TOUCH_FIELD, CONSOLE_LEN_FIELD, OVERHEAD_FIELD, SHEER_FIELD, FC_LENGTH_FIELD, FC_HEIGHT_FIELD, DH_WALK_FIELD, FORE_CABIN_FIELD, FISH_HOLD_FIELD, ...FURNITURE_FIELDS, ...CONSOLE_FIELDS];

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
  /** The saloon aft of the wheelhouse (m; 0 none): 1.6 .. 4.4. */
  saloon: (i: number) => (i ? 1.2 + 0.4 * i : 0),
  /** The saloon floor below the wheelhouse's (m): 0, then a 0.2 m step each. */
  saloonFloor: (i: number) => 0.2 * i,
  /** The saloon's roof below the wheelhouse's (m): 0, then a 0.2 m step each. */
  saloonRoof: (i: number) => 0.2 * i,
  /** The cockpit overhead's length aft of the house (m; 0 none): 0.25 m a step, to 4 m. */
  overhead: (i: number) => 0.25 * i,
  /** More sheer at the stem (m; 0 her type's own). */
  sheer: (i: number) => Math.round(0.15 * i * 100) / 100,
  /** A raised foredeck's length aft from the stem (m; 0 none): 1 to 8 m in half metres. */
  fcLength: (i: number) => (i ? 0.5 + 0.5 * i : 0),
  /** ...and how much higher than her deck aft of it (m). */
  fcHeight: (i: number) => [0.5, 0.65, 0.8, 1.0][i],
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
  /** Roof visor: how far the roof reaches forward of the top of the front windows (m): 0.15 .. 0.75 (owner: always overhanging, hiding the wipers' works). No longer offered or used (owner): the build uses CONFIG.shipyard.visor; the choice stays in the code so codes read as before. */
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

/** The wheelhouse's choices that are measurements (with its saloon and the deckhouse under it). */
export type MeasureKey = 'housePos' | 'houseLength' | 'houseWidth' | 'headroom' | 'floor' | 'saloon' | 'saloonFloor' | 'saloonRoof' | 'windowRake' | 'roofThickness' | 'roofEdge' | 'dhLength' | 'dhHeight' | 'dhWidth' | 'dhRake';

/**
 * The wheelhouse's measured choices (owner, Oct 2026: designs travel as documents now, so no
 * more squeezing them onto a few steps to keep a typed code short). Each holds its real value:
 * metres, degrees, or a fraction (`housePos` 0 right aft .. 1 right forward of the deck free
 * for it; `houseWidth` of what the deck leaves between side decks), anything from `min` to
 * `max` (a document's value is brought onto that: onMeasure); the Shipyard's slider moves `by`
 * at a time. `code` is the old code's step i's value: a design whose values all sit on those steps
 * still gets a short code (encodeDesign); any other travels as a link or file (designDoc.ts).
 * 0 for `saloon` and `dhLength` is none.
 */
export const MEASURES: Record<MeasureKey, { min: number; max: number; by: number; code: (i: number) => number; steps: number }> = {
  housePos: { min: 0, max: 1, by: 0.01, code: SCALES.housePos, steps: 16 },
  houseLength: { min: 2.4, max: 5.4, by: 0.05, code: SCALES.houseLength, steps: 16 },
  // (Down to 0.4 for a narrow wheelhouse with a short console, CS6; never under CONFIG.shipyard.helm.minInside inside. Under 0.65: a link or file.)
  houseWidth: { min: 0.4, max: 1, by: 0.01, code: SCALES.houseWidth, steps: 8 },
  headroom: { min: 1.9, max: 2.6, by: 0.05, code: SCALES.headroom, steps: 8 },
  floor: { min: -0.6, max: 0.8, by: 0.05, code: SCALES.floor, steps: 8 },
  saloon: { min: 0, max: 4.4, by: 0.1, code: SCALES.saloon, steps: 9 },
  // (Whole steps down: a stair's rise each.)
  saloonFloor: { min: 0, max: 0.6, by: 0.2, code: SCALES.saloonFloor, steps: 4 },
  saloonRoof: { min: 0, max: 0.6, by: 0.05, code: SCALES.saloonRoof, steps: 4 },
  windowRake: { min: -30, max: 30, by: 1, code: SCALES.windowRake, steps: 9 },
  roofThickness: { min: 0.08, max: 0.3, by: 0.01, code: SCALES.roofThickness, steps: 3 },
  roofEdge: { min: 20, max: 60, by: 1, code: SCALES.roofEdge, steps: 4 },
  dhLength: { min: 0, max: 3.5, by: 0.1, code: SCALES.dhLength, steps: 8 },
  dhHeight: { min: 0.4, max: 1.5, by: 0.05, code: SCALES.dhHeight, steps: 5 },
  dhWidth: { min: 0, max: 0.8, by: 0.05, code: SCALES.dhWidth, steps: 4 },
  dhRake: { min: 0, max: 50, by: 1, code: SCALES.dhRake, steps: 3 },
};
export const MEASURE_KEYS = Object.keys(MEASURES) as MeasureKey[];
/**
 * A measured choice, tidied: on its range (to a micrometre). Only the saloon's floor keeps to
 * its steps (whole stairs); any other value between is fine (the slider's step is only the
 * slider's: the old code's steps, a position's fifteenths, needn't sit on it).
 */
export function onMeasure(k: MeasureKey, v: number): number {
  const m = MEASURES[k];
  const on = Math.min(m.max, Math.max(m.min, k === 'saloonFloor' ? Math.round(v / m.by) * m.by : v));
  return Math.round(on * 1e6) / 1e6;
}

/** A design written in the old code's step numbers (the hull types' starting designs, tests) as values. */
export function fromSteps<D extends Partial<ShipDesign>>(d: D): D {
  const out = { ...d } as Record<string, number>;
  for (const k of MEASURE_KEYS) if (out[k] !== undefined) out[k] = Math.round(MEASURES[k].code(out[k]) * 1e6) / 1e6;
  return out as D;
}

/** A design's measured choices back as the old code's step numbers, or null if one isn't on them (no short code holds her). */
export function toSteps(d: ShipDesign): ShipDesign | null {
  const out = { ...d };
  for (const k of MEASURE_KEYS) {
    const m = MEASURES[k];
    // (From the top: the roof edge's old first step reads the same as its second.)
    let i = m.steps - 1;
    while (i >= 0 && Math.abs(m.code(i) - d[k]) > 1e-6) i--;
    if (i < 0) return null;
    out[k] = i;
  }
  return out;
}

/** The page's starting point: the landing craft much as she is. */
export const DEFAULT_DESIGN: ShipDesign = fromSteps({
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
  helmAssist: 0,
  overhead: 0,
  sheer: 0,
  fcLength: 0,
  fcHeight: 2,
  dhWalk: 0,
  foreCabin: 0,
  fishHold: 0,
  ...NO_FURNITURE,
  ...CONSOLE_AUTO,
  ...NO_V10_GEAR,
  // The crew's fenders: what every boat has, at the least.
  guard: 1,
  windowRake: 4,
  lowerFront: 0,
  twin: 0,
  engine: 1,
  gear: 2,
  controls: 1,
  oldSchool: 0,
  touch: 0,
  consoleLen: 0,
  paint: 0,
});

/** The characters a design's code is written in (no I, L, O or U: read as 1, 1, 0, and kept out). */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Every combination of version 10's choices: its codes are the numbers 0 .. this - 1. */
export const COMBINATIONS = FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);

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
export function encodeDesign(design: ShipDesign): string {
  // Her measurements as the code's steps; off them, no code holds her (she travels as a document).
  const d = toSteps(design);
  if (!d) throw new Error('her measurements are between the code’s steps: she travels as a link or file');
  if (d.helmAssist) throw new Error('the helm assist panel isn’t in the code: she travels as a link or file');
  if (d.overhead) throw new Error('the cockpit overhead isn’t in the code: she travels as a link or file');
  if (d.sheer) throw new Error('her extra sheer isn’t in the code: she travels as a link or file');
  if (d.fcLength) throw new Error('a raised foredeck isn’t in the code: she travels as a link or file');
  if (d.dhWalk) throw new Error('the deckhouse’s walked top isn’t in the code: she travels as a link or file');
  if (d.foreCabin) throw new Error('the cabin below isn’t in the code: she travels as a link or file');
  if (d.fishHold) throw new Error('a fish hold isn’t in the code: she travels as a link or file');
  if (FURNITURE_FIELDS.some((f) => d[f.key])) throw new Error('furniture isn’t in the code: she travels as a link or file');
  if (CONSOLE_FIELDS.some((f) => d[f.key])) throw new Error('a console placed by hand isn’t in the code: she travels as a link or file');
  if (d.oldSchool) throw new Error('old school instruments aren’t in the code: she travels as a link or file');
  if (d.touch) throw new Error('touchscreens aren’t in the code: she travels as a link or file');
  if (d.consoleLen) throw new Error('a console of a set length isn’t in the code: she travels as a link or file');
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
  const flare = d.flare ?? 0;
  if (flare !== 0 && flare !== 1) throw new Error(`design flare ${flare} is off its scale (0..1)`);
  const sills = d.sills ?? 0;
  if (!Number.isInteger(sills) || sills < 0 || sills >= SILLS_FIELD.steps) throw new Error(`design sills ${sills} is off its scale (0..${SILLS_FIELD.steps - 1})`);
  const outboards = d.outboards ?? 0;
  if (!Number.isInteger(outboards) || outboards < 0 || outboards >= OUTBOARDS_FIELD.steps) throw new Error(`design outboards ${outboards} is off its scale (0..${OUTBOARDS_FIELD.steps - 1})`);
  const material = d.material ?? 0;
  if (!Number.isInteger(material) || material < 0 || material >= MATERIAL_FIELD.steps) throw new Error(`design material ${material} is off its scale (0..${MATERIAL_FIELD.steps - 1})`);
  const sternDrive = d.sternDrive ?? 0;
  if (sternDrive !== 0 && sternDrive !== 1) throw new Error(`design sternDrive ${sternDrive} is off its scale (0..1)`);
  const saloon = d.saloon ?? 0;
  if (!Number.isInteger(saloon) || saloon < 0 || saloon >= SALOON_FIELD.steps) throw new Error(`design saloon ${saloon} is off its scale (0..${SALOON_FIELD.steps - 1})`);
  const saloonFloor = d.saloonFloor ?? 0;
  if (!Number.isInteger(saloonFloor) || saloonFloor < 0 || saloonFloor >= SALOON_FLOOR_FIELD.steps) throw new Error(`design saloonFloor ${saloonFloor} is off its scale (0..${SALOON_FLOOR_FIELD.steps - 1})`);
  const saloonRoof = d.saloonRoof ?? 0;
  if (!Number.isInteger(saloonRoof) || saloonRoof < 0 || saloonRoof >= SALOON_ROOF_FIELD.steps) throw new Error(`design saloonRoof ${saloonRoof} is off its scale (0..${SALOON_ROOF_FIELD.steps - 1})`);
  const roofTop = d.roofTop ?? 0;
  if (!Number.isInteger(roofTop) || roofTop < 0 || roofTop >= ROOF_TOP_FIELD.steps) throw new Error(`design roofTop ${roofTop} is off its scale (0..${ROOF_TOP_FIELD.steps - 1})`);
  const nozzle = d.nozzle ?? 0;
  if (nozzle !== 0 && nozzle !== 1) throw new Error(`design nozzle ${nozzle} is off its scale (0..1)`);
  const rodRack = d.rodRack ?? 0;
  if (!Number.isInteger(rodRack) || rodRack < 0 || rodRack >= ROD_RACK_FIELD.steps) throw new Error(`design rodRack ${rodRack} is off its scale (0..${ROD_RACK_FIELD.steps - 1})`);
  const consoleSide = d.consoleSide ?? 0;
  if (!Number.isInteger(consoleSide) || consoleSide < 0 || consoleSide >= CONSOLE_SIDE_FIELD.steps) throw new Error(`design consoleSide ${consoleSide} is off its scale (0..${CONSOLE_SIDE_FIELD.steps - 1})`);
  const pods = d.pods ?? 0;
  if (pods !== 0 && pods !== 1) throw new Error(`design pods ${pods} is off its scale (0..1)`);
  const stackStyle = d.stackStyle ?? 0;
  if (!Number.isInteger(stackStyle) || stackStyle < 0 || stackStyle >= STACK_STYLE_FIELD.steps) throw new Error(`design stackStyle ${stackStyle} is off its scale (0..${STACK_STYLE_FIELD.steps - 1})`);
  const interior = d.interior ?? 0;
  if (!Number.isInteger(interior) || interior < 0 || interior >= INTERIOR_FIELD.steps) throw new Error(`design interior ${interior} is off its scale (0..${INTERIOR_FIELD.steps - 1})`);
  const cabinFloor = d.cabinFloor ?? 0;
  if (!Number.isInteger(cabinFloor) || cabinFloor < 0 || cabinFloor >= CABIN_FLOOR_FIELD.steps) throw new Error(`design cabinFloor ${cabinFloor} is off its scale (0..${CABIN_FLOOR_FIELD.steps - 1})`);
  const houseColour = d.houseColour ?? 0;
  if (!Number.isInteger(houseColour) || houseColour < 0 || houseColour >= HOUSE_COLOUR_FIELD.steps) throw new Error(`design houseColour ${houseColour} is off its scale (0..${HOUSE_COLOUR_FIELD.steps - 1})`);
  const frames = d.frames ?? 0;
  if (frames !== 0 && frames !== 1) throw new Error(`design frames ${frames} is off its scale (0..1)`);
  // From the top: the frames, the house's colour, the floor, the interior finish, the exhaust stacks' style, pod drives, the console's side, the rod rack, the roof's top colour and the saloon's roof, the nozzle, the saloon's floor and length, stern drives, the material, the outboards, the sills, the raked-out windows, a later engine, the facets, a later hull type, the skiff, no anchor, the narrow deckhouse,
  // no rails, protection (each 0: as before).
  const top = (((((((((((((((((((((((BigInt(frames) * BigInt(HOUSE_COLOUR_FIELD.steps) + BigInt(houseColour)) * BigInt(CABIN_FLOOR_FIELD.steps) + BigInt(cabinFloor)) * BigInt(INTERIOR_FIELD.steps) + BigInt(interior)) * BigInt(STACK_STYLE_FIELD.steps) + BigInt(stackStyle)) * BigInt(PODS_FIELD.steps) + BigInt(pods)) * BigInt(CONSOLE_SIDE_FIELD.steps) + BigInt(consoleSide)) * BigInt(ROD_RACK_FIELD.steps) + BigInt(rodRack)) * BigInt(ROOF_TOP_FIELD.steps) + BigInt(roofTop)) * BigInt(SALOON_ROOF_FIELD.steps) + BigInt(saloonRoof)) * BigInt(NOZZLE_FIELD.steps) + BigInt(nozzle)) * BigInt(SALOON_FLOOR_FIELD.steps) + BigInt(saloonFloor)) * BigInt(SALOON_FIELD.steps) + BigInt(saloon)) * BigInt(STERN_DRIVE_FIELD.steps) + BigInt(sternDrive)) * BigInt(MATERIAL_FIELD.steps) + BigInt(material)) * BigInt(OUTBOARDS_FIELD.steps) + BigInt(outboards)) * BigInt(SILLS_FIELD.steps) + BigInt(sills)) * BigInt(FLARE_FIELD.steps) + BigInt(flare)) * BigInt(MORE_ENGINES) + BigInt(moreEngine)) * BigInt(FACETS_FIELD.steps) + BigInt(facets)) * BigInt(MORE_HULLS) + BigInt(more)) * BigInt(SKIFF_FIELD.steps) + BigInt(skiff)) * 2n + BigInt(noAnchor)) * 2n + BigInt(narrow)) * BigInt(RAIL_FIELD.steps) + BigInt(rails);
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
function unpackPlaces(ext: bigint): (Pick<ShipDesign, PlaceKey | DeckhouseKey | 'guard' | 'rails' | 'dhNarrow' | 'noAnchor' | 'skiff' | 'facets' | 'flare' | 'sills' | 'outboards' | 'material' | 'sternDrive' | 'saloon' | 'saloonFloor' | 'nozzle' | 'saloonRoof' | 'roofTop' | 'rodRack' | 'consoleSide' | 'pods' | 'stackStyle' | 'interior' | 'cabinFloor' | 'houseColour' | 'frames'> & { more: number; moreEngine: number }) | { error: string } {
  const out = { craneAt: 0, lampAt: 0, monitorAt: 0, winchAt: 0, dhLength: 0, dhHeight: 0, dhWidth: 0, dhRake: 0, guard: 0, rails: 0, dhNarrow: 0, noAnchor: 0, skiff: 0, facets: 0, flare: 0, sills: 0, outboards: 0, material: 0, sternDrive: 0, saloon: 0, saloonFloor: 0, nozzle: 0, saloonRoof: 0, roofTop: 0, rodRack: 0, consoleSide: 0, pods: 0, stackStyle: 0, interior: 0, cabinFloor: 0, houseColour: 0, frames: 0, more: 0, moreEngine: 0 };
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
  up /= BigInt(FACETS_FIELD.steps);
  const moreEngine = up % BigInt(MORE_ENGINES);
  up /= BigInt(MORE_ENGINES);
  const flare = up % BigInt(FLARE_FIELD.steps);
  up /= BigInt(FLARE_FIELD.steps);
  const sills = up % BigInt(SILLS_FIELD.steps);
  up /= BigInt(SILLS_FIELD.steps);
  const outboards = up % BigInt(OUTBOARDS_FIELD.steps);
  up /= BigInt(OUTBOARDS_FIELD.steps);
  const material = up % BigInt(MATERIAL_FIELD.steps);
  up /= BigInt(MATERIAL_FIELD.steps);
  const sternDrive = up % BigInt(STERN_DRIVE_FIELD.steps);
  up /= BigInt(STERN_DRIVE_FIELD.steps);
  const saloon = up % BigInt(SALOON_FIELD.steps);
  up /= BigInt(SALOON_FIELD.steps);
  const saloonFloor = up % BigInt(SALOON_FLOOR_FIELD.steps);
  up /= BigInt(SALOON_FLOOR_FIELD.steps);
  const nozzle = up % BigInt(NOZZLE_FIELD.steps);
  up /= BigInt(NOZZLE_FIELD.steps);
  const saloonRoof = up % BigInt(SALOON_ROOF_FIELD.steps);
  up /= BigInt(SALOON_ROOF_FIELD.steps);
  const roofTop = up % BigInt(ROOF_TOP_FIELD.steps);
  up /= BigInt(ROOF_TOP_FIELD.steps);
  const rodRack = up % BigInt(ROD_RACK_FIELD.steps);
  up /= BigInt(ROD_RACK_FIELD.steps);
  const consoleSide = up % BigInt(CONSOLE_SIDE_FIELD.steps);
  up /= BigInt(CONSOLE_SIDE_FIELD.steps);
  const pods = up % BigInt(PODS_FIELD.steps);
  up /= BigInt(PODS_FIELD.steps);
  const stackStyle = up % BigInt(STACK_STYLE_FIELD.steps);
  up /= BigInt(STACK_STYLE_FIELD.steps);
  const interior = up % BigInt(INTERIOR_FIELD.steps);
  up /= BigInt(INTERIOR_FIELD.steps);
  const cabinFloor = up % BigInt(CABIN_FLOOR_FIELD.steps);
  up /= BigInt(CABIN_FLOOR_FIELD.steps);
  const houseColour = up % BigInt(HOUSE_COLOUR_FIELD.steps);
  const frames = up / BigInt(HOUSE_COLOUR_FIELD.steps);
  if (frames >= BigInt(FRAMES_FIELD.steps)) return { error: `that code is from a newer Shipyard than this game (it reads versions 1 to ${DESIGN_VERSION})` };
  out.rodRack = Number(rodRack);
  out.consoleSide = Number(consoleSide);
  out.pods = Number(pods);
  out.stackStyle = Number(stackStyle);
  out.interior = Number(interior);
  out.cabinFloor = Number(cabinFloor);
  out.houseColour = Number(houseColour);
  out.frames = Number(frames);
  out.nozzle = Number(nozzle);
  out.more = Number(more);
  out.moreEngine = Number(moreEngine);
  out.flare = Number(flare);
  out.sills = Number(sills);
  out.outboards = Number(outboards);
  out.material = Number(material);
  out.sternDrive = Number(sternDrive);
  out.saloon = Number(saloon);
  out.saloonFloor = Number(saloonFloor);
  out.saloonRoof = Number(saloonRoof);
  out.roofTop = Number(roofTop);
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
    const read = s.length > 17 ? unpackPlaces(all & ((1n << extBits) - 1n)) : { craneAt: 0, lampAt: 0, monitorAt: 0, winchAt: 0, dhLength: 0, dhHeight: 0, dhWidth: 0, dhRake: 0, guard: 0, rails: 0, dhNarrow: 0, noAnchor: 0, skiff: 0, facets: 0, flare: 0, sills: 0, outboards: 0, material: 0, sternDrive: 0, saloon: 0, saloonFloor: 0, nozzle: 0, saloonRoof: 0, roofTop: 0, rodRack: 0, consoleSide: 0, pods: 0, stackStyle: 0, interior: 0, cabinFloor: 0, houseColour: 0, frames: 0, more: 0, moreEngine: 0 };
    if ('error' in read) return read;
    const { more, moreEngine, ...places } = read;
    type Base = Omit<ShipDesign, PlaceKey | DeckhouseKey | 'guard' | 'rails' | 'dhNarrow' | 'noAnchor' | 'skiff' | 'facets' | 'flare' | 'sills' | 'outboards' | 'material' | 'sternDrive' | 'saloon' | 'saloonFloor' | 'nozzle' | 'saloonRoof' | 'roofTop' | 'rodRack' | 'consoleSide' | 'pods' | 'stackStyle' | 'interior' | 'cabinFloor' | 'houseColour' | 'frames' | 'helmAssist'>;
    const v10 = unpack<Base>(base, FIELDS as { key: keyof Base; steps: number }[]);
    if (!('design' in v10)) return v10;
    // A later hull type: its first 16 characters hold hull 0.
    if (more && v10.design.hull !== 0) return { error: 'that code is off the scales (no design has it)' };
    // A later engine: its first 16 characters hold engine 0.
    if (moreEngine && v10.design.engine !== 0) return { error: 'that code is off the scales (no design has it)' };
    return { design: fromSteps({ ...tidy(v10.design), ...places, helmAssist: 0, overhead: 0, sheer: 0, fcLength: 0, fcHeight: 2, dhWalk: 0, foreCabin: 0, fishHold: 0, ...NO_FURNITURE, ...CONSOLE_AUTO, oldSchool: 0, touch: 0, consoleLen: 0, ...(more ? { hull: BASE_HULLS - 1 + more } : {}), ...(moreEngine ? { engine: BASE_ENGINES - 1 + moreEngine } : {}) }) };
  }
  // Codes from before version 10 (shorter than 17 characters) are retired (owner, Oct 2026: no need to keep old designs).
  return { error: `a design code has 17 characters (this has ${s.length})${s.length >= 10 ? ': codes from older Shipyards no longer open' : ''}` };
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

/**
 * The check character: the characters weighted 1, 3, 5 ..., summed mod 32. Odd weights have an
 * inverse mod 32, so changing any one character always changes the sum.
 */
function check(syms: number[]): number {
  let a = 0;
  for (let i = 0; i < syms.length; i++) a = (a + (2 * i + 1) * syms[i]) % 32;
  return a;
}
