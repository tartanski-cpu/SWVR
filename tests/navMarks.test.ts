import { describe, expect, it } from 'vitest';
import { MARKS, WRECKS } from '../src/world/archipelago';
import { LIGHT_CHARACTERS, lightOn } from '../src/world/navMarks';
import { groundHeight } from '../src/world/terrain';

/** How many separate flashes start within one period. */
function flashes(pattern: number[]): number {
  const total = pattern.reduce((a, b) => a + b, 0);
  let n = 0;
  let was = lightOn(pattern, total - 0.001);
  for (let t = 0; t < total; t += 0.01) {
    const on = lightOn(pattern, t);
    if (on && !was) n++;
    was = on;
  }
  return n + (lightOn(pattern, 0) && !lightOn(pattern, total - 0.001) ? 0 : 0);
}

describe('navigation marks (IALA)', () => {
  it('lights flash their characters: periods and flash counts', () => {
    const sum = (k: keyof typeof LIGHT_CHARACTERS) => LIGHT_CHARACTERS[k].pattern.reduce((a, b) => a + b, 0);
    expect(sum('N')).toBeCloseTo(1, 5); // Q: one a second
    expect(sum('E')).toBeCloseTo(10, 5);
    expect(sum('S')).toBeCloseTo(15, 5);
    expect(sum('W')).toBeCloseTo(15, 5);
    expect(sum('isolated')).toBeCloseTo(5, 5);
    expect(sum('port')).toBeCloseTo(4, 5);
    expect(flashes(LIGHT_CHARACTERS.E.pattern)).toBe(3);
    expect(flashes(LIGHT_CHARACTERS.S.pattern)).toBe(7); // six quick and the long one
    expect(flashes(LIGHT_CHARACTERS.W.pattern)).toBe(9);
    expect(flashes(LIGHT_CHARACTERS.isolated.pattern)).toBe(2);
    expect(LIGHT_CHARACTERS.port.color).toBe('red');
    expect(LIGHT_CHARACTERS.stbd.color).toBe('green');
  });

  it('buoys float in deep water; the isolated danger mark stands on its rock', () => {
    for (const m of MARKS) {
      if (m.kind === 'isolated') expect(groundHeight(m.x, m.z)).toBeGreaterThan(-2);
      else expect(groundHeight(m.x, m.z)).toBeLessThan(-8);
    }
  });

  it('the hazards are real: the wreck and the reef come up to the surface, and are buoyed', () => {
    for (const w of WRECKS) {
      expect(groundHeight(w.x, w.z)).toBeGreaterThan(-0.5);
      expect(MARKS.some((m) => m.name.startsWith(w.name) && Math.hypot(m.x - w.x, m.z - w.z) < 100)).toBe(true);
    }
    expect(groundHeight(-250, 742)).toBeGreaterThan(-0.5); // Dubh Sgeir reef
    // A north cardinal has its hazard to the south (+z is south): safe water is north of it.
    for (const m of MARKS.filter((k) => k.kind === 'N')) expect(groundHeight(m.x, m.z + 58)).toBeGreaterThan(groundHeight(m.x, m.z - 40));
  });
});
