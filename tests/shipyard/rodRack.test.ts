/**
 * The fishing rod's rack (owner, Oct 2026): a Shipyard fitting on the house's aft wall, the
 * side the life ring isn't, its bucket on deck; its own place in the code (version 25).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { EQUIPMENT, fitted } from '../../src/shipyard/pinGear';

afterAll(() => useDesign(DEFAULT_DESIGN));

const boat = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0, ...more });

describe('the rod rack', () => {
  it('is in the code; older codes read without one', () => {
    const back = decodeDesign(encodeDesign(boat({ rodRack: 1, nozzle: 1 })));
    expect('design' in back && back.design.rodRack).toBe(1);
    expect('design' in back && back.design.nozzle).toBe(1);
    expect(encodeDesign(boat({ rodRack: 0 }))).toBe(encodeDesign(boat()));
    const eq = EQUIPMENT.find((e) => e.id === 'rodRack')!;
    expect(fitted(eq, boat({ rodRack: 1 }))).toBe(true);
    expect(fitted(eq, boat())).toBe(false);
  });

  it('goes on the aft wall opposite the life ring, with its bucket on deck, weighed and priced; the boat has a rod rack', () => {
    const plain = buildDesign(boat({ lifeRing: 1 }));
    const b = buildDesign(boat({ lifeRing: 1, rodRack: 1 }));
    const m = b.recipe.modules.find((x) => x.module === 'deck.rod-rack')!;
    expect(m).toBeTruthy();
    const c = m.config as { stow: [number, number, number]; bucket: [number, number, number]; side: number };
    expect(c.side).toBe(1); // the ring is to port
    expect(c.stow[0]).toBeGreaterThan(0.5);
    expect(c.bucket[2]).toBeGreaterThan(c.stow[2]);
    // (Her price is rounded to the thousand: the rack's £700 shows as 0 or 1000.)
    expect([0, 1000]).toContain(b.figures.price - plain.figures.price);
    expect(b.weights.massKg - plain.weights.massKg).toBeCloseTo(CONFIG.shipyard.weights.gear.rodRack, 1);
    useDesign(boat({ lifeRing: 2, rodRack: 1 }));
    const rr = gearOf({ defId: 'design' }, 'rodRack')!;
    expect(rr.side).toBe(-1);
    expect(rr.stow[0]).toBeLessThan(0);
    useDesign(boat());
    expect(gearOf({ defId: 'design' }, 'rodRack')).toBeNull();
  });
});
