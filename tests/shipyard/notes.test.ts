/** Pins and marks: hull fractions follow the boat as she's stretched; the to-do list's order. */
import { describe, expect, it } from 'vitest';
import { cleanNote, fromFrac, putNote, toFrac, todo, type Pin } from '../../src/shipyard/notes';

const pin = (id: string, t: number, done = false): Pin => ({ id, kind: 'pin', by: 'A', colour: '#123456', t, at: [0.5, 0.5, 0.5], text: id, done });

describe('notes', () => {
  it('a pin on the roof stays on the roof when she is made longer and higher', () => {
    const min = [-1.4, -0.5, -4.5];
    const max = [1.4, 3.5, 4.5];
    const roof = [0, 3.4, -1];
    const f = toFrac(roof, min, max);
    // Stretched to 11 m and the house raised 0.4 m: the same fractions land on the new roof.
    const p = fromFrac(f, [-1.4, -0.5, -5.5], [1.4, 3.9, 5.5]);
    expect(p[1]).toBeCloseTo(3.4 + (3.4 + 0.5) / 4 * 0.4, 5);
    expect(p[2]).toBeCloseTo((-1 + 4.5) / 9 * 11 - 5.5, 5);
  });

  it('the to-do list: open pins first, oldest first, then done ones', () => {
    const list = todo([pin('c', 3, true), pin('b', 2), pin('a', 1)]);
    expect(list.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('putting a note again by id replaces it; bad notes are null', () => {
    const one = putNote([pin('a', 1)], { ...pin('a', 1), text: 'new' });
    expect(one).toHaveLength(1);
    expect((one[0] as Pin).text).toBe('new');
    expect(cleanNote({ id: 'a', kind: 'pin', at: [0, 0] })).toBeNull();
    expect(cleanNote({ id: 'a', kind: 'blob' })).toBeNull();
    expect((cleanNote({ ...pin('a', 1), text: 'x'.repeat(500) }) as Pin).text).toHaveLength(140);
  });

  it('a pin keeps its equipment and where it went; the old squared profile sheets are dropped', () => {
    const p = cleanNote({ ...pin('a', 1), gear: 'fireMonitor', placed: 'on the foredeck' }) as Pin;
    expect(p.gear).toBe('fireMonitor');
    expect(p.placed).toBe('on the foredeck');
    expect(cleanNote({ id: 's', kind: 'sheet', by: 'A', colour: '#123456', t: 1, title: 'Profile sketch', image: '', aspect: 2.5, grid: { wM: 20, hM: 8, waterY: 2.5 } })).toBeNull();
  });
});
