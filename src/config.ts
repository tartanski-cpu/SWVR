import { VESSELS_CONFIG } from './config/vessels';
import { SHIPYARD_CONFIG } from './config/shipyard';
import { MODULES_CONFIG } from './config/modules';
import { MAP_CONFIG } from './config/map';
/**
 * Every tunable number in the game lives here, grouped by module.
 * Units are SI (metres, seconds, kilograms, radians) unless the name says otherwise.
 */
export type WeatherPresetName = 'Clear' | 'Overcast' | 'Fog' | 'Rain' | 'Squall';

/** A construction project (CONFIG.career.projects; career/projects.ts). */
export interface ProjectDef {
  id: string;
  name: string;
  /** The harbour office that offers it, and whose quay its buoys wait on. */
  port: string;
  minRep: number;
  desc: string;
  bonus: number;
  /** Where the turbines go (world x, z; the landing's bearing): the later stages build them. */
  turbines: { x: number; z: number; landingDeg: number }[];
  stages: { name: string; bonus: number; jobs: ProjectJobDef[] }[];
}
/** A job in a project's stage: a survey line run, or a mark buoy laid (see CONFIG.career.projects). */
export type ProjectJobDef =
  | { id: string; kind: 'survey'; name: string; from: [number, number]; to: [number, number]; pay: number }
  | { id: string; kind: 'buoy'; name: string; mark: 'N' | 'E' | 'S' | 'W' | 'special'; at: [number, number]; pay: number }
  | { id: string; kind: 'tow'; name: string; tow: string; turbine?: number; pay: number }
  | { id: string; kind: 'supply'; name: string; cargo: string; count: number; pay: number }
  | { id: string; kind: 'guard'; name: string; pay: number }
  | { id: string; kind: 'transfer'; name: string; turbine: number; techs: number; pay: number; commission?: boolean };

/** A career upgrade, bought at the yard (CONFIG.career.upgrades). */
export interface CareerUpgrade {
  id: string;
  name: string;
  price: number;
  /** The best port reputation needed to buy it. */
  minRep: number;
  desc: string;
  /** A module her boat must carry to take it (its id), and what to call it ("Needs the trawl gear"). */
  needs?: string;
  needsName?: string;
  /**
   * Equipment the yard fits to the workboat (the starter boat: owner, Oct 2026): the sockets
   * of her recipe (boats/starterWorkboat.json; "helm/trawl" for one in the helm console) a
   * new career's workboat is built without, until it's bought.
   */
  fit?: string[];
  /**
   * The same equipment on the beginner boat (boats/fleet.ts, a Shipyard design): the choices
   * it sets in her design (shipyard/design.ts ShipDesign). None: it doesn't fit her.
   */
  design?: Record<string, number>;
  /** Only for these boats (vessel ids): equipment the others can't take (the old workboat has no bow fender). */
  boats?: string[];
}

/** How wide a player's body is for walking into things (m: half their width): src/config/vessels.ts. */
export { BODY_RADIUS } from './config/vessels';

/**
 * The ceiling liners' colours (CONFIG.interiors, CONFIG.cabinBeams): their beams are painted
 * into the liner's tile (render/pixelPaint.ts), which is made for its liner's colour, so both
 * read these.
 */
const LINER_LIGHT = 0xe2e1db;
const LINER_DARK = 0x3c4044;
/**
 * The dark liner's ceiling is a mid grey under its tile: a tile can at most double the colour
 * under it, too little to bring a wood-brown beam up from charcoal, so the tile darkens the
 * liner from this and lightens the beams.
 */
const LINER_DARK_BASE = 0x8a8a8a;

