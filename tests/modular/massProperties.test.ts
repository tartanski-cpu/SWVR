/**
 * Modular boats M6a: a boat's mass properties from her hull's lightship plus the modules
 * that declare their own mass. The starter workboat's lightship is the weighed boat less
 * her engine and batteries, so the parts must add back up to exactly the weighed boat.
 */
import { describe, expect, it } from 'vitest';
import { WORKBOAT_HULL } from '../../src/boats/workboatHull';
import { CONFIG } from '../../src/config';
import { combine, inertiaFromGyradius, lightshipOf, type PointMass } from '../../src/modular/massProperties';

const wb = CONFIG.vessels.workboat;
const weighed = { massKg: wb.mass, cg: [...wb.cg] as [number, number, number], inertia: inertiaFromGyradius(wb.mass, wb.gyradius) };

function closeTo(got: readonly number[], want: readonly number[]) {
  got.forEach((x, i) => expect(Math.abs(x - want[i])).toBeLessThan(1e-9 * Math.max(1, Math.abs(want[i]))));
}

describe('mass properties', () => {
  it('a lightship plus the parts taken out of it is the weighed boat again, for any parts', () => {
    const parts: PointMass[] = [
      { massKg: 1300, at: [0.8, 0.7, 0.3] },
      { massKg: 56, at: [0.5, 0.6, 0.4] },
      { massKg: 400, at: [-1.2, 2.5, -3] },
    ];
    const back = combine(lightshipOf(weighed, parts), parts);
    expect(back.massKg).toBeCloseTo(weighed.massKg, 9);
    closeTo(back.cg, weighed.cg);
    closeTo(back.inertia, weighed.inertia);
  });

  it('the workboat\'s hull is lighter by her engine and batteries, and they put her back as weighed', () => {
    const L = WORKBOAT_HULL.lightship;
    const engine = WORKBOAT_HULL.sockets.find((s) => s.id === 'engine')!.transform.position;
    const bank = WORKBOAT_HULL.sockets.find((s) => s.id === 'batteries')!.transform.position;
    const parts: PointMass[] = [
      { massKg: CONFIG.modules.dieselInboard.massKg, at: engine },
      { massKg: 2 * CONFIG.modules.batteryBank.massKg, at: bank },
    ];
    expect(L.massKg).toBe(wb.mass - 1300 - 56);
    const whole = combine(L, parts);
    closeTo([whole.massKg], [wb.mass]);
    closeTo(whole.cg, wb.cg);
    closeTo(whole.inertia, weighed.inertia);
  });

  it('a heavier part makes a heavier boat, its CG pulled toward it', () => {
    const light = combine(weighed, [{ massKg: 100, at: [0, 0, 5] }]);
    expect(light.massKg).toBe(wb.mass + 100);
    expect(light.cg[2]).toBeGreaterThan(wb.cg[2]);
    // Pitch and yaw inertia grow with a mass far aft; roll barely (it's on the centreline).
    expect(light.inertia[0]).toBeGreaterThan(weighed.inertia[0]);
    expect(light.inertia[1]).toBeGreaterThan(weighed.inertia[1]);
  });
});
