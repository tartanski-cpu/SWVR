/** Shipyard designs: the choices round-trip through their 11-character code, typos are caught, older 10-character codes still read. */
import { describe, expect, it } from 'vitest';
import { COMBINATIONS, decodeDesign, DEFAULT_DESIGN, encodeDesign, encodeDesignV2, FIELDS, type ShipDesign } from '../../src/shipyard/design';

describe('Shipyard design codes', () => {
  it('are 11 characters (five, a dash, six), and read back to the same choices', () => {
    const code = encodeDesign(DEFAULT_DESIGN);
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{6}$/);
    expect(decodeDesign(code)).toEqual({ design: DEFAULT_DESIGN });
  });

  it('every choice at every step survives the trip (and the maxima and minima together)', () => {
    for (const f of FIELDS)
      for (let v = 0; v < f.steps; v++) {
        const d: ShipDesign = { ...DEFAULT_DESIGN, [f.key]: v };
        expect(decodeDesign(encodeDesign(d))).toEqual({ design: d });
      }
    const max = Object.fromEntries(FIELDS.map((f) => [f.key, f.steps - 1])) as unknown as ShipDesign;
    const min = Object.fromEntries(FIELDS.map((f) => [f.key, 0])) as unknown as ShipDesign;
    for (const d of [max, min]) expect(decodeDesign(encodeDesign(d))).toEqual({ design: d });
  });

  it('fits: every combination of the choices in 50 bits (10 characters), with plenty of room left', () => {
    expect(COMBINATIONS).toBe(FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n));
    expect(COMBINATIONS * 16n < 1n << 50n).toBe(true);
  });

  it('reads version 2 (10-character) codes as the same single-engine boats', () => {
    for (const hull of [0, 1, 2, 3]) {
      const d: ShipDesign = { ...DEFAULT_DESIGN, hull, twin: 0 };
      const old = encodeDesignV2(d);
      expect(old).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
      expect(decodeDesign(old)).toEqual({ design: d });
    }
  });

  it('reads the first Shipyard\'s (version 1) codes as the same boats, with their bow as designed', () => {
    // Two codes the version 1 page gave: its starting design, and a 12 m workboat-hull design.
    const a = decodeDesign('4H228-BQ98A');
    expect(a).toEqual({ design: { ...DEFAULT_DESIGN, bow: 2 } });
    const b = decodeDesign('6H22N-3QNJ7');
    expect('design' in b && b.design).toMatchObject({ hull: 2, engine: 2, housePos: 10, houseLength: 8, paint: 2, controls: 0, bow: 2 });
  });

  it('is forgiving as typed: any case, no dash, I/L for 1 and O for 0', () => {
    const code = encodeDesign(DEFAULT_DESIGN);
    const typed = code.toLowerCase().replace('-', ' ').replace(/1/g, 'l').replace(/0/g, 'o');
    expect(decodeDesign(typed)).toEqual({ design: DEFAULT_DESIGN });
  });

  it('catches any one mistyped character, and says why it can\'t read a bad code', () => {
    const code = encodeDesign(DEFAULT_DESIGN).replace('-', '');
    const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let i = 0; i < code.length; i++)
      for (const ch of ALPHA) {
        if (ch === code[i]) continue;
        const bad = code.slice(0, i) + ch + code.slice(i + 1);
        expect('error' in decodeDesign(bad), bad).toBe(true);
      }
    expect(decodeDesign('ABC')).toEqual({ error: 'a design code has 11 characters (this has 3)' });
    expect('error' in decodeDesign('UUUUU-UUUUU')).toBe(true);
  });
});
