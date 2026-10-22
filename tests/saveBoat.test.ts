/**
 * Save the boat you're aboard to your favourites (Boat > Save her; owner, Oct 2026: from VR,
 * where the Shipyard isn't to hand). Her design code is the one the Shipyard saves.
 */
import { describe, expect, it } from 'vitest';
import { FLEET } from '../src/boats/fleet';
import { boatType, designCodeOf } from '../src/boats/library';
import { designToken, readDesign, sameDesign } from '../src/shipyard/designDoc';
import { readFavourites, type Store } from '../src/shipyard/favourites';
import { saveBoatFavourite, ShipyardCodes } from '../src/shipyard/takeHer';

const memory = (): Store => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe('save the boat you are aboard to your favourites', () => {
  it("every fleet boat and every Shipyard boat in the game has her design code; the old hand-built types don't", () => {
    for (const f of FLEET) {
      const code = designCodeOf(f.id)!;
      expect(code, f.id).toBeTruthy();
      expect(sameDesign(code, designToken(f.design)), f.id).toBe(true);
    }
    const tugCode = designToken(FLEET.find((f) => f.id === 'smallTug')!.design);
    const id = boatType(tugCode)!;
    expect(sameDesign(designCodeOf(id)!, tugCode)).toBe(true);
    expect(designCodeOf('workboat')).toBeNull();
    expect(designCodeOf('barge')).toBeNull();
  });

  it('saved once: again (the same design, any name) is said and changes nothing; a name taken gets a number', () => {
    const tug = designCodeOf('smallTug')!;
    const pilot = designCodeOf('pilotBoat')!;
    let r = saveBoatFavourite([], tug, 'Small tug', '13.0 m', 1);
    expect(r.text).toBe('Saved to your favourites as “Small tug”');
    const list = r.list!;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Small tug', code: tug, picture: '', summary: '13.0 m' });
    r = saveBoatFavourite(list, tug, 'Another name', '', 2);
    expect(r.list).toBeNull();
    expect(r.text).toMatch(/already, as “Small tug”/);
    r = saveBoatFavourite(list, pilot, 'Small tug', '', 3);
    expect(r.list!.map((f) => f.name)).toEqual(['Small tug 2', 'Small tug']);
  });

  it("into this browser's storage, read back as a favourite the menu can launch", () => {
    const store = memory();
    const codes = new ShipyardCodes(() => store);
    expect(codes.saveBoat(designCodeOf('pilotBoat')!, "Bosun's boat", '11.2 m · 9.5 t', 5)).toMatch(/Saved/);
    const favs = readFavourites(store);
    expect(favs).toHaveLength(1);
    expect(favs[0].name).toBe("Bosun's boat");
    expect('design' in readDesign(favs[0].code)).toBe(true);
    expect(codes.favouriteAt(0)?.name).toBe("Bosun's boat");
    // Storage that won't take it: said so.
    const full = new ShipyardCodes(() => ({ getItem: () => null, setItem: () => { throw new Error('full'); } }));
    expect(full.saveBoat(designCodeOf('smallTug')!, 'Tug', '', 6)).toMatch(/won’t save/);
  });
});
