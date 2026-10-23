/**
 * The hull study's fast catamaran workboat (owner, Oct 2026: a wide working platform for
 * cranes, the house forward or aft, stiff in roll, 25-28 kn on every size with the engines
 * there are). Her lines' numbers, at the Shipyard's smallest, standard and largest sizes
 * (length, beam and depth each x0.8 .. x1.175, the demihulls' spacing and the wet deck
 * scaled with the beam and the depth).
 */
import { describe, expect, it } from 'vitest';
import { DESIGNS } from '../../src/hulls/designs';
import { hydrostatics, loft, type HullDesign } from '../../src/hulls/loft';

const base = DESIGNS.find((d) => d.id === 'workCat')!;
const sized = (k: number): HullDesign => {
  const by = (c: [number, number][]) => c.map(([t, v]) => [t, v * k] as [number, number]);
  return { ...base, length: base.length * k, halfBeam: by(base.halfBeam), sheer: by(base.sheer), keel: by(base.keel), catamaran: { spacing: base.catamaran!.spacing * k, tunnel: base.catamaran!.tunnel * k } };
};

describe('the fast catamaran workboat (hull study)', () => {
  it('is a catamaran: two slim demihulls (L/b over 7 at the waterline), a wide deck, a high wet deck', () => {
    expect(base.catamaran).toBeDefined();
    const h = hydrostatics(loft(base));
    const demihullB = h.beamWl - base.catamaran!.spacing;
    expect(h.lwl / demihullB).toBeGreaterThan(7);
    expect(h.beam).toBeGreaterThan(5.4);
    expect(h.lwl / h.beam).toBeLessThan(2.3);
    // The wet deck well clear of the water: 10 % of her waterline length, so it stays over 7 %
    // even at the Shipyard's smallest, which sits deeper for her size.
    expect(base.catamaran!.tunnel / h.lwl).toBeGreaterThan(0.1);
  });

  it('drawn to float on her lines at the Shipyard\'s weight for her: about 15 t at standard size, 6.5 to 26 t across the sizes', () => {
    const [small, std, large] = [0.8, 1, 1.175].map((k) => hydrostatics(loft(sized(k))));
    expect(std.displacementT).toBeGreaterThan(13.5);
    expect(std.displacementT).toBeLessThan(16);
    expect(small.displacementT).toBeGreaterThan(6.5);
    expect(large.displacementT).toBeLessThan(26);
    // A planing hull's buoyancy aft: the LCB well aft of amidships (z + is aft).
    expect(std.lcb / std.lwl).toBeGreaterThan(0.08);
  });

  it('very stiff in roll: her transverse metacentre several times a monohull workboat\'s of her size', () => {
    const cat = hydrostatics(loft(base));
    const mono = hydrostatics(loft(DESIGNS.find((d) => d.id === 'landingCraft')!));
    expect(cat.km).toBeGreaterThan(8);
    expect(cat.km / mono.km).toBeGreaterThan(3);
  });
});
