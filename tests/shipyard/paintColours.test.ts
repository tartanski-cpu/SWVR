/**
 * More paint colours (owner, Oct 2026: "a few more options for paint colors"): the Shipyard
 * offers every one; those after the short code's first ones travel as a link or file, and
 * every old code reads as before.
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_HULLS, HOUSE_PAINTS, LIVERIES, liveryOf, ROOF_PAINTS, ROOF_TOPS } from '../../src/shipyard/parts/catalog';
import { ALL_FIELDS, decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';

const plain: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[1].defaults, hull: 1 };
const steps = (k: keyof ShipDesign) => ALL_FIELDS.find((f) => f.key === k)!.steps;

describe('paint colours', () => {
  it('the Shipyard offers every one', () => {
    expect(steps('paint')).toBe(LIVERIES.length);
    expect(steps('roofPaint')).toBe(ROOF_PAINTS.length);
    expect(steps('roofTop')).toBe(ROOF_TOPS.length);
    expect(steps('houseColour')).toBe(HOUSE_PAINTS.length);
    expect(LIVERIES.length).toBeGreaterThan(8);
    // Each a colour of its own, under its own name.
    for (const list of [LIVERIES.map((l) => l.livery.topsides ?? 0xd9622b), ROOF_PAINTS.map((p) => p.colour), ROOF_TOPS.map((p) => p.colour), HOUSE_PAINTS.map((p) => p.colour)]) expect(new Set(list).size).toBe(list.length);
    for (const list of [LIVERIES, ROOF_PAINTS, ROOF_TOPS, HOUSE_PAINTS]) expect(new Set(list.map((p) => p.name)).size).toBe(list.length);
  });

  it('the first ones are in the short code as before', () => {
    for (const change of [{ paint: 7 }, { roofPaint: 4 }, { roofTop: 4 }, { houseColour: 9 }]) {
      const back = decodeDesign(encodeDesign({ ...plain, ...change }));
      expect('design' in back && back.design).toMatchObject(change);
    }
  });

  it('a newer colour travels as a link or file, and comes back', () => {
    for (const change of [{ paint: LIVERIES.length - 1 }, { roofPaint: ROOF_PAINTS.length - 1 }, { roofTop: ROOF_TOPS.length - 1 }, { houseColour: HOUSE_PAINTS.length - 1 }]) {
      const d = { ...plain, ...change };
      expect(shortCode(d)).toBeNull();
      const back = readDesign(designToken(d));
      expect('design' in back && back.design).toMatchObject(change);
    }
  });

  it('a newer colour paints her', () => {
    const teal = LIVERIES.findIndex((l) => l.name === 'Teal');
    expect(liveryOf({ ...plain, paint: teal }).topsides).toBe(0x1f6f6a);
    const cream = ROOF_PAINTS.findIndex((p) => p.name === 'Cream');
    expect(liveryOf({ ...plain, roofPaint: cream }).roof).toBe(0xe9e1c8);
  });
});
