import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';
import { buildHullForm, type HullForm } from './hullForm';

type Workboat = typeof CONFIG.vessels.workboat;
type WorkboatLayout = Workboat['layout'];

/**
 * Deck layout: bulwarks, rails, walkable margins, and (on boats that have them) the
 * wheelhouse, its walkable roof and the ladder up to it.
 */
export type LayoutConfig = Omit<WorkboatLayout, 'wheelhouse' | 'roof' | 'ladder' | 'doorButtons' | 'fairleadGap'> & Partial<Pick<WorkboatLayout, 'wheelhouse' | 'roof' | 'ladder' | 'doorButtons' | 'fairleadGap'>>;

/** Electric outboard (see CONFIG.vessels.skiff.outboard and physics/outboard.ts). */
export type OutboardConfig = typeof CONFIG.vessels.skiff.outboard;

/**
 * Shape of a vessel's config block. Every boat has a hull, mass properties, resistance, a
 * deck layout and a cargo deck, and EITHER an inboard drive (engine + propeller + rudder)
 * OR an outboard. The rest is equipment only some boats carry (the workboat's bridge,
 * lights, anchor, mooring lines, rescue gear...). Adding a boat = a config block + a line
 * in VESSEL_DEFS.
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
  /** Inboard drive (diesel, shaft, propeller, rudder), or an outboard. */
  engine?: VesselConfig['engine'];
  propeller?: VesselConfig['propeller'];
  rudder?: VesselConfig['rudder'];
  outboard?: OutboardConfig;
  /** Where players stand after boarding (vessel axes). */
  boardingSpot: Vec3;
  /** Debug spawn / drop test placement. */
  spawn: VesselConfig['spawn'];
  /** Windage for leeway: side-on and end-on areas (m2) and centre of effort (vessel axes). */
  windage: VesselConfig['windage'];
  /** Deck layout: wheelhouse, bulwarks, walkable margins. */
  layout: LayoutConfig;
  cargo: VesselConfig['cargo'];
  /** Equipment only some boats have. */
  bridge?: VesselConfig['bridge'];
  navLights?: VesselConfig['navLights'];
  exhaust?: VesselConfig['exhaust'];
  anchor?: VesselConfig['anchor'];
  rescueGear?: VesselConfig['rescueGear'];
  cabinLight?: VesselConfig['cabinLight'];
  overheadPanel?: VesselConfig['overheadPanel'];
  whiteboard?: VesselConfig['whiteboard'];
  /** Duty board (optional: not part of WorkboatDef). */
  dutyBoard?: VesselConfig['dutyBoard'];
  deckLights?: VesselConfig['deckLights'];
  spotlight?: VesselConfig['spotlight'];
  mooring?: VesselConfig['mooring'];
  /** Tender crane and cradle (optional: not part of WorkboatDef). */
  tenderCrane?: VesselConfig['tenderCrane'];
  /** 12 V electrics (optional: not part of WorkboatDef; the skiff has its own battery). */
  electrics?: VesselConfig['electrics'];
  /** Swim ladder over the starboard side (optional: not part of WorkboatDef). */
  swimLadder?: VesselConfig['swimLadder'];
  /** Fire monitor on the roof (optional: not part of WorkboatDef). */
  fireMonitor?: VesselConfig['fireMonitor'];
  /** The trawl's A-frame and the TRAWL switch (fishing; optional: not part of WorkboatDef). */
  fishing?: VesselConfig['fishing'];
  /** The tow winch by the towing post (optional: not part of WorkboatDef). */
  towWinch?: VesselConfig['towWinch'];
  /** Bilge (optional: not part of WorkboatDef). */
  bilge?: VesselConfig['bilge'];
  /** Chart table (optional: not part of WorkboatDef). */
  chartTable?: VesselConfig['chartTable'];
  /** Fenders and engine oil (optional: not part of WorkboatDef). */
  fenders?: VesselConfig['fenders'];
  maintenance?: VesselConfig['maintenance'];
  /** Towable (towing missions; optional: not part of WorkboatDef). */
  tow?: TowLook;
}

type Equipment = 'engine' | 'propeller' | 'rudder' | 'bridge' | 'navLights' | 'exhaust' | 'anchor' | 'rescueGear' | 'cabinLight' | 'overheadPanel' | 'whiteboard' | 'deckLights' | 'spotlight' | 'mooring';

/**
 * A fully equipped vessel like the workboat: inboard drive, wheelhouse and bridge, lights,
 * anchor, mooring lines, rescue gear. Code that only makes sense on such a boat (the
 * bridge controls, instruments, engine sound, anchor and mooring physics...) takes this.
 */
export type WorkboatDef = VesselDef & { [K in Equipment]-?: NonNullable<VesselDef[K]> } & {
  layout: LayoutConfig & Required<Pick<WorkboatLayout, 'wheelhouse' | 'roof' | 'ladder' | 'doorButtons'>>;
};

/** Is this a fully equipped boat (see WorkboatDef)? */
export function isWorkboat(def: VesselDef): def is WorkboatDef {
  return !!(def.engine && def.propeller && def.rudder && def.bridge && def.navLights && def.exhaust && def.anchor && def.rescueGear && def.cabinLight && def.overheadPanel && def.whiteboard && def.deckLights && def.spotlight && def.mooring && def.layout.wheelhouse && def.layout.roof && def.layout.ladder && def.layout.doorButtons);
}

/** The def as a fully equipped boat; throws if it isn't one (a programming error). */
export function asWorkboat(def: VesselDef): WorkboatDef {
  if (!isWorkboat(def)) throw new Error(`${def.id} is not a fully equipped vessel`);
  return def;
}

/** Wetted surface at the DWL: submerged girth of each station times its spacing. */
function wettedSurfaceAtDWL(hull: HullForm): number {
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
    engine: c.engine,
    propeller: c.propeller,
    rudder: c.rudder,
    outboard: c.outboard,
    boardingSpot: c.boardingSpot,
    spawn: c.spawn,
    windage: c.windage,
    layout: c.layout,
    bridge: c.bridge,
    navLights: c.navLights,
    exhaust: c.exhaust,
    anchor: c.anchor,
    cargo: c.cargo,
    rescueGear: c.rescueGear,
    cabinLight: c.cabinLight,
    overheadPanel: c.overheadPanel,
    whiteboard: c.whiteboard,
    dutyBoard: c.dutyBoard,
    deckLights: c.deckLights,
    spotlight: c.spotlight,
    mooring: c.mooring,
    tenderCrane: c.tenderCrane,
    electrics: c.electrics,
    swimLadder: c.swimLadder,
    fireMonitor: c.fireMonitor,
    fishing: c.fishing,
    towWinch: c.towWinch,
    bilge: c.bilge,
    chartTable: c.chartTable,
    fenders: c.fenders,
    maintenance: c.maintenance,
    tow: c.tow,
  };
}

/** Registry of vessel types. To add a boat: add a config block, then a line here. */
export const VESSEL_DEFS: Record<string, VesselDef> = {
  workboat: fromConfig('workboat', CONFIG.vessels.workboat),
  skiff: fromConfig('skiff', CONFIG.vessels.skiff),
  derelict: fromConfig('derelict', CONFIG.vessels.derelict),
  logRaft: fromConfig('logRaft', CONFIG.vessels.logRaft),
  barge: fromConfig('barge', CONFIG.vessels.barge),
};

/** The towable kinds (towing missions), by def id. */
export const TOW_DEFS = ['derelict', 'logRaft', 'barge'] as const;
