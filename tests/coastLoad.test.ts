/**
 * Turku's load (owner: "The Turku map takes a while to load ... make sure it's not doing the
 * same thing as the Firth of Clyde map with all the piers"): the start-up work that went over
 * every pier on the map now goes by a grid, with the same answers. Here the piers' drawing
 * steps (world/blockSteps.ts) against the old way, every block against every earlier one, on
 * every coast map; and Turku's done in a fraction of the time.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { blockSteps, blocksOverlap } from '../src/world/blockSteps';
import type { BlockDef } from '../src/world/defs';

/** The steps as they were worked out before: each block against every earlier one. */
function everyPair(blocks: readonly BlockDef[]): number[] {
  const steps: number[] = [];
  blocks.forEach((b, i) => {
    const used = new Set<number>();
    for (let j = 0; j < i; j++) if (Math.abs(blocks[j].top - b.top) < 0.01 && blocksOverlap(blocks[j], b)) used.add(steps[j]);
    let s = 0;
    while (used.has(s)) s++;
    steps.push(s);
  });
  return steps;
}

describe('the piers\' drawing steps by a grid (Turku\'s load)', () => {
  for (const f of ['public/regions/turku/package.json', 'public/regions/clyde/package.json', 'public/regions/syros/package.json', 'src/world/regions/oban.coast.json', 'src/world/regions/tayvallich.coast.json']) {
    it(`the same steps as every pair, ${f.split('/').slice(-2).join('/')}`, () => {
      const blocks = (JSON.parse(readFileSync(f, 'utf8')) as { blocks: BlockDef[] }).blocks;
      expect(blockSteps(blocks)).toEqual(everyPair(blocks));
    });
  }

  it("Turku's 3,276 pieces in well under a quarter of a second", () => {
    const blocks = (JSON.parse(readFileSync('public/regions/turku/package.json', 'utf8')) as { blocks: BlockDef[] }).blocks;
    expect(blocks.length).toBeGreaterThan(3000);
    const t0 = performance.now();
    blockSteps(blocks);
    expect(performance.now() - t0).toBeLessThan(250);
  });
});
