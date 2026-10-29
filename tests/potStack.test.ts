/**
 * Pots stack (owner, 29 Oct 2026: "I'd like the fishing pots to stack on the deck and quayside";
 * cargo/stack.ts): ordered on the quay they stand three high; loaded, they stack aboard; set down
 * by hand over a stack, on top; only the top one comes off; a stack rides and is lashed as one;
 * if what a pot stands on goes, it drops.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { aboard, deckHeightAt, kindOf } from '../src/cargo/cargo';
import { waitingHere } from '../src/cargo/order';
import { levelOf, restingOn } from '../src/cargo/stack';
import { isPot } from '../src/potting/potting';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';

const DT = 1 / 60;
const calder = PORTS.find((p) => p.id === 'calder')!;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const b = calder.cargo.berth!;
  placeVessel(v, b.x, 0, b.z, 0);
  const send = (control: string, value = 1, ref?: string, args?: number[], target = v.id) =>
    stepWorld(world, [{ playerId: localPlayerId, targetId: target, control, value, ref, ...(args ? { args } : {}) } as Intent], DT);
  return { world, v, send, me: localPlayerId };
}

const high = CONFIG.cargo.stacking.high;

describe('pots stack, on the quay and on deck', () => {
  it('ordered on the quay they stand in stacks, three high', () => {
    const { world, send } = setup();
    send('cargoOrder', 7, 'calder', [2]);
    const pots = waitingHere(world, calder, 'pots');
    expect(pots).toHaveLength(7);
    const levels = pots.map((p) => levelOf(world, p)).sort();
    expect(Math.max(...levels)).toBe(high);
    // Seven pots: two full stacks and one pot on its own.
    expect(levels.filter((l) => l === 1)).toHaveLength(Math.ceil(7 / high));
    // Each sits on the top of the one below, square with it.
    const h = kindOf(pots[0]).size[1];
    for (const p of pots) {
      if (!('ground' in p.at) || !p.at.on) continue;
      const under = world.cargo[p.at.on];
      expect('ground' in under.at).toBe(true);
      if (!('ground' in under.at)) continue;
      expect(p.at.ground[1]).toBeCloseTo(under.at.ground[1] + h, 6);
      expect(Math.hypot(p.at.ground[0] - under.at.ground[0], p.at.ground[2] - under.at.ground[2])).toBeLessThan(1e-6);
      expect(p.at.yaw).toBe(under.at.yaw);
    }
  });

  it('only the top one comes off a stack', () => {
    const { world, send } = setup();
    send('cargoOrder', 2, 'calder', [2]);
    const [bottom, top] = waitingHere(world, calder, 'pots').sort((a, b) => levelOf(world, a) - levelOf(world, b));
    expect(restingOn(world, bottom)?.id).toBe(top.id);
    send('cargoTake', 1, bottom.id);
    expect('ground' in bottom.at).toBe(true);
    send('cargoTake', 1, top.id);
    expect('carriedBy' in top.at).toBe(true);
    // With the top one off, the bottom one comes free.
    send('cargoTake', 1, bottom.id);
    expect('carriedBy' in bottom.at).toBe(true);
  });

  it('loaded aboard, they stack on her deck: a full load of pots needs a third of the deck', () => {
    const { world, v, send } = setup();
    send('cargoOrder', 6, 'calder', [2]);
    send('potQuickLoad');
    const pots = aboard(world, v.id).filter(isPot);
    expect(pots).toHaveLength(6);
    const bottoms = pots.filter((p) => !('vessel' in p.at && p.at.on));
    expect(bottoms).toHaveLength(2);
    for (const p of pots) expect(levelOf(world, p)).toBeLessThanOrEqual(high);
    // Stacked pots sit a pot's height up per level.
    const h = kindOf(pots[0]).size[1];
    for (const p of pots) {
      if (!('vessel' in p.at)) continue;
      expect(p.at.pos[1]).toBeCloseTo(deckHeightAt(v.defId, p.at.pos[2]) + (levelOf(world, p) - 1) * h, 6);
    }
  });

  it('set down by hand over a stack, a pot goes on top', () => {
    const { world, v, send } = setup();
    send('cargoOrder', 2, 'calder', [2]);
    send('potQuickLoad');
    const [first] = aboard(world, v.id).filter((p) => isPot(p) && !restingOn(world, p));
    const third = (() => {
      send('cargoOrder', 1, 'calder', [2]);
      return waitingHere(world, calder, 'pots')[0];
    })();
    send('cargoTake', 1, third.id);
    expect('carriedBy' in third.at).toBe(true);
    const at = first.at as { pos: number[] };
    send('cargoPlace', 1, third.id, [at.pos[0] + 0.1, at.pos[1] + 1, at.pos[2] - 0.1, 0]);
    expect('vessel' in third.at && third.at.on).toBe(first.id);
    expect(levelOf(world, third)).toBe(3);
  });

  it('a stack rides and is lashed as one; if what a pot stands on goes, it drops to the deck', () => {
    const { world, v, send } = setup();
    send('cargoOrder', 3, 'calder', [2]);
    send('potQuickLoad');
    const pots = aboard(world, v.id).filter(isPot);
    const bottom = pots.find((p) => !('vessel' in p.at && p.at.on))!;
    const top = pots.find((p) => levelOf(world, p) === 3)!;
    // Lashing the top straps the stack (its bottom).
    send('cargoLash', 0, top.id);
    expect((bottom.at as { lashed: boolean }).lashed).toBe(false);
    send('cargoLash', 1, top.id);
    expect((bottom.at as { lashed: boolean }).lashed).toBe(true);
    expect((top.at as { lashed: boolean }).lashed).toBe(true);
    // The bottom moved (as if it slid): the stack goes with it.
    const b = bottom.at as { pos: number[] };
    b.pos = [b.pos[0] + 0.3, b.pos[1], b.pos[2]];
    send('cargoQuickLash', 1);
    expect((top.at as { pos: number[] }).pos[0]).toBeCloseTo(b.pos[0], 6);
    // The bottom one gone (over the side): the others drop to the deck.
    delete world.cargo[bottom.id];
    send('cargoQuickLash', 1);
    const middle = pots.find((p) => p.id !== bottom.id && p.id !== top.id)!;
    const m = middle.at as { pos: number[]; on?: string };
    expect(m.on).toBeUndefined();
    expect(m.pos[1]).toBeCloseTo(deckHeightAt(v.defId, m.pos[2]), 6);
    // The top now rests on the middle one.
    expect(levelOf(world, top)).toBe(2);
  });

  it('shooting from the deck takes the top of a stack', () => {
    const { world, v, send } = setup();
    send('cargoOrder', 3, 'calder', [2]);
    send('potQuickLoad');
    const top = aboard(world, v.id).find((p) => isPot(p) && levelOf(world, p) === 3)!;
    send('potQuickShoot');
    expect(world.cargo[top.id]).toBeUndefined();
    expect(aboard(world, v.id).filter(isPot)).toHaveLength(2);
  });
});
