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
  Partial<Pick<WorkboatLayout, 'roof' | 'ladder' | 'doorButtons' | 'fairleadGap' | 'engineHatch' | 'sideGate'>> & { wheelhouse?: WheelhouseLayout; bowRamp?: BowRampLayout };

/** A planing hull's banking in turns (CONFIG.vessels.landingCraft.planing). */
export type PlaningConfig = (typeof CONFIG.vessels.landingCraft)['planing'];

/** A bow ramp across a square bow (the landing craft's: CONFIG.vessels.landingCraft.layout.bowRamp). */
export type BowRampLayout = (typeof CONFIG.vessels.landingCraft.layout)['bowRamp'];

/**
 * A hull's paint, by part (vessel/view/hullMesh.ts draws her in it); a part not given keeps
 * the workboat's colour. 0xRRGGBB.
 */
export type Livery = Partial<Record<'bottom' | 'topsides' | 'deck' | 'house' | 'windows' | 'roof' | 'mast' | 'rail' | 'floor' | 'console' | 'panel', number>>;

/**
 * A wheelhouse: the workboat's, with what not every house has optional (M7): a port side
 * door, side sills raised alongside the console, a higher front sill, a raked front.
 */
export type WheelhouseLayout = Omit<WorkboatLayout['wheelhouse'], 'sideDoor' | 'sideRaise' | 'frontSill' | 'frontRakeDeg'> &
  Partial<Pick<WorkboatLayout['wheelhouse'], 'sideDoor' | 'sideRaise' | 'frontSill' | 'frontRakeDeg'>> & {
    /** A shaped house (the Shipyard's): drawn by its own builder (hullMesh.ts buildShapedHouse). */
    shape?: HouseShape;
    /** Steps at the aft door, where her floor is more than a step above or below the deck there. */
    steps?: DoorStep[];
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
  damping: Workboat['damping'];
  resistance: Workboat['resistance'];
  layout: LayoutConfig;
  cargo: Workboat['cargo'];
  boardingSpot: Vec3;
  spawn: Workboat['spawn'];
  windage: Workboat['windage'];
  engine?: Workboat['engine'];
  propeller?: Workboat['propeller'];
  rudder?: Workboat['rudder'];
  outboard?: OutboardConfig;
  bridge?: Workboat['bridge'];
  navLights?: Workboat['navLights'];
  exhaust?: Workboat['exhaust'];
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
  look: 'derelict' | 'logs' | 'barge';
  name: string;
}

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

/** What's built into a hull (see VesselDef). */
export interface HullFittings {
  exhaust?: Workboat['exhaust'];
  rescueGear?: Workboat['rescueGear'];
  /**
   * Where the hand gear lives aboard (M7: it was always the workboat's places): the
   * extinguisher's and the torch's wall brackets, the binoculars' spot on the dash (vessel
   * axes; the binoculars turned `yawDeg`). Gear she has no place for isn't aboard.
   */
  stowage?: { extinguisher?: Vec3; torch?: Vec3; binoculars?: { at: Vec3; yawDeg: number } };
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
export const VESSEL_IDS = ['workboat', 'skiff', 'derelict', 'logRaft', 'barge', 'landingCraft', 'design'] as const;

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
export const TOW_DEFS = ['derelict', 'logRaft', 'barge'] as const;
