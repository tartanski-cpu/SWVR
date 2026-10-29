/**
 * The career's Shipyard signs (ui/shipyardDoor.ts careerShipyardSpots; owner, Oct 2026: the
 * Shipyard button "should be in career mode too", at any harbour): one on the quay at every
 * harbour of the career world, on level ground.
 */
import { farmAt } from '../src/aqua/farmService';
import { describe, expect, it } from 'vitest';
import { careerShipyardSpots } from '../src/ui/shipyardDoor';
import { PORTS } from '../src/world/archipelago';
import { REGIONS } from '../src/world/regions';

describe('career Shipyard signs', () => {
  it('stands one at every harbour with a berth, ashore', () => {
    const spots = careerShipyardSpots();
    // (Not a fish farm's feed barge: aqua/farmService.ts.)
    const withBerth = PORTS.filter((p) => !farmAt(p.id) && REGIONS.some((r) => r.berths.some((b) => b.portId === p.id)));
    expect(withBerth.length).toBeGreaterThan(3);
    expect(spots.length).toBe(withBerth.length);
    for (const s of spots) {
      expect(s.y).toBeGreaterThan(0.2); // on the quay, not in the water
      expect(Number.isFinite(s.farHeading)).toBe(true);
    }
  });
});

describe('the Your boats board', () => {
  it('lists the favourites saved in this browser, a page at a time, each with its button to take her out', async () => {
    const { boatsBoardRows } = await import('../src/ui/shipyardDoor');
    const { ShipyardCodes } = await import('../src/shipyard/takeHer');
    const { designCodeOf } = await import('../src/boats/library');
    const code = designCodeOf('pilotBoat')!;
    const saved = JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ name: `Boat ${i + 1}`, code, savedAt: 10 - i, picture: '', summary: '' })));
    const codes = new ShipyardCodes(() => ({ getItem: () => saved, setItem: () => {} }));
    const taken: string[] = [];
    const rows = boatsBoardRows({ shipyardCodes: () => codes, takeDesign: (c) => void taken.push(c), takeLabel: () => 'Sea trial (5 min)', boatNow: () => 'The beginner boat' });
    const lab = (b: { text: string | (() => string) }) => (typeof b.text === 'function' ? b.text() : b.text);
    const texts = () => rows.flatMap((r) => ('buttons' in r ? r.buttons.map(lab) : []));
    expect(texts()).toContain('Now: The beginner boat');
    expect(texts()).toContain('Boat 1');
    expect(texts()).toContain('Page 1 of 2');
    // Take the second one out.
    const second = rows.find((r) => 'buttons' in r && lab(r.buttons[0]) === 'Boat 2')!;
    expect('buttons' in second && lab(second.buttons[1])).toBe('Sea trial (5 min)');
    if ('buttons' in second) second.buttons[1].press!();
    expect(taken).toEqual([code]);
    // The next page.
    const arrows = rows.find((r) => 'buttons' in r && r.buttons.some((b) => lab(b) === '▶'))!;
    if ('buttons' in arrows) arrows.buttons[2].press!();
    expect(texts()).toContain('Boat 6');
    expect(texts()).toContain('Page 2 of 2');
  });
});
