/**
 * The coast extras plan, C4: place names. Where a spot at sea is, in words, as a call would
 * say it ("in Rothesay Bay", "off Toward"), from a coast map's names; none near, none said.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config';
import type { PlaceDef } from '../src/world/defs';
import { placePhrase } from '../src/world/places';
import { OBAN } from '../src/world/regions/oban';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('place names (C4)', () => {
  const places: PlaceDef[] = [
    { name: 'Long Bay', kind: 'bay', x: 0, z: 0, rank: 2 },
    { name: 'Black Point', kind: 'cape', x: 2000, z: 0, rank: 3 },
    { name: 'Portmore', kind: 'town', x: 0, z: 2500, rank: 1 },
    { name: 'The Narrows', kind: 'strait', x: -2400, z: 0, rank: 2 },
  ];

  it('in a bay near its name, off it farther out; off a headland; the more prominent name wins at equal distance', () => {
    expect(placePhrase(200, 100, places)).toBe('in Long Bay');
    expect(placePhrase(0, -CONFIG.places.inside - 200, places)).toBe('off Long Bay');
    expect(placePhrase(1900, 300, places)).toBe('off Black Point');
    // Halfway between a town (rank 1) and a bay (rank 2): the town.
    expect(placePhrase(0, 1250, places)).toBe('off Portmore');
    expect(placePhrase(-2300, 0, places)).toBe('in the Narrows');
    expect(placePhrase(20000, 20000, places)).toBeNull();
  });

  it("Oban's and the Clyde's own names", () => {
    const oban = OBAN.places!;
    expect(oban.length).toBeGreaterThan(30);
    const ganavan = oban.find((p) => p.name === 'Ganavan Bay')!;
    expect(placePhrase(ganavan.x + 100, ganavan.z - 100, oban)).toBe('in Ganavan Bay');
    const clyde = (JSON.parse(readFileSync(join(root, 'public/regions/clyde/package.json'), 'utf8')) as { places: PlaceDef[] }).places;
    const bay = clyde.find((p) => p.name === 'Rothesay Bay')!;
    expect(placePhrase(bay.x, bay.z + 200, clyde)).toBe('in Rothesay Bay');
    // No farms, single houses or town quarters on the charts.
    expect(clyde.some((p) => p.kind === 'farm' || p.kind === 'isolated_dwelling' || p.kind === 'quarter')).toBe(false);
  });
});
