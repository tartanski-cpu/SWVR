/**
 * The scenery's cheaper wave samples (CONFIG.ocean.sceneryIterations; review, Oct 2026: the
 * harbour boats', buoys' and marks' samples were a big share of the Quest's frame): within a
 * few centimetres of the boats' own full sample in a moderate sea, still close in a storm.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { seaStateWaves } from '../src/environment/environmentState';
import { prepareWaves, surfaceHeight } from '../src/ocean/waves';

describe('scenery wave samples', () => {
  for (const [name, scale, tol] of [['moderate', 1, 0.05], ['storm', 2.6, 0.2]] as const) {
    it(`${name} sea: within ${tol * 100} cm of the full sample`, () => {
      const waves = prepareWaves(seaStateWaves(scale), 123.4);
      let worst = 0;
      for (let i = 0; i < 400; i++) {
        const x = (i % 20) * 7.3 - 70;
        const z = Math.floor(i / 20) * 6.1 - 60;
        worst = Math.max(worst, Math.abs(surfaceHeight(waves, x, z, CONFIG.ocean.sceneryIterations) - surfaceHeight(waves, x, z)));
      }
      expect(worst).toBeLessThan(tol);
    });
  }
});
