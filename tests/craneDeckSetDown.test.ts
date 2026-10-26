/**
 * A crane's load lowered over her own deck goes on her deck: under the hook if it fits there,
 * else the nearest clear spot (within about a metre), never taken for "over the side" (owner,
 * Oct 2026: a cardinal buoy lowered onto the cargo deck was refused, "lower it to the water").
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { useDesign } from '../src/boats/sims';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { craneStateOf, cranesOf, hookOnBoat } from '../src/cargo/craneHook';
import { deckHeightAt as deckHeight, hookNote, kindOf } from '../src/cargo/cargo';
import { deckSpot, onOpenDeck, overDeck } from '../src/cargo/deck';
import { startEngine } from './helpers/engine';

const DT = 1 / 60;

describe('the deck crane setting a load down on her own deck', () => {
  it('a buoy lowered over the deck just off a clear patch goes on the deck nearby, not "lower it to the water"', () => {
    useDesign({ ...DEFAULT_DESIGN, deckCrane: 1 });
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    world.environment.waves = [];
    world.geography = 'openSea';
    const v = world.vessels[vesselId];
    startEngine(world, v);
    for (const id of Object.keys(world.cargo)) delete world.cargo[id];
    const path = cranesOf(v)[0].path;
    const s = craneStateOf(v, path)!;
    const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === CONFIG.career.projectBuoy.kind);
    world.cargo.b1 = { id: 'b1', kind, mass: CONFIG.cargo.kinds[kind].mass, from: 'x', to: 'y', at: { hook: v.id, crane: path } };
    s.hooked = 'b1';
    const item = world.cargo.b1;
    const half = kindOf(item).size[0] / 2;
    const f = { hx: half, hz: half };
    // Somewhere the crane reaches over her deck where the buoy doesn't fit right under the
    // hook (the old rule: refused) but a clear spot is close by.
    let found: { slew: number; luff: number } | null = null;
    for (let slew = -170; slew <= 170 && !found; slew += 5)
      for (let luff = -5; luff <= 70 && !found; luff += 5) {
        Object.assign(s, { slew, luff, wire: 1 });
        const h = hookOnBoat(v, path)!;
        if (!overDeck(v.defId, h.x, h.z) || onOpenDeck(v.defId, f, h.x, h.z)) continue;
        const spot = deckSpot(v.defId, f, h.x, h.z, []);
        if (spot && Math.hypot(spot.x - h.x, spot.z - h.z) < 0.8) found = { slew, luff };
      }
    expect(found).not.toBeNull();
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
    send('crane.slew', found!.slew);
    send('crane.luff', found!.luff);
    for (let i = 0; i < 12 / DT; i++) stepWorld(world, [], DT);
    // Lowered to the deck.
    const hook = hookOnBoat(v, path)!;
    const deckY = deckHeight(v.defId, hook.z);
    s.wire += hook.y - kindOf(item).size[1] - deckY - 0.3;
    send('crane.wire', s.wire);
    for (let i = 0; i < 4 / DT; i++) stepWorld(world, [], DT);
    expect(hookNote(world, v)).toBeNull();
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect('vessel' in world.cargo.b1.at).toBe(true);
  });
});
