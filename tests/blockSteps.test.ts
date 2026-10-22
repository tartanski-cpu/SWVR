/**
 * Overlapping quay and pier blocks are drawn apart (world/blockSteps.ts; owner: z-fighting
 * where quaysides intersect). On every coast map, no two blocks that overlap at one deck
 * height share a drawing step, and it takes only a few steps.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { blocksOverlap, blockSteps } from '../src/world/blockSteps';
import type { BlockDef } from '../src/world/defs';

const block = (x: number, z: number, halfLength: number, halfWidth: number, yawDeg: number, top = 2.4): BlockDef => ({ kind: 'pier', x, z, halfLength, halfWidth, yawDeg, top, fendered: true });

describe('overlapping blocks drawn apart', () => {
  it('overlap in plan, turned any way; apart when they only meet or lie clear', () => {
    expect(blocksOverlap(block(0, 0, 10, 3, 0), block(0, 18, 10, 3, 0))).toBe(true); // two runs of one pier, ends overlapping
    expect(blocksOverlap(block(0, 0, 10, 3, 0), block(0, 20, 10, 3, 0))).toBe(false); // end to end, touching
    expect(blocksOverlap(block(0, 0, 10, 1, 45), block(-6, 6, 10, 1, 45))).toBe(true); // along its diagonal
    expect(blocksOverlap(block(0, 0, 10, 1, 45), block(6, 6, 10, 1, 45))).toBe(false); // side by side, clear
    // An L: two runs meeting at a right angle, the corner shared.
    expect(blocksOverlap(block(0, 0, 10, 3, 0), block(9, 10, 10, 3, 90))).toBe(true);
  });

  it('a pier in three overlapping runs: each run a step apart from its neighbours; another deck height is no matter', () => {
    const runs = [block(0, 0, 11, 3, 0), block(0, 20, 11, 3, 0), block(0, 40, 11, 3, 0), block(0, 20, 11, 3, 0, 0.5)];
    const s = blockSteps(runs);
    expect(s[0]).not.toBe(s[1]);
    expect(s[1]).not.toBe(s[2]);
    expect(s[3]).toBe(0); // a pontoon under it: another deck height, it doesn't flicker with them
  });

  it('on every coast map, no overlapping pair at one deck height shares a step, and a few steps do it', () => {
    for (const f of ['public/regions/clyde/package.json', 'public/regions/syros/package.json', 'src/world/regions/oban.coast.json', 'src/world/regions/tayvallich.coast.json']) {
      const blocks = (JSON.parse(readFileSync(f, 'utf8')) as { blocks: BlockDef[] }).blocks;
      const s = blockSteps(blocks);
      let pairs = 0;
      for (let i = 0; i < blocks.length; i++)
        for (let j = i + 1; j < blocks.length; j++)
          if (Math.abs(blocks[i].top - blocks[j].top) < 0.01 && blocksOverlap(blocks[i], blocks[j])) {
            pairs++;
            expect(s[i], `${f} blocks ${i} and ${j}`).not.toBe(s[j]);
          }
      if (f.includes('clyde')) expect(pairs).toBeGreaterThan(50);
      // The deepest step is still a few centimetres: not to be seen.
      expect(Math.max(...s) * CONFIG.render.blockStepM, f).toBeLessThan(0.1);
    }
  });
});
