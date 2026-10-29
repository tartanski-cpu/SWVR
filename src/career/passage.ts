/**
 * Passages (owner, 29 Oct 2026: "the career map's now quite big ... a world tab, so not under
 * debug, and you can teleport to the sheltered harbour with the pier in any one of the regions,
 * and it only costs you time and the fuel"). The menu's World tab (career only) lists each
 * region's harbour; Go makes the passage at once, as the voyage's Go does, but it's paid for:
 *
 *   distance  the straight line from her to the harbour, times `routeFactor` (round the
 *             headlands and up the channels: the water's way is longer than the crow's)
 *   time      at her cruising speed (`lever` ahead, measured on her: seaTrials measureCruise):
 *             the game's clock goes on that long, and so does the time played (world.time),
 *             so a contract's time runs, pots soak, a farm's silo goes down, salmon goes stale
 *   fuel      her burn at that cruise for that long, out of her tank (paid for when she fills up)
 *
 * She arrives as the voyage's Go puts her: at the harbour's cargo berth, lever in neutral,
 * lines off, ready to make fast. The host makes it (the time is everyone's); not with a tow
 * fast, not without the fuel for it.
 */
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { cargoPortAt } from '../cargo/cargo';
import { lineOf } from '../tow/tow';
import type { VesselState } from '../vessel/vesselState';
import { PORTS, type PortDef } from '../world/archipelago';
import { REGIONS } from '../world/regions';

/** Each region's sheltered harbour (its port of kind 'harbour'), region by region: where a passage can go. */
export const PASSAGE_PORTS: { port: PortDef; region: string }[] = REGIONS.flatMap((r) => {
  const port = r.ports.find((p) => p.kind === 'harbour');
  const live = port ? PORTS.find((p) => p.id === port.id) : undefined;
  return live ? [{ port: live, region: r.name }] : [];
});

/** Her cruise, as measured: speed (kn) and fuel burn (L/h). */
export interface Cruise {
  knots: number;
  fuelLph: number;
}

/** A passage worked out: how far (nautical miles), how long (s) and how much fuel (L). */
export interface PassagePlan {
  nm: number;
  seconds: number;
  litres: number;
}

const NM = 1852;

/** A passage's time for the menu: "25 min", "1 h 10 min". */
export function passageTime(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** The passage from where she is to a harbour, at her cruise. */
export function planPassage(v: VesselState, port: PortDef, cruise: Cruise): PassagePlan {
  const to = port.cargo.berth ?? port;
  const nm = (Math.hypot(to.x - v.position[0], to.z - v.position[2]) * CONFIG.passage.routeFactor) / NM;
  const hours = nm / Math.max(0.5, cruise.knots);
  return { nm, seconds: hours * 3600, litres: hours * cruise.fuelLph };
}

/** Why she can't make this passage now, or null. */
export function passageBlocker(world: WorldState, v: VesselState, port: PortDef, plan: PassagePlan | null, cruise: Cruise | null): string | null {
  const to = port.cargo.berth ?? port;
  if (cargoPortAt(v)?.id === port.id || Math.hypot(to.x - v.position[0], to.z - v.position[2]) < CONFIG.passage.hereM) return 'She’s here';
  if (lineOf(world, v.id)) return 'Cast off the tow first';
  if (cruise && cruise.knots < 1) return 'She can’t make way';
  if (plan && plan.litres > v.engine.fuelL) return `Not enough fuel (${Math.ceil(plan.litres)} L)`;
  return null;
}

/**
 * The passage intent (targetId: the boat; ref: the harbour's port id; args [seconds, litres],
 * worked out by the host's menu from her measured cruise): the clock and the time played go on,
 * the fuel's burnt. Returns true if she goes (then she's put at the harbour, as Go does).
 */
export function applyPassage(world: WorldState, intent: Intent, dt: number): boolean {
  const v = world.vessels[intent.targetId];
  const port = PORTS.find((p) => p.id === intent.ref);
  const [seconds = 0, litres = 0] = intent.args ?? [];
  if (!v || !port || !(seconds >= 0) || !(litres >= 0)) return false;
  if (passageBlocker(world, v, port, { nm: 0, seconds, litres }, null)) return false;
  v.engine.fuelL = Math.max(0, v.engine.fuelL - litres);
  // The time played is the tick count times the tick (simulation.ts): the count goes on.
  world.tick += Math.round(seconds / dt);
  world.time = world.tick * dt;
  const env = world.environment;
  env.timeOfDay = (((env.timeOfDay + seconds / 3600) % 24) + 24) % 24;
  return true;
}
