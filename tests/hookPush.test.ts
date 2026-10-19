/**
 * Pushing off with the boat hook (owner, Oct 2026): each press with the tip on a quay gives
 * the boat a shove along the hook, by its impulse over her mass; a heavy boat hardly moves.
 */
import { describe, expect, it } from 'vitest';
import { gearOf } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const DT = 1 / 60;

function setup(defId = 'workboat') {
  const { world, vesselId } = createWorld(new IdFactory(), defId);
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -600, 0);
  const send = (control: string, args?: number[], player = 'player-1') => stepWorld(world, [{ playerId: player, targetId: v.id, control, value: 1, args } as Intent], DT);
  return { world, v, send };
}

describe('pushing off with the boat hook', () => {
  it('a push moves her by impulse over mass along the hook, and yaws her when the hand is off her centre; nothing without the hook in hand', () => {
    const { v, send } = setup();
    const J = CONFIG.rescue.hookPush.impulse;
    // Hand at her port quarter, pushing to starboard (+x).
    send('hookPush', [1, 0, v.position[0] - 2, 1, v.position[2] + 3]);
    expect(v.linearVelocity[0]).toBeCloseTo(0, 3); // not holding the hook yet
    send('hookTake');
    const vx0 = v.linearVelocity[0];
    send('hookPush', [1, 0, v.position[0] - 2, 1, v.position[2] + 3]);
    // One tick of water drag on it is tiny: within a few percent of J / m.
    expect(v.linearVelocity[0] - vx0).toBeGreaterThan((0.9 * J) / VESSEL_DEFS.workboat.mass);
    expect(v.linearVelocity[0] - vx0).toBeLessThan((1.05 * J) / VESSEL_DEFS.workboat.mass);
    expect(Math.abs(v.angularVelocity[1])).toBeGreaterThan(0);
    // Straight at her CG: no yaw to speak of.
    const { v: w, send: s2 } = setup();
    s2('hookTake');
    s2('hookPush', [1, 0, w.position[0], 1, w.position[2] + VESSEL_DEFS.workboat.cg[2]]);
    expect(Math.abs(w.angularVelocity[1])).toBeLessThan(1e-3);
  });

  it('the same push on a heavy boat is a crawl: the impulse is the same, so speed goes as one over her mass', () => {
    const boats = ['workboat', 'landingCraft', 'alaskan38'].filter((id) => gearOf({ defId: id }, 'boatHook'));
    expect(boats.length).toBeGreaterThan(0);
    const got = boats.map((id) => {
      const s = setup(id);
      s.send('hookTake');
      const z0 = s.v.linearVelocity[2];
      s.send('hookPush', [0, -1, s.v.position[0], 0.5, s.v.position[2] + VESSEL_DEFS[id].cg[2]]);
      return (s.v.linearVelocity[2] - z0) * VESSEL_DEFS[id].mass;
    });
    for (const j of got) expect(j).toBeCloseTo(-CONFIG.rescue.hookPush.impulse, -1);
  });
});