export const CONFIG = {
  sim: {
    /** Fixed simulation rate (Hz). Physics and intents are processed on this tick only. */
    tickRate: 60,
    /**
     * Upper bound on ticks run in one rendered frame. If the browser stalls (tab hidden,
     * GC pause) we drop the backlog instead of trying to catch up ("spiral of death").
     */
    maxTicksPerFrame: 5,
  },

  /**
   * Pixel painting (owner, Oct 2026): small low-resolution detail images on the boats'
   * surfaces (non-slip deck, wood lining, floor matting, chequer plate),
   * drawn as crisp pixels, Stormworks style: detail without extra shapes or draw calls.
   * The images are generated at start-up (render/pixelPaint.ts), greyscale, and multiply each
   * part's own colour, so they take any livery.
   */
  pixelPaint: {
    /** How strongly the detail shows: 0 off (plain colours, as before) .. 1 full. */
    strength: 1,
    /**
     * How much surface one repeat of each image covers (m, square). Each image is 64 x 64
     * pixels, so wood at 2 m is 32 pixels a metre. `crate` and `window` are whole pictures
     * stretched to one face each (keep them at 1). Step 2 (cargo, harbours, sea marks):
     * sacking on sacks, worn paint on drums, buoys and posts, weatherboarding, render,
     * corrugated sheet and slates on the houses and sheds, concrete on the quays, stone on
     * the breakwaters.
     */
    tileMetres: { nonSlip: 1, wood: 2, mat: 1, chequer: 0.5, crate: 1, sacking: 2, worn: 1.5, boards: 2, render: 2, sheet: 2, slates: 2, concrete: 4, stone: 3, window: 1, rust: 2, teak: 1.5, deckTeak: 1.2, steel: 3, brushed: 2.4, facade: 3, beamsLight: 1.68, beamsDark: 1.68, topsides: 3 },
    /**
     * The house fronts' windows at night (the house kit): the share of windows lit, their
     * glow (colour, its brightness is the strength), and how dark it must be before they
     * come on (0 day .. 1 night; full glow at night).
     */
    litWindows: 0.35,
    windowGlow: 0xffc070,
    windowsFrom: 0.35,
    /** Width of the black window frames round the wheelhouse glass (m). */
    frameWidth: 0.06,
    /**
     * The hulls' weathering (owner, Oct 2026, from the texture study): the `topsides` tile on
     * every hull's sides, from the waterline to the deck edge (render/pixelPaint.ts). No new
     * shapes or draw calls; one texture read on the hull's pixels, as the other tiles.
     *   strength  how much it shows on a hull with no choice of her own (the fleet's boats,
     *             the harbours', tows): 0 as new (plain paint, as before) .. 1 the tile as
     *             drawn. A Shipyard boat brings her own (Livery.weathering, new or used).
     *   fade      the paint's mottle, the brightness swing of its soft patches (0.5 ± fade/2)
     *   grime     how dark the band of grime on the waterline is (taken off the brightness)
     *   runs      rust runs down from the deck edge, per 3 m of hull (tileMetres.topsides)
     */
    weathering: { strength: 1, fade: 0.07, grime: 0.11, runs: 7 },
  },
  /**
   * The wheelhouse's interior finishes (owner, Oct 2026: "options for the interior textures";
   * then, from photos of real ones: "quite often there's a wood floor and then... either a
   * light ceiling liner or a dark ceiling liner... and I like this one with the wooden beams
   * across it"; chosen in the Shipyard, Wheelhouse step, Lining). Each is a colour and a tile
   * (pixelPaint) for the walls' inside faces and for the ceiling. The liners' varnished wooden
   * battens across the ceiling are painted into their ceiling tile (`beamsLight`, `beamsDark`;
   * owner: "you can just paint those with textures, they don't need to be 3D"): CONFIG.cabinBeams.
   * - wood: the planked lining every boat had before (first, so a boat with no choice keeps it);
   * - light liner: a pale speckled vinyl headliner between the battens, dark charcoal walls
   *   (the aluminium pilothouse in the owner's photos);
   * - dark liner: the same with a charcoal headliner;
   * - light all round: pale walls and headliner, the battens;
   * - painted steel: a tug's, the plating painted pale green under a cream deckhead;
   * - bare aluminium: the plain workboat's, the hull's own sheet left bare.
   */
  interiors: [
    { name: 'Wood lining', walls: 0x8a5d3c, wallTile: 'wood', ceiling: 0x8a5d3c, ceilingTile: 'wood' },
    { name: 'Light liner, beams', walls: 0x34383c, wallTile: 'mat', ceiling: LINER_LIGHT, ceilingTile: 'beamsLight' },
    { name: 'Dark liner, beams', walls: 0x34383c, wallTile: 'mat', ceiling: LINER_DARK_BASE, ceilingTile: 'beamsDark' },
    { name: 'Light all round, beams', walls: 0xc8cac6, wallTile: 'mat', ceiling: LINER_LIGHT, ceilingTile: 'beamsLight' },
    { name: 'Painted steel', walls: 0xb9c9ae, wallTile: 'steel', ceiling: 0xe2e2d6, ceilingTile: 'steel' },
    { name: 'Bare aluminium', walls: 0xc3c8cd, wallTile: 'brushed', ceiling: 0xc2c5c8, ceilingTile: 'brushed' },
  ] as const,
  /**
   * The liners' beams, painted into the ceiling's tile (pixelPaint `beamsLight` / `beamsDark`):
   * the varnished wood's colour; for each tile, the ceiling colour it's made to go over (as in
   * CONFIG.interiors: the tile multiplies it) and the liner's colour to show; and the beams'
   * spacing and width in the tile's pixels (the tile repeats every 1.68 m, pixelPaint.tileMetres:
   * 16 pixels is 0.42 m between beams, 3 pixels ~8 cm wide), each with a pixel of shadow beside.
   */
  cabinBeams: {
    colour: 0xa86c3c,
    light: { ceiling: LINER_LIGHT, liner: LINER_LIGHT },
    dark: { ceiling: LINER_DARK_BASE, liner: LINER_DARK },
    pitchPx: 16,
    widthPx: 3,
  },
  /**
   * The wheelhouse floor (owner, Oct 2026, from photos: a wood floor, or "a grippy deck kind of
   * utility floor"; Shipyard, Wheelhouse step, Floor): its colour (null: the livery's floor
   * colour, as before) and tile.
   */
  cabinFloors: [
    { name: 'Matting', colour: null, tile: 'mat' },
    { name: 'Teak planks', colour: 0x6a3e22, tile: 'deckTeak' },
    { name: 'Grippy utility', colour: 0x33373b, tile: 'nonSlip' },
  ] as const,
  render: {
    antialias: true,
    maxPixelRatio: 2,
    fovDeg: 70,
    near: 0.05,
    /**
     * Far plane (m): out to the clearest day's horizon (environment.hazeFar), so a region's
     * landmark hill shows across the sound (regions, milestone 2). Depth precision at the
     * far end is coarse (tens of metres), which is why far-off land is drawn above the
     * waterline only and nudged toward the camera (worldView.ts).
     */
    far: 14000,
    /**
     * Overlapping quay and pier blocks at one deck height (world/blockSteps.ts): each drawn
     * this much lower and narrower per step (m), so their decks and sides aren't in one plane
     * and don't flicker. Small enough not to see (a few overlapping need two or three steps);
     * enough to keep them apart in the depth buffer out to about 100 m, where you stand on them.
     */
    blockStepM: 0.015,
  },

  xr: {
    /** 1.0 = the headset's recommended resolution. Lower to buy frame time. */
    framebufferScale: 1.0,
    /** Fixed foveated rendering, 0 (off) .. 1 (max). Quest 3 copes well with ~0.5. */
    foveation: 0.5,
    /** Requested refresh rate if the headset supports it (Quest 3: 72 / 90 / 120). */
    targetFrameRate: 90,
    /**
     * Coming from another page in VR (the timber camp), a session the browser hands across
     * (`sessiongranted`, app/xrSession.ts) is entered after this wait (ms), if three's button
     * hasn't already: so the two never both press it.
     */
    grantedEnterDelayMs: 600,
  },

  environment: {
    /** Hours, 0..24. */
    startTimeOfDay: 10.5,
    /**
     * Game-hours per real second. 0 = frozen sun. Time flows by default since the regions
     * (owner): one game hour in five real minutes (the menu's x12), so a day is two real
     * hours and a six-hour race cycle half an hour, with slack windows minutes long.
     */
    timeScale: 12 / 3600,
    /** Sea (and air) temperature (°C): a cold engine starts here, the cooler rejects heat to it. */
    seaTempC: 14,
    /** Hours added per keypress of N / M (debug). */
    timeStepHours: 0.5,
    /** Observer latitude and solar declination drive the sun path (degrees). */
    latitudeDeg: 50,
    solarDeclinationDeg: 12,
    /**
     * The clearest day's haze (m): scene fog runs out to the visibility, or to this, whichever
     * is less, so even on a clear day the sea and the far land dissolve into the sky by here
     * (the camera's far plane sits just beyond). Was 2600 before the regions: the next
     * region's hill, 4-5 km off, was simply not drawn.
     */
    hazeFar: 13500,
    /** Radius (m) of the sky dome; must be inside the camera far plane. */
    skyRadius: 13800,
  },

  ocean: {
    gravity: 9.81,
    /** Sea water density (kg/m^3). */
    density: 1025,
    /**
     * Wave components summed as Gerstner (trochoidal) waves. Tuned by eye for a moderate
     * wind sea: Hs ~1.2 m (4*sigma of the sum), periods 2-7 s, waves travelling
     * towards the NE (coming from the SW) with +-35 deg directional spread.
     *
     *   amplitude    m, crest height above mean level (A); Hs = 4*sqrt(sum(A^2)/2)
     *   period       s; wavelength and celerity follow from deep-water dispersion w^2 = g*k
     *   directionDeg compass bearing the wave travels TOWARDS (0 = north = -Z, 90 = east = +X)
     *   steepness    Q in 0..1: horizontal orbital amplitude as a fraction of A. Q = 1 is the
     *                true deep-water circular orbit; sum(Q*k*A) must stay < 1 or crests loop.
     *   phase        rad, fixed offset so components don't all peak together
     */
    waves: [
      { amplitude: 0.25, period: 7.0, directionDeg: 45, steepness: 1.0, phase: 0.0 },
      { amplitude: 0.23, period: 6.0, directionDeg: 25, steepness: 1.0, phase: 1.7 },
      { amplitude: 0.17, period: 5.2, directionDeg: 65, steepness: 1.0, phase: 4.1 },
      { amplitude: 0.13, period: 4.3, directionDeg: 35, steepness: 1.0, phase: 2.6 },
      { amplitude: 0.1, period: 3.6, directionDeg: 80, steepness: 1.0, phase: 5.3 },
      { amplitude: 0.08, period: 3.0, directionDeg: 10, steepness: 1.0, phase: 0.9 },
      { amplitude: 0.055, period: 2.4, directionDeg: 55, steepness: 1.0, phase: 3.8 },
      { amplitude: 0.035, period: 2.0, directionDeg: 30, steepness: 1.0, phase: 2.2 },
    ],
    /**
     * Sea states: the waves above are "Moderate" (scale 1). Other states scale them:
     * amplitudes × s, periods × s^seaPeriodExponent. Exponent 0.5 would be pure Froude
     * scaling (constant steepness, a storm just a bigger copy of a moderate sea - accurate
     * for a fully developed swell but it looks the same from the boat); 0.3 makes a building
     * sea steeper as well as longer, like a young storm sea (steepness ∝ s^0.4; the Gerstner
     * crest-loop factor Σ Q·k·A goes 0.24 -> 0.35 at Storm, safely < 1). Hs ≈ 1.25 m × s.
     * Measured on the workboat beam-on: Moderate rolls ~16° and heaves 1.5 m, Rough 25° /
     * 2.8 m, Storm 31° / 4 m.
     */
    seaPeriodExponent: 0.3,
    /**
     * Short, steep seas in enclosed water, long ones in the open (owner, Oct 2026;
     * docs/FETCH_SEAS.md; world/fetch.ts, ocean/windSea.ts). The wind sea at each spot by
     * fetch-limited growth (JONSWAP, at its textbook strength), carried by short `trains`;
     * the long `waves` above scaled by each spot's exposure toward where they come from.
     *   cellM, maxCells   the fetch grid: cells this size (m), coarser on a big map so there
     *                     are at most this many
     *   landDepth         ground less than this far under the surface (m) stops a sea
     *   sectors           bearings the fetch is worked out for; `spreadSectors` either side of
     *                     the wind count toward its effective fetch (weighted by cos²)
     *   fetchMaxM         the longest fetch looked for (m); a ray off the map runs this far
     *   openFetchM        a fetch this long is open sea: exposure F/this, at most 1
     *   trains            the short wave trains: period (s), and their angle off downwind
     *                     (deg), so they don't all run in line
     *   spreadLn          how wide the share of a sea over the trains is, in log-period
     *   steepness         the trains' Gerstner Q (their crests' sharpness)
     *   refreshWindPct, refreshDirDeg   the field's worked out again when the wind has
     *                     changed by this much
     */
    fetchSeas: {
      enabled: true,
      cellM: 150,
      maxCells: 25000,
      landDepth: 0.5,
      sectors: 16,
      spreadSectors: 2,
      fetchMaxM: 60000,
      openFetchM: 40000,
      trains: [
        { period: 4.4, offsetDeg: 5 },
        { period: 3.1, offsetDeg: -12 },
        { period: 2.2, offsetDeg: 15 },
      ],
      spreadLn: 0.35,
      steepness: 0.7,
      refreshWindPct: 4,
      refreshDirDeg: 4,
      /** A refresh is worked out this many cells a tick (ocean/windSea.ts), the old field in use meanwhile: no hitch. */
      sliceCells: 4000,
    },
    seaStates: [
      { name: 'Calm', scale: 0 },
      { name: 'Slight', scale: 0.5 },
      { name: 'Moderate', scale: 1 },
      { name: 'Rough', scale: 1.8 },
      { name: 'Storm', scale: 2.6 },
    ],
    /**
     * Largest sea scale anything may set: 5 is Hs about 6.0 m in open water (owner, Oct 2026:
     * "try raising the max sea to about 6 m", for testing in Debug > World > Weather; it was 3,
     * Hs 3.6 m). The crests still don't loop: the Gerstner factor Σ Q·k·A is 0.46 at 5 (0.37
     * at 3), well under 1. The wind's own sea stays capped lower (weather.windSeaMax).
     */
    maxSeaScale: 5,
    /**
     * Scenery on the waves (harbour boats, buoys and marks; ocean/waves.ts surfaceHeight): the
     * rest-position search's steps. The boats' physics takes 6 (under a centimetre even in a
     * storm); scenery that only bobs takes this many, within a few centimetres in a moderate
     * sea, for under half the cost (review, Oct 2026: the harbour boats' wave samples were a
     * big share of the Quest's frame).
     */
    sceneryIterations: 3,
    /**
     * Added resistance in waves (vessel/physics/vesselPhysics.ts): the drag a sea puts on a
     * hull beyond calm water, ∝ ρ g ζ² B²/L (ζ the local wave amplitude, B her beam, L her
     * length: the classic scaling), × `gain`; full in a head sea, `following` of it with the
     * sea astern. It is what makes the overfalls hard to travel through: the standing,
     * steepened waves there put ζ up two or three times, so the resistance four to nine.
     * `fullAt`: it comes in over the first m/s of way (full at `fullAt` m/s), so a boat lying
     * stopped isn't held or set adrift by it. gain 0.4: the workboat flat out into a sea of
     * 1.5 loses about a fifth of her speed in open water; in the overfalls, half or more.
     */
    addedResistance: { gain: 0.4, following: 0.15, fullAt: 2 },
    seaScaleStep: 0.1,
    mesh: {
      /** Grid spacing (m) in the dense centre around the viewer. */
      innerSpacing: 1.0,
      /** Half-width (m) of the uniformly dense centre. */
      innerHalfExtent: 32,
      /** Each cell beyond the centre is this much larger than the previous one. */
      growth: 1.08,
      /** Half-width (m) of the wave-detailed tile; beyond it the cells grow faster (`farGrowth`) out to `farRadius`. */
      radius: 3000,
      /**
       * Half-width (m) of the whole tile: past environment.hazeFar, so the sea's edge is
       * always lost in the haze. The cells out there are hundreds of metres across: no wave
       * is drawn on them (they fade with the grid), it's the flat, hazed sea to the horizon.
       */
      farRadius: 14000,
      farGrowth: 1.25,
      /**
       * A wave is faded out (visually only) where the grid becomes too coarse to draw it:
       * where cell size exceeds wavelength / this many cells.
       */
      minCellsPerWavelength: 4,
    },
    colors: {
      deep: 0x0b3550,
      scatter: 0x1f7a80,
      foam: 0xd8e4e8,
    },
    /** Sun glint sharpness (Blinn-Phong exponent). */
    specularPower: 220,
    /** Scales the Fresnel sky reflection (1 = physical). Lower = more water colour. */
    reflectionStrength: 0.75,
    /**
     * Fine wind ripples on top of the waves (surface detail only: they tilt the shading
     * normal, they don't move the water or the boat). Without them a calm sea is one flat
     * colour: no texture for the eye, hard to judge distance in VR. Two layers of the same
     * tiling pattern at different scales drift across each other. `strength`: slope added
     * to the normal; faded out between `fadeNear` and `fadeFar` (m) where they'd only
     * sparkle. `calmBoost`: extra strength in a flat calm (scaled down as the waves grow).
     */
    /**
     * Foam the wind makes (owner: whitecaps, and the lines of foam along the wind when it
     * blows hard), from the weather's wind speed (m/s), as the Beaufort scale describes:
     *   white horses on the crests from `capsFrom` (force 4, 5.5 m/s), frequent by `capsFull`
     *   (force 7, 13.9 m/s);
     *   foam blown into streaks along the wind from `streakFrom` (force 6, 10.8 m/s), well
     *   marked by `streakFull` (force 9, 20.8 m/s): lines about `streakLength` m long and
     *   `streakWidth` m apart (the noise's blob sizes: the lines are sparser), drifting downwind at `drift` m/s.
     * Fixed to the water (they ride the swell); faded in sheltered water.
     */
    windFoam: { capsFrom: 5.5, capsFull: 13.9, streakFrom: 10.8, streakFull: 20.8, streakLength: 90, streakWidth: 3.5, drift: 0.6 },
    ripples: {
      strength: 0.13,
      calmBoost: 0.06,
      layers: [
        { scale: 9, speed: 0.35, directionDeg: 50 },
        { scale: 3.1, speed: 0.22, directionDeg: 125 },
      ],
      fadeNear: 30,
      fadeFar: 260,
    },
  },

  /**
   * Docking: inside a berth's hot spot (close, slow, roughly lined up either way round),
   * making the lines fast at the cleats warps the boat in and the lines then hold her
   * alongside. They are horizontal spring-dampers at bow and stern towards the berth, so
   * she still heaves and rolls.
   */
  /**
   * Landing on a slipway (world/slipway.ts; owner, Oct 2026), for a boat with a bow ramp:
   * her ramp down (or going down), lined up with the slip within `maxAngleDeg`, slower than
   * `maxSpeed` m/s, her middle within `range` m (in plan) of where she'd lie landed and
   * `across` m of its centreline: she's drawn up onto it at `landSpeed` m/s (taking at least
   * `landSec` s) and held there,
   * the waves no longer moving her. The lever `releaseLever` astern or more takes her off.
   * Landed, she lies level at her waterline, as far up the slip as her bottom allows (it
   * just touches the concrete); her ramp's toe flaps (`layout.bowRamp.flap`) rest on it.
   */
  slipway: { maxAngleDeg: 20, maxSpeed: 1.0, range: 4, across: 1.5, landSec: 2, landSpeed: 0.8, releaseLever: -0.25 },
  /**
   * Beaching (the coast extras plan, C3; vessel/physics/vesselPhysics.ts, world/slipway.ts):
   * a boat with a bow ramp running onto soft ground (a coast map's sand or shingle,
   * world/coastShore.ts, or a slipway's concrete) takes no harm up to `impactSafe` m/s; past
   * it, only the speed over it counts as a hit (wear.ts). Grinding over it does nothing. Rock,
   * cliff and other ground are as hard as ever, and every other boat grounds as before.
   * With her ramp down, slower than `maxSpeed` m/s, her bow on soft ground and the lever not
   * astern, she lands there and is held, as on a slipway; her ramp's toe flaps hang at
   * `flapDeg` (below level) for the walk ashore. The lever astern (`slipway.releaseLever`)
   * takes her off.
   */
  beaching: { impactSafe: 3, maxSpeed: 1.5, flapDeg: 25 },

  /**
   * The handheld fishing rod (owner, Oct 2026; fishing/rodGame.ts, modules/rodRack): a rod on
   * a rack on the wheelhouse's aft wall (a Shipyard fitting), a bucket on deck under it.
   * Take the rod, cast (trigger / click) over the side, wait; a fish bites (the float dips,
   * the rod buzzes): strike within `biteWindow` s, then play it: hold to reel (the line's
   * tension rises, the fish comes in), let go to rest it (the tension falls). Over 1 the line
   * parts. Landed at `landAt` m, it goes in the bucket; tied up at a port the bucket is sold.
   *   castRange     how far the float flies (m, along the rod, level)
   *   maxSpeed      the boat must be slower than this to fish (m/s)
   *   wait          seconds to a bite in open water (range); in a fishing ground divided by
   *                 (1 + richness × groundFactor)
   *   biteWindow    seconds to strike once it bites
   *   reelRate      line in per second while reeling (m/s), less as the fish pulls
   *   tensionUp     how fast the tension rises while reeling, per unit of the fish's pull
   *   tensionDown   how fast it falls resting (per s)
   *   fightPeriod   the fish's runs (s): its pull swings between calm and full
   *   pullPerKg     a fish's full pull in tension per kg (a 2 kg fish at 0.9 breaks the line if you don't rest it)
   *   landAt        the float this close (m) and the fish is in
   *   perRack, spacing   rods on a rack (each one usable: the crew fish together), standing
   *                 upright this far apart along the wall (m); their tips reach above the roof
   *   takeGrace     seconds after taking a rod before a press counts (so the grab isn't a cast)
   *   bucketMax     fish the bucket holds
   *   pricePerKg    what the merchant pays (GBP), times the port's fish factor
   *   species       what bites where: the coast's own mix, and each fishing ground's own
   *                 species (FishingGroundDef.species) when you're in one; kg ranges
   */
  rod: {
    castRange: 12,
    maxSpeed: 1.5,
    wait: [10, 35] as [number, number],
    groundFactor: 1.5,
    biteWindow: 2.5,
    reelRate: 1.4,
    tensionUp: 0.9,
    tensionDown: 1.2,
    fightPeriod: 3.2,
    pullPerKg: 0.42,
    landAt: 1.5,
    perRack: 4,
    spacing: 0.24,
    takeGrace: 0.5,
    bucketMax: 12,
    pricePerKg: 5.5,
    species: {
      coast: ['mackerel', 'pollack', 'wrasse', 'mackerel', 'coalfish'] as string[],
      kg: { mackerel: [0.3, 1.1], pollack: [0.6, 3.5], wrasse: [0.4, 1.6], coalfish: [0.5, 2.8], haddock: [0.7, 2.4], herring: [0.2, 0.5], cod: [1.0, 6.0] } as Record<string, [number, number]>,
    },
  },

  /**
   * A Kort nozzle (owner, Oct 2026; the Shipyard's choice on a shaft-driven inboard): a duct
   * round the propeller. Ducting a heavily loaded propeller lets the duct itself carry part of
   * the thrust, so at a standstill (bollard pull) she pulls harder for the same power; at
   * speed the duct's own drag takes it back, so she's slower free-running. A rudder in the
   * nozzle's concentrated jet answers better at low speed and astern (vessel/physics/
   * propulsion.ts: propellerForces and rudderForceAt).
   *   thrustGain   bollard thrust (K_T at J 0) times this
   *   jFactor      the thrust's fall with advance (j0) times this: it drops off sooner
   *   torqueGain   the torque absorbed times this (the duct loads the propeller a little more)
   *   asternGain   astern thrust times this (a nozzle backs poorly: its flow is the wrong way round)
   *   steerGain    the rudder's slipstream force (washFactor and its cap) times this
   *   asternSteer  astern, the share of that the rudder gets from the propeller drawing its
   *                water in past it through the duct (owner: it "hardly steers at all"
   *                backwards; tuned on the small tug to turn about half as hard astern as
   *                ahead at the same throttle, as nozzle-and-rudder tugs do)
   *   price        GBP, in the Shipyard
   *   look         its drawing in the Shipyard's Engine step only (shipyard/enginePreview.ts; the
   *                game doesn't draw it), in propeller diameters D, after the common 19A duct:
   *                lengthD its length (0.5 D), tipGap the gap between blade tips and the duct
   *                (1 % of D), inletFlare how much wider the mouth is than the throat, noseD
   *                the thickness of its rounded leading edge (thin at the trailing edge), and
   *                headbox a plate from its top up to her bottom that carries it
   */
  nozzle: { thrustGain: 1.3, jFactor: 0.75, torqueGain: 1.08, asternGain: 0.85, steerGain: 1.5, asternSteer: 0.9, price: 12000, look: { lengthD: 0.5, tipGap: 0.01, inletFlare: 0.15, noseD: 0.1, headbox: true } },

  docking: {
    /**
     * Lying at a berth: the berth marks (BerthDef.shoreDist, 2.5 m off the face) are set for
     * the workboat's beam (her widest deck half-beam, 2.3 m, plus this much air for her
     * fenders). Any boat lies with her own half-beam plus this off the face
     * (vessel/physics/mooring.ts berthInshore), so a broad tug lies further off and a narrow
     * boat closer, instead of into the quay (owner, Oct 2026: the big tug spawned into it).
     */
    fenderClear: 0.2,
    /**
     * The skiff's painter (vessel/physics/painter.ts): her bow line to one of the ship's cleats,
     * so she doesn't blow away. Made fast to the forward starboard cleat as she touches the
     * water off the crane; click her bow cleat to let go or make fast to the nearest cleat in
     * `reach` (m, bow cleat to ship's cleat), or a midship cleat to lead it there. It's made
     * fast with `slack` (m) more than the distance, at least `minLength`, at most `maxLength`.
     * A rope only pulls: taut, a spring (`stiffness` N/m; 12 mm braid stretches a little) with
     * damping at `dampingRatio` of critical so she doesn't bounce on it. It parts above
     * `breakForce` (N) or stretched `maxStretch` (m), as if she's towed off at speed.
     */
    painter: { reach: 6, slack: 0.5, minLength: 2.5, maxLength: 7, stiffness: 3000, dampingRatio: 0.7, breakForce: 15000, maxStretch: 2.0 },
    /**
     * Where the bow and stern lines are drawn to on the quay: the bollard nearest this far
     * (m) beyond her cleat, forward for the bow line and aft for the stern line, so a long
     * boat's lines lead out from her ends, not back inside her length (owner, Oct 2026: a 24 m
     * trawler at the start quay). None within `lineLeadMax` (m) of that: her berth's own pair.
     */
    lineLead: 4,
    lineLeadMax: 12,
    /** Hot spot: boat origin within this distance of the berth (m)... */
    range: 18,
    /** ...below this speed (m/s)... */
    maxSpeed: 1.5,
    /** ...and within this angle of the berth axis, either way round (degrees). */
    maxAngleDeg: 40,
    /** Line stiffness and damping per end (N/m, N*s/m) once made fast. */
    stiffness: 9000,
    damping: 14000,
    /**
     * A boat lighter than this (kg: only the dinghy today) has her lines' stiffness, damping
     * and pull scaled down by her mass over it. Lines this stiff on a 240 kg boat, made fast
     * high on her tubes, roll her over: each tick's damping push is more than her small roll
     * inertia can take, so it overshoots and grows (Oct 2026: the dinghy heeled 30-60 deg at
     * a quay). Scaled, she lies to them as a heavy boat does to hers.
     */
    lightBoatKg: 2000,
    /** Most a line pulls while warping in, and when moored (N); beyond `breakDist` m off, lines part. */
    warpForce: 7000,
    holdForce: 40000,
    breakDist: 8,
    /** Lines come taut over this long when docking (s). */
    warpTime: 4,
  },

  /**
   * Towing missions (tow/tow.ts). Out of harbour with nothing else on, every so often a
   * call comes: something adrift (a broken-down motor cruiser, a raft of logs, a work
   * barge) to bring into any port. Pick up the handset to take the job; hook its bow eye
   * with the boat hook (or the menu's Tow row) to make the towline fast to our towing post.
   *
   * The towline is one straight spring-damper between the towing post on our stern and
   * the tow's bow eye. It only pulls when taut (stretched past `lineLength`):
   *   T = k * stretch + c * (rate of stretch),  never negative (a rope can't push),
   * on the tow toward our stern and on us toward the tow, at those two points. c is set
   * for `dampingRatio` of critical on the two masses (so a heavy barge isn't springier
   * than a light cruiser). Snatching it (or dragging a tow over the rocks) above
   * `breakForce`, or stretching it past `maxStretch`, parts it.
   */
  tow: {
    /**
     * Seconds between calls while she's out of harbour and free (first one too). Doubled
     * after V1.0 (owner: too many calls; was 240-540).
     */
    every: [480, 1080] as [number, number],
    /** Relative odds of each kind (def ids). */
    /** The open-water calls' mix; a region's own job list (RegionDef.jobs) replaces it there. The cage section comes only from a region's list. */
    weights: { derelict: 1, dory: 0.8, logRaft: 1, barge: 0.7, yacht: 0.8, trawler: 0.5, pontoon: 0.4, cage: 0, coaster: 0 } as Record<string, number>,
    /**
     * A tug's work (owner, Oct 2026): a boat that's tug class (isTugClass: her engine's rated
     * speed at or under `tugRpm`, the slow-revving tug diesel; or the heavy towing post) gets
     * the big tows (`tow.needs` 'tug': the coaster) `bigShare` of the time, from `bigWeights`.
     * Other boats never hear those calls.
     */
    tugRpm: 1200,
    bigShare: 0.5,
    bigWeights: { coaster: 1 } as Record<string, number>,
    /** Where it's adrift: this far ahead (m), this far off to one side (m), in open water. */
    ahead: [450, 850] as [number, number],
    offset: [80, 260] as [number, number],
    minDepth: 6,
    minPortDistance: 400,
    /** An unanswered call goes away after this long (s); the alert repeats this often (s). */
    callTimeout: 120,
    /** The radio's call alert repeats this often while unanswered (s; was 10, owner: too insistent). */
    callRepeat: 20,
    /** Towline: length (m), and the most the bow eye may be from our towing post to make it fast (m). */
    lineLength: 22,
    /**
     * Multi-boat towing: the most towlines drawn at once (every boat with a stern roller has
     * her own; several may be on one tow). All in one instanced mesh, one draw call; past
     * this many, the extra lines still pull but aren't drawn.
     */
    drawLines: 4,
    /**
     * Multi-boat towing: where a second (third) boat's line goes on a vessel already on a
     * line: a bow fairlead on the side nearer her, this fraction of the tow's length aft of
     * the stem, at the deck edge. (Two lines on the one centre eye converge: each pulls its
     * boat's stern in toward the tow and her bow out, and the tow's head off her course. On
     * the fairleads they run more nearly parallel, as two tugs' lines do on a ship's bows.)
     * The first line always goes on the centre bow eye.
     */
    fairleadAft: 0.12,
    attachRange: 16,
    /**
     * The tow winch by the stern roller (hold-to-run): heave in / pay out speeds (m/s), the
     * shortest and longest line it allows (m), the most it can pull in against (N), and the
     * slack left when a line is made fast (m: it's made fast at the distance to the tow plus
     * this, so heaving in starts pulling her at once).
     */
    winch: { heaveSpeed: 0.6, payOutSpeed: 1.0, minLength: 4, maxLength: 60, pullN: 18000, makeFastSlack: 1.0 },
    /** Line stiffness (N/m) and damping as a fraction of critical. */
    stiffness: 6000,
    dampingRatio: 0.5,
    /** It parts above this tension (N) or this stretch (m). */
    breakForce: 40000,
    /** With the heavy towing post (career upgrade): this much more. */
    heavyPostFactor: 1.75,
    maxStretch: 12,
    /**
     * The TOW LINE screen (owner, Oct 2026: "how close it is to snapping"): its load bar is the
     * nearer of the tension to its breaking force and the stretch to `maxStretch`. The highest
     * load is held `peakHoldS` s (a snatch is over quicker than you can look); the bar turns
     * amber from `amber` and red from `red` of breaking, and says EASE OFF; PARTED shows
     * `partedShowS` s after it goes.
     */
    gauge: { peakHoldS: 6, amber: 0.5, red: 0.8, partedShowS: 20 },
    /**
     * A ship (TowLook.needs 'tug': the coaster; owner, Oct 2026) is delivered only alongside a
     * quay or pier of the port: her middle within her half beam + `berthReach` m of the face,
     * slow, for deliverTime (push her in with your bow). The harbour's lines go on and she
     * lies there `shipRemoveAfter` s before she's taken over (long enough to look at).
     */
    berthReach: 2.5,
    shipRemoveAfter: 120,
    /** Delivered: the tow within this of a port (m), slower than this (m/s), for this long (s). */
    deliverRadius: 170,
    deliverSpeed: 0.8,
    deliverTime: 5,
    /** A delivered tow is taken over by the harbour (removed) this long after the hand-over (s). */
    removeAfter: 8,
    /**
     * The towline leads from the winch drum aft over a stern roller in a notch in the
     * transom bulwark on the centreline (owner request: no towing post on deck; a closed
     * fairlead was too fussy). The tow pulls on the boat at the top of the roller: its height
     * above the deck (m), how far in from the transom (m), and the roller's radius (m).
     */
    fairlead: { height: 0.24, inset: 0.03, rollerRadius: 0.06 },
    /** Debug "tow job alongside": this far astern of us (m). */
    debugDistance: 12,
    /**
     * Debris on the towline: a point mass (kg) with water drag F = (dragLinear + dragQuad |v|) v
     * (N; about 0.5 rho Cd A for a waterlogged tangle of planks and a drum: ~5 kN at 3.5 m/s).
     */
    debris: { mass: 900, dragLinear: 150, dragQuad: 350 },
  },

  /**
   * The career (career/career.ts): money (£), reputation per port (0..100) and the harbour
   * offices' contracts and upgrades.
   *   pay       per job, before the port's reputation factor (1 .. 1 + repPayBonus at 100):
   *             cargo `cargoBase` + `cargoPerKm` per km between the ports; a box of fish (x
   *             `iceFactor` with the ice machine); a salvage log; debris cleared; a lost
   *             crate brought in; tows by kind; a rescue plus per survivor; a fire put out.
   *   costs     fuel per litre (a full 600 L tank from empty is ~£960), a can of oil, cargo
   *             lost overboard (and reputation at its port).
   *   rep       gained per job (or lost), at the port it's for.
   *   contracts `perPort` offers at each office, renewed every `refresh` s. Per kind: the
   *             item counts by tier (reputation `tierRep` at that port to take each tier),
   *             the bonus per item and the time allowed per item (s).
   *   upgrades  price and the best port reputation needed; `needs`: a module her boat must
   *             carry to fit it (the deck crane's motion compensation). `fit`: equipment a new
   *             career's workboat hasn't got until it's bought (CareerUpgrade).
   */
  /**
   * Dive sites (src/dive/diveSites.ts: wrecks for the submersible game, on the career map and
   * the Oban map): each drawn on the chartplotter as a ring `radius` m round its middle, with
   * the chart's wreck mark, its name and its depth; on the paper chart as a wreck mark and
   * its depth.
   */
  dive: {
    radius: 50,
    /**
     * Back from a dive (dive/diveReturn.ts, docs/dive-contract.md; Submersible World's M9): what
     * the finds fetch (£, by the submersible game's kind, else its class), each in a salvage
     * crate on deck, sold in any port; the survey and the story paid on coming back aboard:
     * so much a point of coverage gained, for naming the wreck, for finding how she was lost
     * (and more if right at the first filing). `airFactor`: a find's weight out of the water
     * over its weight in water (about 1.15 for iron and brass). A return carries at most
     * `maxItems` finds. Salvage on deck sells once she's been stopped (under `sellBelowMS`) in port for `sellAfterS` s.
     */
    prices: { bottle: 30, plate: 40, lantern: 220, porthole: 650, binnacle: 1800, safe: 2500, crate: 700, anchor: 2600, engine: 1500, small: 40, medium: 600, heavy: 1500 },
    fees: { perCoveragePoint: 25, identified: 600, finding: 800, firstTime: 1200 },
    airFactor: 1.15,
    maxItems: 30,
    sellBelowMS: 0.4,
    sellAfterS: 30,
  },
  career: {
    /**
     * A sea trial (owner, Oct 2026: "a sea trial is time limited to 5 mins"): a Shipyard design
     * the career hasn't paid for (the Shipyard's "Try her in the game", or Office > Your boats
     * away from a boatyard) is sailed this long (s of game time), nothing from it saved, then
     * the career is back in its own boat. At a boatyard, Take her buys her instead.
     */
    seaTrialS: 300,
    startMoney: 500,
    /** Paid when the first voyage (the tutorial) is done. */
    tutorialBonus: 200,
    /** Radar upgrade: echoes on the plotter within this (m). */
    radarRange: 2800,
    ledgerKeep: 12,
    repPayBonus: 0.5,
    pay: {
      cargoBase: 60,
      cargoPerKm: 50,
      fishBox: 45,
      iceFactor: 1.3,
      log: 180,
      debris: 40,
      crate: 80,
      tow: { dory: 350, derelict: 600, logRaft: 450, barge: 800, yacht: 900, trawler: 1600, pontoon: 2000, cage: 550, coaster: 6500 } as Record<string, number>,
      towDefault: 500,
      rescue: 400,
      rescuePerPerson: 150,
      fire: 650,
      /** Crew transfer to the wind farm (transfer/transfer.ts): the trip, and each technician put across. */
      transfer: 500,
      transferPerPerson: 120,
    },
    costs: { fuelPerL: 1.6, oil: 35, lostCargo: 100 },
    /** Repairs in port (phase 2): per % of hull damage, per % of engine wear (an overhaul). */
    repairs: { hullPerPercent: 30, enginePerPercent: 25 },
    /** Danger money: rescues, tows and fires in a squall or a sea over `stormHs` m pay this much more. */
    stormBonus: 0.5,
    stormHs: 1.8,
    rep: { transfer: 4, cargo: 2, fish: 1, log: 3, debris: 1, tow: 6, rescue: 10, fire: 8, contract: 8, contractFail: -6, lostCargo: -3, max: 100 },
    contracts: {
      perPort: 2,
      refresh: 600,
      tierRep: [0, 15, 40],
      kinds: {
        cargo: { counts: [4, 8, 12], bonusPer: 90, secondsPer: 480 },
        fish: { counts: [4, 8, 12], bonusPer: 35, secondsPer: 240 },
        logs: { counts: [1, 2, 3], bonusPer: 160, secondsPer: 720 },
      },
    },
    /** The bigger fuel tank upgrade: her tank's size times this. */
    bigTankFactor: 1.6,
    /** The boat the game starts in, and a new career's (owner, Oct 2026: the fleet's beginner boat, boats/fleet.ts). */
    boat: 'starterBoat',
    /**
     * What the boatyard at Calder Haven sells (its board on the shed: ui/yardBoard.ts). With
     * `fit`: add-ons, her equipment (a new career's boat comes without it; fitted, the game
     * starts again with her refitted): on the old workboat the sockets her recipe leaves empty
     * without it; on the beginner boat (boats/fleet.ts, a Shipyard design) the change to her
     * design it makes (`design`; none: it doesn't fit her). Without `fit`: upgrades to what she
     * has.
     */
    upgrades: [
      { id: 'trawlGear', name: 'Trawl gear', price: 2500, minRep: 5, fit: ['aFrame', 'trawl', 'helm/trawl'], desc: 'The A-frame over the transom, the net on its drum and the TRAWL switch' },
      { id: 'skiff', name: 'Skiff and her crane', price: 4000, minRep: 10, fit: ['tenderCrane'], desc: 'The skiff (a rubber dinghy with an electric outboard) in her cradle on the foredeck, and the crane to launch her' },
      { id: 'searchlight', name: 'Searchlight', price: 1500, minRep: 5, fit: ['searchlight', 'helm/spotlight', 'helm/spotJoystick'], design: { searchlight: 1 }, desc: 'The searchlight on the wheelhouse roof, its SPOT switch and joystick at the helm' },
      { id: 'fireMonitor', name: 'Fire monitor', price: 3000, minRep: 10, fit: ['fireMonitor', 'helm/firePump', 'helm/monJoystick'], design: { fireMonitor: 1 }, desc: 'The fire monitor on the roof, the FIRE PUMP switch, its joystick and gauge: the fire calls come once she has it' },
      // Owner, Oct 2026: the beginner boat comes without these, and the yard sells them. (`fit` empty:
      // the old workboat has hers already and keeps them.)
      { id: 'fenders', name: 'Fenders', price: 600, minRep: 0, fit: [], design: { guard: 1 }, desc: 'Fenders along her sides and a basket of spares: knocks alongside land on them, not her hull, and you can hang one between her and the quay by hand' },
      { id: 'lifeRing', name: 'Life ring', price: 400, minRep: 0, fit: [], design: { lifeRing: 1 }, desc: 'A life ring and a boat hook on the wheelhouse aft wall: the rescue calls come once she has it' },
      // Owner, Oct 2026: crew transfer to the wind farm wants a bow fender, and a quick way to
      // one without designing a new boat. The beginner boat's design with one (modules/bowFender;
      // the Shipyard's price, CONFIG.shipyard.bowFenderPrice). The old workboat can't take it.
      { id: 'bowFender', name: 'Bow fender', price: 6000, minRep: 0, fit: [], design: { bowFender: 1 }, boats: ['starterBoat'], desc: 'A thick rubber block on her bow, for crew transfer: push her against a wind turbine\'s boat landing and hold her there with the throttle while the technicians step across. It grips, so she doesn\'t slide' },
      { id: 'radar', name: 'Radar', price: 2400, minRep: 20, desc: 'Debris and floating crates on the plotter' },
      { id: 'ais', name: 'AIS receiver', price: 900, minRep: 0, desc: 'Passing ships on the plotter, by name and course, in any visibility' },
      { id: 'bigTank', name: 'Bigger fuel tank', price: 1400, minRep: 5, desc: 'Her fuel tank enlarged by 60 %: further between fills' },
      { id: 'towPost', name: 'Heavy towing post', price: 1500, minRep: 10, desc: 'The towline holds 75 % more before it parts' },
      { id: 'trawl', name: 'Bigger trawl', price: 1800, minRep: 10, needs: 'fishing.trawl', needsName: 'the trawl gear', desc: 'The net fills half as fast again' },
      { id: 'ice', name: 'Ice machine', price: 1200, minRep: 0, needs: 'fishing.trawl', needsName: 'the trawl gear', desc: 'Iced fish fetch 30 % more' },
      { id: 'craneComp', name: 'Crane motion compensation', price: 3500, minRep: 15, needs: 'deck.crane', needsName: 'a deck crane', desc: 'The deck crane holds its hook steady as she rolls, pitches and heaves' },
    ] as CareerUpgrade[],
    /**
     * Construction projects (owner, Oct 2026: "build another [wind farm] as the first project
     * ... 2 turbines or something, to prove the system"; career/projects.ts). A project is a
     * chain of stages offered at a harbour office; each stage is a handful of jobs, each paid
     * when done, the stage's `bonus` when the last is; the project's when the last stage is.
     * Its progress is saved with the career. Jobs:
     *   survey  run the line from `from` to `to` (world x, z), either way, at survey speed: every
     *           stretch of it (`projectSurvey.segments`) covered within `projectSurvey.width` m
     *           of it, heading along it (±`headingDeg`), at `speedKn` (min, max).
     *   buoy    a mark buoy (crane cargo on the office's quay) lifted out and lowered into the
     *           sea within `projectBuoy.radius` m of its spot `at`: it's laid there, a lit mark.
     *   tow     a floated monopile (a tug's tow, CONFIG.vessels.monopile) waiting at the laydown
     *           (`projectTow.laydown`), towed out and handed over at its turbine (`turbine`, an
     *           index into `turbines`) to the jack-up, which drives it in the background
     *           (`projectTow.driveS`). One at a time: the next comes out once the last is driven.
     *           Without a `turbine` it's for the jack-up itself (the transition pieces' barge):
     *           handed over alongside her, and she lifts each piece onto its foundation in turn
     *           (`projectTow.fitS` each).
     *   supply  `count` loads of `cargo` (hand cargo) on the office's quay, carried out and
     *           brought alongside the jack-up (`projectSupply`): her crane takes them aboard.
     *   guard   guard duty while the installation ship puts the turbines up (`projectInstall`):
     *           her work goes on only while a players' boat stands by the works, and stops
     *           while a ship is inside the zone. Ships are sent through now and then; meet one
     *           and she's called on the VHF and turns away. Paid when the last turbine's up,
     *           less `projectGuard.strike` for each ship that got into the zone.
     *   transfer  `techs` fitters for turbine `turbine` (once it's up), on the crew-transfer
     *           quay (CONFIG.transfer), put across onto its landing as a wind farm transfer.
     *           `commission`: they're its commissioning engineers: once they're up, the turbine
     *           is commissioned (`projectCommission.s`), its lights on and its rotor turning.
     * The last stage done and every turbine commissioned, the project's done: its `bonus`
     * paid, and the farm stands for good (CareerState.projectsDone).
     * Positions: Tarran Rig, two turbines in 40 m of open water about 1.1 km north of Calder
     * Haven, clear of Holm Rig and the fishing grounds; its zone boxed by four cardinals.
     */
    projects: [
      {
        id: 'tarranRig',
        name: 'Tarran Rig wind farm',
        port: 'calder',
        minRep: 0,
        desc: 'A new two-turbine wind farm north of Calder Haven: survey the site, then mark it out',
        /** Paid when the whole project is done: its last stage, every turbine commissioned. */
        bonus: 5000,
        turbines: [
          { x: 350, z: -420, landingDeg: 180 },
          { x: 600, z: -420, landingDeg: 180 },
        ],
        stages: [
          {
            name: 'Survey the site',
            bonus: 800,
            jobs: [
              { id: 'line1', kind: 'survey', name: 'Survey line 1 (north)', from: [150, -520], to: [800, -520], pay: 450 },
              { id: 'line2', kind: 'survey', name: 'Survey line 2 (middle)', from: [150, -420], to: [800, -420], pay: 450 },
              { id: 'line3', kind: 'survey', name: 'Survey line 3 (south)', from: [150, -320], to: [800, -320], pay: 450 },
              { id: 'met', kind: 'buoy', name: 'Met buoy', mark: 'special', at: [700, -560], pay: 600 },
            ],
          },
          {
            name: 'Mark the site',
            bonus: 1000,
            jobs: [
              { id: 'cardN', kind: 'buoy', name: 'North cardinal', mark: 'N', at: [475, -640], pay: 600 },
              { id: 'cardE', kind: 'buoy', name: 'East cardinal', mark: 'E', at: [820, -420], pay: 600 },
              { id: 'cardS', kind: 'buoy', name: 'South cardinal', mark: 'S', at: [475, -200], pay: 600 },
              { id: 'cardW', kind: 'buoy', name: 'West cardinal', mark: 'W', at: [130, -420], pay: 600 },
            ],
          },
          {
            name: 'Foundations',
            bonus: 2000,
            jobs: [
              { id: 'mono1', kind: 'tow', name: 'Monopile 1 to turbine 1', tow: 'monopile', turbine: 0, pay: 1800 },
              { id: 'mono2', kind: 'tow', name: 'Monopile 2 to turbine 2', tow: 'monopile', turbine: 1, pay: 1800 },
            ],
          },
          {
            name: 'Transition pieces',
            bonus: 2000,
            jobs: [
              { id: 'tps', kind: 'tow', name: 'Transition pieces to the jack-up', tow: 'tpBarge', pay: 2500 },
              { id: 'supply1', kind: 'supply', name: 'Bolts and grout for the jack-up', cargo: 'Building materials', count: 4, pay: 900 },
            ],
          },
          {
            name: 'Turbines',
            bonus: 3000,
            jobs: [
              { id: 'guard', kind: 'guard', name: 'Guard the works', pay: 3000 },
              { id: 'fit1', kind: 'transfer', name: 'Fitters to turbine 1', turbine: 0, techs: 3, pay: 700 },
              { id: 'fit2', kind: 'transfer', name: 'Fitters to turbine 2', turbine: 1, techs: 3, pay: 700 },
            ],
          },
          {
            name: 'Commissioning',
            bonus: 2000,
            jobs: [
              { id: 'comm1', kind: 'transfer', name: 'Commissioning crew to turbine 1', turbine: 0, techs: 2, pay: 800, commission: true },
              { id: 'comm2', kind: 'transfer', name: 'Commissioning crew to turbine 2', turbine: 1, techs: 2, pay: 800, commission: true },
            ],
          },
        ],
      },
    ] as ProjectDef[],
    /** Survey lines (see `projects`): stretches a line is cut into, how far off it counts (m), heading off it (deg), speed (kn). */
    projectSurvey: { segments: 13, width: 30, headingDeg: 25, speedKn: [2.5, 6.5] as [number, number] },
    /** Mark buoys (see `projects`): how near its spot it must go in to be laid (m), and its cargo kind (CONFIG.cargo.kinds). */
    projectBuoy: { radius: 25, kind: 'Mark buoy' },
    /**
     * Monopile tows (see `projects`). `laydown`: where each waits, held on its moorings until a
     * tug makes fast (world x, z; its heading, deg: lying north-south, south-west of Calder Haven's
     * mouth, clear of the fairway). Hand-over: within `handover.radius` m of its turbine, under
     * `handover.speed` m/s for `handover.holdS` s; then the jack-up drives it, `driveS` s.
     */
    projectTow: { laydown: { x: 370, z: 745, headingDeg: 0 }, handover: { radius: 30, speed: 0.4, holdS: 8 }, driveS: 120, fitS: 90, toJackUpRadius: 50 },
    /** Supplies for the jack-up (see `projects`): alongside her within `radius` m of her middle, under `speed` m/s for `holdS` s, and her crane takes what's aboard. */
    projectSupply: { radius: 45, speed: 0.5, holdS: 6 },
    /**
     * The jack-up that drives the piles (career/projectView.ts draws it; a set piece, no physics:
     * its legs are solid blocks). It stands `offsetM` north of the turbine it's working on, its
     * hull `hull` (length x width x depth, m) with its bottom `hullY` above the sea, on four
     * legs `legHalf` m half-width at `legSpacing` (across, along) between centres.
     */
    projectJackUp: { offsetM: 55, hull: [40, 30, 4] as [number, number, number], hullY: 14, legHalf: 1.2, legSpacing: [30, 22] as [number, number] },
    /**
     * The installation ship that puts the turbines up (a set piece like the jack-up, bigger:
     * career/projectView.ts). She stands `offsetM` north of the turbine she's on, her hull
     * `hull` (length x width x depth, m) `hullY` above the sea on legs at `legSpacing`. Each
     * turbine takes `erectS` s of work, in three lifts: the tower, then the nacelle (from
     * `nacelleAt` of the way), then the rotor (from `rotorAt`).
     */
    projectInstall: { offsetM: 60, hull: [80, 36, 6] as [number, number, number], hullY: 16, legHalf: 1.8, legSpacing: [64, 28] as [number, number], erectS: 240, nacelleAt: 0.4, rotorAt: 0.65 },
    /**
     * Guard duty (see `projects`). The work goes on while a players' boat is within `standBy` m
     * of the installation ship, and stops while a ship is within `zone` m of her. A ship is
     * sent for the works every `every` s (a range; one at a time), starting `from` m off;
     * come within `hail` m of her and she's called on the VHF and alters away. Each that gets
     * into the zone costs `strike` of the guard job's pay (it never pays under `minPay`).
     */
    /** Commissioning (see `projects`): a turbine is commissioned this long after its engineers are up (s). */
    projectCommission: { s: 90 },
    projectGuard: { standBy: 900, zone: 400, every: [50, 110] as [number, number], from: 1700, hail: 300, strike: 600, minPay: 600 },
  },

  /**
   * Damage and wear (vessel/wear.ts). Hull: a hit faster than `impactSafe` m/s (about 2 kn:
   * docking speed is fine) does (v - impactSafe)^2 x `impactDamage`; grinding over the
   * bottom (sliding faster than `slideSafe` m/s under more than `grindForce` N) does
   * `grindDamage` per metre. Damage leaks `leakRate` of the bilge per second at 1 (the pump
   * clears 1/90 per s: it keeps up below ~0.45). A full bilge weighs `bilgeMassFull` kg.
   * Engine: wear per s per °C over `hotC`, and per s with the sump under `lowOil`; at
   * wear 1 the rack is capped at 1 - `powerLoss`.
   */
  wear: {
    impactSafe: 1.0,
    impactDamage: 0.08,
    slideSafe: 0.4,
    grindForce: 20000,
    grindDamage: 0.02,
    /** Rubbing on the guards damages her only in a sea over this scale (a storm), at this much per m. */
    stormSea: 2.5,
    /** Voyage: a boat just come into the world, or sent to a port, takes no hull damage for this long (s): she settles into her berth or the water without it counting as a crash. */
    spawnGraceS: 10,
    stormRubDamage: 0.002,
    /** Damage or wear over this blinks the HULL / ENGINE lamp (on from the duty board's thresholds). */
    badAt: 0.5,
    leakRate: 1 / 40,
    bilgeMassFull: 3000,
    hotC: 98,
    hotWear: 0.0004,
    lowOil: 0.15,
    dryWear: 0.004,
    powerLoss: 0.5,
  },

  /**
   * Log salvage (salvage/salvage.ts): logs wash up on beaches every `every` s (the first
   * after `firstAfter`), at most `max`, `length` m long, `mass` kg. Pulling one off the
   * beach takes more than mu_s m g (~8 kN) on the line; sliding, mu_k. Afloat it drags
   * (dragLinear + dragQuad |v|) v N, and floats once the ground is `floatDepth` m under.
   * Beach spots: water `reachDepth` m deep `reachOut` m off the shore, `portClear` m from
   * ports; logs wash up at least `minDistance` m from the boat and go after `expire` s
   * if nobody comes. The towline to a log is longer (`line`): we stand off the beach.
   */
  salvage: {
    every: [240, 540] as [number, number],
    firstAfter: 120,
    max: 3,
    length: [7, 11] as [number, number],
    mass: 1500,
    frictionStatic: 0.55,
    frictionKinetic: 0.4,
    dragLinear: 250,
    dragQuad: 450,
    floatDepth: 0.4,
    reachDepth: 2.2,
    reachOut: 20,
    portClear: 300,
    minDistance: 500,
    expire: 1800,
    /** Debug "log on the nearest beach": within this of the boat (m). */
    debugNear: 3000,
    line: { length: 30, attach: 30 },
  },

  /**
   * Fishing (fishing/fishing.ts): the grounds (centre, radius m, richness), trawling speed
   * (m/s; 1.0-2.3 is 2-4.5 kn), seconds of good trawling per box at richness 1, how long the
   * net takes out and in (s), where it fouls (shallower than m), and its drag on the boat:
   * (dragLinear + dragQuad |v|) v N (~10 kN at 3 kn), fouled `foulDrag` |v| and a
   * `foulHold` N pull astern. The catch is boxed on deck by where the codend was emptied (codendBoxes, below).
   */
  fishing: {
    // The grounds themselves (where, how rich) are level data: each region's `fishingGrounds`.
    minSpeed: 1.0,
    /**
     * Raised from 2.1 (4 kn) with the drag below (owner feedback after V1.0: the trawling
     * speed was hard to hold, too fast). With the net out she now makes about 1.9 kn idling
     * in gear, 2 kn at 12 % lever, 4 kn at ~55 % and 4.5 kn at ~65 %: half the lever's
     * ahead travel is good trawling, where before it was 8-23 %.
     */
    maxSpeed: 2.3,
    boxEvery: 40,
    /** The bigger trawl (career upgrade) fills this much faster. */
    bigTrawlFactor: 1.5,
    shootTime: 10,
    haulTime: 12,
    /**
     * The catch comes aboard in the net (owner, Oct 2026: "pull the fish in the net instead of
     * auto-loading the crates"). Trawling, the catch builds up in the codend, at most
     * `codendBoxes` boxes' worth. Hauled, once the warps are in (`haulTime`) the net comes up
     * the stern and the A-frame swings the codend in over the deck (`liftTime` s); RELEASE
     * empties it on deck, where the crew boxes the heap, a box every `boxTime` s (into the fish
     * hold first, if she has one); then the A-frame swings back out and the net goes back on
     * its drum (`stowTime` s). Where the codend goes: fishing/codend.ts (`codend`: astern and
     * deep, the surface `surfaceAft` astern of the gallows by lift `surfaceAt`, hanging `hang`
     * under the lifting block by `hangAt`). Drawn `radius` round empty, growing by
     * `radiusPerBox` (as the cube root of what's in it), its fish pouring out over `pourTime` s.
     */
    codendBoxes: 12,
    liftTime: 12,
    stowTime: 8,
    boxTime: 3,
    codend: { astern: 22, depth: 2.5, surfaceAft: 3, surfaceAt: 0.45, hangAt: 0.7, hang: 1.35, radius: 0.2, radiusPerBox: 0.17, pourTime: 1.5 },
    snagDepth: 7,
    /** No fishing in a sea bigger than this (Hs, m). */
    maxHs: 2.2,
    /** Tripled after V1.0: the old net (3.5 kN at 3 kn) let her make 3 kn idling in gear. */
    dragLinear: 1800,
    dragQuad: 3000,
    /** Fouled on the bottom: well above the net's normal drag (27 kN at 1.5 m/s). */
    foulDrag: 18000,
    foulHold: 6000,
  },

  /**
   * Wildlife (wildlife/wildlife.ts): decoration, a pure function of world time and the
   * boat's pose. Gulls: how many, the radius (m), height above the sea (m) and turn rate
   * (rad/s) of their circles, how far their centres wander about the boat (m). Dolphins: a
   * pod of `count` in most (`chance`) slots of `every` s, staying `stay` s, if she's doing
   * more than `minSpeed` m/s in water deeper than `minDepth` m, `minPortDistance` m from a
   * port. Faster than `maxSpeed` m/s (owner: about 9 kn, what they can keep up with) they
   * don't come, and a pod already at the bow drops back astern over `fallBack` s (and comes
   * up again if she slows while the visit lasts). Neither come out after dark (darkness
   * above `night`, 0 day .. 1 night).
   */
  wildlife: {
    gulls: { count: 6, radius: [12, 35] as [number, number], height: [7, 18] as [number, number], turnRate: [0.15, 0.32] as [number, number], wander: 12 },
    dolphins: { count: 4, every: 300, chance: 0.6, stay: 70, minSpeed: 2, maxSpeed: 4.6, fallBack: 5, minDepth: 12, minPortDistance: 500 },
    night: 0.6,
    /** Seconds between gull calls (when gulls are about). */
    gullCallEvery: [4, 12] as [number, number],
  },

  /**
   * Fire missions (fire/fire.ts; the monitor itself is CONFIG.vessels.workboat.fireMonitor).
   * Out of harbour with no other job on, a fire is reported every so often: a fishing boat
   * burning at sea (`shoreChance` of the time a fire ashore instead, if a spot is found).
   * It starts at `startIntensity`, grows at `growth` per s to 1, and the jet knocks it down
   * at `douse` per s at full flow on target (net: about a minute's steady hosing from
   * full). Out below `outBelow`; the wreck smoulders `removeAfter` s. The jet hits within
   * `hitRadius` m of it, up to the flames' height (`flameHeight` x 0.4..1 with intensity).
   */
  fire: {
    /** Seconds between fire calls (doubled after V1.0, owner: too many calls; was 300-660). */
    every: [600, 1320] as [number, number],
    shoreChance: 0.5,
    ahead: [400, 800] as [number, number],
    offset: [100, 300] as [number, number],
    minDepth: 6,
    minPortDistance: 350,
    /** Ashore: ground this high (m), with water `minDepth` deep within `shoreReach` m, within `shoreRange` m of us. */
    shoreHeight: [0.8, 6] as [number, number],
    shoreReach: 45,
    shoreRange: 1500,
    callTimeout: 120,
    /** The radio's call alert repeats this often while unanswered (s; was 10, owner: too insistent). */
    callRepeat: 20,
    startIntensity: 0.6,
    growth: 0.004,
    douse: 0.02,
    outBelow: 0.03,
    /** The coastguard calls the progress as the fire comes below these fractions of full (owner: better feedback). */
    progressCalls: [0.5, 0.2] as [number, number],
    removeAfter: 40,
    hitRadius: { boat: 5, shore: 6 } as Record<'boat' | 'shore', number>,
    flameHeight: { boat: 5, shore: 7 } as Record<'boat' | 'shore', number>,
    /** Debug "fire off the bow": this far ahead (m). */
    debugDistance: 45,
  },

  /** Port lighting: the shared floodlight for the nearest port at night. */
  portLights: {
    /** Floodlight intensity (cd) and reach (m); only on within `activeRange` m of the port. */
    floodIntensity: 1600,
    floodDistance: 70,
    activeRange: 500,
    /** Lamp glow colour (warm LED / sodium). */
    lampColor: 0xffd9a0,
  },

  /** Cargo between ports (cargo/cargo.ts). */
  cargo: {
    /**
     * Each port keeps this many items waiting (a delivery spawns a replacement elsewhere).
     * 12 (owner, Oct 2026: "significantly more cargo now that the boats are bigger"; it was
     * 5), stacked in rows of `stackRow` along the quay, the rows `stackRowGap` (m) apart,
     * back from the water.
     */
    perPort: 12,
    /** Goods waiting ashore are drawn only this near you (m: cargo/cargoView.ts). */
    drawRange: 400,
    stackRow: 6,
    stackRowGap: 1.1,
    /**
     * Crane cargo (owner, Oct 2026: "some cargo ... can only be lifted on by the cargo
     * crane, so larger, heavier cargo"): the `kinds` named here can't be carried by hand,
     * only lifted by a deck crane's hook. `perPort` of them wait at each port with a cargo
     * berth (and go only to another), in a row along the berth's quay edge, `edgeIn` (m) in
     * from it and `spacing` apart, centred on the berth: within reach of a crane on a boat
     * lying there, on her quay side or across her deck (the workboat's crane runs out to
     * 5.4 m, lifting 800 kg × 3.4 / 5.4 ≈ 500 kg there: so 450 kg at most). Move her along
     * the quay to come under the next. They pay `payFactor` times a hand item's rate.
     */
    crane: {
      kinds: ['Pallet of blocks', 'Engine block', 'Chain basket'] as readonly string[],
      perPort: 3,
      edgeIn: 1.1,
      spacing: 2.4,
      payFactor: 3,
      note: 'crane only: lift it with a deck crane',
    },
    /** Counts as anchored in a port's bay only nearly stopped (m/s). */
    maxSpeed: 0.6,
    /** Set an item down ashore within this of its destination's goods stack to deliver it (m). */
    deliveryRadius: 12,
    /** Spacing of items waiting in a port's stack row (m). */
    stackSpacing: 0.9,
    /**
     * Said of goods for a port with no quay, only an anchorage (owner, Oct 2026: the beginner
     * boat has no skiff; you can anchor and swim them ashore, but a boat with a skiff lands
     * them easier): on the goods' labels and the job offers there.
     */
    anchorageNote: 'no quay: land it by skiff, or anchor in the bay and swim it ashore',
    /**
     * Kinds of cargo, all man-portable (carried by hand): name, mass (kg), size (m: across,
     * height, along) and shape. Above `twoHandKg` an item needs both hands. `slots`: room
     * it takes in a small boat with a slot limit (the skiff: two crates, or one drum).
     */
    kinds: [
      { name: 'Crate', mass: 40, size: [0.6, 0.45, 0.5] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Fish box', mass: 30, size: [0.8, 0.3, 0.5] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Sack', mass: 50, size: [0.55, 0.3, 0.85] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Gas bottle', mass: 70, size: [0.32, 1.1, 0.32] as [number, number, number], shape: 'drum' as const, slots: 1 },
      { name: 'Oil drum', mass: 110, size: [0.58, 0.88, 0.58] as [number, number, number], shape: 'drum' as const, slots: 2 },
      // The regions' goods (the Sounds): the same crates and drums, different contents.
      { name: 'Feed sack', mass: 45, size: [0.6, 0.35, 0.9] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Building materials', mass: 60, size: [0.8, 0.5, 0.6] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Whisky cask', mass: 80, size: [0.6, 0.85, 0.6] as [number, number, number], shape: 'drum' as const, slots: 2 },
      // The Fjord's: feed pellets for the farm, salmon from it (iced, in an insulated box), sawn timber.
      { name: 'Feed pellets', mass: 40, size: [0.6, 0.3, 0.85] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Salmon box', mass: 32, size: [0.9, 0.35, 0.5] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Timber', mass: 70, size: [0.5, 0.4, 1.6] as [number, number, number], shape: 'box' as const, slots: 2 },
      // The Narrows': the cannery's canned fish out; groceries in (fuel comes in the oil drums).
      { name: 'Canned fish', mass: 45, size: [0.6, 0.4, 0.45] as [number, number, number], shape: 'box' as const, slots: 1 },
      { name: 'Groceries', mass: 30, size: [0.55, 0.4, 0.45] as [number, number, number], shape: 'box' as const, slots: 1 },
      /**
       * A lobster / crab pot (potting/potting.ts): not trade cargo (never spawned at the
       * ports' goods stacks), but carried, stowed and lashed the same way. A creel: a
       * boxy frame with netting, its line coiled on top and the marker buoy tied to it.
       */
      { name: 'Pot', mass: 24, size: [0.75, 0.42, 0.5] as [number, number, number], shape: 'pot' as const, slots: 2 },
      // Crane cargo (`crane` above): too heavy to carry, lifted by a deck crane.
      { name: 'Pallet of blocks', mass: 420, size: [1.1, 0.75, 1.1] as [number, number, number], shape: 'box' as const, slots: 4 },
      { name: 'Engine block', mass: 380, size: [1.0, 0.8, 0.8] as [number, number, number], shape: 'box' as const, slots: 3 },
      { name: 'Chain basket', mass: 450, size: [0.95, 0.7, 0.95] as [number, number, number], shape: 'drum' as const, slots: 3 },
      // A construction project's mark buoy (career/projects.ts), on its float: crane only, never trade cargo.
      { name: 'Mark buoy', mass: 420, size: [1.1, 1.5, 1.1] as [number, number, number], shape: 'drum' as const, slots: 4 },
      // A salvage crate from a dive (dive/diveReturn.ts): its own mass (the find's), from 40 kg.
      { name: 'Salvage', mass: 40, size: [0.8, 0.55, 0.7] as [number, number, number], shape: 'box' as const, slots: 2 },
    ],
    /** How many of `kinds` (from the start) are trade cargo, spawned at the goods stacks. */
    tradeKinds: 13,
    twoHandKg: 60,
    /**
     * Unlashed cargo on deck slides when the apparent gravity along the deck (heel, trim,
     * the deck's own accelerations in a seaway, slams) beats friction: wood/steel on a wet
     * steel deck, μ ≈ 0.35. Pressed against the bulwark by more than `overboardG` (in g)
     * along the deck, it goes over the rail.
     */
    friction: 0.35,
    overboardG: 0.55,
    /** Accelerations above this (g) are clipped: penalty-contact spikes aren't real. */
    maxDeckG: 3,
  },

  /**
   * Dynamic weather (environment/weather.ts). One state - wind, visibility, rain, cloud -
   * moving between presets by smooth transitions; the sea follows the wind with a lag.
   *   presets   wind (m/s), visibility (m), rain and cloud (0..1)
   *   next      which presets may follow which (never clear straight to squall), weights
   *   hold      how long a preset holds before the director moves on (s, real time),
   *             squalls are short (`squallHold`)
   *   transition  time constant (s) of the values easing toward a new preset
   *   seaPerWind  sea scale per m/s of wind (CONFIG.ocean.seaStates: 1 = moderate)
   *   seaBuild / seaDecay  time constants (s): the sea builds after the wind, and settles slower
   *   windDir  the wind comes FROM this bearing, wandering +-`windDirSpread`
   * Fog banks (where, how thick) are level data: each region's `fogBanks` (world/regions/).
   */
  /**
   * Katabatic gusts (environment/gusts.ts; the zones are each region's `gusts`, when they fall
   * its weather profile's `katabatic`).
   *   rise, fall   a gust comes up over `rise` s and dies away over `fall` s
   *   flutter      it pulses: its strength dips by up to this fraction (two slow sines)
   *   edge         across its zone it fades out over this outer fraction of the radius
   *   nearBias     how often it falls on the zone nearest the home boat (else any of the region's)
   *   maxBaseWind  no gusts while the weather's own wind is over this (m/s): lost in a gale
   *   firstAfter   the first one falls this long after you come into a region with gusts (s)
   *   debugLast    the debug menu's "Gust now" blows this long (s)
   *   lead         the dark patch on the water shows this long before the wind arrives (s)
   *   look         its patch on the water: how much darker, how much streaked with spray (0..1)
   */
  gusts: {
    rise: 4,
    fall: 10,
    flutter: 0.3,
    edge: 0.4,
    nearBias: 0.7,
    maxBaseWind: 9,
    firstAfter: 90,
    debugLast: 45,
    lead: 3,
    look: { darken: 0.3, spray: 0.4 },
  },

  /**
   * The cloud layer (environment/clouds.ts, drawn in the sky dome by skyView.ts: no extra
   * draw call; two looks into a small noise picture per sky pixel).
   *   lead        a change of weather shows on the upwind horizon this long before it comes (s)
   *   rainDark / cloudDark  how dark a weather's cloud is: rain x rainDark + cover x cloudDark
   *   scale       how many noise tiles across the cloud deck per deck height (bigger: smaller clouds)
   *   drift       the deck moves with the wind: tiles per metre the wind blows (so clouds
   *               cross the sky in a few minutes in a fresh breeze)
   *   upwind      where across the sky the upwind side takes over: from `upwind[0]` to
   *               `upwind[1]` deck heights out along the wind (0 overhead)
   *   horizon     clouds thin into the haze over this height above the horizon (sky dir y)
   *   baseDark    how dark the darkest cloud base is, as a fraction of the horizon's colour
   *   minCover    even the clearest sky has this much fair-weather cloud (of the sky, 0..1)
   *   flash       how much a lightning flash lights up the clouds
   *   noiseSize   the noise picture (pixels square, tiling)
   */
  clouds: {
    lead: 300,
    rainDark: 1,
    cloudDark: 0.25,
    scale: 0.35,
    drift: 0.0004,
    upwind: [-0.4, 3] as [number, number],
    horizon: 0.05,
    baseDark: 0.16,
    minCover: 0.15,
    flash: 1.6,
    noiseSize: 128,
  },

  /**
   * Small lights drawn as points (render/lightPoints.ts: ships' nav lights, buoys, harbour
   * lamps): `size` px at `ref` m, shrinking with distance between `min` and `max` px.
   */
  lightPoints: { size: 7, ref: 120, min: 2.2, max: 14 },

  /**
   * The moon (environment/environmentView.ts): after dusk (the sun under `from` degrees) the
   * night's light comes from the anti-sun point, as a full moon does: `light` is its
   * directional strength (the sun's is up to 3), `ambient` what it adds to the sky light,
   * `color` its cool white. Cloud dims it as it does the sun. Owner: the night sea was very dark.
   */
  moon: { from: -6, full: -12, light: 0.35, ambient: 0.1, color: 0xc4d2ff },

  weather: {
    startPreset: 'Clear' as WeatherPresetName,
    /** Fix the weather to the start preset for a session (no director). */
    fixed: false,
    presets: {
      Clear: { wind: 5, visibility: 20000, rain: 0, cloud: 0.1 },
      Overcast: { wind: 7, visibility: 9000, rain: 0, cloud: 0.85 },
      Fog: { wind: 2.5, visibility: 220, rain: 0, cloud: 0.6 },
      Rain: { wind: 10, visibility: 2500, rain: 0.6, cloud: 1 },
      Squall: { wind: 17, visibility: 900, rain: 1, cloud: 1 },
    },
    next: {
      Clear: { Clear: 2, Overcast: 3, Fog: 1 },
      Overcast: { Clear: 3, Rain: 2, Fog: 1 },
      Fog: { Clear: 2, Overcast: 2 },
      Rain: { Overcast: 3, Squall: 1 },
      Squall: { Rain: 1 },
    },
    /** How long each weather holds (s). Doubled after V1.0 (owner: the weather changed too often; was 240-600). */
    hold: [480, 1200] as [number, number],
    squallHold: [90, 150] as [number, number],
    transition: 60,
    seaPerWind: 0.12,
    /**
     * The biggest sea the wind alone raises (sea scale; 3 = Hs about 3.6 m): the game's own
     * weather as it was before the cap above went up to 5. Bigger seas come only from a
     * marine forecast (live weather) or by hand (Debug).
     */
    windSeaMax: 3,
    seaBuild: 90,
    seaDecay: 160,
    windDir: 225,
    windDirSpread: 35,
    // Fog banks (where, how thick) are level data: each region's `fogBanks`.
    /**
     * Fog: scene fog runs from `nearFraction` x the fog's far end to that end. In fog
     * (visibility under ~3 km) the near end is close in, `nearFraction`; in clear air it
     * stands further out, `hazeNearFraction` of the haze distance, so the sea is crisp for
     * the first few kilometres and the far land only softens. Blended between the two in
     * log(visibility) between 3 and 13.5 km.
     */
    nearFraction: 0.12,
    hazeNearFraction: 0.35,
    /** Leeway: air density (kg/m3) and drag coefficient on the boats' windage (vessel `windage`). */
    airDensity: 1.225,
    windCd: 1.0,
    /**
     * How far the centre of effort moves toward the upwind end with the wind ahead or
     * astern (fraction of the length; a flat plate's centre of pressure is near its leading
     * quarter at a fine angle, mid-plate side-on). This is what turns a stopped boat
     * beam-on to the wind, as real ones lie.
     */
    windCeShift: 0.25,
    /** Things floating in the water drift downwind at this fraction of the wind speed. */
    driftPerWind: 0.02,
    /** The thrown life ring is pushed downwind in flight at this fraction of the wind (m/s^2 per m/s). */
    ringPushPerWind: 0.06,
    /** Rain darkens the light a little more than cloud alone (fraction at full rain). */
    rainDarken: 0.3,
    /**
     * Lightning in squalls: a flash every `every` s (random in the range), `dist` m away
     * (random); thunder follows at the speed of sound.
     */
    lightning: { every: [10, 30] as [number, number], dist: [500, 4000] as [number, number], flashTime: 0.35 },
    /**
     * Shipping forecast on the VHF (every 12 min since V1.0, was 6): every `every` s, and `afterChange` s after the weather
     * turns (the plan for the next change is new). Received only with the radio on.
     */
    forecast: { every: 720, afterChange: 30 },
  },

  /**
   * Rain (view only): streaks in a box around the viewer, one draw call, animated in the
   * vertex shader - no per-frame CPU work. `count` at full rain on high quality, `lowCount`
   * on low; they don't fall inside the wheelhouse.
   */
  rain: {
    count: 1400,
    lowCount: 500,
    /** Box around the viewer (m): width/depth and height. */
    area: 16,
    height: 8,
    /** Fall speed (m/s) and streak length (m). */
    speed: 9,
    length: 0.45,
    opacity: 0.6,
    /** Window rain: drops build back up this long after a wipe at full rain (s); drop grid (m). */
    /**
     * In the headset, on "High": if frames take longer than `autoLowFrameMs` on average
     * over `autoLowSeconds` while it rains, drop to Low for the session (and say so).
     */
    autoLowFrameMs: 16.5,
    autoLowSeconds: 3,
    glassRefill: 3.5,
    glassCell: 0.022,
    /**
     * Pantograph wipers, pivoted on the header above each front pane: one sweep there and
     * back (s), and the pivot's height above the window head (m). Each wiper is sized to its
     * own pane (owner: they didn't grow with the windows; rainGlass.ts wiperFit): its arm and
     * blade as long as the pane's height allows, its sweep at most `wiperSweepDeg` either side
     * and no wider than keeps the blade `wiperEdge` (m) inside the pane's sides; the blade
     * clears the sill and the head by `wiperMargin` (m).
     */
    wiperPeriod: 1.7,
    wiperSweepDeg: 45,
    wiperPivotAbove: 0.1,
    wiperMargin: 0.02,
    wiperEdge: 0.06,
  },

  /**
   * Spotting: the lookout calls out something in the water within this range (m) - or the
   * visibility, if less. A survivor's strobe shows through fog to `strobeVisFactor` x the
   * visibility; their arm waving is seen within the visibility.
   */
  spotting: { range: 900, strobeVisFactor: 1.6 },

  /** The duty board's game-generated task list (duties/duties.ts). */
  /**
   * Passing ships and hazards (traffic/traffic.ts). `maxShips` AI ships are kept about
   * (owner request: 4): while there are fewer, one is spawned every `every` s (random in the
   * range; the first `firstShip` s in) on a straight course that crosses ahead of the
   * workboat `pass` m off at its closest, starting `spawnDist` m away, its whole track in
   * deep water; it goes when it's `despawn` m off and moving away. In harbour too, as long
   * as such a track exists (debris only out of harbour). Ship types:
   * length, beam, speed (m/s), AIS names. Sighted within min(`sightRange`, visibility x
   * `sightVis`). In restricted visibility they sound a prolonged blast every 2 min, and
   * answer yours. Hazards: floating debris (spawned like ships, drifting). The fixed
   * hazards (rocks, a reef, a wreck) and their buoys are world data (archipelago.ts MARKS).
   */
  traffic: {
    every: [20, 45] as [number, number],
    firstShip: 5,
    maxShips: 4,
    spawnDist: [1800, 2600] as [number, number],
    pass: [350, 900] as [number, number],
    despawn: 3600,
    sightRange: 2500,
    sightVis: 1.1,
    /** Shortest gap between two ship sightings the lookout calls (s). */
    sightEvery: 300,
    hornRange: 3000,
    /** Each type's size, speed, names, and the least water it keeps to (m; the cargo ship needs a deep channel, a yacht gets about in the shallows). */
    ships: {
      cargo: { length: 82, beam: 13, speed: 6.5, minDepth: 8, names: ['Hebridean Trader', 'Lorne Carrier', 'Skerry Star'] },
      fishing: { length: 19, beam: 6, speed: 4, minDepth: 4, names: ['Morning Dew', 'Silver Harvest', 'Girl Isla'] },
      yacht: { length: 12, beam: 3.8, speed: 3, minDepth: 3, names: ['Kittiwake', 'Blue Moon', 'Saorsa'] },
    },
    /**
     * Confined waters (owner, Oct 2026: traffic on the Voyage maps too; in a loch or a bay no
     * ship can run a 4 km straight track in deep water). When no full-length track crossing
     * ahead of us can be found, `tries` points on any bearing from the boat, `minPass` to
     * `maxPass` m off, are each tried on `courses` courses (well under a millisecond), and the longest clear run (at
     * least `minBack` m each side of the point) taken; the ship starts at its back end, at
     * least `minStart` m from us (not appearing in plain view). Under way, a ship looks
     * `lookAhead` m ahead each tick; with its water shoaling it alters course to the clearest
     * of a few turns (its course easing round at `turnRate` deg/s), or, with nowhere to go,
     * is gone (into a harbour, as far as anyone can tell).
     */
    confined: { tries: 96, courses: 8, minPass: 250, maxPass: 1500, minBack: 300, minStart: 500, lookAhead: 220, turnRate: 6 },
    debrisEvery: [300, 600] as [number, number],
  },

  /**
   * The overhead chartplotter (nav/chartPlotter.ts). On a coast map its land, shallows and sea
   * are drawn as shapes cut from the ground's mesh (nav/chartLand.ts), sharp at any zoom; a
   * square's shapes are made the first time it's in view, for at most `buildMs` each redraw
   * (a few times a second), nearest first, so a map's first look never stalls a frame (the
   * map's coarse picture shows meanwhile).
   */
  chartPlotter: {
    buildMs: 4,
    /**
     * Its zoom (owner, Oct 2026: "add zoom buttons"): − and + under the screen step through
     * these, the width of ground across the screen (m); AUTO (between them) goes back to
     * choosing it for you (what matters now in view: 700 m to 5 km).
     */
    ranges: [250, 500, 1000, 2000, 4000, 8000, 16000, 32000],
  },
  /**
   * Pencil marks on the paper chart (chart/marks.ts). Strokes are stored in world metres
   * (so they line up with the map), points kept at least `minStepM` m of chart apart and
   * rounded to `quantM`. Over `maxPoints` in all, the oldest strokes go (the oldest ones
   * are drawn fainter as the cap nears, as if rubbed). Table side (m): the pencil touches
   * within `contactMm` of the paper; the eraser rubs out within `eraseRadius`. Hold the
   * eraser's trigger `clearHold` s to clear the chart. `showOnPlotter`: the crew's marks faintly on the chartplotter too.
   */
  chartMarks: {
    maxPoints: 4000,
    minStepM: 15,
    quantM: 0.5,
    contactMm: 6,
    eraseRadius: 0.012,
    clearHold: 2,
    sendEvery: 0.1,
    showOnPlotter: true,
  },

  duties: {
    /** A finished duty stays up, ticked, this long (s), then drops off. */
    doneLinger: 15,
    /** Hull damage and engine wear above which they go on the board (vessel/wear.ts). */
    damageAt: 0.02,
    wearAt: 0.1,
    /** Restricted visibility (COLREG rule 35): under way in visibility below `fogVis` (m)... */
    fogVis: 1000,
    /** ...until it clears above `fogClearVis`: a prolonged blast (>= `blastMin` s) every `blastEvery` s. */
    fogClearVis: 1500,
    blastMin: 4,
    blastEvery: 120,
    /** Heavy weather: a received forecast of rain or a squall counts for this long (s). */
    forecastValid: 900,
  },

  /** Water effects (all one draw call each; see vessel/view/wakeTrail.ts and spray.ts). */
  effects: {
    /**
     * Diesel exhaust smoke (vessel/exhaust.ts: the model; vessel/view/exhaustSmoke.ts: the
     * drawing). Owner, Oct 2026: a small simulation of why a diesel smokes, not a lookup.
     *
     * A diesel always takes a full charge of air and injects fuel into it; it smokes BLACK
     * (soot) when the air–fuel ratio goes rich of the smoke limit, as it can't burn all the
     * fuel: lugging (full rack, revs well down: a turbo gives little boost at low revs, and a
     * mechanical pump delivers more per stroke slowly), a throttle snap (the rack opens before
     * the turbo spools up: turbo lag), or an overloaded engine. It smokes WHITE when cold
     * (fuel and water vapour unburnt: a cold block, poor atomisation), BLUE when it burns its
     * lube oil (worn rings and guides: a worn engine, most at idle and when cold). Warm, clean
     * and within its power it shows a faint grey haze only.
     *
     *   lambdaFull    the air–fuel ratio, relative to stoichiometric, at full rack and rated
     *                 revs, warm: the maker's smoke limit (naturally aspirated / turbocharged);
     *                 `slowEngine`, a slow-revving heavy one's
     *   smokeLambda   soot starts to show below this ratio; blackLambda: solid black
     *   turbo         boost at full exhaust energy (1 = twice the air) and how long it takes
     *                 to spool up (s; it falls off twice as fast). Turbocharged engines are
     *                 the ones whose voice has a turbo (CONFIG.engineVoices).
     *   lugFuel       a mechanical pump's over-delivery: fuel per stroke at full rack rises
     *                 by this from rated revs down to a standstill
     *   snapFuel      the transient over-fuelling as the rack swings open (per unit of rack
     *                 per second)
     *   coldC         white smoke from the block stone cold up to this temperature (°C),
     *                 gone by coldClearC
     *   blueWear      how much blue a worn-out engine (wear 1) makes at idle
     *   haze          the opacity of the clean warm engine's haze
     *   jet, jetPerRpm, lift, rise   how fast it leaves the outlet (m/s: jet + jetPerRpm ×
     *                 rpm fraction), its upward kick (m/s, plus as much again at random),
     *                 and the plume's drift upward as it drags to still air (m/s)
     *   greyHaze, greyBlack   the grey of the haze and of solid soot, fresh from the outlet
     *                 (linear light: 0.16 shows as a mid grey, 0.02 as near black)
     *   greyAge       how much it lightens as it disperses (over its life)
     *   rate, ratePerOpacity   particles per second from a warm engine at rated revs: rate +
     *                 ratePerOpacity × the smoke's opacity (fewer at low revs)
     */
    exhaust: {
      lambdaFull: { natural: 1.45, turbo: 1.7 },
      /**
       * A slow-revving heavy-duty engine's full-load ratio (owner, Oct 2026: the tug's smoke
       * "wasn't black"): one rated at or under `ratedRpm` (the tug diesel) is set up rich for
       * torque, `lambdaFull`, so worked hard it smokes: black opened up from idle, dark
       * grey-black towing a heavy tow flat out; clean once she's running free.
       */
      slowEngine: { ratedRpm: 1200, lambdaFull: 1.15 },
      smokeLambda: 1.35,
      blackLambda: 0.95,
      turbo: { maxBoost: 1.0, lagS: 1.5 },
      lugFuel: 0.3,
      snapFuel: 0.4,
      coldC: 25,
      coldClearC: 60,
      blueWear: 0.6,
      haze: 0.12,
      jet: 1.4,
      jetPerRpm: 2.2,
      lift: 0.3,
      rise: 0.4,
      greyHaze: 0.16,
      greyBlack: 0.02,
      greyAge: 0.08,
      rate: 10,
      ratePerOpacity: 60,
      /**
       * A tug's cooling water out of its hole in her side (owner, Oct 2026: "the cooling
       * water spits out the side close to the water line... intermittently, as the pump spits
       * out some water"; ExhaustFitting `water`): while the engine runs, a spurt every
       * `everyS` seconds (a random time between the two; more often with more revs: `perRpm`
       * shortens it by up to that share at rated revs), each `drops` drops over `spurtS`
       * seconds, leaving at `speed` m/s (± `spread`), falling as water does.
       */
      water: { everyS: [0.9, 2.4] as [number, number], perRpm: 0.5, drops: 30, spurtS: 0.5, speed: 3.0, spread: 0.6, size: 0.32 },
    },
    wake: {
      /** Ring-buffer size; with the spacing below this must cover `life` at full speed. */
      maxPoints: 220,
      /** A new trail point every this many metres travelled... */
      spacing: 1.2,
      /** ...or this often (s) while the prop churns with the boat (nearly) stopped. */
      idleInterval: 0.35,
      /** Seconds until the foam has gone. The prop wash in the middle fades sooner. */
      life: 26,
      washLife: 9,
      /** Half-width at the transom (m), and how fast the arms spread per m/s of speed (m/s). */
      startHalfWidth: 1.7,
      /** tan(19.47°) - the Kelvin wake half-angle - softened. */
      spreadPerSpeed: 0.3,
      maxSpread: 2.5,
      /** Speed (m/s) for full-strength arms, and thrust (N) for full-strength prop wash. */
      fullArmSpeed: 4,
      fullWashThrust: 25000,
      /**
       * The propeller's jet (owner: a tug at full throttle, hardly moving, should churn the
       * water astern). Momentum theory: the slipstream far behind the disc moves aft through
       * the water at u = sqrt(V^2 + 2 T / (rho A)) - V (V the speed of advance, T one
       * propeller's thrust, A its disc area). Its foam is carried aft at u, slowing as the
       * jet mixes into the water around it (time constant `jetTau` s, so it travels at most
       * u x jetTau), and spreads sideways at up to `washSpread` m/s at full wash.
       */
      jetTau: 2.2,
      washSpread: 0.9,
      /** A planing hull's wake (owner: more pronounced): spread up to `planingSpread` x maxSpread, the white water astern full. */
      planingSpread: 1.6,
    },
    spray: {
      maxParticles: 900,
      /**
       * Planing (owner: planing boats throw up a lot of spray), from her hull's `planing`
       * Froude range (fnStart .. fnFull): sheets of spray thrown out from both chines where
       * her bottom meets the water (found each frame: where her keel line goes under the
       * surface, as she trims and pitches; owner, Oct 2026), `sheetRate` particles/s per m/s
       * at full planing; and a mist kicked up behind her transom (`sternRate` per m/s), left
       * behind as she runs on. The bow wave comes off the same point while it's forward of
       * amidships.
       */
      planing: { sheetRate: 18, sternRate: 3 },
      /** Bow wave "moustache": starts above this speed (m/s), particles/s per m/s above it. */
      bowSpeed: 2.2,
      bowRate: 18,
      /** A slam: the bow re-entering the water faster than this (m/s) throws spray. */
      slamSpeed: 1.0,
      /** Particles per m/s of slam speed above the threshold (each bow probe). */
      slamParticles: 14,
    },
  },

  /**
   * Hull contacts with the seabed, shore, quays and piers: penalty springs at points on the
   * keel, chines and deck edges (vessel physics). Per point: F_n = k·depth − c·v_n (pushing
   * only), friction ≤ μ·F_n opposing sliding. Fendered faces are softer and slippery.
   */
  /**
   * The roving fender (vessel/walkFender.ts, player/fenderHands.ts; owner): with the
   * fenders out, stand at the rail, look at the quay or the boat alongside, press with an
   * empty hand, and a fender is hung there at your station. It counts only if what you're
   * looking at is within `reach` m of her side (the far side of a wide gap is no use), and
   * only along the ray's first `rayLength` m. It can't hang within `endClear` m of her stem
   * or transom. Hung by the first press; another press elsewhere moves it.
   */
  fenderWalk: {
    reach: 3.0,
    rayLength: 6,
    endClear: 0.4,
  },

  /**
   * The gangway mark (player/gangway.ts; owner, Oct 2026: "a bit clunky to get from the ship
   * onto the quay side ... you kind of fall underneath it"): with her moored, a mark stands
   * in the air over the quay beside her, "Step ashore"; ashore near a moored boat, one over
   * her deck, "Step aboard". Point at it and press (a free hand's trigger in VR, a click on
   * desktop), and you're put there.
   *   up          "Step aboard": its height over the quay (m), over her deck by her rail
   *   ashoreUp    "Step ashore": its height over the quay (m), low enough to be seen from
   *               her wheelhouse's side windows, under the roof
   *   edgeIn      "Step ashore" stands this far in from the quay's edge, abreast of her (m)
   *   radius      how big a target it is (m): the ring's radius, and the pointer's hit
   *   reach       how far away it can be pointed at (m)
   *   aboardRange shown over a moored boat when you're ashore within this of her (m)
   */
  gangway: { up: 1.6, ashoreUp: 0.8, edgeIn: 0.6, radius: 0.35, reach: 25, aboardRange: 14 },

  contacts: {
    /** The values below are for a boat of this mass (the workboat); lighter ones scale them down. */
    referenceMass: 18300,
    stiffness: 4e5,
    damping: 3e4,
    friction: 0.45,
    fenderStiffness: 1.2e5,
    fenderDamping: 2.5e4,
    fenderFriction: 0.12,
    /** Below this sliding speed friction becomes viscous, so a grounded boat settles (m/s). */
    stickSpeed: 0.08,
    /**
     * Boat against boat (vessel/physics/vesselContact.ts): friction across the touch, as a
     * fraction of the push, so a tug's bow holds on a ship's side instead of skating along
     * it (owner, Oct 2026: pushing a ship onto her berth). Plain plating on plating; a push
     * fender's own `pushFender.friction`, the crew's fenders' `fenderFriction`.
     */
    boatFriction: 0.35,
    /**
     * What a boat hangs or fits on her own sides to keep her topsides off a quay (owner: a
     * Shipyard choice; vessel/physics/guards.ts). Each is probed at its own points, standing
     * proud of the hull, so it touches before the plating does. Per point, as the hard
     * values above: `stiffness` (N/m), `damping` (N per m/s), `friction` (sliding, as a
     * fraction of the push). `absorb` (m/s): how much of the approach speed it takes up
     * before any of the hit reaches the hull for damage (vessel/wear.ts `impactSafe` then
     * applies on top). A softer guard lets her lean in further, and soaks up more of the knock.
     *   fenders  the crew's air-filled fenders, hung on their lines (only while out):
     *            softest, slippery;
     *   strake   a solid rubber rubbing strake along her sheer: firm, takes a rub or a
     *            moderate knock; it's thin, so a hard push reaches the plating;
     *   tyres    old lorry tyres in a close row (a tug's or a pushboat's): soft and grippy,
     *            they hold her against a quay or a hull she's pushing.
     */
    guards: {
      fenders: { stiffness: 6e4, damping: 2e4, friction: 0.15, absorb: 1.2 },
      strake: { stiffness: 2.5e5, damping: 3e4, friction: 0.5, absorb: 0.4 },
      tyres: { stiffness: 1e5, damping: 3e4, friction: 0.7, absorb: 0.9 },
      /**
       * A tug's push fender (modules/pushFender): a thick block of rubber on her square bow,
       * built to push barges and ships: stiffer than tyres (it carries her whole thrust),
       * grippy so the bow doesn't slide off what she's pushing, and it takes a hard knock.
       */
      pushFender: { stiffness: 2e5, damping: 4e4, friction: 0.8, absorb: 1.2 },
    },
  },

  /** Desktop debug driving with the arrow keys (in VR you use the bridge controls). */
  /**
   * The Shipyard (shipyard/): matching a design's gearbox by trial. `matchRpm`: flat out
   * should settle at this share of the engine's rated rpm (the landing craft's: 1696 of
   * 1800); `runSeconds`: how long each full-throttle trial runs before it's read.
   */
  /**
   * A planing hull in a turn (vesselPhysics.ts; each hull's `planing`): her side force's
   * heeling moment reckoned with it acting `alpha` of the way from her chines up to her CG
   * (her bottom's lift carries it, not her keel); her lift's roll stiffness, `stiffness` x
   * W x her half-beam at the chines, toward a lean into the turn of her `lean` x the
   * apparent vertical's angle (gravity with U r), at most `maxLeanDeg`. Tuned on sea trials,
   * flat out then the helm put over (owner: the landing craft should lean in, the small ones
   * most): on a 40 % helm the Shipyard's landing craft type leans ~9 deg in at 7.2 m, ~6 at
   * 9 m (the built-in landing craft ~7); the deep-V pilot boat ~15; the semi-displacement
   * workboat ~5. Hard over the 9 m landing craft leans ~13 deg in, then comes upright as she
   * slows; the workboat heels ~5 deg out; none capsizes, even with four outboards.
   */
  planingTurn: { maxLeanDeg: 20, alpha: 0.6, stiffness: 1.5 },

  /**
   * Touchscreen controls (ui/touchControls.ts), shown on a phone or tablet (a coarse pointer
   * and no mouse), or with ?touch=1 in the address (?touch=0 hides them). No multiplayer
   * from a phone yet (owner). `leverDetent`: within this of the middle, the throttle slider
   * snaps to neutral. `lookSensitivity`: radians of view per pixel dragged.
   * `startAboard`: board at the helm as the game starts.
   */
  touch: {
    leverDetent: 0.08,
    lookSensitivity: 0.005,
    startAboard: true,
  },

  debugDriving: {
    /**
     * Lever travel per second while the key (or a controller's bumper) is held (full range is
     * -1..1): neutral to full ahead in about 1.1 s (the owner's desktop crew found 0.6 slow).
     */
    leverRate: 0.9,
    /** Helm travel per second while the key is held (full range is -1..1). */
    helmRate: 0.8,
  },

  /**
   * A game controller on the desktop (player/gamepad.ts): the sticks' dead zone (0..1 of
   * their travel), the steering curve (helm = stick^steerCurve: gentle near the middle), how
   * close to the helm (m, on deck) "F: take the helm" shows, and how fast the right stick
   * looks round (rad/s at full deflection).
   */
  gamepad: { deadZone: 0.15, steerCurve: 1.5, helmReach: 1.6, lookRate: 2.4 },

  /**
   * The boatyard (owner, Oct 2026): where she's fitted out and mended, on the Calder Haven
   * quay (the shed on the apron, a yard crane at the quay edge and old boats laid up round
   * the shed: world/regions/home.ts; the slipway was too far from the berths). Its
   * board on the shed's front (ui/yardBoard.ts) sells the add-ons and upgrades and does the
   * repairs, with her in this port. `board`: its centre (x, z; m), its height above the
   * ground, the way it faces (deg, compass: 270 = west), its width (m), how near (m) you
   * must be for it to be drawn, and how far a pointer reaches it (m: VR and desktop).
   */
  /**
   * The boatyards (ui/yardBoard.ts): one per port that has one, its board on the shed's front
   * (world x, z, height above the ground, the compass bearing it faces, its width, how near
   * you must be to see it and to reach it). What each sells and charges is the port's
   * `economy` (world/defs.ts PortDef): Calder's the equipment and the everyday upgrades at the
   * standard rate; Loch Tarsk's the radar and the heavy towing post, and repairs cheaper.
   */
  boatyards: [
    { port: 'calder', name: 'Calder Boatyard', board: { x: 727.4, z: 645, up: 2.15, facingDeg: 270, width: 1.7, range: 25, reach: 4 } },
    { port: 'tarsk', name: 'Loch Tarsk Yard', board: { x: 597, z: -3921.5, up: 2.15, facingDeg: 0, width: 1.7, range: 25, reach: 4 } },
  ],

  /** Anchoring: the anchor's holding power by the bottom (PortDef.bottom; sand elsewhere). */
  anchoring: {
    bottomHolding: { sand: 1, mud: 0.8, weed: 0.55, rock: 0.4 } as Record<'sand' | 'mud' | 'weed' | 'rock', number>,
  },

  /** Player movement aboard and ashore. */
  locomotion: {
    /**
     * Grab-the-world (grip + drag) is always on; smooth stick movement is optional.
     * This and snapTurnDeg are defaults: the VR menu changes them per device.
     */
    smoothEnabled: true,
    smoothSpeed: 1.4,
    /**
     * Running (owner request): walking speed times this. VR: push the stick all the way;
     * desktop: Shift (a controller: the left stick clicked in). 2.4 was too slow (owner).
     */
    runMultiplier: 3.2,
    snapTurnDeg: 30,
    /** Crouch (X in VR, C on the desktop): how far the view and hands drop (m), and how fast (s). */
    crouchDrop: 0.6,
    crouchTime: 0.12,
    /** Stick deflection that triggers a snap turn, and that must be released before the next. */
    snapThreshold: 0.7,
    /** Floor-height following time constant (s), smooths steps like the doorway sill. */
    floorSmoothing: 0.12,
  },

  /**
   * The player's body off the deck: walking ashore, jumping, swimming (player/body.ts).
   * Jumps start with the boat's own velocity at your feet, so leaping off a moving boat
   * carries you along with her, as it would.
   */
  /**
   * The player's health (player/health.ts; owner, Oct 2026: a berth "should have the function
   * of healing the player"; hurt by cold water, a propeller, falls, and fire and smoke). One
   * number, 1 well to 0 blacked out, kept by each player's own game. Game-paced, not real:
   * at the sea's 14 C a person in the water keeps going for an hour or more; here the cold
   * takes a full-health swimmer in about `coldMinutes`, so a swim is a risk but not a sentence.
   */
  health: {
    /** In the water, from full health to blacked out (min, game-paced). */
    coldMinutes: 8,
    /** Standing in the flames (inside the fire's hitRadius, CONFIG.fire), at full blaze: health a second. */
    firePerS: 0.2,
    /** In thick smoke downwind of it, at full blaze: health a second. */
    smokePerS: 0.03,
    /** The smoke: downwind of the fire this far (m), widening this much a metre downwind (each side), thinning to nothing at the end. */
    smokeReach: 40,
    smokeSpread: 0.25,
    /** Wind under this (m/s): the smoke rises round the fire, out to twice its radius. */
    calmWind: 1,
    /** A turning propeller: this much at a blow (the strike's fade and haul-out follow as before). */
    propHit: 0.6,
    /** A fall: no harm landing from this high (m), then this much health a metre more. */
    safeFall: 2.5,
    fallPerM: 0.2,
    /** Lying in a berth: from nothing back to full in this long (s, real time). */
    restFullS: 90,
    /** Blacked out: you come round aboard, this well. */
    wakeHealth: 0.5,
    /** Below this, a warning (once each time it falls past). */
    warnBelow: 0.35,
    /**
     * Sleep (owner: "Both": a berth heals, and sleeping in it passes time): with everyone aboard
     * the game lying in a berth, the clock runs this many game hours a real second. Lain down
     * hurt, you get up by yourself once well by day; else you sleep on until the clock comes
     * round to `wakeHour`. A step gets you up any time. Night (no getting up well): `nightFrom` to `wakeHour`.
     */
    sleepHoursPerS: 0.25,
    wakeHour: 7,
    nightFrom: 20,
  },
  body: {
    gravity: 9.81,
    /** Take-off speed up and along your view (m/s): ~0.55 m high, ~2 m long from standing. */
    jumpUp: 3.3,
    jumpForward: 2.4,
    /** Hitting a quay face with your feet this far below its top, you clamber up onto it (m). */
    clamberHeight: 0.8,
    /** You can stand where the ground is at most this deep under mean water (m). */
    wadeDepth: 1.0,
    /** Steepest terrain you can walk up: minimum ground-normal Y (0.55 ≈ 57°). */
    maxSlopeNormalY: 0.55,
    /** Swimming: stick speed (m/s), head height above the surface (m), surface-follow time constant (s). */
    swimSpeed: 0.8,
    swimHeadAbove: 0.15,
    swimSmoothing: 0.4,
    /** Climbing out: a gripping hand this close to the gunwale or transom hauls you aboard (m). */
    climbReach: 0.45,
    /** Jump / grip while swimming within this of the hull or a quay face climbs out (m). */
    climbOutRange: 1.3,
    /** Highest quay or pier deck above the water you can climb onto from the water (m). */
    quayClimbMax: 2.8,
  },

  /**
   * Rescues on cargo runs (rescue/rescue.ts; the kinds of rescue are in rescue/rescueDefs.ts).
   * A run is: cargo aboard bound for another port, and the boat out of harbour. Once per run
   * there's a `chance` of a call, somewhere between `triggerFraction` of the way along.
   */
  /**
   * SOS (owner, Oct 2026; rescue/sos.ts): a boat capsized or sunk is recovered to the nearest
   * boatyard's port by the salvage tug, from the main menu (Boat > SOS) or the red button
   * under the VHF set. Upright and afloat, the coastguard turns an SOS down.
   *   overturnDeg  she counts as capsized once she's rolled or pitched this far from upright
   *   sunkDepth    ...or her waterline is this far under the surface (m): sunk
   */
  sos: { overturnDeg: 80, sunkDepth: 3 },

  rescue: {
    /** Lowered after V1.0 (owner: too many calls; was 0.5). */
    chance: 0.35,
    /** Out of harbour: further than this from every port (m). */
    harbourRadius: 300,
    /** The call comes this fraction of the way from the departure port to the destination. */
    triggerFraction: [0.25, 0.65] as [number, number],
    /** The incident: this far ahead of the boat, toward the destination (m)... */
    ahead: [450, 800] as [number, number],
    /** ...and this far off to one side, so it's an easy diversion (m). */
    offset: [80, 220] as [number, number],
    /** Keep it in open water: at least this deep (m) and this far from any port (m). */
    minDepth: 5,
    minPortDistance: 350,
    /** An unanswered call goes away after this long (s), and repeats its alert this often (s). */
    callTimeout: 120,
    /** The radio's call alert repeats this often while unanswered (s; was 10, owner: too insistent). */
    callRepeat: 20,
    /** Targets lie within this fraction of the search radius from its centre. */
    targetSpread: 0.6,
    /** Lost crates float in a loose group: this far apart (m). */
    crateSpacing: [4, 12] as [number, number],
    /**
     * Harder mode: the call gives the last known position as latitude/longitude only, and
     * the chartplotter doesn't show the search area - plot it on the paper chart yourself.
     */
    plotYourself: false,
    /** Slow drift of everything in the water (m/s, world x/z); there's no wind yet. */
    drift: [0.1, 0.06] as [number, number],
    /** Debug "spawn alongside": this far off the bow (m), within a life ring's throw. */
    debugSpawnDistance: 18,
    /** A survivor waves when you're within this (m), and blows the lifejacket whistle every few seconds within that (m, s). */
    waveRange: 300,
    whistleRange: 350,
    whistleEvery: 6,
    /**
     * Recovery. Life ring: thrown with the controller's release velocity x `throwScale`
     * (slower than `minThrowSpeed` puts it back); it lands within `catchRadius` of a survivor
     * and they grab it. The line pays out to `maxLine`; each hand pull reels in that distance
     * x `reelScale` (desktop: `desktopPull` per click; throws land where you look, at up to
     * `desktopThrowSpeed` m/s).
     */
    throwScale: 1.4,
    minThrowSpeed: 1.2,
    catchRadius: 2.5,
    /**
     * A crew-mate overboard takes the ring when it floats within this of them (m: a couple
     * of strokes; their own game checks it, the host allows a little slack for lag).
     */
    crewCatchRadius: 2.5,
    crewCatchSlack: 1.5,
    /**
     * A swimmer into a turning propeller (owner: a bloody special effect, for fun). Turning:
     * in gear with the engine over `minRpm`. Struck: their chest within the blades' radius
     * + `reach` (m) of the hub. Then, from the hit (s): the view red at once, fading to black
     * by `blackAt`, put back aboard her at `respawnAt`, clear again by `clearAt`. Everyone
     * sees a burst of `droplets` red drops, then red froth churned up at `frothRate` a
     * second for `frothSec`.
     */
    propStrike: { minRpm: 300, reach: 0.55, blackAt: 1.1, respawnAt: 1.8, clearAt: 3.2, droplets: 140, frothRate: 45, frothSec: 2.2 },
    maxLine: 30,
    reelScale: 1.6,
    desktopThrowSpeed: 17,
    desktopPull: 1.5,
    /** On the line within this of the stern (and in neutral), they climb aboard over `climbTime` s. */
    climbRange: 3,
    climbTime: 2.2,
    /** In gear with a survivor within this of the stern: they swim away from the propeller at this speed (m/s). */
    propRadius: 7,
    swimAway: 0.8,
    /**
     * A survivor in the water swims for the ring once it floats within `swimToRing` m of
     * them (owner: a hard throw to land right on them in VR), at `swimSpeed` m/s, while no
     * one else is on the line.
     */
    swimToRing: 14,
    swimSpeed: 0.7,
    /**
     * People on a liferaft or a sinking boat (rescueDefs `prop`) climb aboard straight from
     * it: your stern within `raftRange` m of it and in neutral, one after another. A
     * sinking boat goes down `sinkTime` s after the call (its people into the water then,
     * for the ring); the raft and the upturned dinghy drift as everything does.
     */
    raftRange: 4.5,
    sinkTime: 300,
    /** Boat hook: length (m), how close its tip must come to a crate to hook it, and how close
     *  alongside (from the hull side, m) a hooked crate must be to lift aboard. */
    hookLength: 2.2,
    hookReach: 0.6,
    /**
     * Pushing off with the boat hook (owner, Oct 2026): its tip on a quay, a pier or the
     * shore, each press of the trigger (VR) or click (desktop) gives the boat a shove of
     * `impulse` N·s along the hook, away from what it's on (a person's hard push for a
     * second or two), at the hand. She moves by impulse / her mass: a 4 t boat a fifth of a
     * knot a push, a 60 t tug hardly at all, so a heavy boat takes many pushes. No feedback
     * through the hand, so it's a nudge, not physics. `every`: no more often than this (s).
     */
    hookPush: { impulse: 900, every: 0.3 },
    /**
     * Auto-extend (menu option, on by default): pointed at a floating crate or a tow's bow
     * eye within this range (m), the hook telescopes out to it; it slides back to its own
     * length once something is on it, bringing it in. Telescoping speed (m/s) out and in.
     */
    hookAutoReach: 8,
    hookExtendSpeed: 10,
    hookRetractSpeed: 1.5,
    liftRange: 2.5,
    /** The menu's quick "Lift crates" (no hook): crates floating within this of the hull (m). */
    quickLiftRange: 15,
    /**
     * VR: lifting a hooked crate aboard (alongside). The crate floats at the waterline at the
     * end of the pole, beyond a hand's reach, so your free hand either takes hold of the
     * pole, or reaches over the side within this of the crate horizontally (m, about the
     * pole's length; owner VR test: it was 1 m, which no arm reaches).
     */
    liftHandReach: 2.2,
    /**
     * Landing survivors (milestone 4): moored alongside any quay, or anchored at an
     * anchorage (the skiff takes them), they step off one every `landEvery` s, each taking
     * `landTime` s; they stand ashore `quayInset` m in from the quay edge, `ashoreSpacing`
     * apart, and wave for `ashoreTime` s before the rescue is closed.
     */
    landEvery: 1.4,
    landTime: 2.0,
    quayInset: 1.6,
    ashoreSpacing: 0.9,
    ashoreTime: 12,
    /** Night strobe on survivors' lifejackets (crates have none): flash period and length (s); shown when it's this dark (0..1). */
    strobePeriod: 1.0,
    strobeOn: 0.08,
    strobeDarkness: 0.25,
  },

  /**
   * FM radio in the wheelhouse: internet radio streams played by the browser (an <audio>
   * element, so no CORS needed). Every player aboard hears the station the set is tuned to,
   * each from their own connection. The frequencies are made up, for the display. Streams
   * must be https (the game is served over https). Heard fully within `fullRange` of the
   * set (m), fading to nothing at `range`.
   */
  fmRadio: {
    // Owner: pop and 90s, English-speaking, no German stations. Streams are plain HTTPS MP3
    // or AAC. Each must allow cross-origin use to be placed at the set (all these do); one
    // that doesn't plays without direction. A dead one just shows NO SIGNAL.
    stations: [
      { freq: '88.6', name: 'TruckersFM', url: 'https://live.truckers.fm/' },
      { freq: '91.2', name: 'Heart 90s', url: 'https://media-ssl.musicradio.com/Heart90s' },
      { freq: '94.7', name: 'Absolute 90s (1.FM)', url: 'https://strm112.1.fm/90s_mobile_mp3' },
      { freq: '97.3', name: 'Heart', url: 'https://media-ssl.musicradio.com/HeartUK' },
      { freq: '101.5', name: 'Smooth', url: 'https://media-ssl.musicradio.com/SmoothUK' },
      { freq: '104.8', name: 'Radio Paradise', url: 'https://stream.radioparadise.com/mp3-128' },
    ],
    /** Full level within `fullRange` of the set (m), fading to silence at `range`. */
    fullRange: 3,
    range: 16,
    /** Streams are mastered loud: their level at 100 % on the FM volume setting (owner: too loud). */
    gain: 0.2,
    /**
     * Heard from outside the wheelhouse (owner: quieter out on deck), through its walls:
     * the level times `outsideLevel` and the tone cut above `outsideLp` (Hz) with its door
     * open; `outsideShutLevel` and `outsideShutLp` with the doors shut.
     */
    outsideLevel: 0.45,
    outsideLp: 2500,
    outsideShutLevel: 0.22,
    outsideShutLp: 700,
  },

  /**
   * Laser pointer (replaces pings, owner request): VR, hold the right stick in; desktop,
   * hold the middle mouse button (the right one is the binoculars). Reach (m); what it hits is found `hitRate` times a second.
   * Desktop: the beam starts at a "hand" `deskHand` (m: right, up, forward of the eyes), so it's
   * seen from the side; started at the eyes it would be seen end-on, just a dot.
   */
  /**
   * Panel lighting (controls/panelLighting.ts): the wheelhouse's self-lit screens, labels
   * and dials dim with the daylight to `nightLevel` of their daytime brightness at full
   * dark. As night falls (darkness from `redFrom` to `redTo`, 0 day .. 1 night) they turn
   * red by themselves (owner: automatic, no switch), dimmer still at `redLevel` of that.
   */
  panelLighting: { nightLevel: 0.3, redLevel: 0.6, redFrom: 0.55, redTo: 0.85 },

  /**
   * The chart, the whiteboard and the duty board at night (render/nightPaper.ts; owner: they
   * were very bright at night). Their brightness: the sky's ambient light times `daylight`,
   * plus the cabin lamp (`cabinWhite` / `cabinRed`), plus the chart lamp (1 by day, `lampNight`
   * at night, turned down), at least `least`, at most `nightMax` at night. At night they go
   * red with the panels (CONFIG.panelLighting redFrom..redTo): green and blue cut by
   * `redGreen` / `redBlue`; with the white cabin light on, only `whiteLightRed` of that.
   */
  nightPaper: { daylight: 1.1, cabinWhite: 0.3, cabinRed: 0.1, lampNight: 0.3, least: 0.04, nightMax: 0.4, redGreen: 0.7, redBlue: 0.85, whiteLightRed: 0.2 },

  /**
   * Other players' figures (net/avatarView.ts, looks in net/avatarOutfits.ts). Upper body
   * only (owner's choice): head, a torso hanging from the neck to the waist, two-part arms
   * with elbows reaching to the hands. The torso turns toward where the head looks but lags
   * (`bodyTurnRate` 1/s) and never twists more than `maxTwistDeg` from it; its waist sits
   * `lean` of the way back toward the feet, so leaning the head leans the body.
   * Lengths in m. Arms hang relaxed when a hand isn't tracked (desktop's left hand).
   */
  avatar: {
    neckDrop: 0.13,
    torsoLength: 0.55,
    shoulderHalf: 0.18,
    shoulderDrop: 0.07,
    upperArm: 0.3,
    forearm: 0.29,
    bodyTurnRate: 4,
    maxTwistDeg: 50,
    lean: 0.5,
    /**
     * VR hand gestures (player/handGesture.ts): with the grip held on a free hand, the stick
     * pushed forward past `stick` (0..1 of its travel) points the index finger, pulled back
     * past it raises the middle finger.
     */
    gesture: { stick: 0.6 },
    /**
     * The hands' turn on the controller, applied to every hand shape, ours and crew-mates'.
     * The shapes are drawn fingers forward along -z, thumb up +y, the wrist back at +z. The
     * controller's grip frame (the WebXR spec, which the Quest browser follows): a fist round
     * a rod (the handle), -Z along the rod toward the thumb, +X out of the back of the right
     * hand (-X of the left), +Y back along the arm. So the shapes are pitched forward 90°
     * about X (their up to -Z, their back to +Y), and nothing else: `rollDeg` (about Z) and
     * `yawDeg` (about Y) are for fine-tuning, live from Debug > Hands (owner, Oct 2026: a
     * 90° roll as well was wrong).
     */
    handTurn: { pitchDeg: 90, rollDeg: 0, yawDeg: 0 },
  },

  /**
   * The recording camera (player/cameraMode.ts): a desktop player who's a flying camera for
   * filming the others (record the screen with OBS), which a VR player can pick up.
   *   fov            field of view to start with, and its range (deg, vertical)
   *   speeds         flying speeds, slow / normal / fast (m/s; Shift: x3)
   *   smoothTau      smoothing on: the view eases to where you fly and look over this (s)
   *   heldTau        held by a VR player: the view eases onto their hand (s; smooths the network)
   *   grabRange      a VR hand this close to the camera body (m) grips it
   *   lens           the lens in the holder's grip axes (m: up, and forward along the controller)
   *   preview        held in VR, a little screen of its view above it (player/cameraPreview.ts):
   *                  its picture `width` x `height` pixels, drawn `rate` times a second out to
   *                  `far` m; the screen `size` m wide, `above` m over the lens
   */
  camera: {
    fov: 60,
    fovMin: 20,
    fovMax: 100,
    speeds: [1.2, 4, 10] as [number, number, number],
    smoothTau: 0.35,
    heldTau: 0.08,
    grabRange: 0.2,
    lens: [0, 0.035, -0.08] as [number, number, number],
    /**
     * The grab camera held in a VR hand (player/cameraHold.ts): tilted this far forward
     * (deg, about the hand's own side-to-side axis) from the controller's grip axis, which
     * runs up out of the fist. Without it the camera looked at the ceiling with its body
     * rotated back (owner, Oct 2026: "rotate it 85 degrees forward"). Negative tilts down.
     */
    holdPitchDeg: -85,
    preview: { width: 192, height: 108, rate: 12, far: 400, size: 0.13, above: 0.1 },
  },

  /**
   * The line-throwing gun (owner, Oct 2026; tow/lineGun.ts, player/handGear.ts kind
   * 'lineGun'): a tug's hand tool for passing a hawser to a ship she can't reach with the
   * boat hook. On its bracket in every tug's wheelhouse (a tug hull or the tug diesel, the
   * Shipyard). Take it, aim at the ship's bow eye and fire: a rocket carries a thin messenger
   * line across; landed by the eye (within `hitRadius` m of it, or aimed within `aimDeg` of
   * it inside `range` m), the ship's crew make it fast and haul the hawser over on it
   * (`haulS` s), and the towline is then fast as if hooked on. A miss splashes; `reloadS` s
   * to the next shot. The rocket flies at `speed` m/s under gravity.
   */
  lineGun: { range: 55, speed: 38, aimDeg: 8, hitRadius: 4, haulS: 6, reloadS: 3 },

  /**
   * Camera views at the helm with a game controller (player/helmCamera.ts; owner, Oct 2026):
   * Y cycles inside, orbit and flyby while you drive from the helm.
   *   orbit   `lengths` of her length off (at least `minDist` m), the right stick turning it
   *           round and up or down at `rate` rad/s between `pitchMin` and `pitchMax`, looking
   *           at her `up` lengths above her origin, eased over `tau` s
   *   flyby   the spot `ahead` m along her course, `offset` m to the side (alternating),
   *           `height` m up; a new spot once she's `behind` m past it or `maxDist` m off;
   *           the look eases over `lookTau` s
   *   zoom    RT / LT held: the orbit distance scaled between `zoomMin` and `zoomMax`, the
   *           flyby lens down to `fovMin` of its field of view, at `zoomRate` (per s, as a log)
   */
  helmCamera: {
    orbit: { lengths: 2.2, minDist: 14, rate: 2.0, pitchMin: 0.06, pitchMax: 1.2, up: 0.12, tau: 0.25, zoomMin: 0.4, zoomMax: 3 },
    flyby: { ahead: 70, offset: 28, height: 7, behind: 25, maxDist: 170, lookTau: 0.12, fovMin: 0.3 },
    zoomRate: 0.9,
  },

  laser: { reach: 600, hitRate: 15, deskHand: [0.2, -0.25, -0.35] as [number, number, number] },

  comfort: {
    /**
     * Motion coupling between the deck and the player's view, 0..1 (BeamNG-style).
     *   1   = rigidly attached: you feel every roll, pitch and heave of the deck.
     *   0.x = a critically damped "neck and knees" spring between deck and view: slow,
     *         gross motion is followed, faster roll/pitch/heave is soaked up, like the
     *         human head-stabilisation reflexes do.
     *   0   = horizon level, height smoothed.
     * Heading and horizontal position always stay locked to the deck (walking/collision).
     * Adjust in VR: the menu (Y). Desktop: 9 / 0.
     */
    // Default rigid: in VR testing, decoupling also moved the hands relative to the deck
    // (they live in the same rig as the head), making the bridge controls hard to grab.
    motionCoupling: 1.0,
    /**
     * The same on the desktop (its own setting, keys 9 / 0): softer by default, since there
     * are no hands to keep on the controls and a screen that rolls with the deck makes
     * onlookers queasy (owner feedback).
     */
    desktopMotionCoupling: 0.3,
    /**
     * ...except at the controls: in the wheelhouse, or with the reticle on a control, the
     * desktop view eases to riding rigidly with the boat over `desktopRigidTime` s, so the
     * console holds still under the reticle (with the softer coupling it swung by several
     * degrees in a seaway, worst for crew-mates joining, whose boat moves in snapshot steps).
     */
    desktopRigidAtControls: true,
    desktopRigidTime: 0.5,
    /**
     * The smoothing on top of the coupling: its time constant at coupling 0 (s), shrinking
     * with (1 - coupling) to nothing at 1, so the slider runs evenly from "the boat moves
     * all her motion past you" to rigid, with no step at 100 % (owner, Oct 2026: 0-90 % felt
     * alike, 100 % locked; 90 % should be "a very gentle smoothing of bumps"). In an 8 deg,
     * 5 s roll the boat moves past you about 6.4, 5.0, 3.1, 2.1, 1.1 and 0 deg at 30, 50,
     * 70, 80, 90 and 100 %; a sharp 4 deg slam is felt as 1.4, 2.0 and 2.8 deg at 70, 80
     * and 90 %. (Was 1.6 s, with a 0.12 s floor.)
     */
    maxTimeConstant: 0.4,
    /** Time constant (s) of the very slow reference height that heave is measured from. */
    heaveReferenceTime: 8,
    /** Softly limits how far the view may move vertically relative to the deck (m). */
    maxHeaveOffset: 0.4,
    /** Tunnel vignette while artificially moving (0..1 strength). */
    vignette: 0.6,
  },

  /**
   * Binoculars (player/binoculars.ts): 7x. They lie on top of the dash, port end (vessel
   * axes, `stowYawDeg` turned). VR: grip within `grabRange` to take them; held within
   * `eyeRange` of your eyes you look through them: two lens circles each `lensDeg` wide,
   * black all round (owner: so nothing outside them is drawn, and the picture, `renderSize`
   * pixels wide and half as high, is the only scene render while you look: it goes out to
   * the full draw distance). Desktop:
   * hold the right mouse button (or Z). The view through them is steadied: it eases onto
   * where you look over `steady` s (VR: the scope's orientation; desktop: the mouse look),
   * since the zoom magnifies every tremor too. 0 is direct.
   */
  binoculars: {
    magnification: 7,
    steady: 0.12,
    stow: [-1.05, 2.6, -1.74] as [number, number, number],
    stowYawDeg: 20,
    grabRange: 0.2,
    eyeRange: 0.2,
    lensDeg: 70,
    renderSize: 1280,
  },

  /**
   * Lobster and crab potting (potting/potting.ts; owner's feature, milestone 1: pots as
   * cargo and shooting them). Off unless switched on (Settings → Game → Potting) while it's
   * being built.
   *   pallet     where the pots wait on the quay (world x, z, yaw deg) and how many: you
   *              have `pots` of them; any lost are replaced there (pots are free for now)
   *   maxShot    the most pots in the water at once, for everyone (cap on world records)
   *   sinkTime   seconds from the splash until the pot's on the bottom and the marker buoy
   *              pops up (s)
   *   buoyColors each boat's buoy colour (by boat), flag colour while soaking
   */
  potting: {
    // Just aft of a boat at the Calder Haven cargo berth, 4 m in from the quay edge (owner: it was 25 m forward of her).
    pallet: { x: 716, z: 670.5, yawDeg: 90 },
    pots: 5,
    maxShot: 24,
    sinkTime: 2.5,
    /** Desktop: a pot set down from the rail is thrown this far out the way you look (m). */
    deskThrow: 1.4,
    buoyColors: [0xf26a1a, 0xf2d21a, 0xe0306a, 0x2ab0e0],
    flagSoaking: 0xd8281c,
    /**
     * Soak time (milestone 2). Measured in time played (world time, s), not the game's
     * clock: the time of day stands still unless you speed it up in the menu, so "a day"
     * wouldn't pass. A pot is ready to haul after `soakReady` (20 min) and its catch keeps
     * improving until `soakBest` (40 min); after that, no better.
     */
    soakReady: 1200,
    soakBest: 2400,
    /** The ready cue: flag green instead of red, and a little light blinking on it at night; only within this distance (m), so you still have to find your marks. */
    flagReady: 0x28c040,
    cueRange: 45,
    /**
     * Storm drift: in wind over `dragFrom` (m/s) a pot drags along the bottom downwind, its
     * buoy with it, at `dragRate` m/s for every m/s over (a squall's 17 m/s: about 1.5 m a
     * minute). It stops where the water gets too shallow.
     */
    dragFrom: 11,
    dragRate: 0.004,
    /** A local potter on the VHF now and then, telling of good ground (s between, from first switched on). */
    tipEvery: [900, 1500] as [number, number],
    tipFirst: 240,
    /** Casual mode: your pots shown on the chartplotter too (off: the crew's marks on the paper chart are all you have). */
    showOnPlotter: false,
    /**
     * Hauling (milestone 3): hook the buoy with the boat hook (its tip within `hookReach`
     * m of the buoy), bring it alongside and aboard (within `liftRange` m of the hull),
     * then haul the line hand over hand: each pull takes in the hand's travel x
     * `pullScale` (desktop: `deskPull` m a click). The line is the depth plus `slack` (m).
     * In a swell over `slipFrom` m (significant height), stop pulling for `slipAfter` s and
     * the pot's weight drags the line back out at `slipRate` m/s per m of swell over.
     */
    haul: { hookReach: 0.95, liftRange: 2.5, pullScale: 1.6, deskPull: 2.5, slack: 1.5, slipFrom: 1.0, slipAfter: 1.5, slipRate: 0.6 },
    /**
     * The catch, worked out when the pot comes up (a seeded random, the same for everyone):
     * the expected haul is the ground's quality x the soak (0..1, potting.ts soakFactor) x
     * the weather (every pot is baited) (`roughFactor` if it's blowing over
     * `roughWind` m/s). Up to `lobsterMax` lobsters and `crabMax` crabs at best. Off any
     * ground the quality is `offGround`. A `bycatch` chance of a small fish, a starfish or
     * (`bootChance` of those) an old boot.
     */
    catch: { lobsterMax: 2, crabMax: 6, offGround: 0.15, roughWind: 11, roughFactor: 0.7, bycatch: 0.25, bootChance: 0.12 },
    /**
     * What the fish buyer pays (career money) for each animal in a pot set down on a harbour
     * quay. Lobster is worth far more than crab.
     */
    price: { lobster: 40, crab: 8 },
    /**
     * Quick potting from the menu (no walking): haul the nearest buoy within `quickHaulRange`
     * m of the hull; a pot shot from the deck lands `quickShootOff` m off her side.
     */
    quickHaulRange: 25,
    quickShootOff: 3,
  },

  /**
   * Hand gear on brackets inside the wheelhouse, on the aft wall in its starboard corner
   * (player/handGear.ts; owner request). VR: grip within `grabRange` to take one off its
   * bracket; it stays in the hand while you hold the grip and goes back when you let go.
   * Desktop: click it to take it, click its bracket (or U) to put it back. `bracket`: where
   * it hangs (vessel axes, its middle). `deskHold`: where a desktop player holds it (camera
   * axes, m).
   */
  handGear: {
    grabRange: 0.2,
    /** VR: a held piece stays in hand through a loss of the controller's tracking shorter than this (s). */
    lostGrace: 1.0,
    deskHold: [0.22, -0.3, -0.5] as [number, number, number],
    /**
     * A 6 kg water-mist / foam extinguisher (hold the trigger, or the left mouse button, to
     * spray). The spray leaves the nozzle at `nozzleSpeed` (m/s) and falls under gravity
     * with `airDrag` (per s), reaching 5-6 m: get close. Where it passes through the fire
     * it knocks it down at `douse` x the fire monitor's rate (CONFIG.fire.douse) - small,
     * but a fire you're close to goes out. A charge lasts `seconds` of spraying; hung back
     * on its bracket it's swapped for a full one.
     */
    extinguisher: { bracket: [1.05, 1.62, 1.33] as [number, number, number], nozzleSpeed: 9, airDrag: 0.6, douse: 0.8, seconds: 60 },
    /**
     * A big rechargeable torch (trigger or left click: on / off). Lit, a real spotlight from
     * its lens (`angleDeg` half-angle, `intensity`, `distance` m), only for your own torch.
     * Sized for a person in the water 5-6 m off (owner): at 7 degrees the pool is about 1.4 m
     * across at 6 m. It also has its own pool on the sea (ocean shader uTorch*). Crew-mates'
     * torches show as a beam. `realLight` false: a beam only for yours too (no
     * extra light in the scene, for a cheaper frame on the Quest).
     */
    torch: { bracket: [1.25, 1.72, 1.36] as [number, number, number], angleDeg: 7, intensity: 260, distance: 45, realLight: true },
  },

  /** Bridge-control interaction tuning. */
  interaction: {
    /** Direct grab: hand within this distance of a lever knob / the wheel rim (m). */
    grabRadius: 0.12,
    /** Direct press: controller tip within this distance of a button / switch (m). */
    touchRadius: 0.06,
    /**
     * Size of the panel switches and push buttons (toggle plates and bats, button housings
     * and caps), as a factor of their first, VR-sized build (owner, Oct 2026: "reduce
     * slightly the size of the switches"). 1 = a 70 x 90 mm toggle plate with a 62 mm bat and
     * an 84 mm push button; 0.75 = 53 x 68 mm and a 63 mm button, still well over a
     * fingertip. Only their look: `touchRadius` (how near a hand must come) stays as it was,
     * so they are no harder to press in VR.
     */
    switchScale: 0.75,
    /** Pointer-ray fallback length (m) for controls just out of reach. */
    rayLength: 1.5,
    /** Desktop reticle reach (m). */
    desktopReach: 2.6,
    /**
     * Desktop aim help (degrees): a reticle that just misses a control still picks the
     * nearest one within `desktopAssistDeg` of its edge, and a control under the reticle
     * stays picked until the aim is `desktopStickyDeg` off it. In a seaway the console
     * swings under the reticle (the desktop view is steadied against the roll), and for a
     * crew-mate joining it moves in 20 Hz snapshot steps: without this, small switches
     * flicker in and out of reach.
     */
    desktopAssistDeg: 2.5,
    desktopStickyDeg: 5,
    /**
     * After you set a control, how long (ms) it waits for the host's state to show it
     * before believing an older value (a joining crew-mate's round trip; see Control).
     */
    pendingMs: 800,
    /** Displays redraw rate (Hz). */
    displayHz: 10,
  },

  /** The in-game menu (Y in VR, O on desktop). */
  menu: {
    /**
     * Desktop: the menu opens flat on the screen (owner: easier to use than floating in the
     * 3D view), the mouse freed to work it; VR and a game controller's aim keep the panel
     * in the world. false: always in the world.
     */
    flatDesktop: true,
    /** Panel width (m); the height follows from the number of rows. */
    width: 0.24,
    /** Rows a long list (the ports) shows at a time; ▲ / ▼ (and the desktop wheel) scroll it. */
    portRows: 6,
    /** Bottom-centre of the panel on the left grip (m, grip axes: +Y up, -Z forward). */
    wristOffset: [0, 0.05, -0.02] as [number, number, number],
    /** Tilt about the grip's X axis; negative leans the top away so it faces you. */
    wristTiltDeg: -35,
    /** Distance in front of the head when the menu floats (desktop / no left controller). */
    floatDistance: 0.55,
    /** Poke: the fingertip counts as on the panel within this distance of it (m)... */
    pokeReach: 0.04,
    /** ...presses when it gets this close (m)... */
    pokeDepth: 0.006,
    /** ...and must back off this far before the next press (m). */
    pokeRelease: 0.02,
    /** Pointer-ray reach for the menu (m). */
    rayLength: 2.0,
  },

  desktop: {
    eyeHeight: 1.7,
    /** Walking speed (m/s); Shift = run (x locomotion.runMultiplier). */
    walkSpeed: 1.6,
    /** Ladder climbing speed with Space / C (m/s). */
    climbSpeed: 1.0,
    /** Free-fly speed (m/s). */
    moveSpeed: 4,
    fastMultiplier: 5,
    lookSensitivity: 0.0022,
    /**
     * Reading the paper chart: while the crosshair is on it from standing at the table,
     * the view eases in by this much (camera zoom; owner feedback: desktop players had to
     * crouch or lean in to read it). The look slows to match. 1 = off.
     */
    chartZoom: 1.7,
    /** How far from the eyes the chart counts as "at the table" (m), and the ease rate (1/s). */
    chartZoomReach: 1.5,
    chartZoomRate: 5,
  },

  /** The boat the game is played in (a key of CONFIG.vessels / VESSEL_DEFS). */
  testScene: {
    // A new world's boat when none is named (the tests and their golden runs). The game starts in CONFIG.career.boat.
    vesselDefId: 'workboat',
  },

  /**
   * Refuelling by hand (fuel/fuelHose.ts; owner, Oct 2026): each harbour's fuel pump has a
   * hose. Take the nozzle from its holster (grip it; desktop: click), walk it out to the
   * boat, plug it into her filler (let go of it there, or pull the trigger; desktop: click
   * the filler), walk back and press START on the pump; STOP, or it stops when she's full.
   * Then take the nozzle out and hang it back on the pump. No collisions: the hose is drawn
   * only (as the towline is, hanging in a curve and lying on the ground).
   *   reach       how far the nozzle goes from the pump (m, flat): carried further, it stays
   *               at the end of the hose; plugged in, a boat that drifts `pullOut` m past it
   *               pulls the nozzle out (it falls on the quay) and the pump stops
   *   hoseLength  the hose as drawn (m): longer than `reach`, so it sags and lies on the ground
   *   pump        the pump, in its own axes (x across its face, y up, z out of its face, which
   *               looks at the fuel berth): size (w, h, d), where the hose comes out
   *               (`outlet`), the nozzle's holster, the gauge and the START / STOP buttons
   *   filler      each boat's filler: on the side deck, both sides, `aft` m aft of her
   *               wheelhouse (of her middle without one), `inset` m in from the deck edge
   *   grab        a hand within this of the nozzle grips it, of a button presses it, and a
   *               nozzle let go within `plug` of a filler (or the holster) goes in (m)
   *   desk        desktop reach for clicks (m), and where the nozzle rides in the "hand"
   *               (m right, up, forward of the eyes)
   */
  fuelHose: {
    reach: 10,
    pullOut: 1.5,
    hoseLength: 11,
    pump: {
      size: [0.6, 1.6, 0.45] as [number, number, number],
      outlet: [0.31, 0.7, 0.12] as [number, number, number],
      holster: [-0.18, 1.0, 0.24] as [number, number, number],
      gauge: [0, 1.24, 0.226] as [number, number, number],
      start: [0.1, 1.0, 0.24] as [number, number, number],
      stop: [0.22, 1.0, 0.24] as [number, number, number],
    },
    filler: { aft: 0.4, inset: 0.3 },
    grab: 0.3,
    button: 0.12,
    plug: 0.4,
    desk: { reach: 3.2, hand: [0.18, -0.3, 0.55] as [number, number, number] },
  },

  /**
   * Voyage mode (mode.ts, world/maps.ts; owner, Oct 2026): a real-coastline map on its own,
   * no career, no saves. `boat`: the boat it starts in (any other by Start in, a Shipyard
   * code or a design file), fitted out in full.
   */
  /**
   * A second boat put in the world beside the home boat (multi-boat M2: Debug > Boat > Second
   * boat; core/spawnBoat.ts): this much clear water between their sides (m). `boardReach`: from
   * ashore, the board button takes you to the nearest boat with a wheelhouse within this (m).
   */
  /**
   * Level of detail by distance to the nearest player (multi-boat M4; core/lod.ts). A boat
   * within `near` m of a player (or with one aboard) is simulated in full every tick; within
   * `mid` on every second station; beyond, on `farStations` stations and, when nothing holds
   * her and `everyOtherTick` is on, every other tick at twice the step. The views draw wake and spray within `mid` of the viewer, smoke
   * within `near`; beyond `far` a boat's controls, labels and screens aren't drawn at all (her
   * hull, house and lights are).
   */
  lod: { near: 150, mid: 600, far: 1500, farStations: 4, everyOtherTick: true },

  spawn: {
    abeam: 6,
    boardReach: 40,
    /**
     * Launching your own boat (multi-boat M3; core/launch.ts, world/slots.ts): she's moored at
     * a berth whose quay face has room for her length plus `slotMargin` m each end, clear of
     * other boats (those within `nearFace` m of the face count), with her draught and `underKeel` m of
     * water under her whole hull; else anchored off the harbour:
     * in its anchorage, or `anchorOff` m from the port (tried outward) in `anchorDepth` m of
     * water, `anchorClear` m from any other boat.
     */
    slotMargin: 1.5,
    underKeel: 1,
    nearFace: 10,
    anchorOff: [80, 240] as [number, number],
    anchorDepth: [4, 30] as [number, number],
    anchorClear: 35,
    /** A launch asked for and no boat come in this long (s): the asker is told there was no room. */
    launchWaitS: 12,
  },

  voyage: {
    boat: 'pilotBoat',
    /**
     * Where you are on a map is remembered between sessions (owner, Oct 2026: close the
     * browser, come back to the map, and you're in the same place): the boat's position,
     * heading and berth, and whether you were aboard, saved every `rememberEveryS` s and
     * as the page closes (app/voyagePlace.ts, `swvr.voyage.<map>` in the browser's storage;
     * by the host or alone, never by crew). `?start` on the address starts at the map's
     * berth again (and forgets the place).
     */
    rememberEveryS: 5,
    /** A remembered spot afloat is only taken with this much water there (m); else the map's start. */
    rememberMinDepth: 2.5,
    /**
     * The voyage planning table (owner, Oct 2026: "in the harbour that you spawn in, a large
     * map table with a chart laid out ... that you can cooperatively plan on"; voyage/plan.ts,
     * voyage/planTable.ts). A big chart table on the quay at the map's start, behind where
     * you begin; the crew plan a route on it together (waypoints, stops, things to look at),
     * and every boat's chartplotter then shows the route and steers for its next point.
     *   maxPoints   points in a plan at most
     *   reach       how near any player's boat must come to a point (m) for it to count as
     *               reached and the next to come up: a waypoint, a stop (in the harbour),
     *               a thing to look at (seen from the water)
     *   nameStopM   a stop takes the name of the nearest harbour within this (m), else
     *               "off" the nearest town; `nameLookM` a thing to look at takes the name of
     *               the nearest castle, monument, tower, hill, wreck or light within it,
     *               else the nearest town
     *   removeShare Remove takes the point nearest the press within this share of the
     *               chart's width
     *   minSpan     the table zoomed in as far as it goes: this much sea across (m)
     *   drawPx      the chart drawn this many pixels across (sharper costs more to draw)
     *   table       its top (m: width along the quay, depth, height), how far behind the
     *               start spot it stands (m), its keys' row
     */
    plan: {
      maxPoints: 30,
      reach: { way: 150, stop: 300, look: 900 },
      nameStopM: 1500,
      nameLookM: 2500,
      removeShare: 0.05,
      minSpan: 1500,
      drawPx: 2048,
      table: { width: 2.4, depth: 1.6, height: 0.9, back: 3.2, keyDepth: 0.12 },
    },
    /**
     * The sign into the Shipyard beside the planning table (ui/shipyardDoor.ts; owner, Oct 2026:
     * refit or design her anew in the real Shipyard page): its width (m), how far past the
     * table's end it stands (m), its middle's height above the quay (m), how near you must be
     * to see it and to reach it (m).
     */
    shipyardSign: { width: 0.9, besideM: 0.9, up: 1.5, range: 25, reach: 4 },
    /**
     * The Your boats board (ui/shipyardDoor.ts ShipyardDoor.boats; owner, Oct 2026): your
     * Shipyard favourites on a board on the quay, beside every Shipyard sign (in Voyage on the
     * planning table's other side). Its width (m), and the gap between it and the sign (m);
     * its height, range and reach are the sign's.
     */
    boatsBoard: { width: 1.2, besideM: 0.3 },
    /**
     * The timber run (owner's spec, 23 Oct 2026: Workboat World x Timber; voyage/timber.ts,
     * voyage/metaverse.ts, docs/metaverse-contract.md). Anchor in a marked bay, go ashore to
     * the Timber game, come back to find your logs on the beach (owner, 25 Oct 2026: no
     * barge), tow them off one at a time and sell them at the merchant.
     *   holdS, maxSpeedKn   the prompt comes up once the anchor is set, she's slower than
     *                       this and inside the site's radius, for this long
     *   keepIds             handoff ids kept in the browser's lists (issued, consumed)
     *   fadeS               the fade to black before the page goes to the camp, and back in
     *   maxLogs             logs brought back at once (Timber sends at most this a trip and
     *                       keeps the rest), laid on the beach; also a saved barge's load at
     *                       most, four tiers (a barge with hundreds aboard would sink)
     *   logsPerTier         logs in each tier of the stack on deck (tiers at 10, 20, 30, 40)
     *   logKg, logLength, logDiameter   one log: 3 m of 0.3 m softwood, about 170 kg green
     *                       (a log on the beach is towed as that mass: salvage.ts logMass).
     *                       A full barge's 40 (6.8 t) puts her about 0.25 m deeper, which she
     *                       has freeboard for (her deck is 0.5 m up), and over half again her
     *                       own 10.5 t to tow and stop
     *   beachSpacingM, beachMaxAboveM   the camp's logs laid on the beach (owner, 25 Oct 2026:
     *                       no barge): side by side `beachSpacingM` apart along the shore, each
     *                       pointing out to sea, its middle where the beach is first under
     *                       `beachMaxAboveM` above the water going down to it; up to `maxLogs`
     *   merchants           where logs are bought: a harbour berth on a map. Oban's North Pier
     *                       berth: Ardantrive Bay is 2 km across the sound, a 10-20 minute tow
     *   logPrice            paid per log, before the harbour's reputation and buyer factors
     *                       (owner, 25 Oct 2026: a log's base price is £2,000, "and eventually
     *                       when we get really big ones, that could be up to 10,000": that needs
     *                       the camp to send each log's size, later). The beach's logs and a
     *                       saved barge's alike. (Washed-up salvage keeps CONFIG.career.pay.log.)
     *   sellRangeM          a log afloat within this of the merchant's quay (plus half its
     *                       length), slower than CONFIG.tow.deliverSpeed for
     *                       CONFIG.tow.deliverTime s, is bought; a saved barge's sale is
     *                       offered within this (plus her half-length, `bargeHalfLengthM`)
     *   sellMaxSpeedKn      with the boat slower than this
     */
    timber: {
      holdS: 3,
      maxSpeedKn: 0.5,
      keepIds: 50,
      fadeS: 1,
      maxLogs: 40,
      logsPerTier: 10,
      logKg: 170,
      logLength: 3,
      logDiameter: 0.3,
      beachSpacingM: 1.2,
      beachMaxAboveM: 0.5,
      merchants: [{ mapId: 'oban', berthId: 'oban-cargo', name: 'the Oban timber merchant' }],
      logPrice: 2000,
      sellRangeM: 15,
      sellMaxSpeedKn: 0.6,
      bargeHalfLengthM: 4.5,
    },
  },

  /**
   * The career's start: her berth, and the spot on the quay the player stands at (facing
   * the boat). On any other berth (a Voyage map's start, a boat moored elsewhere) the spot
   * ashore is worked out: `quayBack` m back from the berth's face beyond where she lies
   * (world/startSpot.ts).
   */
  start: {
    berthId: 'calder-cargo',
    quay: { x: 713, z: 661.5, yawDeg: 90 },
    quayBack: 2,
    /** A boat too deep for Calder Haven (4.5 m: her draught and `spawn.underKeel` to spare) starts at this port's first berth with room for her instead: Brannock Pier, deep water at its T-head (world/startSpot.ts startBerthFor). */
    deepPort: 'brannock',
  },

  /**
   * Engine voices: how each kind of diesel sounds (audio/engineAudio.ts, audio/dieselWorklet.ts).
   * A boat's diesel module names one in its config (`voice`); without one it's `inlineSix`.
   *   cylinders      a four-stroke fires cylinders/2 times a revolution: the beat's pitch
   *   strength       each firing's loudness, in firing order (the cycle's lumpy rhythm)
   *   jitter         +- random spread on each firing's loudness
   *   grit           how much of each pulse is noise (0.08 if left out)
   *   mech           level of that noise in `mechBand` (Hz, from and to; 400 to 1400 if
   *                  left out), beside the tone: the engine's mechanical clatter riding on
   *                  each firing (0: none)
   *   pulseTau       how long each exhaust pulse rings (s), + pulseTauLow more at idle
   *   body, stack    the exhaust's two resonances (peaking filters: Hz, Q, dB)
   *   lp             the tone's low-pass: base + rpm * (rpm / rated) + load * load (Hz)
   *   thump          its level: base + rpm * (rpm / rated) + load * load
   *   drive          soft-clip saturation (grit under load)
   *   hiss           intake / exhaust rush: base + load * load * rpm fraction
   *   turbo          a turbocharger's whine (a sine, Hz from idle to full boost) at `gain`
   *                  under full boost; null if naturally aspirated
   */
  engineVoices: {
    /**
     * The workboat's 400 kW engine: a worn, naturally aspirated straight six, dark and
     * round, its cylinders noticeably unequal so it lopes once a cycle. Tuned with the owner
     * against a recording of a similar boat: nothing above a few hundred Hz.
     */
    inlineSix: {
      cylinders: 6,
      strength: [1.0, 0.48, 1.1, 0.55, 1.03, 0.46],
      jitter: 0.1,
      grit: 0.08,
      mech: 0,
      mechBand: null as readonly [number, number] | null,
      pulseTau: 0.013,
      pulseTauLow: 0.006,
      body: { freq: 110, q: 0.9, gain: 4 },
      stack: { freq: 150, q: 2.2, gain: 3 },
      lp: { base: 150, rpm: 120, load: 180 },
      thump: { base: 0.65, rpm: 0.25, load: 0.35 },
      drive: 1.25,
      hiss: { base: 0.002, load: 0.008 },
      turbo: null as { idleHz: number; boostHz: number; gain: number } | null,
    },
    /**
     * The landing craft's 280 kW engine: a turbocharged V8, newer and evener than the
     * workboat's six. Eight cylinders fire four times a revolution (40 Hz at idle, 120 Hz
     * flat out, against the six's 30 / 90 Hz), so it's busier; what keeps it deep is the
     * V8 burble: in its firing order (1-5-4-2-6-3-7-8, odd cylinders on the port bank)
     * the banks take turns unevenly (P P S S S P P S), and the louder port bank's pulses
     * bunch up, so a low lope runs under the beat. A bigger exhaust: both resonances a
     * little lower, a touch more saturation under load. Its turbo whines faintly with boost
     * (set `turbo.gain` to 0 to lose it).
     */
    v8: {
      cylinders: 8,
      strength: [1.0, 0.94, 0.58, 0.55, 0.6, 1.03, 0.97, 0.56],
      jitter: 0.12,
      grit: 0.08,
      mech: 0,
      mechBand: null as readonly [number, number] | null,
      pulseTau: 0.011,
      pulseTauLow: 0.005,
      body: { freq: 85, q: 0.9, gain: 5 },
      stack: { freq: 132, q: 2.0, gain: 3 },
      lp: { base: 160, rpm: 140, load: 200 },
      thump: { base: 0.55, rpm: 0.3, load: 0.4 },
      drive: 1.4,
      hiss: { base: 0.002, load: 0.01 },
      turbo: { idleHz: 1400, boostHz: 3200, gain: 0.006 } as { idleHz: number; boostHz: number; gain: number } | null,
    },
    /**
     * The tug diesel, the big straight six (owner, Oct 2026: "a better engine noise for the
     * big straight six diesel"; "still sounds like a single cylinder"; then, with a phone
     * recording of "an actual 6 cylinder marine diesel" idling: this voice is that one's,
     * and only the big straight six's). The recording, analysed (PROGRESS.md): it fires 70
     * times a second, very evenly (the lines half-way between the firing's, which unequal
     * cylinders make, are 35 to 48 dB down), its third harmonic (210 Hz) the loudest, the
     * fundamental 6 dB and the second 11 dB under it, most of it at 120 to 400 Hz, a little
     * clatter to 2 kHz. A six firing 70 times a second at idle fires six times a revolution,
     * as a two-stroke six does (~700 rpm): `cylinders` 12 in this four-stroke reckoning
     * (45 Hz at the tug diesel's 450 rpm idle, 100 Hz flat out; a four-stroke six at its revs
     * fired only 22 times a second at idle, heard as one cylinder thumping). Even cylinders;
     * short pulses; a narrow exhaust resonance at 210 Hz (`stack`) and a dip at 70 (`body`,
     * negative gain); the clatter riding on each firing (`grit`, `mech`). Rendered offline at
     * the recording's 70 firings a second and its size, its harmonics lay within 1 dB of the
     * recording's for the first three, its spectrum within a few per cent from 200 Hz up;
     * then all of it scaled to the tug diesel's size (below).
     */
    bigSix: {
      cylinders: 12,
      strength: [1.0, 0.98, 1.0, 0.98, 1.0, 0.98],
      jitter: 0.03,
      grit: 0.3,
      mech: 3.5,
      // Scaled from the recording's smaller six (owner: "a smaller straight 6 so you can adapt
      // for the size of the tug's one"): the tug diesel's block 2.65 m long against ~1.5 m,
      // ~35 litres against ~6.5 (cube root 1.75): about 1.8 times the size. A bigger engine of
      // the same kind rings lower in proportion: its resonances, the clatter's band and the
      // tone's low-pass divided by 1.8, its pulses 1.8 times as long.
      mechBand: [220, 780] as readonly [number, number] | null,
      pulseTau: 0.011,
      pulseTauLow: 0.007,
      body: { freq: 39, q: 1.0, gain: -6 },
      stack: { freq: 117, q: 4, gain: 16 },
      lp: { base: 390, rpm: 170, load: 220 },
      // (Rendered offline: within about 2 dB of the engine's old sound overall, and a few dB
      // stronger where a headset plays, 100 to 400 Hz, where most of it now is.)
      thump: { base: 0.26, rpm: 0.26, load: 0.4 },
      drive: 1.5,
      hiss: { base: 0.003, load: 0.012 },
      turbo: { idleHz: 650, boostHz: 1700, gain: 0.007 } as { idleHz: number; boostHz: number; gain: number } | null,
    },
    /**
     * The petrol V8 outboards (owner, Oct 2026: "a great V8 petrol outboard sound", heard on
     * the Alaskan 38, "without the turbo part"): the V8's voice exactly, the turbo whine
     * left out. Revving to 5800 rpm (the outboards' rated speed: ENGINE voices take their
     * pulse rate from the engine's revs), its beat runs four times the diesel's: the
     * high, hard V8 howl of an outboard flat out.
     */
    outboardV8: {
      cylinders: 8,
      strength: [1.0, 0.94, 0.58, 0.55, 0.6, 1.03, 0.97, 0.56],
      jitter: 0.12,
      grit: 0.08,
      mech: 0,
      mechBand: null as readonly [number, number] | null,
      pulseTau: 0.011,
      pulseTauLow: 0.005,
      body: { freq: 85, q: 0.9, gain: 5 },
      stack: { freq: 132, q: 2.0, gain: 3 },
      lp: { base: 160, rpm: 140, load: 200 },
      thump: { base: 0.55, rpm: 0.3, load: 0.4 },
      drive: 1.4,
      hiss: { base: 0.002, load: 0.01 },
      turbo: null as { idleHz: number; boostHz: number; gain: number } | null,
    },
  },

  /**
   * The engine on small speakers (a phone's, earbuds; on with the touch controls): their
   * speakers can't play the beat's fundamental (30-120 Hz), so its harmonics they can play
   * are lifted (`presenceDb` at `presenceHz`) and the tone opened up (`lpLiftHz` on its
   * low-pass); the ear hears the deep beat from them. VR and desktop are untouched.
   */
  /** Twin engines (the Shipyard's): the engine sound's level times this (two sources, ~+3 dB; split between the two engines' sounds). */
  engineTwinLevel: 1.4,
  /**
   * The other players' boats heard (owner, Oct 2026: "hear your friends whizzing past you in
   * a motorboat ... spatialised ... and the horn has to work so you can beep at your
   * friends"; audio/boatVoices.ts). Each boat within `range` m (the nearest `maxBoats`
   * only: an engine voice costs the Quest's audio thread) is heard where she is, in 3D:
   *   engine     her own engine's voice (one, `twinLevel` louder for a twin), its revs and
   *              load from her state; `engineLevel` at `refDistance` m, falling off with
   *              distance (inverse, `rolloff`), the air taking the high end away (`airLp`
   *              Hz near, less by `airLpPerKm` per km)
   *   rush       the water she throws: noise, band-passed, `rushLevel` at `rushFullSpeed`
   *              m/s, as her speed squared: the "zoom" of a fast boat going by
   *   Doppler    her pitch up as she comes at you, down as she goes (her speed toward you,
   *              and yours toward her, over the speed of sound), at most `dopplerMax` either way
   *   horn       her horn while it's pressed (and she has power), `hornLevel`
   */
  boatSounds: {
    range: 700,
    maxBoats: 3,
    refDistance: 12,
    rolloff: 1,
    engineLevel: 0.5,
    twinLevel: 1.4,
    airLp: 14000,
    airLpPerKm: 11000,
    rushLevel: 0.35,
    rushFullSpeed: 14,
    dopplerMax: 0.25,
    hornLevel: 0.6,
  },
  /**
   * Twin engines' drone (owner): each engine has its own sound, and the second runs a little
   * off the first's revs, by a share of them that wanders slowly through zero: `share` at
   * most (0.8 %: 12 rpm at 1500, so their beats drift in and out of step about once every
   * 1-2 s at full revs, slower at idle), as the sum of two slow swings (`periodsS`, s,
   * weighted 0.6 / 0.4) so it never quite repeats. In real twins the governors never hold
   * exactly the same speed: the firing pulses go in and out of phase and you hear the
   * "wow-wow" drone. Only the sound: the physics still runs them in lockstep.
   */
  engineTwinDrift: { share: 0.008, periodsS: [23, 9.7] as [number, number] },

  engineSmallSpeakers: { presenceHz: 240, presenceDb: 9, lpLiftHz: 160 },

  /**
   * Multiplayer. "Try her together" (the Shipyard, owner Oct 2026): everyone in a design
   * session is sent into the game at once, and the crew may arrive before the one who pressed
   * it has the game open. So a crew-mate who finds no game yet tries again every
   * `togetherRetryS` seconds, up to `togetherTries` times (~40 s in all, a slow phone included).
   * A host lost (net/takeover.ts): the crew-mate who joined first hosts the game on under the
   * same code after `takeoverDelayS` s (time for a host whose page merely reloaded to come
   * back first); the rest rejoin by the retries above.
   * The host changing boat (App `restartPage`): the host's page waits `restartLeadS` s after
   * telling the crew before it starts again (the notice on its way), each crew page
   * `restartFollowS` s before it starts again in her (the host's old room closed by then),
   * then joins as "sent in together" (the retries above, while the host's new page opens).
   * An attempt not in after `togetherConnectS` seconds is dropped and tried again (one
   * can hang if made just as the host's game opens).
   * `togetherLeadS`: the Shipyard waits this long after telling the others before going into
   * the game itself, so the message is out before its page closes.
   * Hosting that fails at the broker (slow, down, or a room still held by a page that closed
   * without saying) is tried `hostTries` times in all, each wait `hostRetryS` longer than the last.
   * A crew-mate the host hasn't heard from for `crewHoldS` s lets go of what they held (the
   * wheel, a lever), and after `crewSilentS` s is taken out of its world (put back if heard
   * from again; net/hostSession.ts): a page gone without saying leaves no frozen avatar. A
   * crew page whose host is an older build waits for the host's page to update itself (App
   * `onOtherBuild`) and tries again, `olderHostRetryS` s, then as "sent in together".
   * A crew-mate's own boat waits `crewBoatGraceS` s for them once they've left (owner, 26 Oct
   * 2026: two minutes), theirs again if they rejoin from the same tab (core/launch.ts). The
   * host's page reloaded hosts the game again as it left it, within `hostWorldKeepS` s. A crew
   * page going to the host's map, mode or version says so `reloadNoticeS` s before it goes.
   * A join not in after `joinTimeoutS` s gives up (`joinLoadS` once the world is coming); a
   * game link (`?game=`) is tried `linkTries` times, not `togetherTries` (study #8, #23).
   * The heartbeat the other way (multiplayer study #1): a host not heard from for
   * `hostSilentS` s is "not responding", for `hostLostS` s lost (the takeover's wait starts,
   * `takeoverDelayS`: long enough for a host's page to reload, even a Quest's). A host whose
   * page is hidden keeps its game going, a step every `hiddenStepS` s (a background tab's
   * timers run about once a second). A host whose link to the game finder drops reconnects,
   * `finderRetryS` (first, most) apart, doubling.
   */
  net: { crewBoatGraceS: 120, hostWorldKeepS: 180, reloadNoticeS: 1.5, joinTimeoutS: 20, joinLoadS: 60, linkTries: 5, crewHoldS: 3, crewSilentS: 12, hostSilentS: 4, hostLostS: 10, hiddenStepS: 1, finderRetryS: [2, 30] as [number, number], olderHostRetryS: 6, togetherRetryS: 2, togetherTries: 20, togetherConnectS: 8, togetherLeadS: 0.6, hostTries: 5, hostRetryS: 3, restartLeadS: 0.8, restartFollowS: 1.5, takeoverDelayS: 25 },

  /**
   * Voice between the crew (net/voice.ts; owner request: up to four players). Everyone's
   * microphone goes to everyone else over the multiplayer link; how each voice is heard is
   * worked out from where the players are:
   *
   *   proximity (always on)  heard from where their head is, full up to `nearFull` metres,
   *                          fading to nothing at `nearMax` (a voice on deck, not over the sea)
   *   VHF (one channel)      while they press to talk on their handheld, heard by everyone
   *                          within `radioRange` metres through the radio: no direction, cut
   *                          down to the radio's narrow band (`radioLowHz`..`radioHighHz`) and
   *                          a little overdriven (`radioDrive`). Line of sight is not modelled:
   *                          a handheld's few kilometres, hills or not. Past `staticFrom` of
   *                          the range a hiss comes up, to `staticMax` at the edge. A radio
   *                          that's transmitting hears nobody (one talks at a time, as on VHF).
   *   squelchS / squelchGain the short burst of noise as a transmission starts and ends.
   *   retryS                 a call that failed is tried again after this (s).
   *   answerS                a call with no voice coming after this (s) is dropped and tried again.
   */
  voice: {
    nearFull: 2,
    nearMax: 22,
    radioRange: 5000,
    radioLowHz: 350,
    radioHighHz: 2800,
    radioDrive: 3,
    radioGain: 0.9,
    staticFrom: 0.6,
    staticMax: 0.08,
    squelchS: 0.12,
    squelchGain: 0.25,
    retryS: 5,
    answerS: 8,
    /** Your own handset's talk button (audio/handsetAudio.ts): the switch's click and the squelch burst after it. */
    handset: { clickHz: 2200, clickGain: 0.5, squelchS: 0.09, squelchGain: 0.18 },
  },

  /**
   * The handheld VHF everyone carries with voice chat on (player/radioHandset.ts). VR: clipped
   * high on your left shoulder at `shoulder` (metres from your head: right, up, forward, turned
   * with your heading), up out of the way of hands pulling and grabbing (on the chest it was
   * taken by mistake); grip it within `grabRange` (m) to take it, hold the trigger to talk,
   * let go and it clips back on. You can't see it there, so (owner, Oct 2026: "very hard to
   * find") the reach is generous, and a free hand coming within it gets a short tick in the
   * controller (`nearPulse`: strength 0..1, ms), once each time it arrives. `onAvatar`: where
   * others see it, in the torso's axes (hung from the neck). Desktop: hold V to talk.
   */
  radio: {
    shoulder: [-0.19, -0.2, -0.04] as [number, number, number],
    grabRange: 0.18,
    nearPulse: [0.3, 18] as [number, number],
    onAvatar: [-0.16, -0.06, -0.1] as [number, number, number],
  },

  /**
   * VR fly (Debug menu, for looking round the world in the headset): the left stick flies
   * the way you look (forward and back, side to side) at `speed` m/s; one trigger held
   * flies `fast` times quicker, both triggers `veryFast` times. The right stick still turns.
   */
  vrFly: { speed: 5, fast: 5, veryFast: 25 },

  /**
   * How shut-in the wheelhouse is, for sound (0 open .. 1 shut): the aft door is the big
   * opening, so shutting it counts `door` (the windows the rest). Inside, wind, rain and the
   * hull wash are muffled by that much (the wash by up to `washMuffle`).
   */
  /**
   * Inside the wheelhouse: the engine's level (x) and low-pass (Hz) with the aft door open
   * and shut (on deck: full, unfiltered). Wind, rain, wash and fire are muffled by the door
   * too; `washMuffle` is how much of the wash goes with it shut.
   */
  wheelhouseSound: {
    engineInside: 0.75,
    engineInsideLp: 1200,
    engineShut: 0.45,
    engineShutLp: 320,
    washMuffle: 0.6,
  },

  /**
   * Regions (world/regions/, docs/REGIONS.md): several map areas, each drawn in full only
   * while you're near it. All regions' DATA is always live (terrain, harbours, charts, jobs);
   * what's streamed per player is the drawing.
   *   loadDistance    a region's full terrain, structures and trees are shown (built in a
   *                   worker the first time) when the viewer is within this of its footprint (m)
   *   unloadDistance  ...and put away again beyond this (m; wider than loadDistance so a
   *                   boat working along the edge doesn't flicker it in and out)
   *   residencyEvery  how often the distances are checked (s)
   *   sight           how far off a thing of height h (m) can be seen on the clearest day
   *                   (m): base + perSqrtHeight * sqrt(h). The owner's rule of thumb: a 100 m
   *                   hill from ~40 km, a 10 m light from ~12 km, the sea itself from ~5 km.
   *                   Not horizon maths: a cull distance, cut further by the day's visibility.
   *   lightVisFactor  a light (a point) is seen through haze a little further than land:
   *                   out to this times the visibility
   */
  /**
   * Ferries on a coast map's real routes (the coast extras plan, C7; traffic/ferries.ts, drawn
   * by traffic/ferryView.ts), sailing them to and fro as the map draws them.
   *   shareReach  routes with ends this close (m) share a terminal (or a gap at the map's
   *             edge) and are one fleet
   *   fleet     a fleet has at most this many ships (one a route if fewer); they take its
   *             routes out past the map's edge in turn (Oban's six island routes: three ships)
   *   lane      she keeps this many of her beams to starboard of the route's line, so two
   *             meeting pass port to port; easing onto the line over `laneTaper` of her
   *             lengths into a terminal
   *   berthWait she lies off this many of her lengths short of a terminal while another of
   *             her fleet has the berth, or is still leaving it (within that and a length more)
   *   avoid     a ship meeting her head on within `ahead` m, closer abeam than `clear` x
   *             their beams (half the two added), she steps away from at `rate` m/s, up to
   *             `most` of her beams; back to her lane at half that once clear
   *   classes   each design's length, beam, draught and freeboard (m; her hull's box in the
   *             collision, the drawing made to it) and service speed (m/s: large 14 kn, small
   *             9 kn, launch 12 kn)
   *   dwell     she lies at a terminal this long (s) before sailing again
   *   away      beyond the map's edge this long (s: her crossing out of sight) before she
   *             comes back in
   *   brake     she slows over this many of her lengths into a terminal, to `minSpeed` (m/s)
   *   stopShort her bow stops this far (m) short of the route's end (the linkspan)
   *   hold      she stops rather than run anyone down: a boat within `ahead` m beyond her bow
   *             and `side` m beyond her side, on her course (or a ship of hers going her
   *             way); on again once it's clear
   *   stepReach the collision follows ferries within this of any vessel (m)
   *   radio     her calls leaving and arriving are heard within this of your boat (m)
   *   drawDistance  drawn within this of the viewer (m; the haze hides them beyond)
   */
  ferries: {
    classes: {
      large: { length: 72, beam: 15.5, draught: 3.2, freeboard: 3.6, speed: 7.2 },
      small: { length: 38, beam: 11, draught: 1.6, freeboard: 1.7, speed: 4.6 },
      launch: { length: 20, beam: 6, draught: 1.2, freeboard: 1.5, speed: 6.2 },
    } as Record<'large' | 'small' | 'launch', { length: number; beam: number; draught: number; freeboard: number; speed: number }>,
    dwell: 480,
    away: 1800,
    brake: 4,
    minSpeed: 0.8,
    stopShort: 6,
    shareReach: 300,
    fleet: 3,
    lane: 1.5,
    laneTaper: 1.5,
    berthWait: 3,
    avoid: { ahead: 400, clear: 2.5, most: 3, rate: 1.2 },
    hold: { ahead: 120, side: 20 },
    stepReach: 400,
    radio: 6000,
    drawDistance: 9000,
  },
  /**
   * Harbour boats (the settlements brief, Part C; world/harbourBoats.ts, drawn by
   * world/view/harbourBoatsView.ts): boats lying in a coast map's harbours, alongside, on
   * moorings and at anchor. Solid to a hull (a soft, fendered bump), not driven: they lie
   * where they are, swinging to the wind.
   *   pontoonShare / quayShare  the share of the berths along the pontoons / quays and piers
   *                    with a boat in (picked by each berth's id, so the same every time)
   *   namedClear       no boat alongside within this of a named berth (m: the cargo, fuel
   *                    and start berths, and their neighbours, stay free for you)
   *   kinds            each design's length, beam, draught and freeboard (m): her hull's box
   *                    for the collision; the drawing is made to the same size
   *   pennant          a moored boat lies this far beyond her length's half from the buoy
   *                    (m: the mooring pennant and the riser's scope)
   *   anchorPivot      at anchor she swings about where her chain lies on the seabed, this far
   *                    ahead of her bow (m, [least, most]; the owner: 15-20 m): `anchorScope`
   *                    x the depth, kept within it
   *   calmWind         below this wind (m/s) she lies more and more to her own whim (the tide)
   *   stepReach        the collision follows the boats within this of any vessel (m)
   *   drawDistance / maxShown  drawn within this of the viewer (m), the nearest this many;
   *                    `bobDistance` the nearer ones ride the waves (pitch and roll from
   *                    three wave samples), the farther just rise and fall; re-picked every
   *                    `refresh` s. `desktop`: farther on a desktop (Settings > Trees: the same
   *                    device level as the trees, render/device.ts).
   *   everyFrame       posed every frame within this of the viewer (m); out to `bobDistance`
   *                    every 2nd frame, beyond it every `farEvery`th, taking turns (review, Oct
   *                    2026: the busiest marina cost ~10 ms a frame on wave samples). A
   *                    moored boat's buoy takes her height (no sample of its own).
   */
  /**
   * The navigation marks (world/view/navMarksView.ts): set on the waves every frame within
   * `nearM` of the viewer (m), every `mid`th frame out to `midM`, every `far`th beyond, taking
   * turns (a far mark's rise and fall can't be seen; its light still flashes on time). Review,
   * Oct 2026: every mark on the map was sampled every frame.
   */
  navMarks: { wavesEvery: { nearM: 300, midM: 2000, mid: 4, far: 16 } },

  harbourBoats: {
    pontoonShare: 0.55,
    quayShare: 0.2,
    namedClear: 25,
    kinds: {
      creel: { length: 9.5, beam: 3.6, draught: 1.2, freeboard: 1.3 },
      yacht: { length: 10.5, beam: 3.4, draught: 1.7, freeboard: 1.1 },
      cruiser: { length: 9, beam: 3.2, draught: 0.9, freeboard: 1.4 },
      rib: { length: 5.8, beam: 2.3, draught: 0.4, freeboard: 0.8 },
      caique: { length: 9, beam: 3.2, draught: 1.1, freeboard: 1.2 },
    } as Record<'creel' | 'yacht' | 'cruiser' | 'rib' | 'caique', { length: number; beam: number; draught: number; freeboard: number }>,
    pennant: 3,
    anchorScope: 3,
    anchorPivot: [15, 20] as [number, number],
    calmWind: 3,
    stepReach: 250,
    drawDistance: 1500,
    maxShown: 120,
    bobDistance: 250,
    everyFrame: 150,
    farEvery: 4,
    refresh: 1,
    desktop: { drawDistance: 3500, maxShown: 400, bobDistance: 900 },
  },
  debug: {
    /** Log how many wheelhouse parts the interior-detail culling took (performance pass). */
    logDetail: false,
    overlayVisibleAtStart: false,
    surfaceProbesVisibleAtStart: false,
    hydroDebugVisibleAtStart: false,
    /** How often the overlay text is refreshed (Hz). */
    overlayUpdateHz: 4,
    /**
     * VR messages (debug/overlay.ts vrToast; review, Oct 2026): a card held in the view, this
     * wide (m), this far in front of your eyes (m) and this far below your line of sight (m),
     * so it's read with a glance down and doesn't hide the horizon. A buzz of `pulse` strength
     * for `pulseMs` on the left controller says one has come.
     */
    vrToast: { width: 0.62, distance: 1.25, down: 0.34, pulse: 0.3, pulseMs: 30 },
  },

  // Each area's own file (src/config/), so the chats working on each don't edit one file:
  ...VESSELS_CONFIG,
  ...SHIPYARD_CONFIG,
  ...MODULES_CONFIG,
  ...MAP_CONFIG,
};

export type Config = typeof CONFIG;
