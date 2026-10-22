/**
 * The shapes of the world's level data: what a region is made of. Plain data, no code.
 * The regions themselves are in regions/ (one file each); archipelago.ts joins them into
 * the flat lists the rest of the game reads (ISLANDS, PORTS, ...).
 *
 * World axes: +X east, -Z north, metres; heights above mean sea level (MSL = y 0).
 */

import type { RegionCoast } from './coastRegion';

export interface IslandDef {
  name: string;
  x: number;
  z: number;
  /** Mean coastline radius (m). */
  radius: number;
  /** Peak height (m). */
  height: number;
  /** Coastline wobble: [harmonic k, relative amplitude, phase (rad)]. */
  shape: [number, number, number][];
  /** Width of the gentle beach slope at the coast (m); small = rocky shore. */
  beach: number;
  /** Seed for the hills and trees. */
  seed: number;
  /** Trees per 100 m² of suitable ground (0 = bare rock). */
  trees: number;
  /**
   * How far inland (fraction of the radius) the hills take to reach their full height
   * (regions: mountains). Unset: 0.75, the gentle islands of home and the Sounds; a fjord's
   * mountain sides rise in a third of that.
   */
  rise?: number;
}

/**
 * A channel cut through the land (regions: a fjord, a narrows): the ground within
 * `halfWidth` m of the line through `points` is lowered to `depth` below MSL, rising back to
 * the land over `edge` m (a steep wall when the land beside it is high). Each point is
 * [x, z, halfWidth]: the width eases from point to point, so a fjord can narrow to a gap and
 * open into a basin. The surface width is about twice the half-width.
 */
export interface ChannelDef {
  name: string;
  points: [number, number, number][];
  depth: number;
  edge: number;
}

/** A dredged basin or natural bay: terrain inside is lowered to `depth` below MSL. */
export interface CutDef {
  x: number;
  z: number;
  radius: number;
  depth: number;
  /** Width of the sloping edge (m). */
  edge: number;
}

/**
 * A shallow bank (regions: the Narrows' flats): the seabed inside is brought UP to `depth`
 * below MSL (never lowered), easing back over `edge` m at the rim. Open water to look at, too
 * shallow to cross: a channel (ChannelDef) dredged through it is the way, and its marks
 * show where. Laid on after the islands, before the cuts and channels.
 */
export interface ShoalDef {
  x: number;
  z: number;
  radius: number;
  depth: number;
  edge: number;
}

/** Levelled ground (waterfronts): land inside is brought down to `height` (never raised). */
export interface FlatDef {
  x: number;
  z: number;
  radius: number;
  height: number;
  /** Width of the blend back to natural ground (m). */
  edge: number;
}

/** Rubble-mound breakwater from (ax, az) to (bx, bz). */
export interface RidgeDef {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Crest height above MSL (m), crest half-width (m), side slope (rise per run). */
  crest: number;
  halfWidth: number;
  slope: number;
  /** Drawn as rubble (breakwaters, reefs); false for a shape something else draws (a wreck's hull). */
  drawn?: boolean;
}

/**
 * A solid box the boat collides with: quay walls, pier decks (treated as solid to the
 * seabed), pontoons. Local Z runs along `yawDeg` (compass bearing of the long axis).
 */
export interface BlockDef {
  /** `barge`: a moored steel barge (a fish farm's feed barge), solid like the others. */
  kind: 'quay' | 'pier' | 'barge';
  x: number;
  z: number;
  /** Half-length along the axis, half-width across it (m). */
  halfLength: number;
  halfWidth: number;
  yawDeg: number;
  /** Deck height above MSL (m). */
  top: number;
  /** Rubber fenders along the faces (softer, slippery contact). */
  fendered: boolean;
  /** A fish farm's cage ring or mussel line (world/farms.ts): solid, but no berth to tie up at. */
  farm?: boolean;
}

