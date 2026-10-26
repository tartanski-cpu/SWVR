/**
 * Back from a dive (dive/diveReturn.ts; docs/dive-contract.md; Submersible World's M9): the
 * envelope read (bounded, Timber's left alone), counted once by its handoff id; the finds as
 * salvage crates on the dive ship's deck, sold in port; the survey and her story paid; the
 * sub afloat astern when she's still over the site; the wreck's name for the charts.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { aboard } from '../src/cargo/cargo';
import { applyDiveReturn, consumeDiveReturn, decodeDiveReturn, divePayments, foundNames, priceOf, sellSalvage, takeDiveReturn, type DiveReturn } from '../src/dive/diveReturn';
import { DIVE_SITES, siteLabel, siteWorld } from '../src/dive/diveSites';
import { DIVE_FRAME, subAt } from '../src/modules/diveFrame';
import { diveFrameOf, diveFrameState } from '../src/modules/diveFrame/onBoat';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';
import { issueId } from '../src/voyage/metaverse';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';

afterAll(() => useDesign(DEFAULT_DESIGN));

const ST = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Stern trawler'));
const dsv = (): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[ST].defaults, hull: ST, aFrame: 0, netDrum: 0, trawlWinches: 0, diveFrame: 1 });
void buildDesign;

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

const site = DIVE_SITES.find((s) => s.map === 'career')!;
const back: DiveReturn = {
  v: 1,
  id: 'k3x9qa',
  from: 'submersible',
  site: site.id,
  status: 'recovered',
  items: [
    { kind: 'anchor', cls: 'heavy', name: 'Her bower anchor', kg: 330 },
    { kind: 'bottle', cls: 'small', name: 'Green glass bottle', kg: 0 },
  ],
  survey: { pct: 64, gain: 40, identified: true, name: 'Brave Light', namedNow: true },
  story: { clues: 4, of: 6, solved: true, solvedNow: true, firstTime: true },
  minutes: 38,
  depth: 27,
};
const encode = (e: unknown) => btoa(JSON.stringify(e)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('back from a dive', { timeout: 60000 }, () => {
  it('reads the envelope off the address, bounded, and leaves anything else (Timber) alone', () => {
    const href = `https://x.test/SWVR/career.html?boat=diveShip&mv=${encode(back)}`;
    const { back: got, clean } = takeDiveReturn(href);
    expect(got).toEqual(back);
    expect(clean).toBe('https://x.test/SWVR/career.html?boat=diveShip');
    expect(takeDiveReturn(`https://x.test/?mv=${encode({ v: 1, from: 'timber', id: 'a', site: 'b' })}`).back).toBe(null);
    expect(decodeDiveReturn('garbage!')).toBe(null);
    const big = decodeDiveReturn(encode({ ...back, items: Array.from({ length: 99 }, () => ({ kind: 'x'.repeat(99), cls: 'huge', name: 3, kg: 1e9 })) }))!;
    expect(big.items.length).toBe(CONFIG.dive.maxItems);
    expect(big.items[0]).toEqual({ kind: 'x'.repeat(24), cls: 'small', name: 'A find', kg: 2000 });
  });

  it('counts a return once, and only one whose id was issued here', () => {
    const st = store();
    expect(consumeDiveReturn(back, st)).toBe(null);
    issueId(back.id, st);
    expect(consumeDiveReturn(back, st)).toEqual(back);
    expect(consumeDiveReturn(back, st)).toBe(null);
  });

  it('puts the finds on deck as salvage crates, pays the survey and the story, the sub afloat astern over the site; sells the crates in port', () => {
    useDesign(dsv());
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    stepWorld(world, [], 1 / 60);
    const at = siteWorld(site)!;
    placeVessel(v, at.x, 0, at.z, 0);
    v.linearVelocity = [0, 0, 0];
    const before = world.career?.money ?? CONFIG.career.startMoney;
    const st = store();
    const text = applyDiveReturn(world, v, back, st);
    expect(text).toMatch(/2 salvage crates on deck/);
    expect(text).toMatch(/afloat astern/);
    const crates = aboard(world, v.id).filter((c) => c.salvage);
    expect(crates.map((c) => c.salvage!.name)).toEqual(['Her bower anchor', 'Green glass bottle']);
    // The anchor as heavy as it is out of the water.
    expect(crates[0].mass).toBe(Math.round(330 * CONFIG.dive.airFactor));
    // Paid: 40 points of coverage, her name, the cause found first time.
    const f = CONFIG.dive.fees;
    const fees = 40 * f.perCoveragePoint + f.identified + f.finding + f.firstTime;
    expect(divePayments(back).reduce((s, p) => s + p.amount, 0)).toBe(fees);
    expect(world.career!.money - before).toBe(fees);
    // The sub afloat off the stern, as when she dived.
    const fr = diveFrameOf(v)!;
    expect(subAt(fr.config, diveFrameState(v)!).on).toBe('afloat');
    expect(v.modules![fr.path].id).toBe(DIVE_FRAME.id);
    // Her name for the charts.
    expect(foundNames(st)[site.id]).toBe('Brave Light');
    expect(siteLabel(site, foundNames(st))).toBe('the Brave Light');
    expect(siteLabel(site)).toMatch(/^the wreck /);
    // At sea: nothing sold. In port, stopped: each crate at its price.
    sellSalvage(world, v);
    expect(aboard(world, v.id).filter((c) => c.salvage).length).toBe(2);
    const port = PORTS.find((p) => p.cargo.berth)!;
    placeVessel(v, port.cargo.berth!.x, 0, port.cargo.berth!.z, 0);
    v.linearVelocity = [0, 0, 0];
    const m0 = world.career!.money;
    sellSalvage(world, v);
    // Not at once: the buyer comes after she's been stopped there a while.
    expect(aboard(world, v.id).filter((c) => c.salvage).length).toBe(2);
    world.time += CONFIG.dive.sellAfterS + 1;
    sellSalvage(world, v);
    expect(aboard(world, v.id).filter((c) => c.salvage).length).toBe(0);
    expect(world.career!.money - m0).toBeGreaterThanOrEqual(Math.round((priceOf(back.items[0]) + priceOf(back.items[1])) * 0.5));
  });

  it('away from the site (a career comes back in port) the sub stays on her cradle', () => {
    useDesign(dsv());
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    stepWorld(world, [], 1 / 60);
    const text = applyDiveReturn(world, v, { ...back, survey: { ...back.survey, gain: 0, namedNow: false }, story: { ...back.story, solvedNow: false } }, store());
    expect(text).not.toMatch(/afloat astern/);
    expect(subAt(diveFrameOf(v)!.config, diveFrameState(v)!).on).toBe('cradle');
  });

  it('no wreck is named or described on the charts until a dive names her', () => {
    for (const s of DIVE_SITES) {
      expect(Object.keys(s)).not.toContain('name');
      expect(Object.keys(s)).not.toContain('wreck');
      expect(siteLabel(s)).toBe(`the wreck ${s.near}`);
    }
  });
});
