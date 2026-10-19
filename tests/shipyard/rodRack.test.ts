/**
 * The fishing rods' rack (owner, Oct 2026): a Shipyard fitting placed on a wall of the
 * wheelhouse (the aft wall port or starboard of the door, or a side wall), four rods standing
 * upright in it, a bucket beside them; its own place in the code (version 26).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, ROD_RACKS, type ShipDesign } from '../../src/shipyard/design';
import { EQUIPMENT, fitted, placeGear } from '../../src/shipyard/pinGear';

afterAll(() => useDesign(DEFAULT_DESIGN));

const boat = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0, ...more });
const rack = (d: ShipDesign) => {
  const m = buildDesign(d).recipe.modules.find((x) => x.module === 'deck.rod-rack');
  return m ? (m.config as { rods: [number, number, number][]; yawDeg: number; bucket: [number, number, number]; side: number }) : null;
};

describe('the rod rack', () => {
  it('is in the code with its place; older codes read without one; a pin puts it on the nearest wall', () => {
    for (let i = 1; i < ROD_RACKS.length; i++) {
      const back = decodeDesign(encodeDesign(boat({ rodRack: i, nozzle: 1 })));
      expect('design' in back && back.design.rodRack).toBe(i);
      expect('design' in back && back.design.nozzle).toBe(1);
    }
    expect(encodeDesign(boat({ rodRack: 0 }))).toBe(encodeDesign(boat()));
    const eq = EQUIPMENT.find((e) => e.id === 'rodRack')!;
    expect(fitted(eq, boat({ rodRack: 3 }))).toBe(true);
    expect(fitted(eq, boat())).toBe(false);
    const house = { front: -3, aft: 0, halfWidth: 1.5 };
    expect(placeGear(eq, [-1, 0, 1], house, 5).patch).toEqual({ rodRack: 1 }); // aft of the house, port
    expect(placeGear(eq, [1, 0, -0.5], house, 5).patch).toEqual({ rodRack: 2 }); // near the aft wall, starboard
    expect(placeGear(eq, [-1.6, 0, -2], house, 5).patch).toEqual({ rodRack: 3 }); // along the port wall
    expect(placeGear(eq, [1.6, 0, -2], house, 5).patch.rodRack).toBe(4);
  });

  it('four rods stand upright in a row on the chosen wall, the bucket at the end; the boat has a rod rack', () => {
    const n = CONFIG.rod.perRack;
    expect(n).toBe(4);
    const aftPort = rack(boat({ rodRack: 1 }))!;
    expect(aftPort.rods).toHaveLength(n);
    expect(aftPort.yawDeg).toBe(0);
    expect(aftPort.side).toBe(-1);
    for (const r of aftPort.rods) expect(r[0]).toBeLessThan(0);
    // In a row along the wall, spaced; all at the same z (against the aft wall).
    expect(new Set(aftPort.rods.map((r) => r[2])).size).toBe(1);
    expect(Math.abs(aftPort.rods[1][0] - aftPort.rods[0][0])).toBeCloseTo(CONFIG.rod.spacing, 2);
    const aftStbd = rack(boat({ rodRack: 2 }))!;
    expect(aftStbd.side).toBe(1);
    for (const r of aftStbd.rods) expect(r[0]).toBeGreaterThan(0);
    // The pilot boat has side decks: the rack can stand on her starboard wall.
    const stbd = rack({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[3].defaults, hull: 3, rodRack: 4 });
    expect(stbd).not.toBeNull();
    expect(stbd!.yawDeg).toBe(90);
    expect(new Set(stbd!.rods.map((r) => r[0])).size).toBe(1);
    expect(Math.abs(stbd!.rods[1][2] - stbd!.rods[0][2])).toBeCloseTo(CONFIG.rod.spacing, 2);
    // Priced (her price is rounded to the thousand) and weighed.
    const plain = buildDesign(boat());
    const b = buildDesign(boat({ rodRack: 1 }));
    expect([0, 1000]).toContain(b.figures.price - plain.figures.price);
    expect(b.weights.massKg - plain.weights.massKg).toBeCloseTo(CONFIG.shipyard.weights.gear.rodRack, 1);
    useDesign(boat({ rodRack: 2 }));
    expect(gearOf({ defId: 'design' }, 'rodRack')?.rods).toHaveLength(n);
    useDesign(boat());
    expect(gearOf({ defId: 'design' }, 'rodRack')).toBeNull();
  });
});
