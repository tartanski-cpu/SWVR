import type { MarkKind } from './archipelago';

/**
 * The lights on the buoys (world/archipelago.ts MARKS): the IALA characters, so they can be
 * told apart at night by their rhythm alone, as at sea.
 *   N         Q          white, quick: flashing continuously (60 a minute)
 *   E         Q(3) 10s   three quick flashes every 10 s (3 o'clock)
 *   S         Q(6)+LFl 15s  six quick and a long flash every 15 s (6 o'clock)
 *   W         Q(9) 15s   nine quick flashes every 15 s (9 o'clock)
 *   isolated  Fl(2) 5s   two white flashes every 5 s
 *   port      Fl R 4s    a red flash every 4 s
 *   stbd      Fl G 4s    a green flash every 4 s
 * A pattern is on, off, on, off... durations (s) repeating; its sum is the period.
 */
export interface LightCharacter {
  color: 'white' | 'red' | 'green';
  pattern: number[];
  /** As it's written on the chart. */
  label: string;
}

/** Quick flash: 60 a minute. */
const Q = [0.3, 0.7];
const quick = (n: number) => Array.from({ length: n }, () => Q).flat();
/** Pad the last dark interval so the pattern lasts `period` s. */
function period(p: number[], total: number): number[] {
  const out = p.slice();
  const sum = out.reduce((a, b) => a + b, 0);
  out[out.length - 1] += Math.max(0, total - sum);
  return out;
}

export const LIGHT_CHARACTERS: Record<MarkKind, LightCharacter> = {
  N: { color: 'white', pattern: Q, label: 'Q' },
  E: { color: 'white', pattern: period(quick(3), 10), label: 'Q(3) 10s' },
  S: { color: 'white', pattern: period([...quick(6), 2.0, 1.0], 15), label: 'Q(6)+LFl 15s' },
  W: { color: 'white', pattern: period(quick(9), 15), label: 'Q(9) 15s' },
  isolated: { color: 'white', pattern: period([0.5, 1.0, 0.5, 1.0], 5), label: 'Fl(2) 5s' },
  port: { color: 'red', pattern: period([0.5, 0.5], 4), label: 'Fl R 4s' },
  stbd: { color: 'green', pattern: period([0.5, 0.5], 4), label: 'Fl G 4s' },
};

/** Is a light with this pattern lit at time `t` (s)? `phase` staggers lights of the same kind. */
export function lightOn(pattern: number[], t: number, phase = 0): boolean {
  const total = pattern.reduce((a, b) => a + b, 0);
  let u = (((t + phase) % total) + total) % total;
  for (let i = 0; i < pattern.length; i++) {
    if (u < pattern[i]) return i % 2 === 0;
    u -= pattern[i];
  }
  return false;
}
