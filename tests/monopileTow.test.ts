/**
 * The floated monopile (CONFIG.vessels.monopile; career/projects.ts's tug tow): it floats level
 * at its design waterline, stays upright, and the small tug can tow it at a sensible speed.
 */
import { describe, expect, it } from 'vitest';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { isTugClass, vesselKey } from '../src/tow/tow';
import { uprightHydrostatics } from '../src/vessel/hydrostatics';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { createVesselState } from '../src/vessel/vesselState';

const DT = 1 / 60;

describe('the floated monopile', { timeout: 90000 }, () => {
  it('floats level at its design waterline, about 190 t', () => {
    const h = uprightHydrostatics(VESSEL_DEFS.monopile);
    expect(Math.abs(h.sinkage)).toBeLessThan(0.05);
    expect(Math.abs(h.lcgMinusLcb)).toBeLessThan(0.1);
    expect(h.displacementT).toBeGreaterThan(170);
    expect(h.displacementT).toBeLessThan(210);
    expect(h.gmt).toBeGreaterThan(0); // stable in roll
  });

  it('the small tug tows it at a few knots, and it stays upright', () => {
    const { world, vesselId } = createWorld(new IdFactory(), 'smallTug');
    world.environment.waves = [];
    world.geography = 'openSea';
    const tug = world.vessels[vesselId];
    expect(isTugClass(world, tug)).toBe(true);
    placeVessel(tug, 0, 0, 0, 0);
    // The pile lying astern of her, its bow eye a few metres off her stern.
    const pile = createVesselState('pile', 'monopile');
    placeVessel(pile, 0, 0, 34, 0);
    world.vessels.pile = pile;
    const send = (control: string, value = 1, ref?: string) => stepWorld(world, [{ playerId: 'p', targetId: tug.id, control, value, ref } as Intent], DT);
    send('towMake', 1, vesselKey('pile'));
    expect(world.tow!.lines[tug.id]?.target).toBe(vesselKey('pile'));
    send('quickStart');
    send('lever', 0.7);
    let maxRoll = 0;
    for (let i = 0; i < 90 / DT; i++) {
      stepWorld(world, [], DT);
      const [qx, qy, qz, qw] = pile.orientation;
      // Roll: the angle of her up axis from the vertical.
      const upY = 1 - 2 * (qx * qx + qz * qz);
      maxRoll = Math.max(maxRoll, (Math.acos(Math.min(1, upY)) * 180) / Math.PI);
      void qy;
      void qw;
    }
    const kn = Math.hypot(pile.linearVelocity[0], pile.linearVelocity[2]) / 0.514444;
    expect(world.tow!.lines[tug.id]).toBeTruthy(); // the line held
    expect(kn).toBeGreaterThan(1.5);
    expect(kn).toBeLessThan(8);
    expect(maxRoll).toBeLessThan(15);
    expect(pile.position.every(Number.isFinite)).toBe(true);
  });
});
