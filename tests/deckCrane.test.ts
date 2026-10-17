/**
 * The placeable deck crane (modules/deckCrane, cargo/craneHook): on a Shipyard design it
 * moves only with hydraulic pressure, at its own rates, and its HOOK takes cargo under it,
 * hangs it under the hook (its weight on the boat there), and sets it down again.
 */
import { describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { deckHeightAt, payloadOf, type CargoItem } from '../src/cargo/cargo';
import { craneStateOf, cranesOf, hookOnBoat } from '../src/cargo/craneHook';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { busOf } from '../src/modular/bus';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { startEngine } from './helpers/engine';

const DT = 1 / 60;
const crane = CONFIG.modules.deckCrane;

function setup(deckCrane: number) {
  useDesign({ ...DEFAULT_DESIGN, deckCrane });
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  world.environment.waves = [];
  world.geography = 'openSea';
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const path = cranesOf(v)[0]?.path;
  return { world, v, send, run, path };
}

describe('deck crane', { timeout: 30000 }, () => {
  it('only a design with one has it, and its keys', () => {
    const none = setup(0);
    expect(cranesOf(none.v)).toEqual([]);
    expect(busOf(none.v).has('crane.slew')).toBe(false);
    for (const at of [1, 2]) {
      const { v, path } = setup(at);
      expect(path).toBeDefined();
      expect(busOf(v).has('crane.slew')).toBe(true);
      expect(busOf(v).get('crane.luff')).toBe(crane.stow.luffDeg); // the stick untouched: stowed
    }
  });

  it('holds without hydraulic pressure, then slews, luffs and hoists at its own rates', () => {
    const { world, v, send, run, path } = setup(1);
    send('crane.slew', 90);
    send('crane.luff', 40);
    run(2);
    expect(craneStateOf(v, path!)!.slew).toBe(crane.stow.slewDeg); // engine off: no pressure
    startEngine(world, v);
    run(1);
    const s = craneStateOf(v, path!)!;
    expect(s.slew).toBeGreaterThan(crane.slewRateDeg * 0.5);
    expect(s.slew).toBeLessThan(90);
    run(6);
    expect(s.slew).toBeCloseTo(90, 5);
    expect(s.luff).toBeCloseTo(40, 5);
    const wire = s.wire;
    send('crane.hoistDown', 1);
    run(2);
    send('crane.hoistDown', 0);
    expect(s.wire).toBeCloseTo(wire + 2 * crane.hoistRate, 1);
  });

  it('hooks a crate on her deck, carries its weight at the hook, and sets it down on deck', () => {
    const { world, v, send, run, path } = setup(1);
    startEngine(world, v);
    // Boom raised over her foredeck (the crane stows pointing forward), and let it get there.
    send('crane.luff', 50);
    run(5);
    const s = craneStateOf(v, path!)!;
    const hook = hookOnBoat(v, path!)!;
    // A crate on deck under the hook, and the hook lowered to its top.
    const kind = CONFIG.cargo.kinds.findIndex((k) => k.mass <= crane.swlKg);
    const h = CONFIG.cargo.kinds[kind].size[1];
    const deckY = deckHeightAt(v.defId, hook.z);
    const item: CargoItem = { id: 'c1', kind, mass: CONFIG.cargo.kinds[kind].mass, from: 'calder', to: 'brannock', at: { vessel: v.id, pos: [hook.x, deckY, hook.z], yaw: 0, vel: [0, 0], lashed: false } };
    world.cargo.c1 = item;
    s.wire += hook.y - (deckY + h);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect(item.at).toEqual({ hook: v.id, crane: path });
    expect(s.hooked).toBe('c1');
    // Its weight bears at the hook.
    const p = payloadOf(world, v.id);
    expect(p.reduce((m, x) => m + x.mass, 0)).toBeGreaterThanOrEqual(item.mass);
    // Hoist it up and down again, then set it down: back on her deck.
    send('crane.hoistUp', 1);
    run(3);
    send('crane.hoistUp', 0);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect('hook' in item.at).toBe(true); // too high to set down
    send('crane.hoistDown', 1);
    run(3);
    send('crane.hoistDown', 0);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect('vessel' in item.at).toBe(true);
    expect(s.hooked).toBeNull();
  });

  it('won\'t lift more than its safe working load', () => {
    const { world, v, send, run, path } = setup(1);
    startEngine(world, v);
    send('crane.luff', 50);
    run(5);
    const s = craneStateOf(v, path!)!;
    const hook = hookOnBoat(v, path!)!;
    const deckY = deckHeightAt(v.defId, hook.z);
    world.cargo.big = { id: 'big', kind: 0, mass: crane.swlKg + 100, from: 'calder', to: 'brannock', at: { vessel: v.id, pos: [hook.x, deckY, hook.z], yaw: 0, vel: [0, 0], lashed: false } };
    s.wire += hook.y - (deckY + CONFIG.cargo.kinds[0].size[1]);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect('vessel' in world.cargo.big.at).toBe(true);
    expect(s.hooked).toBeNull();
  });
});
