import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { createWeather } from '../src/environment/weather';
import { PORTS } from '../src/world/archipelago';

// Owner, Oct 2026: in Voyage the boats "spawn in and they're not docked. So they quickly
// drift off if it's windy." Sent to a harbour with Go, or spawned, she's made fast.
describe('Voyage: boats arrive made fast', () => {
  // A squall (17 m/s) blowing all the while.
  const gale = (world: ReturnType<typeof createWorld>['world']) => {
    world.environment.weather = createWeather('Squall');
  };

  for (const port of PORTS.slice(0, 4)) {
    it(`Go to ${port.name}: moored with her lines fast, or at anchor, and she stays there in a blow`, () => {
      const { world, vesselId } = createWorld(new IdFactory(), undefined, { voyage: true, weather: true });
      gale(world);
      const v = world.vessels[vesselId];
      stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'teleportToPort', value: 1, ref: port.id }], 1 / 60);
      expect(v.mooring.phase === 'moored' || v.anchor.phase === 'set').toBe(true);
      const at = [v.position[0], v.position[2]];
      for (let i = 0; i < 60 * 60; i++) stepWorld(world, [], 1 / 60);
      expect(Math.hypot(v.position[0] - at[0], v.position[2] - at[1])).toBeLessThan(port.cargo.berth ? 4 : 60);
    });
  }

  it('a boat spawned from the fleet comes in made fast at the harbour; in the career, beside you as before', () => {
    const voyage = createWorld(new IdFactory(), undefined, { voyage: true }).world;
    stepWorld(voyage, [{ playerId: 'p', targetId: 'environment', control: 'spawnBoat', value: 1, ref: 'lander' }], 1 / 60);
    const s = Object.values(voyage.vessels).find((x) => x.id.startsWith('boat-'))!;
    expect(s.mooring.phase === 'moored' || s.anchor.phase === 'set').toBe(true);
    const career = createWorld(new IdFactory()).world;
    stepWorld(career, [{ playerId: 'p', targetId: 'environment', control: 'spawnBoat', value: 1, ref: 'lander' }], 1 / 60);
    expect(Object.values(career.vessels).find((x) => x.id.startsWith('boat-'))!.mooring.phase).toBe('free');
  });
});
