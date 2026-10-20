import type { DeckhouseLayout } from './deckhouse';
import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';
import { buildHullForm, type HullForm } from './hullForm';

type Workboat = typeof CONFIG.vessels.workboat;
type WorkboatLayout = Workboat['layout'];

/**
 * Deck layout: bulwarks, rails, walkable margins, and (on boats that have them) the
 * wheelhouse, its walkable roof and the ladder up to it.
 */
export type LayoutConfig = Omit<WorkboatLayout, 'wheelhouse' | 'roof' | 'ladder' | 'doorButtons' | 'fairleadGap' | 'engineHatch' | 'sideGate'> &
  Partial<Pick<WorkboatLayout, 'roof' | 'ladder' | 'doorButtons' | 'fairleadGap' | 'sideGate'>> & {
    /**
     * The hatch over the engine (its opening, x0..x1 across, z0..z1 along) and the engine
     * space under it (`pitDepth` deep). In the helm house's floor, or (`y`, the deck's height
     * there: a Shipyard design's engine aft or forward of the house) cut into the open deck.
     * `space`: the engine space wider than the opening, across (twin engines, side by side).
     */
    engineHatch?: WorkboatLayout['engineHatch'] & { y?: number; space?: { x0: number; x1: number } };
    wheelhouse?: WheelhouseLayout;
    bowRamp?: BowRampLayout;
    deckhouse?: DeckhouseLayout;
    /**
     * Floors besides the deck and the house's (the Alaskan 38: her companionway treads and
     * the fore cabin's sole), each a level rectangle at a height; walked like any floor,
     * each within a stride (layout.ts STEP_HEIGHT) of its neighbours.
     */
    extraFloors?: FloorPatch[];
    /**
     * Hollow volumes inside what would otherwise be solid (below the deck or the house
     * floor): the fore cabin, the companionway. Your head is in the open there.
     */
    hollows?: Hollow[];
    /** The deck cut away forward of the house too, from `front` to the house, `inset` in from the deck edge: a cabin under a trunk cabin there (hullMesh.ts sunkenHouse). */
    deckOpening?: {
      front: number;
      inset: number;
      /** Its half width along her instead ([z, half width], front to aft; a Shipyard cabin below, P2c): the cut ends at its last z. */
      plan?: [number, number][];
    };
    /** A cabin below the deck under the deckhouse (parametric boats P2c, a Shipyard design's): see CabinBelow. */
    cabin?: CabinBelow;
    /**
     * A cockpit overhead (parametric boats P2b, owner): the house's aft roof carried on aft over
     * the working deck, from `z0` (the house's aft wall) to `z1`, its underside at `y`, `thickness`
     * thick, out to `halfWidth` each side. It stands on a wing each side: a plate `wing` thick
     * just inside the bulwark, as high as the roof from the house aft to the knee at `kneeZ`
     * (on the deck, `deckY` there), then sweeping up in a hollow curve to the roof's aft edge.
     * Solid where it is (layout.ts); open air under it (it's the deck, outside).
     */
    overhead?: OverheadLayout;
    /**
     * More houses besides the helm's (`wheelhouse`), parametric boats P2a: each a house of its
     * own (a saloon aft of the pilothouse, a deckhouse, a trunk cabin), walked, drawn, kept
     * off the deck and solid in its walls, as the helm's is. What belongs to the helm stays
     * the helm house's: the console (a further house's `consoleDepth` 0 has none), the doors
     * and their buttons, the rain on the front glass and the wipers, the roof ladder, the
     * engine hatch, the module places. `housesOf` gives them all, the helm's first.
     */
    houses?: WheelhouseLayout[];
  };

/** Every house she has, the helm's first (none: an open boat). */
export function housesOf(layout: { wheelhouse?: WheelhouseLayout; houses?: WheelhouseLayout[] }): WheelhouseLayout[] {
  return [...(layout.wheelhouse ? [layout.wheelhouse] : []), ...(layout.houses ?? [])];
}

/** A cockpit overhead (LayoutConfig.overhead). */
export interface OverheadLayout {
  z0: number;
  z1: number;
  y: number;
  thickness: number;
  halfWidth: number;
  wing: number;
  kneeZ: number;
  deckY: number;
}

/**
 * The top of an overhead's wing at z (its plate solid below it, down to the deck): the roof
 * from the house aft to the knee, then a hollow curve down to the deck... read the other way:
 * from the knee on the deck up to the roof's aft edge (a quadratic, as the Alaskan's).
 * Aft of the knee the plate is the part above the curve: `wingBelow` is that curve's height.
 */
