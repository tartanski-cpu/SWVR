/**
 * The Shipyard's trials (owner, Oct 2026): a quick run of a design on the game's own physics,
 * to match her gearbox to her engine and propeller and to report what she does.
 *
 * Matching: a fixed-pitch propeller loads the engine by its speed squared, so the gearbox
 * ratio decides where flat out settles. Too low (prop turning fast) and she can't reach her
 * rated rpm, the engine labours; too high and it runs up to the governor's limit with power
 * left unused. Matched, flat out lands just under rated rpm (CONFIG.shipyard.matchRpm of it),
 * as the landing craft's does. Full-throttle rpm rises with the ratio, so it's a halving
 * search over the 16 gearbox steps: four or five short runs.
 */
import { gearOf, useDesign } from '../boats/sims';
import { CONFIG } from '../config';
import { IdFactory } from '../core/ids';
import type { Intent } from '../core/intents';
import { stepWorld } from '../core/simulation';
import { createWorld } from '../core/world';
import { placeVessel } from '../vessel/vesselControl';
import { FIELDS, type ShipDesign } from './design';

const DT = 1 / 60;

/** Flat out on calm open water: speed (kn) and rpm once she's settled (`seconds` of running). */
export function fullAhead(d: ShipDesign, seconds = CONFIG.shipyard.runSeconds): { knots: number; rpm: number; ratedRpm: number } {
  useDesign(d);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  world.environment.waves = [];
  world.geography = 'openSea';
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'trial', targetId: v.id, control, value } as Intent], DT);
  send('quickStart', 1);
  for (let i = 0; i < 5 / DT; i++) stepWorld(world, [], DT);
  send('lever', 1);
  for (let i = 0; i < seconds / DT; i++) stepWorld(world, [], DT);
  return { knots: Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144, rpm: v.engine.rpm, ratedRpm: gearOf(v, 'diesel')?.engine.ratedRpm ?? 1800 };
}

/** The gearbox step that matches her engine and propeller (see above), and her run at it. */
export function matchGear(d: ShipDesign): { gear: number; knots: number; rpm: number } {
  const steps = FIELDS.find((f) => f.key === 'gear')!.steps;
  let lo = 0;
  let hi = steps - 1;
  let best = { gear: lo, knots: 0, rpm: 0 };
  // The lowest ratio whose flat-out rpm reaches the target.
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = fullAhead({ ...d, gear: mid });
    if (r.rpm >= CONFIG.shipyard.matchRpm * r.ratedRpm) {
      best = { gear: mid, knots: r.knots, rpm: r.rpm };
      hi = mid - 1;
    } else lo = mid + 1;
  }
  if (best.rpm === 0) {
    const r = fullAhead({ ...d, gear: steps - 1 });
    best = { gear: steps - 1, knots: r.knots, rpm: r.rpm };
  }
  useDesign({ ...d, gear: best.gear });
  return best;
}
