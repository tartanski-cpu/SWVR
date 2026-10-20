/** The brief: jobs and targets, the hull types ranked against it, a bare hull and its engine, the line-by-line check. */
import { describe, expect, it } from 'vitest';
import { bareHull, checkBrief, cleanBrief, engineOptions, newBrief, pickEngine, TOW_BOLLARD_T, type Brief, type Measured } from '../../src/shipyard/brief';
import { rankTypes } from '../../src/shipyard/typeFit';

/** A design's measured figures, for the brief checks (each test changes what it needs). */
const MEASURED: Measured = { topSpeedKn: 20, rangeNm: 100, price: 100_000, gmM: 1, crane: false, bollardT: 4, crates: 20, pots: 10, payloadKg: 2000, has: () => false };
const brief = (patch: Partial<Brief>): Brief => ({ ...newBrief(), ...patch });
const LANDING = 0, GILL = 1, WORKBOAT = 2, PILOT = 3;

describe('the brief', () => {
  it('starts empty: no jobs, no hull type, only a floor on stability', () => {
    const b = newBrief();
    expect(b.jobs).toEqual([]);
    expect(b.hull).toBeNull();
    expect(b.gmM).toBeGreaterThan(0);
    // Four engines, single and twin, but the tug diesel only single.
    expect(engineOptions()).toHaveLength(7);
  });

  it('a bare hull: the type’s layout and no deck gear (it’s pinned on her)', () => {
    const d = bareHull(WORKBOAT, () => ({ houseLength: 5, searchlight: 1 }));
    expect(d).toMatchObject({ hull: WORKBOAT, houseLength: 5, deckCrane: 0, searchlight: 0, fireMonitor: 0 });
  });

  it('picks the cheapest engine fit that does the job; failing that, the fastest', () => {
    const b = brief({ speedKn: 22, rangeNm: 110, budget: 280_000 });
    const tried = [
      { fit: { engine: 1, twin: 1 }, topSpeedKn: 17.8, rangeNm: 84, price: 235_000, bollardT: 2.9 },
      { fit: { engine: 2, twin: 1 }, topSpeedKn: 24.1, rangeNm: 126, price: 264_000, bollardT: 4.0 },
      { fit: { engine: 2, twin: 0 }, topSpeedKn: 12.2, rangeNm: 61, price: 216_000, bollardT: 3.5 },
    ];
    expect(pickEngine(b, tried)!.fit).toEqual({ engine: 2, twin: 1 });
    expect(pickEngine({ ...b, speedKn: 40 }, tried)!.fit).toEqual({ engine: 2, twin: 1 }); // nothing does: the fastest
    // Towing: the bollard pull counts too.
    const tows = brief({ speedKn: 10, rangeNm: 50, budget: 300_000, jobs: ['towing'] });
    const two = [
      { fit: { engine: 1, twin: 0 }, topSpeedKn: 11, rangeNm: 80, price: 150_000, bollardT: 2.5 },
      { fit: { engine: 2, twin: 0 }, topSpeedKn: 12, rangeNm: 60, price: 180_000, bollardT: 3.9 },
    ];
    expect(pickEngine(tows, two)!.fit).toEqual({ engine: 2, twin: 0 });
    expect(pickEngine({ ...tows, jobs: [] }, two)!.fit).toEqual({ engine: 1, twin: 0 });
  });

  it('checks each line: met, not met (with where to go), or waiting for her trial', () => {
    const b = brief({ speedKn: 10, rangeNm: 50, budget: 200_000, gmM: 0.6, crane: true });
    const lines = checkBrief(b, { ...MEASURED, topSpeedKn: null, rangeNm: 60, price: 250_000, gmM: 1.2, crane: false });
    const by = (l: string) => lines.find((x) => x.label === l)!;
    expect(by('Top speed').ok).toBeNull();
    expect(by('Range flat out').ok).toBe(true);
    expect(by('Price').ok).toBe(false);
    expect(by('Price').fix).toBeTruthy();
    expect(by('Deck crane').ok).toBe(false);
    expect(by('Deck crane').fix!.step).toBe('deck gear');
    expect(by('Stability (GM)').ok).toBe(true);
  });

  it('adds each job’s lines: deck room, bollard pull, the gear the game’s job asks for', () => {
    const b = brief({ gmM: 0, jobs: ['cargo', 'potting', 'towing', 'fire', 'rescue', 'trawl'], crates: 6, pots: 5 });
    const lines = checkBrief(b, { ...MEASURED, crates: 4, pots: 5, bollardT: TOW_BOLLARD_T - 0.5, has: (k) => k === 'searchlight' });
    const by = (l: string) => lines.find((x) => x.label === l)!;
    expect(by('Cargo runs: crates on deck').ok).toBe(false);
    expect(by('Cargo runs: crates on deck').fix!.step).toBe('hull');
    expect(by('Lobster & crab pots: pots on deck').ok).toBe(true);
    expect(by('Towing: bollard pull').ok).toBe(false);
    expect(by('Towing: tow point')).toMatchObject({ ok: false, fix: { step: 'deck gear' } });
    expect(by('Fire fighting: fire monitor').ok).toBe(false);
    expect(by('Fire fighting: fire monitor').fix!.step).toBe('deck gear');
    expect(by('Search & rescue: searchlight').ok).toBe(true);
    expect(by('Search & rescue: life ring').ok).toBe(false);
    expect(by('Trawling: trawl gantry and net').ok).toBe(false);
    expect(lines.some((l) => l.na)).toBe(false); // every job's gear can be fitted now
    // Too little payload for the crates: the hull is the fix.
    const light = checkBrief({ ...b, jobs: ['cargo'] }, { ...MEASURED, crates: 4, payloadKg: 160 });
    expect(light[0].fix!.step).toBe('hull');
  });

  it('reads older briefs: no jobs, and a mission becomes its hull type', () => {
    const old = cleanBrief({ name: 'x', mission: 'fishing', speedKn: 15, rangeNm: 70, budget: 0, gmM: 0.6, crane: false })!;
    expect(old.jobs).toEqual([]);
    expect(old.crates).toBe(6);
    expect(old.hull).toBe(GILL);
    expect(cleanBrief({ ...old, jobs: ['fire', 'flying'] })!.jobs).toEqual(['fire']);
    expect(cleanBrief({ name: 'y' })!.hull).toBeNull();
  });
});

