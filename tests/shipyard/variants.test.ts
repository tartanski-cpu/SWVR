/** Variants: forks with a parent link, shared in a session; compare, merge, promote. */
import { describe, expect, it } from 'vitest';
import { LoopbackHost } from '../../src/net/transport';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { Keeper, Member, type SessionEvents } from '../../src/shipyard/session';
import { cleanDoc, diffFields, dropVariant, fork, MAIN, mergePatch, newDoc, promote, putVariant, MAX_VARIANTS } from '../../src/shipyard/variants';

const tick = () => new Promise((r) => setTimeout(r, 0));
const quiet: SessionEvents = { onDesign: () => {}, onPeople: () => {}, onLost: () => {} };

describe('variants', () => {
  it('a fork is a full copy of the design and its notes, with a parent link', () => {
    const main = newDoc({ ...DEFAULT_DESIGN, length: 4 }).variants[0];
    main.notes = [{ id: 'n1', kind: 'pin', by: 'A', colour: '#123456', t: 1, at: [0.5, 0.5, 0.5], text: 'x', done: false }];
    const v = fork(main, 'v1', 'Simon’s twin-engine version', 'Simon', 5);
    expect(v).toMatchObject({ id: 'v1', parent: MAIN, by: 'Simon', name: 'Simon’s twin-engine version' });
    expect(v.design).toEqual(main.design);
    expect(v.design).not.toBe(main.design);
    expect(v.notes).toHaveLength(1);
  });

  it('compare lists what differs; merge takes the ticked values; promote swaps with the main and keeps the old', () => {
    const main = newDoc({ ...DEFAULT_DESIGN, length: 4, twin: 0 }).variants[0];
    const v = { ...fork(main, 'v1', 'Long', 'A', 1), design: { ...main.design, length: 9, twin: 1, gear: 3 } };
    expect(diffFields(main.design, v.design)).toEqual(['length', 'twin']); // the gearbox isn't a difference
    expect(mergePatch(v.design, ['twin'])).toEqual({ twin: 1 });
    const [newMain, old] = promote([main, v], 'v1', 9)!;
    expect(newMain.id).toBe(MAIN);
    expect(newMain.design.length).toBe(9);
    expect(old.id).toBe('v1');
    expect(old.design.length).toBe(4);
    expect(old.name).toMatch(/Main before/);
  });

  it('the main design is never deleted; deleting a variant hangs its children from its parent; there is a cap', () => {
    let list = newDoc(DEFAULT_DESIGN).variants;
    list = putVariant(list, fork(list[0], 'a', 'A', '', 1));
    list = putVariant(list, fork(list[1], 'b', 'B', '', 2));
    expect(dropVariant(list, MAIN)).toHaveLength(3);
    expect(dropVariant(list, 'a').find((v) => v.id === 'b')!.parent).toBe(MAIN);
    for (let i = 0; i < 20; i++) list = putVariant(list, fork(list[0], `x${i}`, 'X', '', 3));
    expect(list).toHaveLength(MAX_VARIANTS);
  });

  it('old saved copies (one design and its notes) read as a main design', () => {
    const doc = cleanDoc({ v: 1, design: { ...DEFAULT_DESIGN, length: 2 }, notes: [] })!;
    expect(doc.variants.map((v) => v.id)).toEqual([MAIN]);
    expect(doc.variants[0].design.length).toBe(2);
    expect(cleanDoc({ v: 2, variants: [{ id: 'x', design: {} }] })).toBeNull(); // no main
    // Off its scale: brought onto it (the design document's rule, designDoc.ts).
    const off = cleanDoc({ v: 2, variants: [{ id: MAIN, design: { length: 999, beam: -1 } }] })!.variants[0].design;
    expect([off.length, off.beam]).toEqual([15, 0]);
  });

  it('in a session: a fork, its edits and its pins reach everyone; edits to one variant leave the others', async () => {
    const host = new LoopbackHost();
    const keeper = new Keeper({ ...DEFAULT_DESIGN }, 'Simon', host, quiet);
    const amy = new Member({ ...DEFAULT_DESIGN }, 'Amy', host.client(), quiet);
    await tick();
    await tick();
    amy.putVariant(fork(amy.variant(MAIN)!, 'v-amy', 'Amy’s long house', 'Amy', 1));
    amy.edit({ houseLength: 4.8 }, 'v-amy');
    amy.note({ id: 'p', kind: 'pin', by: 'Amy', colour: '#2f8a4a', t: 2, at: [0.5, 0.9, 0.5], text: 'longer', done: false }, 'v-amy');
    await tick();
    expect(keeper.variants.map((v) => v.name)).toEqual(['Main', 'Amy’s long house']);
    expect(keeper.variant('v-amy')!.design.houseLength).toBe(4.8);
    expect(keeper.design.houseLength).toBe(DEFAULT_DESIGN.houseLength);
    expect(keeper.variant('v-amy')!.notes).toHaveLength(1);
    expect(keeper.notes).toHaveLength(0);
    // A latecomer gets the lot; the keeper deleting it reaches Amy.
    const cat = new Member({ ...DEFAULT_DESIGN }, 'Cat', host.client(), quiet);
    await tick();
    await tick();
    expect(cat.variant('v-amy')!.design.houseLength).toBe(4.8);
    keeper.dropVariant('v-amy');
    await tick();
    expect(amy.variants).toHaveLength(1);
    // Presence: which tab each person is on.
    amy.presence({ variant: 'nope' });
    await tick();
    expect(keeper.people.find((p) => p.name === 'Amy')!.variant).toBe(MAIN);
  });
});
