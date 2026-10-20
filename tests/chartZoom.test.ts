/**
 * The chartplotter's zoom buttons (owner, Oct 2026): − AUTO + under its screen write the
 * boat's `chartZoom` (0 AUTO, k the k-th of CONFIG.chartPlotter.ranges).
 */
import { describe, expect, it } from 'vitest';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { CONFIG } from '../src/config';

describe('the chartplotter zoom', () => {
  it('a press sets the range for the boat; AUTO is 0; past the list, the widest', () => {
    const { world, vesselId } = createWorld(new IdFactory(), 'smallTug');
    const v = world.vessels[vesselId];
    const send = (value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'chartZoom', value } as Intent], 1 / 60);
    expect(v.controls.chartZoom ?? 0).toBe(0);
    send(3);
    expect(v.controls.chartZoom).toBe(3);
    send(CONFIG.chartPlotter.ranges.length + 4);
    expect(v.controls.chartZoom).toBe(CONFIG.chartPlotter.ranges.length);
    send(0);
    expect(v.controls.chartZoom).toBe(0);
  });
});
