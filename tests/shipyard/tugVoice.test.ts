/** The tug's big slow straight six has its own voice (owner, Oct 2026), not the workboat six slowed down. */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';

describe('the tug diesel’s voice', () => {
  it('is the big six, deeper and with longer pulses than the workboat six; the other engines keep theirs', () => {
    const tug = ENGINES.findIndex((e) => e.ratedRpm === 1000);
    expect(ENGINES[tug].voice).toBe('bigSix');
    expect(ENGINES.filter((_, i) => i !== tug).map((e) => e.voice)).toEqual(['inlineSix', 'v8', 'v8']);
    const big = CONFIG.engineVoices.bigSix;
    const six = CONFIG.engineVoices.inlineSix;
    expect(big.body.freq).toBeLessThan(six.body.freq);
    expect(big.pulseTau).toBeGreaterThan(six.pulseTau);
    // In her recipe: the game plays it.
    const b = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4, engine: tug });
    const engine = b.recipe.modules.find((m) => m.socket === 'engine')!.config as { voice: string };
    expect(engine.voice).toBe('bigSix');
  });
});
