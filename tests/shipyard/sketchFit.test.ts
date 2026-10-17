/** From a sketch to a boat: drawn profiles read and matched to the nearest hull type; and the brief. */
import { describe, expect, it } from 'vitest';
import { fitSketch, readSketch, type HullProfile, type Pt } from '../../src/shipyard/sketchFit';
import { SCALES } from '../../src/shipyard/design';
import { checkBrief, engineOptions, MISSIONS, newBrief, pickEngine, suggestFor } from '../../src/shipyard/brief';

// The four types at their standard size, as the page reads them off their stations (Oct 2026).
const TYPES: HullProfile[] = [
  { name: 'Landing craft', lengthM: 9, depthM: 1.51, draughtM: 0.48, stemDeg: 23, rampBow: true, defaults: { houseLength: 2 } },
  { name: 'Gillnetter', lengthM: 9.8, depthM: 1.79, draughtM: 0.6, stemDeg: 22, rampBow: false, defaults: { houseLength: 6 } },
  { name: 'Workboat', lengthM: 12, depthM: 2.07, draughtM: 0.95, stemDeg: 17, rampBow: false, defaults: { houseLength: 5 } },
  { name: 'Pilot boat', lengthM: 14, depthM: 2.5, draughtM: 1.1, stemDeg: 40, rampBow: false, defaults: { houseLength: 12 } },
];

/** A hull outline: transom at x 0, sheer at `fb`, keel at -`dr`, the stem from (L, fb) down to (L - run, -dr). */
function hull(L: number, fb: number, dr: number, run: number): Pt[][] {
  const line = (a: Pt, b: Pt, n = 10): Pt[] => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return [[...line([0, fb], [L, fb]), ...line([L, fb], [L - run, -dr]), ...line([L - run, -dr], [0, -dr]), ...line([0, -dr], [0, fb], 3)]];
}

describe('sketch to boat', () => {
  it('reads length, freeboard, draught and stem rake off a drawn profile', () => {
    const r = readSketch(hull(12, 1.3, 1.1, 0.5), [])!;
    expect(r.lengthM).toBeCloseTo(12, 1);
    expect(r.freeboardM).toBeCloseTo(1.3, 1);
    expect(r.draughtM).toBeCloseTo(1.1, 1);
    expect(r.stemDeg).toBeGreaterThan(5);
    expect(r.stemDeg).toBeLessThan(20);
    expect(r.rampBow).toBe(false);
  });

  it('a deep, near-plumb 12 m hull is a workboat; a long low ramp is a landing craft; a fast raked one is a pilot boat', () => {
    expect(fitSketch(readSketch(hull(12, 1.3, 1.1, 0.5), [])!, TYPES).hull).toBe(2);
    expect(fitSketch(readSketch(hull(9, 1.1, 0.5, 3), [])!, TYPES).hull).toBe(0);
    expect(fitSketch(readSketch(hull(14, 1.7, 0.9, 1.9), [])!, TYPES).hull).toBe(3);
  });

  it('a short beamy shallow boat with an ordinary bow is a gillnetter', () => {
    expect(fitSketch(readSketch(hull(9.5, 1.15, 0.6, 0.7), [])!, TYPES).hull).toBe(1);
  });

  it('sizes the sliders to the sketch, and reads the wheelhouse: length, place, height, front', () => {
    const house: Pt[][] = [[[4, 1.3], [4, 3.6], [7.4, 3.6], [8.2, 1.3]]]; // front raked aft at the top
    const s = fitSketch(readSketch(hull(13, 1.3, 1.1, 0.5), house)!, TYPES);
    expect(s.hull).toBe(2);
    expect(SCALES.scale(s.patch.length!)).toBeCloseTo(13 / 12, 1);
    expect(SCALES.houseLength(s.patch.houseLength!)).toBeCloseTo(4.2, 0);
    expect(SCALES.windowRake(s.patch.windowRake!)).toBeLessThan(0); // raked aft
    expect(s.says.join(' ')).toMatch(/wheelhouse/);
  });

  it('too little drawn: no reading', () => {
    expect(readSketch([[[0, 0], [1, 0]]], [])).toBeNull();
  });
});


describe('the brief', () => {
  it('a job gives its targets and the suggested hull type, with a crane when wanted', () => {
    const b = newBrief('workboat');
    expect(b.crane).toBe(true);
    const s = suggestFor(b, () => ({ houseLength: 5 }));
    expect(s.hull).toBe(MISSIONS.find((m) => m.id === 'workboat')!.suggest.hull);
    expect(s.deckCrane).toBeGreaterThan(0);
    expect(engineOptions()).toHaveLength(6);
  });

  it('picks the cheapest engine fit that does the job; failing that, the fastest', () => {
    const b = { ...newBrief('pilot'), speedKn: 22, rangeNm: 110, budget: 280_000 };
    const tried = [
      { fit: { engine: 1, twin: 1 }, topSpeedKn: 17.8, rangeNm: 84, price: 235_000 },
      { fit: { engine: 2, twin: 1 }, topSpeedKn: 24.1, rangeNm: 126, price: 264_000 },
      { fit: { engine: 2, twin: 0 }, topSpeedKn: 12.2, rangeNm: 61, price: 216_000 },
    ];
    expect(pickEngine(b, tried)!.fit).toEqual({ engine: 2, twin: 1 });
    expect(pickEngine({ ...b, speedKn: 40 }, tried)!.fit).toEqual({ engine: 2, twin: 1 }); // nothing does: the fastest
  });

  it('checks each line: met, not met (with where to go), or waiting for her trial', () => {
    const b = { ...newBrief('workboat') };
    const lines = checkBrief(b, { topSpeedKn: null, rangeNm: 60, price: 250_000, gmM: 1.2, crane: false });
    const by = (l: string) => lines.find((x) => x.label === l)!;
    expect(by('Top speed').ok).toBeNull();
    expect(by('Range flat out').ok).toBe(true);
    expect(by('Price').ok).toBe(false);
    expect(by('Price').fix).toBeTruthy();
    expect(by('Deck crane').ok).toBe(false);
    expect(by('Stability (GM)').ok).toBe(true);
  });
});
