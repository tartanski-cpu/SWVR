/**
 * The handheld rod's game (owner, Oct 2026): cast, wait, a bite to strike at, play the fish
 * on the line's tension, land it; let go of the rod and it's all wound in.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { RodGame, type RodInput } from '../src/fishing/rodGame';

const DT = 1 / 60;
const input = (o: Partial<RodInput> = {}): RodInput => ({
  held: true,
  pressed: false,
  down: false,
  tip: { x: 0, y: 2, z: 0 },
  dir: { x: 0, y: -0.2, z: -1 },
  waterAt: () => 0,
  clearWater: () => true,
  boatSpeed: 0,
  ...o,
});
/** Run until the game says something (or `max` s pass). */
function until(g: RodGame, inp: RodInput, max = 120): string | null {
  for (let t = 0; t < max; t += DT) {
    const ev = g.step(DT, inp);
    if (ev) return ev;
  }
  return null;
}

describe('the rod game', () => {
  it('a press casts the float out along the rod onto open water; not under way, not onto the boat or the shore', () => {
    const g = new RodGame(() => 0.5);
    expect(g.step(DT, input({ pressed: true, boatSpeed: 3 }))).toBeNull();
    expect(g.step(DT, input({ pressed: true, clearWater: () => false }))).toBeNull();
    expect(g.phase).toBe('idle');
    expect(g.step(DT, input({ pressed: true }))).toBe('cast');
    expect(g.phase).toBe('waiting');
    expect(g.float.z).toBeCloseTo(-CONFIG.rod.castRange, 3);
    expect(g.float.y).toBe(0);
  });

  it('a bite comes in its time; miss it and it lets go; strike and the fish is on', () => {
    const g = new RodGame(() => 0.5);
    g.step(DT, input({ pressed: true }));
    expect(until(g, input())).toBe('bite');
    expect(g.phase).toBe('bite');
    expect(until(g, input(), CONFIG.rod.biteWindow + 1)).toBe('missed');
    expect(g.phase).toBe('waiting');
    expect(until(g, input())).toBe('bite');
    expect(g.step(DT, input({ pressed: true }))).toBe('strike');
    expect(g.phase).toBe('playing');
    expect(g.fish).not.toBeNull();
    expect(g.fish!.kg).toBeGreaterThan(0);
  });

  it('reel without a rest and the line parts; reel and rest by the tension and the fish is landed', () => {
    const hook = () => {
      const g = new RodGame(() => 0.9); // a big one
      g.step(DT, input({ pressed: true }));
      until(g, input());
      g.step(DT, input({ pressed: true }));
      return g;
    };
    const greedy = hook();
    expect(until(greedy, input({ down: true }), 60)).toBe('broke');
    expect(greedy.phase).toBe('idle');
    const careful = hook();
    let ev: string | null = null;
    for (let t = 0; t < 300 && !ev; t += DT) ev = careful.step(DT, input({ down: careful.tension < 0.7 }));
    expect(ev).toBe('landed');
    expect(careful.landed?.kg).toBeGreaterThan(0);
    expect(careful.phase).toBe('idle');
  });

  it('let go of the rod and the line is wound in', () => {
    const g = new RodGame(() => 0.5);
    g.step(DT, input({ pressed: true }));
    expect(g.step(DT, input({ held: false }))).toBe('wound');
    expect(g.phase).toBe('idle');
    expect(g.step(DT, input({ held: false }))).toBeNull();
  });
});
