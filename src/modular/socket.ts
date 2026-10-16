/**
 * Contract: SOCKETS (docs/MODULAR_BOATS.md 3.2).
 *
 * A socket is a named mounting point: on the hull (the helm console's place, an engine
 * bay, a roof mount) or on a module (a console's switch slots, a mast's light). Sockets
 * nest, so a whole bridge layout can be a sub-recipe: hull -> console -> instruments.
 *
 * The hull owns the bay; the module fills it. A socket says what fits by its type, and how
 * much by its capacity: the most power, mass and size an engine bay takes, the load rating
 * of a crane foundation. The recipe check refuses a module that's too big, so a "bigger
 * engine" is a one-line recipe change within the bay's rating, and five engines can't
 * appear on a small boat.
 *
 * Positions are in the parent's axes: vessel axes for a hull socket (+X starboard, +Y up,
 * -Z forward, origin amidships on the centreline at the DWL), the module's own axes for a
 * module's socket.
 */
import type { ModuleDefinition } from './module';

export type SocketType =
  // From the brief:
  | 'helm.console' //    the main bridge console (holds panel slots)
  | 'panel.slot' //      one control or instrument in a console or panel
  | 'panel.breaker' //   a breaker panel position
  | 'deck.equipment' //  crane, winch, windlass, davit (with a load rating)
  | 'stern.gantry' //    A-frame, stern roller
  | 'bow.ramp' //        bow door / ramp
  | 'roof.mount' //      searchlight, mast, horn, fire monitor
  | 'hull.light' //      nav lights, deck lights
  | 'engine.bay' //      propulsion unit, batteries, tank, pumps (power / mass / size limits)
  | 'deck.panel' //      solar panels
  | 'shore.inlet' //     shore-power connection
  | 'cabin.furniture' // chart table, duty board, whiteboard
  // Added (each has something on today's boat that needs it):
  | 'cabin.overhead' //  under the wheelhouse roof: VHF, chartplotter, overhead panel, cabin lamp
  | 'wall.panel' //      on a wall: battery master and selector, door buttons
  | 'deck.fitting' //    small deck gear: cleats, fender basket, life ring, boat-hook clips, swim ladder
  | 'bow.windlass' //    anchor windlass and hawse
  | 'tender.cradle' //   where a ship's boat stows (the skiff)
  | 'window.wiper' //    one per wiped windscreen pane
  | 'hull.rudder'; //    a rudder stock and its steering gear

/** Position (m) and rotation (deg, applied in the order Y, X, Z) relative to the parent. */
export interface Transform {
  position: readonly [number, number, number];
  rotationDeg?: readonly [number, number, number];
}

/**
 * What a socket allows. Named limits, not one number: an engine bay limits power AND mass
 * AND size; a crane foundation has a safe working load. Absent: no limit.
 */
export interface SocketCapacity {
  maxPowerKw?: number;
  maxMassKg?: number;
  /** Box the module must fit in (m, socket axes: width x, height y, length z). */
  size?: readonly [number, number, number];
  /** Safe working load of the foundation (kg), for lifting gear. */
  loadRatingKg?: number;
  /** How many units (battery banks, tanks...) of one module it takes. */
  maxUnits?: number;
}

export interface Socket {
  /** Unique among its siblings ('helm', 'slot3'). Full paths join parents: 'helm/slot3'. */
  id: string;
  type: SocketType;
  /** In the parent's axes (the hull's, or the module that offers it). */
  transform: Transform;
  capacity?: SocketCapacity;
  /** Free-form facts the module may need: 'inboard', 'starboard', 'slew:-120..120'. */
  tags?: readonly string[];
  /** For gear that spans the hull (2.7): e.g. the A-frame's foot spacing (m). */
  span?: number;
  /** For the shipyard and error messages: 'Throttle place, starboard of the wheel'. */
  label?: string;
}

/** Join socket ids into a path: socketPath('helm', 'slot3') = 'helm/slot3'. */
export function socketPath(...ids: string[]): string {
  return ids.filter((s) => s.length > 0).join('/');
}

/** What a module says about its size, for the capacity check (module.physical). */
export interface Physical {
  massKg?: number;
  /** Centre of gravity in socket axes (m). */
  cg?: readonly [number, number, number];
  /** Its box (m, socket axes). */
  size?: readonly [number, number, number];
  /** Rated power (kW): engines, motors, gensets. */
  powerKw?: number;
  /** Lifting gear: the load it is built to lift (kg). */
  swlKg?: number;
  /** How many units it counts as (battery banks...). */
  units?: number;
}

/**
 * Can this module go on this socket (with this config)? A readable reason if not:
 * the socket type, the tags the module needs, and every capacity limit.
 */
export function fits(def: ModuleDefinition, socket: Socket, config: unknown): { ok: true } | { ok: false; why: string } {
  if (!def.fits.includes(socket.type)) {
    return { ok: false, why: `${def.id} goes on ${def.fits.join(' / ')}, not on a '${socket.type}' socket` };
  }
  for (const tag of def.needsTags ?? []) {
    if (!socket.tags?.includes(tag)) return { ok: false, why: `${def.id} needs a socket tagged '${tag}'` };
  }
  const p = def.physical?.(config as never) ?? {};
  const c = socket.capacity ?? {};
  if (c.maxPowerKw !== undefined && (p.powerKw ?? 0) > c.maxPowerKw) {
    return { ok: false, why: `${def.id} is ${p.powerKw} kW; this ${socket.type} takes up to ${c.maxPowerKw} kW` };
  }
  if (c.maxMassKg !== undefined && (p.massKg ?? 0) > c.maxMassKg) {
    return { ok: false, why: `${def.id} weighs ${p.massKg} kg; this ${socket.type} takes up to ${c.maxMassKg} kg` };
  }
  if (c.size && p.size && p.size.some((d, i) => d > c.size![i])) {
    const fmt = (s: readonly number[]) => s.map((d) => d.toFixed(2)).join(' x ');
    return { ok: false, why: `${def.id} (${fmt(p.size)} m) doesn't fit the space (${fmt(c.size)} m)` };
  }
  if (c.maxUnits !== undefined && (p.units ?? 1) > c.maxUnits) {
    return { ok: false, why: `${def.id} is ${p.units} units; this ${socket.type} takes up to ${c.maxUnits}` };
  }
  if (p.swlKg !== undefined && (c.loadRatingKg ?? 0) < p.swlKg) {
    return { ok: false, why: `${def.id} lifts ${p.swlKg} kg; this foundation is rated for ${c.loadRatingKg ?? 0} kg` };
  }
  return { ok: true };
}
