/**
 * Voyage mode (src/mode.ts, world/maps.ts; owner, Oct 2026): a coast-pipeline map sailed on
 * its own from the landing page. Each map's start berth must be one of its own berths, in a
 * harbour, so the boat starts moored where the player can walk ashore.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOYAGE_MAPS, mapRegion, voyageMap } from '../src/world/maps';
import { setRemotePackage } from '../src/world/coastRegion';
import { MODE } from '../src/mode';

// A big map's package is fetched by the page (main.ts); here, read from disk.
beforeAll(() => {
  for (const m of VOYAGE_MAPS) if (m.remote) setRemotePackage(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'regions', m.id, 'package.json'), 'utf8')));
});

describe('voyage mode maps', () => {
  it('each map starts at one of its own berths, in a harbour; ids unique', () => {
    expect(VOYAGE_MAPS.length).toBeGreaterThan(0);
    expect(new Set(VOYAGE_MAPS.map((m) => m.id)).size).toBe(VOYAGE_MAPS.length);
    for (const m of VOYAGE_MAPS) {
      const region = mapRegion(m);
      expect(region.coast).toBeTruthy();
      const b = region.berths.find((x) => x.id === m.startBerth);
      expect(b, `${m.id}: start berth ${m.startBerth}`).toBeTruthy();
      const port = region.ports.find((p) => p.id === b!.portId);
      expect(port?.kind).toBe('harbour');
    }
    expect(voyageMap('oban')?.name).toBe('Oban and Lorn');
    expect(voyageMap('nowhere')).toBeUndefined();
  });

  it('with no page (the tests) the mode is the career game', () => {
    expect(MODE).toBe('career');
  });
});
