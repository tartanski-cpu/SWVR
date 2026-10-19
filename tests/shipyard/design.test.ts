/** Shipyard designs: the choices round-trip through their 17-character (or longer) code, typos are caught; codes from before version 10 are retired. */
import { describe, expect, it } from 'vitest';
import { COMBINATIONS, decodeDesign, DEFAULT_DESIGN, encodeDesign, FIELDS, PLACE_GRID, placeOf, placeValue, type ShipDesign, fromSteps } from '../../src/shipyard/design';

// The page's starting design without hull protection.
const BASE: ShipDesign = { ...DEFAULT_DESIGN, guard: 0 };

describe('Shipyard design codes', () => {
  it('are 17 characters (in fives, with dashes), and read back to the same choices', () => {
    const code = encodeDesign(BASE);
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{2}$/);
    expect(decodeDesign(code)).toEqual({ design: BASE });
  });

  it('every choice at every step survives the trip (and the maxima and minima together)', () => {
    for (const f of FIELDS)
      for (let v = 0; v < f.steps; v++) {
        // (In the code's steps; the wheelhouse's measurements as values: fromSteps.)
        const d: ShipDesign = { ...BASE, ...fromSteps({ [f.key]: v }) };
        // The front below the windows isn't offered now: any code reads it as upright.
        expect(decodeDesign(encodeDesign(d))).toEqual({ design: { ...d, lowerFront: 0 } });
      }
    const max = { ...BASE, ...fromSteps(Object.fromEntries(FIELDS.map((f) => [f.key, f.steps - 1]))) } as ShipDesign;
    const min = { ...BASE, ...fromSteps(Object.fromEntries(FIELDS.map((f) => [f.key, 0]))) } as ShipDesign;
    for (const d of [max, min]) expect(decodeDesign(encodeDesign(d))).toEqual({ design: { ...d, lowerFront: 0 } });
  });

  it('fits: every combination of the choices in 80 bits (16 characters)', () => {
    expect(COMBINATIONS).toBe(FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n));
    expect(COMBINATIONS < 1n << 80n).toBe(true);
  });

  it('gear placed by hand: no longer than 17 characters without, a few more with, and back to the same places', () => {
    expect(encodeDesign(BASE).replace(/-/g, '')).toHaveLength(17);
    const one = { ...BASE, searchlight: 2, lampAt: placeValue('lampAt', -0.5, 9.25) };
    const c1 = encodeDesign(one);
    expect(c1.replace(/-/g, '').length).toBeGreaterThan(17);
    expect(c1.replace(/-/g, '').length).toBeLessThanOrEqual(21);
    expect(decodeDesign(c1)).toEqual({ design: one });
    expect(placeOf('lampAt', one.lampAt)).toEqual({ x: -0.5, fromTransom: 9.25, face: 0 });
    // All four placed, at the grid's corners, facings too.
    const g = PLACE_GRID;
    const all = {
      ...BASE,
      deckCrane: 1, searchlight: 3, fireMonitor: 1, towWinch: 1,
      craneAt: placeValue('craneAt', g.halfX * g.step, (g.nz - 1) * g.step, 3),
      lampAt: placeValue('lampAt', -g.halfX * g.step, 0),
      monitorAt: placeValue('monitorAt', 0.25, 4),
      winchAt: placeValue('winchAt', 0, 0.75, 2),
    };
    const c4 = encodeDesign(all);
    expect(decodeDesign(c4)).toEqual({ design: all });
    expect(c4.replace(/-/g, '').length).toBeLessThanOrEqual(30);
    expect(placeOf('craneAt', all.craneAt)).toEqual({ x: 3, fromTransom: 17.75, face: 3 });
    // Snapped to the 25 cm grid, and kept on it.
    expect(placeOf('winchAt', placeValue('winchAt', 0.13, 1.37, 1))).toEqual({ x: 0.25, fromTransom: 1.25, face: 1 });
    expect(placeOf('lampAt', placeValue('lampAt', 9, -2))!.x).toBe(3);
    // A mistyped character in the extension is caught too.
    const bare = c4.replace(/-/g, '');
    const bad = bare.slice(0, 18) + (bare[18] === 'A' ? 'B' : 'A') + bare.slice(19);
    expect('error' in decodeDesign(bad)).toBe(true);
  });

  it('codes from before version 10 (shorter than 17 characters) are retired: they say so', () => {
    expect(decodeDesign('0123456789ABCD')).toEqual({ error: 'a design code has 17 characters (this has 14): codes from older Shipyards no longer open' });
  });

  it('is forgiving as typed: any case, no dash, I/L for 1 and O for 0', () => {
    const code = encodeDesign(BASE);
    const typed = code.toLowerCase().replace('-', ' ').replace('-', '').replace(/1/g, 'l').replace(/0/g, 'o');
    expect(decodeDesign(typed)).toEqual({ design: BASE });
  });

  it('catches any one mistyped character, and says why it can\'t read a bad code', () => {
    const code = encodeDesign(BASE).replace(/-/g, '');
    const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let i = 0; i < code.length; i++)
      for (const ch of ALPHA) {
        if (ch === code[i]) continue;
        const bad = code.slice(0, i) + ch + code.slice(i + 1);
        expect('error' in decodeDesign(bad), bad).toBe(true);
      }
    expect(decodeDesign('ABC')).toEqual({ error: 'a design code has 17 characters (this has 3)' });
    expect('error' in decodeDesign('UUUUU-UUUUU')).toBe(true);
  });
});
