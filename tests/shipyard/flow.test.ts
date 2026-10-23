// The design flow (owner, Oct 2026): in a session everyone is on the same step; the brief is
// written as a typed document with a sketch of the kind of boat it adds up to.
import { describe, expect, it } from 'vitest';
import { LoopbackHost } from '../../src/net/transport';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { Keeper, Member, type SessionEvents } from '../../src/shipyard/session';
import { cleanDoc, newDoc } from '../../src/shipyard/variants';

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