export interface BuildingDef {
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Wall height (m); the pitched roof adds about half the width. */
  height: number;
  yawDeg: number;
  wall: number;
  roof: number;
  /**
   * What the walls are clad in, painted on (pixel paint): weatherboard, render, or corrugated
   * sheet (a shed: its roof is sheet too; the others are slated). Unset: render.
   */
  cladding?: 'boards' | 'render' | 'sheet' | 'stone';
  /**
   * The house kit (world/view/houseKit.ts; the coast pipeline's houses.ts): its type, roof
   * shape, floors, a roof rise when tagged (m), its door's colour and a pub's or shop's sign,
   * which long side faces the water (`front`, ±1 across) and which end (`gable`, ±1 along: a
   * warehouse's or boathouse's doors), a terrace's houses (their front colours, in order
   * along it), a seed for its small choices, and `plain` (a block: no chimneys, doors or
   * signs). Unset: the old pitched box (the hand-built regions).
   */
  kind?: 'cottage' | 'house' | 'terrace' | 'shed' | 'church' | 'warehouse' | 'boathouse' | 'castle' | 'ruin';
  roofShape?: 'gabled' | 'hipped' | 'flat' | 'pyramidal' | 'skillion';
  roofRise?: number;
  levels?: number;
  door?: number;
  sign?: number;
  front?: 1 | -1;
  gable?: 1 | -1;
  units?: number[];
  seed?: number;
  plain?: boolean;
}

export interface LightDef {
  name: string;
  x: number;
  z: number;
  /** Height of the lamp above MSL (m). */
  y: number;
  /** (Yellow: a special mark's, a fish farm's corner buoys.) */
  color: 'red' | 'green' | 'white' | 'yellow';
  /** Flash period (s); 0 = fixed light. */
  period: number;
  /** Tower to draw under it. */
  tower: 'post' | 'lighthouse' | 'none';
}

export interface ShelterDef {
  x: number;
  z: number;
  /** Full shelter inside rIn, none beyond rOut. */
  rIn: number;
  rOut: number;
  /** Wave amplitude multiplier at full shelter (0 = flat calm). */
  factor: number;
  /**
   * Shelter with a gap (regions): the bay is open to seas coming FROM bearings within
   * `openArcDeg` either side of `openFromDeg` (the sea's direction of travel is the
   * opposite). From those the shelter fades to none; from everywhere else it is full.
   * Unset: sheltered from every direction (a harbour basin).
   */
  openFromDeg?: number;
  openArcDeg?: number;
}

export interface PortDef {
  id: string;
  name: string;
  kind: 'anchorage' | 'pier' | 'harbour';
  /** Approach / reference point for bearings. */
  x: number;
  z: number;
  /**
   * Fuel berth: the boat's origin within `radius` of (x, z), nearly stopped. The pump
   * stands on the quay/pier deck at (pumpX, pumpZ).
   */
  fuel?: { x: number; z: number; radius: number; pumpX: number; pumpZ: number };
  /** Keep trees off the waterfront around here (m). */
  clearRadius: number;
  /**
   * Cargo: where the boat must be to load/unload (`berth`: alongside, nearly stopped;
   * `anchorage`: the anchor set within the circle - goods come off the beach by tender),
   * where waiting cargo stands ashore (stack origin and the bearing the row runs along),
   * and the colour that marks cargo bound for this port.
   */
  cargo: {
    berth?: { x: number; z: number; radius: number };
    anchorage?: { x: number; z: number; radius: number };
    stackX: number;
    stackZ: number;
    stackYawDeg: number;
    color: number;
  };
  /**
   * The anchorage's bottom (regions): what the anchor holds in. Scales the anchor's holding
   * power (CONFIG.anchor.bottomHolding): sand holds well, mud less, rock and weed poorly.
   * Unset: sand.
   */
  bottom?: 'sand' | 'mud' | 'rock' | 'weed';
  /**
   * What this port offers, where it differs from the game's defaults (regions: every region
   * has a reason to go). All optional:
   *   fuelPrice  £ per litre at its fuel berth (else CONFIG.career.costs.fuelPerL)
   *   repairs    the yard's repair prices as a factor on CONFIG.career.repairs (1 = the
   *              standard rate), or false: no repairs here
   *   sells      the upgrade ids on offer at its yard (else the game's default list)
   *   buys       price factors by what's sold here: 'fish' (fish boxes), 'shellfish' (pot
   *              catch), 'log' (salvage), 'cargo' (deliveries); unset = 1
   *   products   cargo kinds (names) that ship out of here; `needs` the kinds wanted here.
   *              Runs are made from a port's products to a port that needs them; a port
   *              without either takes part in every run, as before.
   */
  economy?: {
    fuelPrice?: number;
    repairs?: { hull: number; engine: number } | false;
    sells?: string[];
    buys?: Partial<Record<'fish' | 'shellfish' | 'log' | 'cargo', number>>;
    products?: string[];
    needs?: string[];
  };
}