export function wingCurveY(o: OverheadLayout, z: number): number {
  if (z <= o.kneeZ) return o.deckY;
  // The quadratic Bezier from (kneeZ, deckY) through the control point to (z1, y), as the Alaskan's wing.
  const cz = o.kneeZ + (o.z1 - o.kneeZ) * 0.2;
  const cy = o.y - (o.y - o.deckY) * 0.25;
  // Solve z(t) = z for t (monotonic in t), then y(t).
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const zt = (1 - t) * (1 - t) * o.kneeZ + 2 * (1 - t) * t * cz + t * t * o.z1;
    if (zt < z) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return (1 - t) * (1 - t) * o.deckY + 2 * (1 - t) * t * cy + t * t * o.y;
}

/**
 * A cabin below (parametric boats P2c; owner): under a Shipyard design's deckhouse forward of
 * the wheelhouse (its trunk), its sole sunk into the hull for standing headroom, reaching aft
 * under the wheelhouse floor to the foot of the companionway, which comes down from the
 * wheelhouse floor beside the helm. From `z0` (forward) to `z1`, its sole at `sole`, its half
 * width along her (`plan`, [z, half width] front to aft: inside the trunk's walls and her
 * hull's sides at the sole). Its ceiling: the trunk's top forward of `ceiling.front` (the
 * wheelhouse front, at `ceiling.trunk`), the wheelhouse floor's underside aft of it
 * (`ceiling.house`). The companionway: an opening `stair` in the wheelhouse floor, its treads
 * stepping down forward. A V-berth across her forward end to `berth.z1`, `berth.top` high.
 *
 * Drawn by vessel/view/hullMesh.ts (a lining facing in: the hull and deckhouse are drawn to
 * be seen from outside). Walked through the general fields the Alaskan 38's cabin uses: the
 * treads and sole are extraFloors, the space is hollows, the opening the house's floorHoles,
 * the deck cut away over it deckOpening.
 */
export interface CabinBelow {
  z0: number;
  z1: number;
  sole: number;
  plan: [number, number][];
  ceiling: { front: number; trunk: number; house: number };
  stair: { x0: number; x1: number; z0: number; z1: number; treads: { z0: number; z1: number; y: number }[] };
  berth?: { z1: number; top: number };
}

/** A [z, half width] plan's half width at z (front to aft; interpolated; 0 outside it): a cabin below's, a deck opening's. */
export function planHalfWidth(p: readonly (readonly [number, number])[], z: number): number {
  if (z < p[0][0] || z > p[p.length - 1][0]) return 0;
  for (let i = 1; i < p.length; i++) {
    if (z <= p[i][0]) {
      const [za, wa] = p[i - 1];
      const [zb, wb] = p[i];
      return zb === za ? wb : wa + ((wb - wa) * (z - za)) / (zb - za);
    }
  }
  return p[p.length - 1][1];
}

/** A level rectangle of floor at a height (LayoutConfig.extraFloors). */
export interface FloorPatch {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
}

