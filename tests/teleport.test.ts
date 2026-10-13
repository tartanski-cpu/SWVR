import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { skiffPortAt } from '../src/cargo/cargo';
import { berthInRange } from '../src/vessel/physics/mooring';
import { PORTS } from '../src/world/archipelago';

describe('teleport to port (menu)', () => {
  for (const port of PORTS) {
    it(`puts the boat at ${port.name}, settled and ready to dock or anchor`, () => {
      const { world, vesselId } = createWorld(new IdFactory());
      world.environment.waves = [];
      const v = world.vessels[vesselId];
      v.controls.lever = 0.8;
      stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'teleportToPort', value: 1, ref: port.id }], 1 / 60);
      expect(v.controls.lever).toBe(0);
      for (let i = 0; i < 5 * 60; i++) stepWorld(world, [], 1 / 60);
      expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2])).toBeLessThan(0.3);
      expect(v.contact.force).toBeLessThan(5000); // not jammed into the quay
      if (port.cargo.berth) {
        expect(berthInRange(v)).not.toBeNull();
      } else {
        stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'anchor', value: 1 }], 1 / 60);
        for (let i = 0; i < 30 * 60; i++) stepWorld(world, [], 1 / 60);
        expect(skiffPortAt(v)?.id).toBe(port.id);
      }
    });
  }
});
