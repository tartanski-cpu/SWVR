/** Shipyard favourites: kept by name in the browser's storage, newest first, never thrown by bad data. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, encodeDesign } from '../../src/shipyard/design';
import { addFavourite, cleanName, FAVOURITES_KEY, MAX_FAVOURITES, readFavourites, removeFavourite, writeFavourites, type Favourite, type Store } from '../../src/shipyard/favourites';

const memory = (): Store & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const code = encodeDesign(DEFAULT_DESIGN);
const fav = (name: string, savedAt: number, c = code): Favourite => ({ name, code: c, savedAt, picture: '', summary: '' });

describe('Shipyard favourites', () => {
  it('saved and read back, newest first', () => {
    const s = memory();
    let list = addFavourite([], fav('First', 1));
    list = addFavourite(list, fav('Second', 2));
    expect(writeFavourites(s, list)).toBe(true);
    expect(readFavourites(s).map((f) => f.name)).toEqual(['Second', 'First']);
  });

  it('saving again under the same name (any case) replaces it; deleting takes it out', () => {
    let list = addFavourite([fav('Pilot', 1)], fav('pilot', 5));
    expect(list).toHaveLength(1);
    expect(list[0].savedAt).toBe(5);
    list = addFavourite(list, fav('Other', 6));
    expect(removeFavourite(list, 'pilot', 5).map((f) => f.name)).toEqual(['Other']);
  });

  it(`keeps at most ${MAX_FAVOURITES}, dropping the oldest`, () => {
    let list: Favourite[] = [];
    for (let i = 0; i < MAX_FAVOURITES + 3; i++) list = addFavourite(list, fav(`B${i}`, i));
    expect(list).toHaveLength(MAX_FAVOURITES);
    expect(list.some((f) => f.name === 'B0')).toBe(false);
  });

  it('bad or missing storage reads as an empty list; entries with unreadable codes are skipped', () => {
    expect(readFavourites(null)).toEqual([]);
    const s = memory();
    s.data[FAVOURITES_KEY] = 'not json';
    expect(readFavourites(s)).toEqual([]);
    s.data[FAVOURITES_KEY] = JSON.stringify([fav('Good', 1), fav('Bad code', 2, 'XXXX'), { nonsense: true }]);
    expect(readFavourites(s).map((f) => f.name)).toEqual(['Good']);
    const full: Store = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(writeFavourites(full, [fav('A', 1)])).toBe(false);
  });

  it('names are tidied; an empty one takes the fallback', () => {
    expect(cleanName('  my   boat \n', 'x')).toBe('my boat');
    expect(cleanName('   ', 'Pilot boat 11.0 m')).toBe('Pilot boat 11.0 m');
    expect(cleanName('a'.repeat(80), 'x')).toHaveLength(40);
  });
});