/** A box of open space (LayoutConfig.hollows). */
export interface Hollow {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/**
 * A planing hull's behaviour in turns (vesselPhysics.ts), faded in from Fn `fnStart` to
 * `fnFull`. Two models: `bank`, the built-in landing craft's and Alaskan's banking force
 * (CONFIG.vessels.landingCraft.planing; owner: keep how she handles); `lean`, the Shipyard's
 * boats' lean into the turn (CONFIG.planingTurn, CONFIG.shipyard).
 */
export interface PlaningConfig {
  fnStart: number;
  fnFull: number;
  bank?: number;
  lean?: number;
}

/** A bow ramp across a square bow (the landing craft's: CONFIG.vessels.landingCraft.layout.bowRamp). */
export type BowRampLayout = (typeof CONFIG.vessels.landingCraft.layout)['bowRamp'];

/**
 * A hull's paint, by part (vessel/view/hullMesh.ts draws her in it); a part not given keeps
 * the workboat's colour. 0xRRGGBB.
 */
/**
 * `roofTop`: a panel set in from the roof top's edges in its own colour (the eyebrow; none: the
 * roof is one colour). `interior`: the wheelhouse's finish inside, an index into
 * CONFIG.interiors (none: the wood lining).
 */
export type Livery = Partial<Record<'bottom' | 'topsides' | 'deck' | 'house' | 'windows' | 'roof' | 'roofTop' | 'mast' | 'rail' | 'floor' | 'console' | 'panel' | 'interior', number>>;

/**
 * A wheelhouse: the workboat's, with what not every house has optional (M7): a port side
 * door, side sills raised alongside the console, a higher front sill, a raked front.
 */
export type WheelhouseLayout = Omit<WorkboatLayout['wheelhouse'], 'sideDoor' | 'sideRaise' | 'frontSill' | 'frontRakeDeg'> &
  Partial<Pick<WorkboatLayout['wheelhouse'], 'sideDoor' | 'sideRaise' | 'frontSill' | 'frontRakeDeg'>> & {
    /** A shaped house (the Shipyard's): drawn by its own builder (hullMesh.ts buildShapedHouse). */
    shape?: HouseShape;
    /**
     * The walls, windows and roof are the boat's own geometry (boats/oneOffViews.ts, the
     * Alaskan 38): the hull mesh draws only her floor, console and door steps. Everything
     * else (walk areas, the door, rain on the glass, module places) still reads this box.
     */
    shell?: 'oneOff';
    /**
     * The floor on more than one level along the house (the Alaskan 38: the raised
     * pilothouse floor, a tread, the sunk saloon floor), each a stretch of z at a height;
     * `floorY` where none covers (and the helm's level). houseFloorAt gives the floor at z.
     * A level a step or more above or below the next needs a tread between (STEP_HEIGHT).
     */
    levels?: FloorLevel[];
    /**
     * The saloon's own roof, lower than the wheelhouse's (parametric boats P2b): aft of `z` (the
     * step in the roofline) the roof's underside is at `y`, not `roofY`. houseRoofAt gives the
     * underside at z. Unset: one roof all along.
     */
    saloonRoof?: { z: number; y: number };
    /** Openings in the house floor (a companionway down): not walked; the treads below are extraFloors. */
    floorHoles?: { x0: number; x1: number; z0: number; z1: number }[];
    /** Steps at the aft door, where her floor is more than a step above or below the deck there. */
    steps?: DoorStep[];
    /** Where the view out through the front glass starts, above the floor (m): the top of what stands in front of it (the dash). The wipers clear the glass from there up. Unset: the front sill. */
    viewSill?: number;
    /** The console set back from the front wall this far (m; owner: clear of the glass), the floor in front of it bare. Unset: 0. */
    consoleBack?: number;
    /**
     * How far the console runs across the cabin (x, from and to, m; owner, Oct 2026: cut short
     * on a wide wheelhouse, to port, the middle or starboard). Beside it the floor is walked
     * up to the front wall. Unset: wall to wall.
     */
    consoleSpan?: { x0: number; x1: number };
    /** The aft door hinged on its port side, swinging out 90 deg onto the deck (owner: with the windows raked out all round a sliding door would clash with the leaning glass), not sliding. */
    doorHinged?: boolean;
  };

/**
 * A shaped wheelhouse (owner, the Shipyard): the front below the windows leaning forward,
 * the windows raked either way (frontRakeDeg: + leaning forward at the top), and the roof
 * one flat slab (its thickness is roof.thickness) reaching forward over the windows as a
 * visor, its front face raked back as it rises.
 */
export interface HouseShape {
  /** The front below the windows: its lean from vertical (deg, + top forward), from `lowerFromY` (the deck, or the floor if lower) up to the windows. */
  lowerRakeDeg: number;
  lowerFromY: number;
  /** The roof's front face, raked back as it rises from the underside's edge (deg from vertical). */
  roofEdgeDeg: number;
  /** How far the roof reaches forward of the top of the front windows (m). */
  visor: number;
  /**
   * A three-facet front (owner: a tug's pilot house): the middle pane square across her,
   * the outer two angled back to the sides from `centre` (m either side of the centreline,
   * the mullions) to `depth` (m aft) at the side walls; the console and helm stand that
   * much further aft (hullMesh.ts facetDz).
   */
  facet?: { centre: number; depth: number };
  /**
   * Windows raked out all round (owner: a tug's or supply vessel's bridge): above the side
   * windows' sill the side walls lean out and the aft wall leans aft, `tan` (of the rake
   * from vertical) per m of height, up to the window head and on up to the roof at the
   * same offset. The doors stay upright. See houseFlare.ts.
   */
  flare?: { tan: number };
}

/** A stretch of the house floor at one height (WheelhouseLayout.levels). */
export interface FloorLevel {
  z0: number;
  z1: number;
  y: number;
}

/** The house floor's height at z: the level covering it, else `floorY`. */
export function houseFloorAt(wh: { floorY: number; levels?: FloorLevel[] }, z: number): number {
  const l = wh.levels?.find((lv) => z >= lv.z0 && z <= lv.z1);
  return l ? l.y : wh.floorY;
}

/** The house roof's underside at z: the wheelhouse's, or a lower saloon roof's aft of its step (saloonRoof). */
export function houseRoofAt(wh: { roofY: number; saloonRoof?: { z: number; y: number } }, z: number): number {
  return wh.saloonRoof && z > wh.saloonRoof.z ? wh.saloonRoof.y : wh.roofY;
}

/** The house floor's lowest level. */
export function houseFloorLow(wh: { floorY: number; levels?: FloorLevel[] }): number {
  return Math.min(wh.floorY, ...(wh.levels ?? []).map((lv) => lv.y));
}

/** A step at the aft door: a tread `y` high from `z0` to `z1` (z0 < z1), across the doorway. */
export interface DoorStep {
  y: number;
  z0: number;
  z1: number;
}

/** Electric outboard (see CONFIG.vessels.skiff.outboard and physics/outboard.ts). */
export type OutboardConfig = typeof CONFIG.vessels.skiff.outboard;

/**
 * Shape of a vessel's config block. Every boat has a hull, mass properties, resistance, a
 * deck layout and a cargo deck, and EITHER an inboard drive (engine + propeller + rudder)
 * OR an outboard. The rest is equipment only some boats carry (the workboat's bridge,
 * lights, anchor, mooring lines, rescue gear...). It's where the tunable figures live: the
 * hulls (boats/*Hull.ts) and the modules' defaults read them from here, and the boats are
 * built from their recipes (boats/library.ts).
 */
export interface VesselConfig {
  hull: Workboat['hull'];
  mass: number;
  cg: Vec3;
  gyradius: Workboat['gyradius'];
  addedMass: Workboat['addedMass'];
  /** `rollLift`: roll damping that grows with speed (vesselPhysics.ts; unset: none). */
  damping: Workboat['damping'] & { rollLift?: number };
  resistance: Workboat['resistance'];
  layout: LayoutConfig;
  /** `edge`: how far inside her sheer cargo keeps (m; unset: the bulwark's, cargo/deck.ts). */
  cargo: Workboat['cargo'] & { edge?: number };
  boardingSpot: Vec3;
  spawn: Workboat['spawn'];
  windage: Workboat['windage'];
  engine?: Workboat['engine'];
  propeller?: Workboat['propeller'];
  rudder?: Workboat['rudder'];
  outboard?: OutboardConfig;
  bridge?: Workboat['bridge'];
  navLights?: Workboat['navLights'];
  exhaust?: ExhaustFitting;
  anchor?: Workboat['anchor'];
  rescueGear?: Workboat['rescueGear'];
  cabinLight?: Workboat['cabinLight'];
  overheadPanel?: Workboat['overheadPanel'];
  whiteboard?: Workboat['whiteboard'];
  dutyBoard?: Workboat['dutyBoard'];
  deckLights?: Workboat['deckLights'];
  spotlight?: Workboat['spotlight'];
  mooring?: Workboat['mooring'];
  tenderCrane?: Workboat['tenderCrane'];
  electrics?: Workboat['electrics'];
  swimLadder?: Workboat['swimLadder'];
  fireMonitor?: Workboat['fireMonitor'];
  fishing?: Workboat['fishing'];
  towWinch?: Workboat['towWinch'];
  bilge?: Workboat['bilge'];
  chartTable?: Workboat['chartTable'];
  fenders?: Workboat['fenders'];
  maintenance?: Workboat['maintenance'];
  /** Something to tow (towing missions): its look and what the radio calls it. */
  tow?: TowLook;
}

/** A towable hull: the model drawn over it (tow/towLook.ts) and what the radio calls it. */
export interface TowLook {
  look: 'derelict' | 'logs' | 'barge' | 'dory' | 'yacht' | 'trawler' | 'pontoon' | 'cage' | 'coaster';
  name: string;
  /** Small, medium, large or a ship: the debug menu's choice (owner) and roughly the pay. */
  size: TowSize;
  /** A large tow passes you her own heavy hawser: the line parts at this many times CONFIG.tow.breakForce (unset: 1). */
  lineFactor?: number;
  /** Only a tug gets this call (tow/tow.ts isTugClass): a ship. Unset: any boat with a tow point. */
  needs?: 'tug';
}

export type TowSize = 'small' | 'medium' | 'large' | 'ship';

/**
 * Static description of a vessel type (shared by every vessel of that type).
 * Not part of WorldState: vessels reference it by `defId`.
 */
export interface VesselDef {
  id: string;
  hull: HullForm;
  mass: number;
  cg: Vec3;
  /** Principal moments of inertia about the CG in vessel axes: x = pitch, y = yaw, z = roll. */
  inertia: Vec3;
  /** Added-mass fractions in vessel axes: linear [sway (x), heave (y), surge (z)], angular [pitch, yaw, roll]. */
  addedLinear: Vec3;
  addedAngular: Vec3;
  damping: VesselConfig['damping'];
  /** Volume (m^3) displaced at equilibrium; used to scale added mass by immersion. */
  designVolume: number;
  /** Wetted surface (m^2) at the DWL, from the stations. */
  wettedSurface: number;
  resistance: VesselConfig['resistance'];
  /** A planing hull's banking into turns (vessel/physics/vesselPhysics.ts); none: a displacement hull. */
  planing?: PlaningConfig;
  /** Where players stand after boarding (vessel axes). */
  boardingSpot: Vec3;
  /** Debug spawn / drop test placement. */
  spawn: VesselConfig['spawn'];
  /** Windage for leeway: side-on and end-on areas (m2) and centre of effort (vessel axes). */
  windage: VesselConfig['windage'];
  /** Deck layout: wheelhouse, bulwarks, walkable margins. */
  layout: LayoutConfig;
  cargo: VesselConfig['cargo'];
  /**
   * What's built into her hull (modular boats M6b; the hull's `fittings`): the exhaust
   * outlet, the places a rescued casualty is put, and a tow's look. Her machinery, lights
   * and deck gear are her modules': ask them (boats/sims.ts gearOf).
   */
  exhaust?: HullFittings['exhaust'];
  rescueGear?: HullFittings['rescueGear'];
  stowage?: HullFittings['stowage'];
  livery?: HullFittings['livery'];
  tow?: TowLook;
}

/**
 * A vessel type whose hull has a wheelhouse, its walkable roof and the ladder up to it (the
 * workboat's). The bridge, the wheelhouse interior and the app's wheelhouse views are built
 * for one (6c makes them per boat). A fact of her shape: what's fitted in it is her modules'.
 */
export type WheelhouseDef = VesselDef & {
  layout: LayoutConfig & { wheelhouse: WheelhouseLayout } & Required<Pick<WorkboatLayout, 'roof' | 'doorButtons'>>;
};

/** Has her hull a wheelhouse (see WheelhouseDef)? */
export function hasWheelhouse(def: VesselDef): def is WheelhouseDef {
  return !!(def.layout.wheelhouse && def.layout.roof && def.layout.doorButtons);
}

/**
 * Her exhaust: where the smoke comes out and which way it blows (vessel axes). Most boats have
 * a wet exhaust, smoke and cooling water out of one outlet in the transom (drawn as a stub
 * there). A tug (owner, Oct 2026) has dry stacks instead, one per engine (`stack`: the smoke
 * out of their tops, `position` and any `more`; the pipes drawn by their module,
 * fitting.exhaust-stack) and her cooling water out of a hole in her side near the waterline
 * for each (`water`), spat out in bursts as the pump delivers it.
 */
export type ExhaustFitting = Workboat['exhaust'] & {
  stack?: boolean;
  /** A twin's second stack: its top (the smoke shares itself between them). */
  more?: Vec3[];
  water?: { position: Vec3; direction: Vec3 }[];
};

/** The transom outlet the hull draws (none for a dry stack). */
export function wetOutlet(def: { exhaust?: ExhaustFitting }): Vec3 | undefined {
  return def.exhaust && !def.exhaust.stack ? def.exhaust.position : undefined;
}

/** What's built into a hull (see VesselDef). */
export interface HullFittings {
  exhaust?: ExhaustFitting;
  rescueGear?: Workboat['rescueGear'];
  /**
   * Where the hand gear lives aboard (M7: it was always the workboat's places): the
   * extinguisher's and the torch's wall brackets, the binoculars' spot on the dash (vessel
   * axes; the binoculars turned `yawDeg`), and the potting bait tub's spot on deck (vessel
   * x, z; it stands on the deck). Gear she has no place for isn't aboard.
   */
  stowage?: { extinguisher?: Vec3; torch?: Vec3; lineGun?: Vec3; binoculars?: { at: Vec3; yawDeg: number } };
  /** Her paint (unset: the workboat's orange and white). */
  livery?: Livery;
  tow?: TowLook;
}

/** Wetted surface at the DWL: submerged girth of each station times its spacing. */
export function wettedSurfaceAtDWL(hull: HullForm): number {
  let s = 0;
  for (const st of hull.stations) {
    let girth = 0;
    const p = st.polygon;
    // Hull edges only (skip the deck edge, last -> first).
    for (let i = 0; i < p.length - 1; i++) {
      let [x0, y0] = p[i];
      let [x1, y1] = p[i + 1];
      if (y0 > 0 && y1 > 0) continue;
      // Clip the segment to y <= 0.
      if (y0 > 0) [x0, y0] = [x0 + ((x1 - x0) * (0 - y0)) / (y1 - y0), 0];
      if (y1 > 0) [x1, y1] = [x1 + ((x0 - x1) * (0 - y1)) / (y0 - y1), 0];
      girth += Math.hypot(x1 - x0, y1 - y0);
    }
    s += girth * st.weight;
  }
  return s;
}

/** What's built into a hull, from a vessel config block (for fromConfig). */
export function fittingsOf(c: VesselConfig): HullFittings {
  return { exhaust: c.exhaust, rescueGear: c.rescueGear, tow: c.tow };
}

/**
 * A vessel type straight from its config block, the way every boat was built until M6a.
 * Kept so a test can check the recipe-built definitions against it.
 */
export function fromConfig(id: string, c: VesselConfig): VesselDef {
  const m = c.mass;
  const hull = buildHullForm(c.hull);
  return {
    id,
    hull,
    mass: m,
    cg: c.cg,
    inertia: [m * c.gyradius.pitch ** 2, m * c.gyradius.yaw ** 2, m * c.gyradius.roll ** 2],
    addedLinear: [c.addedMass.sway, c.addedMass.heave, c.addedMass.surge],
    addedAngular: [c.addedMass.pitch, c.addedMass.yaw, c.addedMass.roll],
    damping: c.damping,
    designVolume: m / CONFIG.ocean.density,
    wettedSurface: wettedSurfaceAtDWL(hull),
    resistance: c.resistance,
    boardingSpot: c.boardingSpot,
    spawn: c.spawn,
    windage: c.windage,
    layout: c.layout,
    cargo: c.cargo,
    ...fittingsOf(c),
  };
}

/** The vessel types, by def id (the ids live on in saves and snapshots: never rename). */
export const VESSEL_IDS = ['workboat', 'skiff', 'derelict', 'logRaft', 'barge', 'dory', 'yacht', 'trawler', 'pontoon', 'cage', 'coaster', 'landingCraft', 'alaskan38', 'design', 'lander', 'fishingBoat', 'pilotBoat', 'smallTug', 'starterBoat'] as const;

let built: Record<string, VesselDef> | null = null;
let builder: (() => Record<string, VesselDef>) | null = null;

/**
 * The boats' library (boats/library.ts) hands over how to build every vessel type from her
 * recipe when it loads. (This file can't import it: the modules it holds import this file.)
 */
export function registerVesselDefs(build: () => Record<string, VesselDef>): void {
  builder = build;
  built = null;
}

function defs(): Record<string, VesselDef> {
  if (!builder) throw new Error('VESSEL_DEFS used before the boats library (boats/library.ts) was loaded');
  return (built ??= builder());
}

/**
 * Registry of vessel types, each built from her recipe (modular boats M6a: the hull plus her
 * modules, modular/vesselAssembly.ts). Built on first use. To add a boat: a hull, a recipe,
 * and its id here.
 */
export const VESSEL_DEFS: Record<string, VesselDef> = Object.defineProperties(
  {},
  Object.fromEntries(VESSEL_IDS.map((id) => [id, { enumerable: true, get: () => defs()[id] }])),
);

/** The towable kinds (towing missions), by def id. */
export const TOW_DEFS = ['derelict', 'dory', 'logRaft', 'barge', 'yacht', 'trawler', 'pontoon', 'cage', 'coaster'] as const;
