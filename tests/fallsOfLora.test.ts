/**
 * The Falls of Lora (Oban map): a fast tide with standing waves and overfalls, and no
 * whirlpools (owner, Oct 2026: "there's not a whirlpool at the Falls of Lora"). A real-coast
 * race has whirls only where its region request gives them (tools/coast/requests, `whirls`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { knockPoints } from '../src/world/currents';
import type { CurrentZoneDef } from '../src/world/defs';

describe('the Falls of Lora', () => {
  it('runs fast with standing waves, and has no whirl points', () => {
    const pkg = JSON.parse(readFileSync('src/world/regions/oban.coast.json', 'utf8')) as { currents: CurrentZoneDef[] };
    const falls = pkg.currents.find((c) => c.id === 'falls-of-lora')!;
    expect(falls.peakKn).toBeGreaterThanOrEqual(6);
    expect(falls.waveFactor).toBeGreaterThan(1);
    expect(falls.knocks).toBe(0);
    expect(knockPoints(falls)).toEqual([]);
    // The pipeline gives none unless the request asks.
    expect(readFileSync('tools/coast/src/package.ts', 'utf8')).toMatch(/knocks: c\.whirls \?\? 0/);
  });
});
