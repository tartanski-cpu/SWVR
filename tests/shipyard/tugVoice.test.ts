/**
 * The tug diesel, the big straight six, has its own voice (owner, Oct 2026), matched to the
 * owner's recording of a six-cylinder marine diesel idling: six firings a revolution (70 a
 * second in the recording; a four-stroke six at the tug's idle fired 22: "a single
 * cylinder"), even, with clatter. Only the big six has it.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';

describe('the tug diesel’s voice', () => {
  it('fires six times a revolution, evenly, with clatter; only the big six has it', () => {
    const tug = ENGINES.findIndex((e) => e.ratedRpm === 1000);
    expect(ENGINES[tug].voice).toBe('bigSix');
    expect(ENGINES.filter((_, i) => i !== tug).map((e) => e.voice)).toEqual(['inlineSix', 'v8', 'v8']);
    const big = CONFIG.engineVoices.bigSix;
    expect(ENGINES[tug].idleRpm).toBe(450);
    // Six a revolution: 45 Hz at its 450 rpm idle, 100 flat out.
    expect((450 * big.cylinders) / 120).toBe(45);
    expect(big.strength).toHaveLength(6);
    expect(Math.min(...big.strength) / Math.max(...big.strength)).toBeGreaterThan(0.95);
    expect(big.mech).toBeGreaterThan(0);
    // The others keep their tone free of clatter.
    for (const v of ['inlineSix', 'v8', 'outboardV8'] as const) expect(CONFIG.engineVoices[v].mech).toBe(0);
    // In her recipe: the game plays it.
    const b = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4, engine: tug });
    const engine = b.recipe.modules.find((m) => m.socket === 'engine')!.config as { voice: string };
    expect(engine.voice).toBe('bigSix');
  });
});
