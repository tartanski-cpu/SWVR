/**
 * The other players' boats heard where they are (audio/boatVoices.ts): the Doppler shift of a
 * boat going by ("zoom"), and which boats are heard.
 */
import { describe, expect, it } from 'vitest';
import { audibleBoats, dopplerFactor } from '../src/audio/boatVoices';
import { CONFIG } from '../src/config';

const still = { x: 0, y: 0, z: 0, vx: 0, vz: 0 };

describe('other boats heard', () => {
  it('a boat coming at you sounds higher, going away lower, crossing at right angles unchanged; your own speed counts too', () => {
    // 100 m north of you (z -100), coming south at 20 m/s (toward you), then going away.
    const coming = dopplerFactor({ x: 0, z: -100, vx: 0, vz: 20 }, still);
    const going = dopplerFactor({ x: 0, z: -100, vx: 0, vz: -20 }, still);
    expect(coming).toBeCloseTo(343 / 323, 4);
    expect(going).toBeCloseTo(343 / 363, 4);
    expect(dopplerFactor({ x: 0, z: -100, vx: 20, vz: 0 }, still)).toBeCloseTo(1, 6);
    // You running at her at 10 m/s: higher, as (c + 10) / c.
    expect(dopplerFactor({ x: 0, z: -100, vx: 0, vz: 0 }, { ...still, vz: -10 })).toBeCloseTo(353 / 343, 4);
    // Never past the limit, however fast.
    expect(dopplerFactor({ x: 0, z: -100, vx: 0, vz: 300 }, still)).toBeCloseTo(1 + CONFIG.boatSounds.dopplerMax, 6);
    expect(dopplerFactor({ x: 0, z: 0, vx: 5, vz: 5 }, still)).toBe(1);
  });

  it('heard: those within range, the nearest few', () => {
    const at = (id: string, d: number) => ({ id, x: d, z: 0 });
    const boats = [at('far', CONFIG.boatSounds.range + 50), at('c', 300), at('a', 20), at('b', 120), at('d', 500)];
    const heard = audibleBoats(boats, { x: 0, z: 0 }).map((b) => b.id);
    expect(heard).toEqual(['a', 'b', 'c', 'd'].slice(0, CONFIG.boatSounds.maxBoats));
    expect(heard).not.toContain('far');
  });
});
