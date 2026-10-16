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
 * Until M6 a hull stands on today's vessel definition (`legacyDef`): the physics, mesh and
 * walk area still come from VESSEL_DEFS, and the hull adds only its sockets. M6 moves the
 * shape and handling numbers in here and drops `legacyDef`.
 */
import type { HullParams } from '../vessel/hullForm';
import { hullPlan } from '../vessel/layout';
import type { VesselDef } from '../vessel/vesselDef';
import type { BusKey } from './busKeys';
import type { HullQueries, Provision } from './module';
import type { Socket } from './socket';

export interface HullDefinition {
  /** 'hull.workboat-12m'. Stable forever. */
  id: string;
  version: number;
  /** For players and the shipyard: 'Workboat, 12 m'. */
  name: string;
  /** Until M6: the vessel definition her physics, mesh and walk area still come from. */
  legacyDef?: string;
  /** Where she's mounted things: every module goes on one of these, or on a module's own. */
  sockets: Socket[];
  /**
   * What the hull itself gives the boat. Until the electrics and engine are modules (M4),
   * the hull stands in for today's code: 12 V on the existing circuits, deck hydraulics,
   * the power take-off, diesel.
   */
  provides?: Provision[];
  /** Where you stand at the helm (vessel axes) and which way you face (deg, 0 = forward). */
  helm: { stand: readonly [number, number, number]; yawDeg: number };
  /** Doors, hatches and windows that are part of the shape, each with the key that opens it. */
  features?: HullFeature[];

  // ── Filled in M6 (until then from `legacyDef`) ──
  /** Today's hard-chine generator (the workboat, unchanged) or a hull-study design, lofted. */
  form?: { kind: 'chine'; params: HullParams } | { kind: 'loft'; designId: string };
  /** Lightship: WITHOUT the modules that declare their own mass (2.6). */
  lightship?: { massKg: number; cg: readonly [number, number, number]; gyradius: { roll: number; pitch: number; yaw: number } };
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

/** Read-only hull geometry for modules, from a vessel definition (2.7). */
export function hullQueries(def: VesselDef): HullQueries {
  const plan = hullPlan(def);
  const bulwark = def.layout.bulwarkHeight;
  return {
    halfBeam: plan.halfBeam,
    deckY: plan.deckY,
    bulwarkTop: (z) => plan.deckY(z) + bulwark,
    transom: plan.transom,
    stem: plan.stem,
  };
}
