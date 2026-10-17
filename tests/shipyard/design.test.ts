/** Shipyard designs: the choices round-trip through their 13-character code, typos are caught, older 10- and 11-character codes still read. */
import { describe, expect, it } from 'vitest';
import { COMBINATIONS, decodeDesign, DEFAULT_DESIGN, encodeDesign, encodeDesignV2, encodeDesignV3, encodeDesignV4, FIELDS, type OldDesign, type ShipDesign } from '../../src/shipyard/design';

/** The starting design as versions 1-3 held it (a step-down floor, the house a box). */
const { floor: _f, visor: _v, roofThickness: _t, roofEdge: _e, windowRake: _w, lowerFront: _l, ...rest } = DEFAULT_DESIGN;
const OLD: OldDesign = { ...rest, sunk: 1 };

describe('Shipyard design codes', () => {
  it('are 13 characters (in fives, with dashes), and read back to the same choices', () => {
    const code = encodeDesign(DEFAULT_DESIGN);
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{3}$/);
    expect(decodeDesign(code)).toEqual({ design: DEFAULT_DESIGN });
  });

  it('every choice at every step survives the trip (and the maxima and minima together)', () => {
    for (const f of FIELDS)
      for (let v = 0; v < f.steps; v++) {
        const d: ShipDesign = { ...DEFAULT_DESIGN, [f.key]: v };
        // The front below the windows isn't offered now: any code reads it as upright.
        expect(decodeDesign(encodeDesign(d))).toEqual({ design: { ...d, lowerFront: 0 } });
      }
    const max = Object.fromEntries(FIELDS.map((f) => [f.key, f.steps - 1])) as unknown as ShipDesign;
    const min = Object.fromEntries(FIELDS.map((f) => [f.key, 0])) as unknown as ShipDesign;
    for (const d of [max, min]) expect(decodeDesign(encodeDesign(d))).toEqual({ design: { ...d, lowerFront: 0 } });
  });

  it('fits: every combination of the choices in the top half of 60 bits (12 characters), above version 4\'s', () => {
    expect(COMBINATIONS).toBe(FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n));
    expect(COMBINATIONS < 1n << 59n).toBe(true);
  });

  it('reads version 4 codes (the raked roof) as the same boats, the roof the thinnest slab, square at the front', () => {
    const { roofThickness: _t2, roofEdge: _e2, ...v4rest } = DEFAULT_DESIGN;
    for (const roofRake of [0, 2, 4]) {
      const code = encodeDesignV4({ ...v4rest, windowRake: 1, roofRake });
      expect(decodeDesign(code)).toEqual({ design: { ...DEFAULT_DESIGN, windowRake: 1, roofThickness: 0, roofEdge: 0 } });
    }
  });

  it('reads version 2 (10-character) and version 3 (11-character) codes as the same boats, the house a box', () => {
    for (const hull of [0, 1, 2, 3])
      for (const sunk of [0, 1]) {
        const old: OldDesign = { ...OLD, hull, sunk };
        const want: ShipDesign = { ...DEFAULT_DESIGN, hull, floor: sunk ? 2 : 3 };
        const v2 = encodeDesignV2(old);
        expect(v2).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
        expect(decodeDesign(v2)).toEqual({ design: want });
        const v3 = encodeDesignV3({ ...old, twin: 1 });
        expect(v3).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]$/);
        expect(decodeDesign(v3)).toEqual({ design: { ...want, twin: 1 } });
      }
  });

  it('reads the first Shipyard\'s (version 1) codes as the same boats, with their bow as designed', () => {
    // Two codes the version 1 page gave: its starting design, and a 12 m workboat-hull design.
    const a = decodeDesign('4H228-BQ98A');
    expect(a).toEqual({ design: { ...DEFAULT_DESIGN, bow: 2 } });
    const b = decodeDesign('6H22N-3QNJ7');
    expect('design' in b && b.design).toMatchObject({ hull: 2, engine: 2, housePos: 10, houseLength: 8, paint: 2, controls: 0, bow: 2, windowRake: 4 });
  });

  it('is forgiving as typed: any case, no dash, I/L for 1 and O for 0', () => {
    const code = encodeDesign(DEFAULT_DESIGN);
    const typed = code.toLowerCase().replace('-', ' ').replace('-', '').replace(/1/g, 'l').replace(/0/g, 'o');
    expect(decodeDesign(typed)).toEqual({ design: DEFAULT_DESIGN });
  });

  it('catches any one mistyped character, and says why it can\'t read a bad code', () => {
    const code = encodeDesign(DEFAULT_DESIGN).replace(/-/g, '');
    const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let i = 0; i < code.length; i++)
      for (const ch of ALPHA) {
        if (ch === code[i]) continue;
        const bad = code.slice(0, i) + ch + code.slice(i + 1);
        expect('error' in decodeDesign(bad), bad).toBe(true);
      }
    expect(decodeDesign('ABC')).toEqual({ error: 'a design code has 13 characters (this has 3)' });
    expect('error' in decodeDesign('UUUUU-UUUUU')).toBe(true);
  });
});
