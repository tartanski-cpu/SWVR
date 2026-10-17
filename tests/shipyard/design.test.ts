/** Shipyard designs: the choices round-trip through their 15-character code, typos are caught, older 10-, 11-, 13- and 14-character codes still read. */
import { describe, expect, it } from 'vitest';
import { cleanDesign } from '../../src/shipyard/variants';
import { COMBINATIONS, decodeDesign, DEFAULT_DESIGN, encodeDesign, encodeDesignV2, encodeDesignV3, encodeDesignV4, encodeDesignV5, encodeDesignV6, encodeDesignV7, FIELDS, type OldDesign, type ShipDesign } from '../../src/shipyard/design';

/** The starting design as versions 1-3 held it (a step-down floor, the house a box). */
const { floor: _f, visor: _v, roofThickness: _t, roofEdge: _e, roofPaint: _p, windowRake: _w, lowerFront: _l, searchlight: _s, fireMonitor: _m, ...rest } = DEFAULT_DESIGN;
const OLD: OldDesign = { ...rest, sunk: 1 };

describe('Shipyard design codes', () => {
  it('are 15 characters (in fives, with dashes), and read back to the same choices', () => {
    const code = encodeDesign(DEFAULT_DESIGN);
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    expect(decodeDesign(code)).toEqual({ design: DEFAULT_DESIGN });
  });

  it('every choice at every step survives the trip (and the maxima and minima together)', () => {
    for (const f of FIELDS)
      for (let v = 0; v < f.steps; v++) {
        const d: ShipDesign = { ...DEFAULT_DESIGN, [f.key]: v };
        // The front below the windows isn't offered now: any code reads it as upright.
        expect(decodeDesign(encodeDesign(d))).toEqual({ design: { ...d, lowerFront: 0, roofEdge: Math.max(1, d.roofEdge) } });
      }
    const max = Object.fromEntries(FIELDS.map((f) => [f.key, f.steps - 1])) as unknown as ShipDesign;
    const min = Object.fromEntries(FIELDS.map((f) => [f.key, 0])) as unknown as ShipDesign;
    for (const d of [max, min]) expect(decodeDesign(encodeDesign(d))).toEqual({ design: { ...d, lowerFront: 0, roofEdge: Math.max(1, d.roofEdge) } });
  });

  it('fits: every combination of the choices in 70 bits (14 characters)', () => {
    expect(COMBINATIONS).toBe(FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n));
    expect(COMBINATIONS < 1n << 70n).toBe(true);
  });

  it('reads version 7 codes (before the searchlight and monitor were placed) as the same boats: the searchlight on the roof with the advanced controls, no monitor', () => {
    for (const controls of [0, 1]) {
      const { searchlight: _s2, fireMonitor: _m2, ...v7 } = { ...DEFAULT_DESIGN, deckCrane: 2, controls };
      const code = encodeDesignV7(v7);
      expect(code).toHaveLength(16);
      expect(decodeDesign(code)).toEqual({ design: { ...v7, searchlight: controls, fireMonitor: 0 } });
    }
  });

  it('a design saved in the browser before the searchlight was a choice keeps it as it was (with the advanced controls only)', () => {
    const { searchlight: _s5, fireMonitor: _m5, ...saved } = DEFAULT_DESIGN;
    expect(cleanDesign({ ...saved, controls: 0 })).toEqual({ ...DEFAULT_DESIGN, controls: 0, searchlight: 0 });
    expect(cleanDesign({ ...saved, controls: 1 })).toEqual({ ...DEFAULT_DESIGN, controls: 1, searchlight: 1 });
    expect(cleanDesign({ ...DEFAULT_DESIGN, controls: 0, searchlight: 3, fireMonitor: 2 })).toEqual({ ...DEFAULT_DESIGN, controls: 0, searchlight: 3, fireMonitor: 2 });
  });

  it('reads version 6 codes (before the deck crane) as the same boats, without a crane', () => {
    const { deckCrane: _c, searchlight: _s3, fireMonitor: _m3, ...v6 } = { ...DEFAULT_DESIGN, roofPaint: 2, visor: 3 };
    const code = encodeDesignV6(v6);
    expect(code).toHaveLength(16);
    expect(decodeDesign(code)).toEqual({ design: { ...v6, deckCrane: 0, searchlight: 1, fireMonitor: 0 } });
    // And a crane makes a different code.
    expect(encodeDesign({ ...DEFAULT_DESIGN, deckCrane: 1 })).not.toBe(encodeDesign(DEFAULT_DESIGN));
  });

  it('reads version 5 codes (13 characters) as the same boats, the roof the hull\'s colour', () => {
    const { roofPaint: _p2, deckCrane: _c2, searchlight: _s4, fireMonitor: _m4, ...v5 } = { ...DEFAULT_DESIGN, roofThickness: 2, roofEdge: 3, visor: 4 };
    expect(decodeDesign(encodeDesignV5(v5))).toEqual({ design: { ...v5, roofPaint: 0, deckCrane: 0, searchlight: 1, fireMonitor: 0 } });
  });

  it('reads version 4 codes (the raked roof) as the same boats, the roof the thinnest slab, square at the front', () => {
    const { roofThickness: _t2, roofEdge: _e2, roofPaint: _p3, ...v4rest } = DEFAULT_DESIGN;
    for (const roofRake of [0, 2, 4]) {
      const code = encodeDesignV4({ ...v4rest, windowRake: 1, roofRake });
      expect(decodeDesign(code)).toEqual({ design: { ...DEFAULT_DESIGN, windowRake: 1, roofThickness: 0, roofEdge: 1 } });
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
    expect(decodeDesign('ABC')).toEqual({ error: 'a design code has 15 characters (this has 3)' });
    expect('error' in decodeDesign('UUUUU-UUUUU')).toBe(true);
  });
});