/**
 * Buoys marking the hazards (owner request), IALA region A (red to port entering):
 *   N, E, S, W   cardinal marks: pass on the named side of the mark (a north cardinal has
 *                safe water to its north). Pillar buoys, black and yellow, two cone topmarks.
 *   isolated     isolated danger, moored on the danger itself: black with a red band, two
 *                black balls.
 *   port, stbd   lateral marks on the approach to Calder Haven: red can, green cone.
 * Lights (navMarks.ts LIGHT_CHARACTERS) are the IALA characters for each kind.
 */
export type MarkKind = 'N' | 'E' | 'S' | 'W' | 'isolated' | 'port' | 'stbd';
export interface MarkDef {
  name: string;
  kind: MarkKind;
  x: number;
  z: number;
}

/**
 * Potting grounds (potting/potting.ts; owner's feature): where a potter would shoot creels -
 * rocky ground round headlands and islands in 6-25 m of water, not sand. A circle (world
 * x, z, radius m) and how good the ground is (0..1: more and better catch). Data, so free
 * roam and procedural coasts can place them later.
 */
export interface PottingGround {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  quality: number;
}

/** Wrecks drawn in the world (their solid part is a RIDGES entry with `drawn: false`). */
export interface WreckDef {
  name: string;
  x: number;
  z: number;
  /** Which way her bow points (deg, 0 north, clockwise). */
  headingDeg: number;
  length: number;
  /** How far she lies over (deg, + to starboard). */
  listDeg: number;
}

/**
 * Landing slipways (owner, Oct 2026: for the bow-ramp boats): a concrete slip running up out
 * of the water, a boat with a bow ramp lands on it bow first, her ramp down on the concrete
 * (world/slipway.ts). (x, z) is the middle of its top edge, ashore, `top` m above MSL there;
 * it runs down `slope` per metre, `length` m, the other way from `headingDeg` (the bearing up
 * the slip: where a landed boat's bow points). `width` m across, kerbed each side.
 */
export interface SlipwayDef {
  id: string;
  portId: string;
  name: string;
  x: number;
  z: number;
  headingDeg: number;
  width: number;
  length: number;
  top: number;
  slope: number;
}


/**
 * Berths you can dock at (the mooring cleats). Where the boat's origin lies when moored
 * (alongside, fenders touching), the berth's axis (compass bearing; the boat may lie
 * either way round), and the unit vector + distance from the boat's centreline to the
 * quay/pier edge, where the mooring lines go ashore. `deckY` is that edge's height.
 */
export interface BerthDef {
  id: string;
  portId: string;
  name: string;
  x: number;
  z: number;
  headingDeg: number;
  shoreX: number;
  shoreZ: number;
  shoreDist: number;
  deckY: number;
  /** How far each of its two bollards (or cleats) stands from its middle, along the face (m); unset: 6 (world/berths.ts). */
  bollardHalf?: number;
}


/** Lamp posts on quays and piers (a warm glow each; see PORT_FLOODS for the real light). */
export interface LampDef {
  x: number;
  z: number;
  /** Lamp height above MSL (m). */
  y: number;
}


