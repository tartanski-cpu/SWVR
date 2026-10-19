/**
 * The tug diesel has its own voice (owner, Oct 2026), not the workboat six slowed down, matched
 * to the owner's recording of a tug's engines: about 60 firings a second at idle (a six at its
 * idle fired 22: "a single cylinder"), a lope once every eight, clatter on each firing.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';

describe('the tug diesel’s voice', () => {
  it('fires about 60 times a second at idle, lumpy once in eight, with clatter; the other engines keep theirs', () => {
    const tug = ENGINES.findIndex((e) => e.ratedRpm === 1000);
    expect(ENGINES[tug].voice).toBe('bigSix');
    expect(ENGINES.filter((_, i) => i !== tug).map((e) => e.voice)).toEqual(['inlineSix', 'v8', 'v8']);
    const big = CONFIG.engineVoices.bigSix;
    expect(ENGINES[tug].idleRpm).toBe(450);
    const fireAtIdle = (450 * big.cylinders) / 120;
    expect(fireAtIdle).toBeGreaterThan(55);
    expect(fireAtIdle).toBeLessThan(65);
    expect(big.strength).toHaveLength(8);
    expect(big.mech).toBeGreaterThan(0);
    // The others keep their tone free of clatter.
    for (const v of ['inlineSix', 'v8', 'outboardV8'] as const) expect(CONFIG.engineVoices[v].mech).toBe(0);
    // In her recipe: the game plays it.
    const b = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4, engine: tug });
    const engine = b.recipe.modules.find((m) => m.socket === 'engine')!.config as { voice: string };
    expect(engine.voice).toBe('bigSix');
  });
});
