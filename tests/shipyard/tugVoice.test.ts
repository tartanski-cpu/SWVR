/**
 * The big-six voice (owner, Oct 2026) was matched to the owner's recording of a six-cylinder
 * marine diesel idling: six firings a revolution, even, with clatter. The owner tried it on
 * the tug and preferred her old voice, the plain straight six, so the voice stays in the
 * config, unused: no engine names it.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';

describe('the tug diesel’s voice', () => {
  it('the tug diesel speaks with the plain straight six (owner); the big-six voice kept, fires six a revolution, evenly, with clatter', () => {
    const tug = ENGINES.findIndex((e) => e.ratedRpm === 1000);
    expect(ENGINES[tug].voice).toBe('inlineSix');
    expect(ENGINES.filter((_, i) => i !== tug).map((e) => e.voice)).toEqual(['inlineSix', 'v8', 'v8', 'inlineSix', 'v16', 'electric', 'electric']); // (the harbour tug's V16s their own big voice, owner 27 Oct 2026; the last two, the solar catamaran's and the foiling ferry's electric motors: their whine)
    const big = CONFIG.engineVoices.bigSix;
    expect(ENGINES[tug].idleRpm).toBe(450);
    // Six a revolution: 45 Hz at its 450 rpm idle, 100 flat out.
    expect((450 * big.cylinders) / 120).toBe(45);
    expect(big.strength).toHaveLength(6);
    expect(Math.min(...big.strength) / Math.max(...big.strength)).toBeGreaterThan(0.95);
    expect(big.mech).toBeGreaterThan(0);
    // Sized to the tug diesel (the recording's six was smaller, ~1.8 times): its exhaust ringing
    // and clatter lower than the recording's 210 Hz and 400-1400 Hz.
    expect(big.stack.freq).toBeCloseTo(210 / 1.8, 0);
    expect(big.mechBand![1]).toBeLessThan(1400);
    // The others keep their tone free of clatter.
    for (const v of ['inlineSix', 'v8', 'outboardV8'] as const) expect(CONFIG.engineVoices[v].mech).toBe(0);
    // In her recipe: the game plays the straight six.
    const b = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4, engine: tug });
    const engine = b.recipe.modules.find((m) => m.socket === 'engine')!.config as { voice: string };
    expect(engine.voice).toBe('inlineSix');
  });
});