/** The real light over a port's berths (one per port; only the nearest port's is lit). */
export interface PortFloodDef {
  portId: string;
  x: number;
  y: number;
  z: number;
}

/** A patch of thick fog: visibility inside falls to `visibility` m (full strength inside r/2). */
export interface FogBankDef {
  x: number;
  z: number;
  r: number;
  visibility: number;
}

/** A trawling ground (fishing/fishing.ts): a circle and how rich it is (1 = CONFIG.fishing.boxEvery per box). */
export interface FishingGroundDef {
  name: string;
  x: number;
  z: number;
  radius: number;
  richness: number;
  /** What's caught here (regions): named on the fish box, priced by the buyer. */
  species?: string;
}

/**
 * A tall feature you steer for from the next region (the regions brief): a hill with a
 * cairn, a lighthouse on a high point, a mast, a chapel. `height` is its top above MSL (m);
 * how far off it can be seen follows from that and the day's visibility (milestone 2).
 */
export interface LandmarkDef {
  name: string;
  kind: 'hill' | 'lighthouse' | 'mast' | 'chapel';
  x: number;
  z: number;
  height: number;
}

/**
 * A tidal race as a current zone (the regions brief, section 4; world/currents.ts). No tide
 * model: the water in the zone runs along `setDeg` at `peakKn` x sin(2 pi (t - phaseH) /
 * periodH), t the game clock in hours, so it floods one way, slackens, and ebbs back the
 * other, `periodH` hours a full cycle (choose a divisor of 24 so midnight is no jump). Slack
 * is at phaseH + k x periodH / 2. The zone is an oriented rectangle: `length` m along the
 * set, `width` m across, fading in over CONFIG.currents.edgeFade m inside its edges.
 * Inside, the waves stand up (`waveFactor` x their amplitude at peak) and `knocks` whirl
 * points knock the helm about as you pass. The chart prints the peak, the cycle and the
 * slack times; the forecast says whether it's running.
 */
export interface CurrentZoneDef {
  id: string;
  name: string;
  x: number;
  z: number;
  length: number;
  width: number;
  /** Where the water goes on the flood half (deg, 0 north, clockwise). */
  setDeg: number;
  peakKn: number;
  periodH: number;
  phaseH: number;
  waveFactor: number;
  knocks: number;
}

/**
 * A region's jobs (the brief, layer 5): what breaks down and what needs moving there. The
 * job systems pick from the region the home boat is in; a region without a list gets the
 * game's open-water mix. `at`: where the job happens (within `r` m of the spot, in open
 * water), else ahead of the boat as always. `name`: how the radio describes the tow (else
 * the kind's own words).
 */
export interface RegionJobs {
  tows?: { kind: string; weight: number; name?: string; at?: { x: number; z: number; r: number } }[];
  rescues?: { def: string; weight: number; at?: { x: number; z: number; r: number } }[];
}

/**
 * A region's weather profile (the brief, layer 2): the director's odds of what follows each
 * preset (CONFIG.weather.next for the game's default), and how long a preset holds (s).
 * The host uses the profile of the region the home boat is in.
 */
export interface RegionWeather {
  next: Record<string, Partial<Record<string, number>>>;
  hold?: [number, number];
  /**
   * Katabatic gusts (a mountainous region): one falls on one of the region's gust zones
   * every `every` s (a random time between the two), lasting `last` s, while the weather's
   * own wind is light (CONFIG.gusts.maxBaseWind).
   */
  katabatic?: { every: [number, number]; last: [number, number] };
  /**
   * Morning fog (the Narrows): a change of weather due to begin between `from` and `to`
   * o'clock is to fog, `chance` of the time (a cold night's fog over calm water).
   */
  morningFog?: { from: number; to: number; chance: number };
}

/**
 * A region's look (the brief, layer 1): the colours of its ground and where its trees grow.
 * All optional; unset, the look of home and the Sounds (grass and heather, trees up to 40 m
 * on gentle ground).
 *   grass, heath, rock  ground colours (hex); heath above `heathAbove` m
 *   snowAbove           ground above this is snow (m)
 *   treesTo             trees grow up to this height (m)
 *   treeSlope           ...on ground no steeper than this (rise per metre)
 */
