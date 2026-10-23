/**
 * Multi-boat M2 (docs/MULTI_BOAT.md): a second boat in the world, and the player boarding and
 * driving her. The `spawnBoat` environment intent (Debug > Boat > Second boat) puts a fleet
 * boat afloat beside the home boat; a `board` intent puts the player aboard her; intents to
 * her id drive her and leave the home boat be. (The app's side, the dash and sounds following
 * the boat you're aboard, is App.becomeAboard: not testable here.)
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { ENVIRONMENT_ID, IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld, homeVessel } from '../src/core/world';
import { groundHeight } from '../src/world/terrain';

const DT = 1 / 60;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'pilotBoat', { harbour: true, weather: true });
  world.environment.waves = [];
  const send = (targetId: string, control: string, value: number, ref?: string) => stepWorld(world, [{ playerId: localPlayerId, targetId, control, value, ref } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      world.environment.waves = [];
    }
  };
  send(ENVIRONMENT_ID, 'weatherFixed', 1);
  return { world, vesselId, localPlayerId, send, run };
}

describe('a second boat (multi-boat M2)', { timeout: 30000 }, () => {
  it('spawnBoat puts a fleet boat afloat beside the home boat, on her water side, lying the same way', () => {
    const { world, vesselId, send, run } = setup();
    send(ENVIRONMENT_ID, 'spawnBoat', 1, 'smallTug');
    const second = Object.values(world.vessels).find((v) => v.defId === 'smallTug')!;
    expect(second).toBeTruthy();
    expect(second.id).toMatch(/^boat-1-/);
    const home = world.vessels[vesselId];
    const d = Math.hypot(second.position[0] - home.position[0], second.position[2] - home.position[2]);
    expect(d).toBeGreaterThan(CONFIG.spawn.abeam);
    expect(d).toBeLessThan(25);
    expect(groundHeight(second.position[0], second.position[2])).toBeLessThan(-2);
    expect(second.mooring.phase).toBe('free');
    // Afloat and settled a few seconds on.
    run(4);
    expect(Math.abs(second.position[1])).toBeLessThan(2);
    expect(Math.hypot(second.linearVelocity[0], second.linearVelocity[2])).toBeLessThan(0.5);
    // The home boat is still the home boat (the game's systems); a tow or a hull with no wheelhouse is refused.
    expect(homeVessel(world)!.id).toBe(vesselId);
    send(ENVIRONMENT_ID, 'spawnBoat', 1, 'coaster');
    send(ENVIRONMENT_ID, 'spawnBoat', 1, 'skiff');
    expect(Object.values(world.vessels).filter((v) => v.id.startsWith('boat-'))).toHaveLength(1);
  });

  it('the player boards her and drives her; the home boat stays put', () => {
    const { world, vesselId, localPlayerId, send, run } = setup();
    send(ENVIRONMENT_ID, 'spawnBoat', 1, 'lander');
    const second = Object.values(world.vessels).find((v) => v.defId === 'lander')!;
    send(localPlayerId, 'board', 1, second.id);
    expect(world.players[localPlayerId].aboardVesselId).toBe(second.id);
    const x0 = second.position[0];
    const z0 = second.position[2];
    send(second.id, 'quickStart', 1);
    run(3);
    send(second.id, 'lever', 1);
    run(12);
    expect(Math.hypot(second.position[0] - x0, second.position[2] - z0)).toBeGreaterThan(30);
    const home = world.vessels[vesselId];
    expect(home.mooring.phase).toBe('moored');
    expect(home.engine.phase).toBe('off');
  });
});
