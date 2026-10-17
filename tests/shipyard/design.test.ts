/** Shipyard designs: the choices round-trip through their 15-character code, typos are caught, older 10-, 11-, 13- and 14-character codes still read. */
import { describe, expect, it } from 'vitest';
import { cleanDesign } from '../../src/shipyard/variants';
import { COMBINATIONS, decodeDesign, DEFAULT_DESIGN, encodeDesign, encodeDesignV2, encodeDesignV3, encodeDesignV4, encodeDesignV5, encodeDesignV6, encodeDesignV7, encodeDesignV8, encodeDesignV9, FIELDS, PLACE_GRID, placeOf, placeValue, type OldDesign, type ShipDesign } from '../../src/shipyard/design';

/** The starting design as versions 1-3 held it (a step-down floor, the house a box). */
const { floor: _f, visor: _v, roofThickness: _t, roofEdge: _e, roofPaint: _p, windowRake: _w, lowerFront: _l, searchlight: _s, fireMonitor: _m, ...rest } = DEFAULT_DESIGN;
const OLD: OldDesign = { ...rest, sunk: 1 };

describe('Shipyard design codes', () => {
  it('are 17 characters (in fives, with dashes), and read back to the same choices', () => {
    const code = encodeDesign(DEFAULT_DESIGN);
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{2}$/);
    expect(decodeDesign(code)).toEqual({ design: DEFAULT_DESIGN });
  });

  it('every choice at every step survives the trip (and the maxima and minima together)', () => {
    for (const f of FIELDS)
      for (let v = 0; v < f.steps; v++) {
        const d: ShipDesign = { ...DEFAULT_DESIGN, [f.key]: v };
        // The front below the windows isn't offered now: any code reads it as upright.
        expect(decodeDesign(encodeDesign(d))).toEqual({ design: { ...d, lowerFront: 0, roofEdge: Math.max(1, d.roofEdge) } });
      }
    const max = { ...DEFAULT_DESIGN, ...Object.fromEntries(FIELDS.map((f) => [f.key, f.steps - 1])) } as ShipDesign;
    const min = { ...DEFAULT_DESIGN, ...Object.fromEntries(FIELDS.map((f) => [f.key, 0])) } as ShipDesign;
    for (const d of [max, min]) expect(decodeDesign(encodeDesign(d))).toEqual({ design: { ...d, lowerFront: 0, roofEdge: Math.max(1, d.roofEdge) } });
  });

  it('fits: every combination of the choices in 80 bits (16 characters)', () => {
    expect(COMBINATIONS).toBe(FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n));
    expect(COMBINATIONS < 1n << 80n).toBe(true);
  });

  it('gear placed by hand: no longer than 17 characters without, a few more with, and back to the same places', () => {
    expect(encodeDesign(DEFAULT_DESIGN).replace(/-/g, '')).toHaveLength(17);
    const one = { ...DEFAULT_DESIGN, searchlight: 2, lampAt: placeValue('lampAt', -0.5, 9.25) };
    const c1 = encodeDesign(one);
    expect(c1.replace(/-/g, '').length).toBeGreaterThan(17);
    expect(c1.replace(/-/g, '').length).toBeLessThanOrEqual(21);
    expect(decodeDesign(c1)).toEqual({ design: one });
    expect(placeOf('lampAt', one.lampAt)).toEqual({ x: -0.5, fromTransom: 9.25, face: 0 });
    // All four placed, at the grid's corners, facings too.
    const g = PLACE_GRID;
    const all = {
      ...DEFAULT_DESIGN,
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

  it('reads version 9 codes (before the working deck gear) as the same boats, without it', () => {
    const { towWinch: _a, sternRoller: _b, aFrame: _c, lifeRing: _d, sideDoor: _e2, ...v9 } = { ...DEFAULT_DESIGN, chartTable: 1, deckCrane: 2 };
    const code = encodeDesignV9(v9);
    expect(code.replace(/-/g, '')).toHaveLength(15);
    expect(decodeDesign(code)).toEqual({ design: { ...v9, towWinch: 0, sternRoller: 0, aFrame: 0, lifeRing: 0, sideDoor: 0 } });
    const gear = { ...DEFAULT_DESIGN, towWinch: 1, sternRoller: 1, aFrame: 1, lifeRing: 2, sideDoor: 1 };
    expect(decodeDesign(encodeDesign(gear))).toEqual({ design: gear });
  });

  it('reads version 8 codes (before the chart table) as the same boats, without one', () => {
    const { chartTable: _t8, ...v8 } = { ...DEFAULT_DESIGN, searchlight: 3, fireMonitor: 2 };
    const code = encodeDesignV8(v8);
    expect(code.replace(/-/g, '')).toHaveLength(15);
    expect(decodeDesign(code)).toEqual({ design: { ...v8, chartTable: 0 } });
    expect(encodeDesign({ ...DEFAULT_DESIGN, chartTable: 1 })).not.toBe(encodeDesign(DEFAULT_DESIGN));
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
    expect(decodeDesign('ABC')).toEqual({ error: 'a design code has 17 characters (this has 3)' });
    expect('error' in decodeDesign('UUUUU-UUUUU')).toBe(true);
  });
});
