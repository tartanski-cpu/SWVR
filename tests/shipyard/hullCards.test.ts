/**
 * The first step's hull cards (owner, Oct 2026: the hull types and what each is suitable for,
 * instead of the brief document): hullCards.ts.
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { HULL_ROLES, hullCards } from '../../src/shipyard/hullCards';

describe('the hull cards', () => {
  it('a card for every type offered (not the retired workboat), each with what it is made for', () => {
    const cards = hullCards();
    expect(cards.map((c) => c.title)).toEqual(['Landing craft', 'Gillnetter', 'Pilot boat', 'Small tug', 'Stern trawler', 'Fast catamaran', 'Harbour tug', 'Solar catamaran']);
    expect(HULL_ROLES).toHaveLength(DESIGN_HULLS.length);
    for (const c of cards) {
      expect(c.roles.main.length, c.title).toBeGreaterThan(0);
      expect(c.sub, c.title).not.toBe('');
      expect(c.figures.map((f) => f.label)).toEqual(['Speed', 'Deck', 'Pull']);
    }
  });

  it('says what the owner asked: cargo for the landing craft, rescue and fire for the pilot boat, heavy tows for the tug', () => {
    const roles = (t: string) => hullCards().find((c) => c.title === t)!.roles;
    expect(roles('Landing craft').main).toContain('Cargo');
    expect(roles('Pilot boat').main).toEqual(expect.arrayContaining(['Search & rescue', 'Fire']));
    expect(roles('Pilot boat').light).toContain('Light towing');
    expect(roles('Small tug').main).toContain('Heavy towing');
    expect(roles('Gillnetter').main).toContain('Fishing');
    expect(roles('Gillnetter').light).toContain('Light towing');
  });
});