export interface RegionTheme {
  grass?: number;
  heath?: number;
  rock?: number;
  heathAbove?: number;
  snowAbove?: number;
  treesTo?: number;
  treeSlope?: number;
}

/**
 * A waterfall (drawn only): a ribbon of white water down the ground from (x, z) on the
 * heights to (toX, toZ) at the water's edge, `width` m across.
 */
export interface FallDef {
  x: number;
  z: number;
  toX: number;
  toZ: number;
  width: number;
}

/**
 * A fish farm (the Fjord): `rows` x `cols` floating cage rings of `ringRadius` m, `spacing`
 * m apart centre to centre, in a grid turned to `yawDeg` (its rows run along that bearing)
 * from its first ring at (x, z). The rings are solid to a boat (world/farms.ts makes each a
 * low block). The farm's feed barge is one of the region's blocks (`barge`); its goods and
 * berth are a port's.
 */
/** The game's harbour-boat designs (world/view/harbourBoatKit.ts): original small craft. */
export type HarbourBoatKind = 'creel' | 'yacht' | 'cruiser' | 'rib' | 'caique';

/** Where a harbour boat lies on a mooring or at anchor (the coast pipeline's boats stage). */
export interface HarbourBoatSpot {
  x: number;
  z: number;
  /** Water there (m). */
  depth: number;
  /** The harbour or anchorage it belongs to. */
  harbour: string;
  kind: 'mooring' | 'anchor';
  /** One of the map's own mooring buoys (else laid by the pipeline). */
  mapped?: boolean;
}

/** A region's harbour boats (the settlements brief, Part C): its moorings and anchor spots, and which kinds lie where. */
export interface HarbourBoatsDef {
  style: {
    alongside: [HarbourBoatKind, number][];
    moored: [HarbourBoatKind, number][];
    anchored: [HarbourBoatKind, number][];
    hulls: number[];
    moorings: number;
  };
  spots: HarbourBoatSpot[];
}

export interface FarmDef {
  name: string;
  /** Cage rings in a grid (a fish farm: the Fjord's, and a coast map's mapped as fish), or rows of mussel long-lines (the coast extras plan, C2). Unset: cages. */
  kind?: 'cages' | 'lines';
  /** The first ring's middle (cages), or the first line's start (lines). */
  x: number;
  z: number;
  /** The rows run along this bearing (deg). */
  yawDeg: number;
  rows: number;
  cols: number;
  /** Between rings, or between lines (m). */
  spacing: number;
  ringRadius: number;
  /** Lines: each line's length (m). */
  lineLength?: number;
  /** The lease's corners, each with a yellow special mark (a coast map's: its light is in the region's lights). */
  corners?: [number, number][];
}

/**
 * A place name from the map (the coast extras plan, C4; a coast map's): a town, village,
 * island or islet, or the sea's own (a bay, a headland, a strait). On the charts by `rank`
 * (1 shown farthest out, 4 only close in), and in the radio's calls (world/places.ts).
 */
export interface PlaceDef {
  name: string;
  kind: string;
  x: number;
  z: number;
  rank: number;
}

/**
 * What stands up against the sky from the sea (the coast extras plan, C2; a coast map's,
 * from the map data): drawn by world/view/skylineView.ts, on the paper chart as a chart's
 * landmark symbols. `height` (m) where the map tags it, else the kind's own; `size` its
 * footprint's span where mapped as an area (m).
 */
export interface SkylineDef {
  kind: 'castle' | 'tower' | 'mast' | 'chimney' | 'water_tower' | 'monument' | 'turbine' | 'church';
  name: string;
  x: number;
  z: number;
  height?: number;
  size?: number;
}

/**
 * Katabatic gusts (the Fjord): cold air falling off the mountains in a sudden squall over the
 * water inside the circle, blowing from `fromDeg` at up to `peakMs` m/s in the middle. When
 * they come is the region's weather profile (`katabatic`); how they rise and fall,
 * CONFIG.gusts.
 */
