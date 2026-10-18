// The design flow (owner, Oct 2026): in a session everyone is on the same step; the brief is
// written as a typed document with a sketch of the kind of boat it adds up to.
import { describe, expect, it } from 'vitest';
import { LoopbackHost } from '../../src/net/transport';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { Keeper, Member, type SessionEvents } from '../../src/shipyard/session';
import { cleanDoc, newDoc } from '../../src/shipyard/variants';
import { newBrief } from '../../src/shipyard/brief';
import { briefPaper, briefSketch, sketchPlan } from '../../src/shipyard/briefPaper';

const tick = () => new Promise((r) => setTimeout(r, 0));
function events(log: [string, string | null][]): SessionEvents {
  return { onDesign: () => {}, onPeople: () => {}, onLost: () => {}, onStep: (s, by) => log.push([s, by]) };
}

describe('the shared step', () => {
  it('a step anyone moves to reaches everyone, and someone joining later starts on it', async () => {
    const host = new LoopbackHost();
    const k: [string, string | null][] = [], a: typeof k = [], c: typeof k = [];
    const keeper = new Keeper({ ...DEFAULT_DESIGN }, 'Simon', host, events(k));
    const amy = new Member({ ...DEFAULT_DESIGN }, 'Amy', host.client(), events(a));
    await tick();
    await tick();
    amy.setStep('wheelhouse');
    await tick();
    expect(keeper.step).toBe('wheelhouse');
    expect(k).toEqual([['wheelhouse', amy.me]]);
    keeper.setStep('trials & handover');
    await tick();
    expect(a.at(-1)).toEqual(['trials & handover', keeper.me]);
    // Someone joining now arrives on it.
    const cy = new Member({ ...DEFAULT_DESIGN }, 'Cy', host.client(), events(c));
    await tick();
    await tick();
    expect(cy.step).toBe('trials & handover');
    expect(c).toEqual([['trials & handover', null]]);
  });

  it('a bad step is ignored, and the step is kept with the work', () => {
    expect(cleanDoc({ ...newDoc({ ...DEFAULT_DESIGN }), step: '<b>' })?.step).toBeUndefined();
    expect(cleanDoc({ ...newDoc({ ...DEFAULT_DESIGN }), step: 'deck gear' })?.step).toBe('deck gear');
  });
});

describe('the brief on paper', () => {
  it("sketches the kind of boat the brief adds up to", () => {
    const b = newBrief();
    expect(sketchPlan(b)).toEqual({ hull: 'work', houseForward: false, marks: [] });
    expect(sketchPlan({ ...b, jobs: ['towing'] })).toMatchObject({ hull: 'tug', houseForward: true, marks: ['towHook'] });
    expect(sketchPlan({ ...b, speedKn: 25, jobs: ['rescue'] })).toMatchObject({ hull: 'fast', houseForward: false, marks: ['searchlight', 'ring'] });
    expect(sketchPlan({ ...b, jobs: ['cargo', 'potting', 'trawl', 'fire'] }).marks).toEqual(['crates', 'pots', 'crane', 'aFrame', 'monitor']);
    expect(briefSketch(b)).toMatch(/^<svg[^>]*>.*<\/svg>$/s);
  });

  it("writes her duties and requirements, safely, and is agreed once a hull's picked", () => {
    const html = briefPaper({ ...newBrief(), name: '<Calder> & Co', jobs: ['cargo'], speedKn: 12, crates: 8 }, { name: 'Workboat', verdict: 'best fit' });
    expect(html).toContain('&#60;Calder&#62; &#38; Co');
    expect(html).not.toContain('<Calder>');
    expect(html).toContain('12 knots');
    expect(html).toContain('Crates on deck, at least');
    expect(html).toContain('Workboat');
    expect(html).toContain('stamp draft');
    expect(briefPaper({ ...newBrief(), hull: 2 }, null)).toContain('stamp agreed');
  });
});
