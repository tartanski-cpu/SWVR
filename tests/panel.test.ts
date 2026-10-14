import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { applyVesselIntent } from '../src/vessel/vesselControl';

function boat() {
  const { world, vesselId } = createWorld(new IdFactory());
  const v = world.vessels[vesselId];
  const send = (control: string, value: number) => applyVesselIntent(v, { playerId: 'p', targetId: v.id, control, value });
  return { v, send };
}

describe('overhead panel: deck lights and FM radio', () => {
  it('switches the deck lights', () => {
    const { v, send } = boat();
    send('deckFore', 1);
    send('railLights', 1);
    expect(v.controls).toMatchObject({ deckFore: 1, deckAft: 0, railLights: 1 });
    send('deckFore', 0);
    expect(v.controls.deckFore).toBe(0);
  });

  it('TUNE switches the set on, then steps through the stations and wraps', () => {
    const { v, send } = boat();
    const n = CONFIG.fmRadio.stations.length;
    send('fmTune', 1);
    expect(v.controls.fmOn).toBe(1);
    expect(v.controls.fmStation).toBe(0);
    for (let i = 0; i < n; i++) send('fmTune', 1);
    expect(v.controls.fmStation).toBe(0);
    send('fmStation', 2);
    expect(v.controls.fmStation).toBe(2);
    send('fmStation', 99);
    expect(v.controls.fmStation).toBe(2);
    send('fmOn', 0);
    expect(v.controls.fmOn).toBe(0);
  });
});