export interface GustZoneDef {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  fromDeg: number;
  peakMs: number;
}

/** A region's footprint on the map (world m): all its data lies inside; open water between regions belongs to none. */
export interface RegionBounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * A region: one self-contained map area (the regions brief, PROGRESS.md "Regions"). Home
 * (Calder, Brannock, Rona) is one; each new area is another file in regions/. Everything
 * the game needs to simulate, draw and chart the area is in here, so a region is data,
 * never code of its own.
 *
 * Milestone 1 holds the geography and the sea marks. The brief's other layers come with
 * the milestones that use them: the drawing theme and weather profile, fish and goods,
 * the job templates, and the current zones (tidal races).
 */
/**
 * A boatyard's yard (the shed is one of the region's buildings; its board: CONFIG.boatyard):
 * a small fixed yard crane, its jib out toward `jibDeg` (compass), and old boats laid up
 * ashore on blocks, rusting (bow toward `headingDeg`; sizes in m; `house`: a wheelhouse aft).
 */
export interface YardDef {
  crane: { x: number; z: number; jibDeg: number };
  boats: { x: number; z: number; headingDeg: number; length: number; beam: number; depth: number; house: boolean }[];
}

export interface RegionDef {
  /** Stable id (saves and multiplayer may name it; never rename). */
  id: string;
  name: string;
  bounds: RegionBounds;
  landmarks: LandmarkDef[];
  /**
   * Lean high ground (optional): inland above `above` m the drawn terrain merges `cells` x
   * `cells` of the usual 6 m cells into one, so a big, high island stays cheap on the Quest.
   * The coast and the shallows keep the full detail. Home has none (it stays exactly as it was).
   */
  leanTerrain?: { above: number; cells: number };
  islands: IslandDef[];
  /** Fjords and narrows cut through the land (regions). */
  channels?: ChannelDef[];
  /** Shallow banks (regions: the Narrows' flats). */
  shoals?: ShoalDef[];
  cuts: CutDef[];
  flats: FlatDef[];
  ridges: RidgeDef[];
  blocks: BlockDef[];
  buildings: BuildingDef[];
  /** Boatyards' cranes and laid-up boats (drawn only: no collision, like the buildings). */
  yards?: YardDef[];
  marks: MarkDef[];
  wrecks: WreckDef[];
  lights: LightDef[];
  shelters: ShelterDef[];
  ports: PortDef[];
  berths: BerthDef[];
  slipways: SlipwayDef[];
  lamps: LampDef[];
  portFloods: PortFloodDef[];
  pottingGrounds: PottingGround[];
  fishingGrounds: FishingGroundDef[];
  fogBanks: FogBankDef[];
  /** Tidal races (milestone 3). */
  currents: CurrentZoneDef[];
  /** Its jobs and its weather (milestone 4); absent: the game's defaults. */
  jobs?: RegionJobs;
  weather?: RegionWeather;
  /** Its look (milestone 5); absent: home's. */
  theme?: RegionTheme;
  /** Waterfalls, fish farms, katabatic gust zones (milestone 5: the Fjord). */
  falls?: FallDef[];
  farms?: FarmDef[];
  /** What stands up against its sky (castles, masts, turbines...; a coast map's), and the region's look for them ('aegean': white chapels with domes). */
  skyline?: SkylineDef[];
  skylineStyle?: string;
  /** Its place names (a coast map's, from the map data): charts and radio calls. */
  places?: PlaceDef[];
  /** Boats lying in its harbours, on moorings and at anchor (a coast map's; world/harbourBoats.ts). */
  harbourBoats?: HarbourBoatsDef;
  gusts?: GustZoneDef[];
  /**
   * A coast region (real coastline from open map data, tools/coast; coastRegion.ts): its
   * package and where its origin sits in the world. Its ground is the package's mesh
   * (coastTerrain.ts), not islands.
   */
  coast?: RegionCoast;
}
