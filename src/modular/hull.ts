/**
 * Contract: the HULL (docs/MODULAR_BOATS.md 3.4).
 *
 * The one bespoke, sculpted part of a boat. It holds everything that is about the shape:
 *   - the form (stations: the same ones float her and draw her), lightship mass and CG,
 *     damping, resistance, windage, the rudder blade - the handling numbers;
 *   - where you can walk (deck, wheelhouse floor, roof, ladder) and where you stand at the
 *     helm;
 *   - doors, hatches and windows that belong to the shape (their open/shut is a bus key,
 *     worked by ordinary button modules);
 *   - its sockets: where modules go, and what each will take.
 * A hull has no behaviour beyond floating. Anything that does something is a module.
 *
 * Since M6a the hull holds its shape and handling numbers, and the boat's vessel definition
 * (VESSEL_DEFS) is built from it and her recipe (modular/vesselAssembly.ts). Since 6b it
 * also holds what's still built into her (`fittings`: the exhaust outlet, rescue places, a
 * tow's look); her machinery, lights and gear are modules.
 */
import type { HullParams } from '../vessel/hullForm';
import { hullPlan } from '../vessel/layout';
import type { HullForm } from '../vessel/hullForm';
import type { HullFittings, LayoutConfig, VesselConfig } from '../vessel/vesselDef';
import type { MassProperties } from './massProperties';
import type { BusKey } from './busKeys';
import type { HullQueries, Provision } from './module';
import type { Socket } from './socket';

export interface HullDefinition {
  /** 'hull.workboat-12m'. Stable forever. */
  id: string;
  version: number;
  /** For players and the shipyard: 'Workboat, 12 m'. */
  name: string;
  /** Where she's mounted things: every module goes on one of these, or on a module's own. */
  sockets: Socket[];
  /** What the hull itself gives the boat (her wiring: the breakers' circuits). */
  provides?: Provision[];
  /** Where you stand at the helm (vessel axes) and which way you face (deg, 0 = forward). */
  helm: { stand: readonly [number, number, number]; yawDeg: number };
  /** Doors, hatches and windows that are part of the shape, each with the key that opens it. */
  features?: HullFeature[];

  // ── The shape and handling (M6a) ──
  /** Today's hard-chine generator (every boat in the game). A hull-study design, lofted, comes with M7. */
  form: { kind: 'chine'; params: HullParams };
  /**
   * Lightship: WITHOUT the modules that declare their own mass (2.6; the engine, the
   * batteries). The boat's mass, CG and inertia are this plus them (modular/massProperties.ts).
   */
  lightship: MassProperties;
  /** Added mass as fractions of the rigid body's, per axis. */
  addedMass: VesselConfig['addedMass'];
  damping: VesselConfig['damping'];
  /** Calm-water resistance. */
  resistance: VesselConfig['resistance'];
  /** Windage for leeway: areas and the centre of effort. */
  windage: VesselConfig['windage'];
  /** Deck, bulwarks, walkable margins; the wheelhouse, its roof and ladder where she has them. */
  layout: LayoutConfig;
  /** Her cargo deck: payload limits, clear areas, lashing points. */
  cargo: VesselConfig['cargo'];
  /** Debug spawn and drop test placement. */
  spawn: VesselConfig['spawn'];
  /** What's built into her (6b): the exhaust outlet, rescue places, a tow's look. */
  fittings?: HullFittings;
}

/** A door, hatch or window of the hull. */
export interface HullFeature {
  /** 'door.aft', 'hatch.engine'. */
  id: string;
  kind: 'door' | 'hatch' | 'window';
  /** The bus key that says it's open. */
  openKey: BusKey;
}

/** Hulls by id. */
export interface HullLibrary {
  get(id: string): HullDefinition | undefined;
}

export function createHullLibrary(hulls: readonly HullDefinition[]): HullLibrary {
  const byId = new Map(hulls.map((h) => [h.id, h]));
  return { get: (id) => byId.get(id) };
}

/** Read-only hull geometry for modules, from a hull's form and layout (2.7). */
export function hullQueries(def: { hull: HullForm; layout: LayoutConfig }): HullQueries {
  const plan = hullPlan(def);
  const bulwark = def.layout.bulwarkHeight;
  return {
    halfBeam: plan.halfBeam,
    deckY: plan.deckY,
    bulwarkTop: (z) => plan.deckY(z) + bulwark,
    transom: plan.transom,
    stem: plan.stem,
    cabinRoof: def.layout.wheelhouse?.roofY ?? null,
    cabinFloor: def.layout.wheelhouse?.floorY ?? null,
    engineSpace: def.layout.engineHatch ? { depth: def.layout.engineHatch.pitDepth, outboardX: def.layout.engineHatch.x1 } : null,
  };
}
