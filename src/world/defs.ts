/**
 * The shapes of the world's level data: what a region is made of. Plain data, no code.
 * The regions themselves are in regions/ (one file each); archipelago.ts joins them into
 * the flat lists the rest of the game reads (ISLANDS, PORTS, ...).
 *
 * World axes: +X east, -Z north, metres; heights above mean sea level (MSL = y 0).
 */

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
  kind: 'quay' | 'pier';
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
  cladding?: 'boards' | 'render' | 'sheet';
}

export interface LightDef {
  name: string;
  x: number;
  z: number;
  /** Height of the lamp above MSL (m). */
  y: number;
  color: 'red' | 'green' | 'white';
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
  cuts: CutDef[];
  flats: FlatDef[];
  ridges: RidgeDef[];
  blocks: BlockDef[];
  buildings: BuildingDef[];
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
}