describe('hull types for a brief', () => {
  it('cargo and towing at harbour speed: a type that can do it all (the landing craft pulls 3 t only with twin V8s, a twin\'s pull counting both propellers)', () => {
    const r = rankTypes(brief({ jobs: ['cargo', 'towing', 'fire'], speedKn: 10, rangeNm: 50, budget: 230_000 }));
    expect(r[0].misses).toBe(0);
    expect(r.find((t) => t.hull === LANDING)!.lines.find((l) => l.label === 'Pull')!.ok).toBe(true);
  });

  it('the workboat type is retired (owner: a role, not a hull type): never offered', () => {
    for (const b of [brief({ jobs: ['cargo', 'towing', 'fire'], speedKn: 10, rangeNm: 50, budget: 230_000 }), brief({})]) expect(rankTypes(b).some((t) => t.hull === WORKBOAT)).toBe(false);
  });

  it('pots: the gillnetter, built for them, ahead of others that could also do it', () => {
    const r = rankTypes(brief({ jobs: ['potting'], speedKn: 15, rangeNm: 70, budget: 160_000 }));
    expect(r[0].hull).toBe(GILL);
  });

  it('fast and cheap cargo: the landing craft', () => {
    const r = rankTypes(brief({ jobs: ['cargo'], speedKn: 18, rangeNm: 90, budget: 120_000 }));
    expect(r[0].hull).toBe(LANDING);
  });

  it('rescue at speed with money to spend: the pilot boat', () => {
    const r = rankTypes(brief({ jobs: ['rescue'], speedKn: 22, rangeNm: 110, budget: 280_000 }));
    expect(r[0].hull).toBe(PILOT);
  });

  it('deck room: a type that can be stretched to it passes, sized; one that can’t even at her largest doesn’t', () => {
    const r = rankTypes(brief({ jobs: ['cargo'], crates: 30 }));
    const deck = (h: number) => r.find((t) => t.hull === h)!.lines.find((l) => l.label === 'Deck')!;
    expect(deck(LANDING)).toMatchObject({ ok: true, value: '30 crates, stretched' });
    expect(deck(GILL)).toMatchObject({ ok: true, value: '34 crates' });
    expect(rankTypes(brief({ jobs: ['cargo'], crates: 40 })).find((t) => t.hull === LANDING)!.lines[0]).toMatchObject({ ok: false, value: '35 crates at most' });
  });

  it('one engine fit has to meet the numbers together: fast and cheap can’t be had from different fits', () => {
    // The gillnetter is 33.6 kn on twin 400 kW (£202k) and £124k on a single 150 kW (8.4 kn): not both.
    const r = rankTypes(brief({ speedKn: 30, budget: 130_000 })).find((t) => t.hull === GILL)!;
    expect(r.misses).toBeGreaterThan(0);
  });
});
