/**
 * Sea trials and hydrostatics for every vessel type (or just one: VESSEL=workboat npm run trials).
 * The printed report is the useful part when designing a new boat; the hydrostatic checks
 * apply to every boat, the trials expectations are per type (workboat, skiff).
 */
import { describe, expect, it } from 'vitest';
import { formatHydrostatics, gzCurve, uprightHydrostatics } from '../src/vessel/hydrostatics';
import { formatSeaTrials, runSeaTrials } from '../src/vessel/seaTrials';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const only = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VESSEL;
const ids = only ? [only] : Object.keys(VESSEL_DEFS);

for (const id of ids) {
  describe(`${id}`, () => {
    const def = VESSEL_DEFS[id];
    if (!def) throw new Error(`Unknown vessel "${id}". Known: ${Object.keys(VESSEL_DEFS).join(', ')}`);
    const L = def.hull.params.length;
    const h = uprightHydrostatics(def);
    const r = runSeaTrials(id);
    console.log(`\n${formatHydrostatics(def)}\n\n${formatSeaTrials(r)}\n`);

    describe('hydrostatics', () => {
      it('floats near her design waterline, nearly level', () => {
        expect(Math.abs(h.sinkage)).toBeLessThan(0.1);
        expect(Math.abs(h.lcgMinusLcb)).toBeLessThan(0.1);
      });
      it('is stable upright (GM > 0.35 m) with a righting arm out to 60°', () => {
        expect(h.gmt).toBeGreaterThan(0.35);
        for (const p of gzCurve(def, [10, 30, 60])) expect(p.gz).toBeGreaterThan(0);
      });
      it('GM agrees three ways: KB + BM - KG, small-angle GZ, and the dynamic inclining test', () => {
        const gmFromGz = gzCurve(def, [2])[0].gz / Math.sin((2 * Math.PI) / 180);
        expect(gmFromGz).toBeCloseTo(h.gmt, 1);
        expect(r.motions.inclining.impliedGM).toBeCloseTo(h.gmt, 1);
      });
    });

    if (id === 'workboat') {
      describe('sea trials (calm water)', () => {
        it('top speed ~13 kn: driven past hull speed (Fn ~0.65) by a 400 kW engine (owner request)', () => {
          expect(r.topSpeedKn).toBeGreaterThan(12.5);
          expect(r.topSpeedKn).toBeLessThan(13.8);
        });
        it('speed rises with lever and RPM', () => {
          for (let i = 1; i < r.speedTable.length; i++) expect(r.speedTable[i].knots).toBeGreaterThan(r.speedTable[i - 1].knots);
        });
        it('heavy but torquey: 90 % of top speed in 5-40 s', () => {
          expect(r.timeTo90Pct).toBeGreaterThan(5);
          expect(r.timeTo90Pct).toBeLessThan(40);
        });
        it('turns to starboard on starboard helm, tactical diameter 2-5 L', () => {
          expect(r.transfer).toBeGreaterThan(0);
          expect(r.tacticalDiameter / L).toBeGreaterThan(2);
          expect(r.tacticalDiameter / L).toBeLessThan(5);
        });
        it('answers the helm: 10° of heading in under 2.6 s at half ahead, 2 s at full (owner: "bite")', () => {
          const [half, full] = r.helmResponse;
          expect(half.to10).toBeLessThan(2.6);
          expect(full.to10).toBeLessThan(2.0);
          expect(full.to30).toBeLessThan(half.to30);
        });
              it('crash-stops within 1.2-5 L', () => {
          expect(r.crashStopDistance / L).toBeGreaterThan(1.2);
          expect(r.crashStopDistance / L).toBeLessThan(5);
        });
        it('slow-revving inboard: reaches 85-100 % of rated RPM at full ahead', () => {
          const rated = def.engine?.ratedRpm ?? 1;
          const full = r.speedTable[r.speedTable.length - 1].rpm;
          expect(full / rated).toBeGreaterThan(0.85);
          expect(full / rated).toBeLessThan(1.02);
        });
        it('pulls like a 400 kW workboat: bollard pull 3-5.5 t ahead, RPM sags under load', () => {
          expect(r.bollard.aheadKN / 9.81).toBeGreaterThan(3);
          expect(r.bollard.aheadKN / 9.81).toBeLessThan(5.5);
          expect(r.bollard.aheadRpm).toBeLessThan(r.speedTable[r.speedTable.length - 1].rpm);
        });
        it('goes astern slower than ahead', () => {
          expect(r.asternSpeedKn).toBeGreaterThan(3);
          expect(r.asternSpeedKn).toBeLessThan(r.topSpeedKn);
        });
      });

      describe('motions (free decay)', () => {
        it('has plausible natural periods for a ~12 m boat', () => {
          expect(r.motions.heavePeriod).toBeGreaterThan(1.2);
          expect(r.motions.heavePeriod).toBeLessThan(3);
          expect(r.motions.rollPeriod).toBeGreaterThan(2.5);
          expect(r.motions.rollPeriod).toBeLessThan(6);
        });
        it('roll is lightly but clearly damped (5-25 % of critical)', () => {
          expect(r.motions.rollDampingRatio).toBeGreaterThan(0.05);
          expect(r.motions.rollDampingRatio).toBeLessThan(0.25);
        });
      });
    }
    if (id === 'skiff') {
      describe('sea trials (calm water): the tender', () => {
        it('a small electric outboard: ~5.5 kn flat out, ~3.5 kn at quarter throttle', () => {
          expect(r.topSpeedKn).toBeGreaterThan(5);
          expect(r.topSpeedKn).toBeLessThan(6.2);
          expect(r.speedTable[0].knots).toBeGreaterThan(3);
        });
        it('the battery lasts ~40 min flat out, far longer slow', () => {
          const full = r.speedTable[r.speedTable.length - 1];
          const minutes = (full.rangeNm / full.knots) * 60;
          expect(minutes).toBeGreaterThan(35);
          expect(minutes).toBeLessThan(45);
          expect(r.speedTable[0].rangeNm).toBeGreaterThan(4 * full.rangeNm);
        });
        it('turns to starboard on starboard helm, tightly (1.5-4 L) without spinning', () => {
          expect(r.transfer).toBeGreaterThan(0);
          expect(r.tacticalDiameter / L).toBeGreaterThan(1.5);
          expect(r.tacticalDiameter / L).toBeLessThan(4);
          expect(r.steadyTurnDiameter / L).toBeGreaterThan(1.2);
        });
        it('answers the tiller quickly, and goes astern', () => {
          expect(r.helmResponse[1].to10).toBeLessThan(1.5);
          expect(r.asternSpeedKn).toBeGreaterThan(2);
        });
      });
      describe('motions (free decay)', () => {
        it('quick, small-boat periods (under 1.5 s), roll damped', () => {
          expect(r.motions.rollPeriod).toBeLessThan(1.5);
          expect(r.motions.heavePeriod).toBeLessThan(1.2);
          expect(r.motions.rollDampingRatio).toBeGreaterThan(0.05);
        });
      });
    }
  });
}
