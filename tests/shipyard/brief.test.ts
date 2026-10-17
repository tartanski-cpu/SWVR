/** The brief: jobs and targets, the suggested boat and engine, the line-by-line check. */
import { describe, expect, it } from 'vitest';
import { checkBrief, cleanBrief, engineOptions, MISSIONS, newBrief, pickEngine, suggestFor, TOW_BOLLARD_T, type Measured } from '../../src/shipyard/brief';

/** A design's measured figures, for the brief checks (each test changes what it needs). */
const MEASURED: Measured = { topSpeedKn: 20, rangeNm: 100, price: 100_000, gmM: 1, crane: false, bollardT: 4, crates: 20, pots: 10, payloadKg: 2000, has: () => false };

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
      { fit: { engine: 1, twin: 1 }, topSpeedKn: 17.8, rangeNm: 84, price: 235_000, bollardT: 2.9 },
      { fit: { engine: 2, twin: 1 }, topSpeedKn: 24.1, rangeNm: 126, price: 264_000, bollardT: 4.0 },
      { fit: { engine: 2, twin: 0 }, topSpeedKn: 12.2, rangeNm: 61, price: 216_000, bollardT: 3.5 },
    ];
    expect(pickEngine(b, tried)!.fit).toEqual({ engine: 2, twin: 1 });
    expect(pickEngine({ ...b, speedKn: 40 }, tried)!.fit).toEqual({ engine: 2, twin: 1 }); // nothing does: the fastest
  });

  it('checks each line: met, not met (with where to go), or waiting for her trial', () => {
    const b = { ...newBrief('workboat') };
    const lines = checkBrief(b, { ...MEASURED, topSpeedKn: null, rangeNm: 60, price: 250_000, gmM: 1.2, crane: false });
    const by = (l: string) => lines.find((x) => x.label === l)!;
    expect(by('Top speed').ok).toBeNull();
    expect(by('Range flat out').ok).toBe(true);
    expect(by('Price').ok).toBe(false);
    expect(by('Price').fix).toBeTruthy();
    expect(by('Deck crane').ok).toBe(false);
    expect(by('Stability (GM)').ok).toBe(true);
  });

  it('adds each job’s lines: deck room, bollard pull, its gear; gear the Shipyard can’t fit yet is shown, not counted', () => {
    const b = { ...newBrief('own'), gmM: 0, jobs: ['cargo', 'potting', 'towing', 'fire', 'rescue', 'trawl'] as const, crates: 6, pots: 5 };
    const lines = checkBrief({ ...b, jobs: [...b.jobs] }, { ...MEASURED, crates: 4, pots: 5, bollardT: TOW_BOLLARD_T - 0.5, has: (k) => k === 'searchlight' });
    const by = (l: string) => lines.find((x) => x.label === l)!;
    expect(by('Cargo runs: crates on deck').ok).toBe(false);
    expect(by('Cargo runs: crates on deck').fix!.step).toBe('wheelhouse');
    expect(by('Lobster & crab pots: pots on deck').ok).toBe(true);
    expect(by('Towing: bollard pull').ok).toBe(false);
    expect(by('Towing: tow point').na).toBe(true);
    expect(by('Fire fighting: fire monitor').ok).toBe(false);
    expect(by('Fire fighting: fire monitor').fix!.step).toBe('deck gear');
    expect(by('Search & rescue: searchlight').ok).toBe(true);
    expect(by('Search & rescue: life ring').na).toBe(true);
    expect(by('Trawling: trawl gantry and net').na).toBe(true);
    // Too little payload for the crates: the hull is the fix.
    const light = checkBrief({ ...b, jobs: ['cargo'] }, { ...MEASURED, crates: 4, payloadKg: 160 });
    expect(light[0].fix!.step).toBe('hull');
  });

  it('suggests the gear a job needs where the Shipyard can fit it, and an engine that tows', () => {
    const s = suggestFor({ ...newBrief('workboat'), jobs: ['fire', 'rescue'] }, () => ({}));
    expect(s.fireMonitor).toBe(1);
    expect(s.searchlight).toBe(1);
    const tows = { ...newBrief('workboat'), speedKn: 10, rangeNm: 50, budget: 300_000 };
    const tried = [
      { fit: { engine: 1, twin: 0 }, topSpeedKn: 11, rangeNm: 80, price: 150_000, bollardT: 2.5 },
      { fit: { engine: 2, twin: 0 }, topSpeedKn: 12, rangeNm: 60, price: 180_000, bollardT: 3.9 },
    ];
    expect(pickEngine(tows, tried)!.fit).toEqual({ engine: 2, twin: 0 });
    expect(pickEngine({ ...tows, jobs: [] }, tried)!.fit).toEqual({ engine: 1, twin: 0 });
  });

  it('reads an older brief (no jobs) and drops jobs it doesn’t know', () => {
    const old = cleanBrief({ name: 'x', mission: 'fishing', speedKn: 15, rangeNm: 70, budget: 0, gmM: 0.6, crane: false })!;
    expect(old.jobs).toEqual([]);
    expect(old.crates).toBe(6);
    expect(cleanBrief({ ...old, jobs: ['fire', 'flying'] })!.jobs).toEqual(['fire']);
  });
});
