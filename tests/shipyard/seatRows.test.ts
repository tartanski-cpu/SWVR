/**
 * Rows of seats (owner, Oct 2026: the crew-transfer catamaran "basically like being like a bus":
 * seats across the wheelhouse in a couple of rows, "rotatable", the technicians sitting in
 * them). Twelve seats now (other pieces four), each turned in 45 degree steps (design.seatFace).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { hullFormOf } from '../../src/modular/hull';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, FURNITURE_SLOTS, furnitureCell, SEAT_FACES, type ShipDesign } from '../../src/shipyard/design';
import { nextSlot, removeFurniture, turnSeat } from '../../src/shipyard/furnishing';
import { raiseTransfer } from '../../src/transfer/transfer';
import { placeVessel } from '../../src/vessel/vesselControl';
import { BERTHS } from '../../src/world/archipelago';

afterAll(() => useDesign(DEFAULT_DESIGN));

const CAT = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Fast catamaran'));
/** The catamaran with a long wheelhouse and saloon (room for rows), and `rows` rows of 3 seats across it, the second row turned to face aft. */
function bus(rows = 2): ShipDesign {
  const base: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[CAT].defaults, hull: CAT, saloon: 3.0 };
  const b = buildDesign(base);
  const wh = b.hull.layout.wheelhouse!;
  const tr = hullFormOf(b.hull.form).stations[0].z;
  const d = { ...base };
  let n = 0;
  for (let r = 0; r < rows; r++)
    for (const x of [-1.2, 0, 1.2]) {
      const key = FURNITURE_SLOTS.seat[n];
      d[key] = furnitureCell(x, tr - (wh.aft - 1.4 - r * 1.0));
      if (r === 1) d[SEAT_FACES[n]] = 4;
      n++;
    }
  return d;
}

describe('rows of seats', () => {
  it('twelve seats (other pieces four); a seat turns 45 degrees a press, round to forward again; not in the code', () => {
    let d: ShipDesign = { ...DEFAULT_DESIGN };
    for (let i = 0; i < 12; i++) d = { ...d, [nextSlot('seat', d)!]: 100 + i };
    expect(nextSlot('seat', d)).toBeNull();
    expect(FURNITURE_SLOTS.berth).toHaveLength(4);
    let t = d;
    for (let k = 1; k <= 8; k++) {
      t = { ...t, ...turnSeat('seatAt3', t) };
      expect(t.seatFace3).toBe(k % 8);
    }
    expect(() => encodeDesign({ ...DEFAULT_DESIGN, seatFace: 2 })).toThrow(/link or file/);
  });

  it('taking a seat off: the ones after it move up, each keeping its own facing', () => {
    const d: ShipDesign = { ...DEFAULT_DESIGN, seatAt: 10, seatAt2: 20, seatAt3: 30, seatFace: 1, seatFace2: 2, seatFace3: 3 };
    const after = { ...d, ...removeFurniture('seatAt2', d) };
    expect([after.seatAt, after.seatAt2, after.seatAt3]).toEqual([10, 30, 0]);
    expect([after.seatFace, after.seatFace2, after.seatFace3]).toEqual([1, 3, 0]);
  });

  it('two rows of three across the catamaran\'s cabin, the second facing aft: all where they were put, across her beam', () => {
    const b = buildDesign(bus());
    const seats = b.hull.sockets.filter((s) => s.id.startsWith('furniture.seat'));
    expect(b.warnings).toEqual([]);
    expect(seats).toHaveLength(6);
    // Across her: one each side and one on the centreline, in each row.
    const xs = seats.map((s) => s.transform.position[0]).sort((a, c) => a - c);
    expect(xs[0]).toBeLessThan(-0.9);
    expect(Math.min(...xs.map(Math.abs))).toBeLessThan(0.3);
    expect(xs[5]).toBeGreaterThan(0.9);
    // The second row faces aft (turned 180 degrees).
    expect(seats.filter((s) => Math.abs(Math.abs(s.transform.rotationDeg?.[1] ?? 0) - 180) < 1e-6)).toHaveLength(3);
    expect(seats.find((s) => s.id === 'furniture.seat4')!.label).toMatch(/facing aft/);
  });

  it('the technicians sit in her furniture seats, each facing as it does', { timeout: 60000 }, () => {
    useDesign(bus());
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    const berth = BERTHS.find((x) => x.id === 'calder-cargo')!;
    placeVessel(v, berth.x - 3, 0, berth.z, berth.headingDeg);
    Object.assign(v.mooring, { phase: 'moored', berthId: berth.id });
    const job = raiseTransfer(world, 0, 0, 3)!;
    for (let i = 0; i < 5 * 60; i++) stepWorld(world, [], 1 / 60);
    expect(job.techs.every((t) => t.phase === 'aboard')).toBe(true);
    const b = buildDesign(bus());
    const seats = b.hull.sockets.filter((s) => s.id.startsWith('furniture.seat'));
    for (const t of job.techs) {
      const s = seats.find((x) => Math.hypot(x.transform.position[0] - t.seat![0], x.transform.position[2] - t.seat![2]) < 1e-6);
      expect(s, t.id).toBeDefined();
      expect(t.seat![1]).toBeCloseTo(s!.transform.position[1] + CONFIG.modules.furniture.seat.seat - 0.45, 6);
      expect(t.seatYaw).toBe(s!.transform.rotationDeg?.[1] ?? 0);
    }
  });
});
