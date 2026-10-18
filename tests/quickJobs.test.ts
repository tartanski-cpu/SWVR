import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { aboard, quickLoadable, quickUnloadable } from '../src/cargo/cargo';
import { isPot } from '../src/potting/potting';
import { distanceToHull, vesselToWorld } from '../src/rescue/recovery';
import { placeVessel } from '../src/vessel/vesselControl';
import { POTTING_GROUNDS, PORTS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value, ref } as Intent], DT);
  const at = (portId: string) => {
    const b = PORTS.find((p) => p.id === portId)!.cargo.berth!;
    placeVessel(v, b.x, 0, b.z, 0);
  };
  return { world, v, send, at };
}

describe('quick jobs from the menu: the same rules, no walking', () => {
  it('load at a port: what waits there for elsewhere goes aboard, lashed; unload at its port: delivered and paid', () => {
    const { world, v, send, at } = setup();
    // At sea: nothing to load.
    placeVessel(v, 0, 0, -400, 0);
    expect(quickLoadable(world, v)).toHaveLength(0);
    send('cargoQuickLoad');
    expect(aboard(world, v.id)).toHaveLength(0);
    at('calder');
    const waiting = quickLoadable(world, v);
    expect(waiting.length).toBeGreaterThan(0);
    send('cargoQuickLoad');
    const loaded = aboard(world, v.id);
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.every((c) => 'vessel' in c.at && c.at.lashed)).toBe(true);
    // Release and lash all.
    send('cargoQuickLash', 0);
    expect(aboard(world, v.id).some((c) => 'vessel' in c.at && c.at.lashed)).toBe(false);
    send('cargoQuickLash', 1);
    expect(aboard(world, v.id).every((c) => 'vessel' in c.at && c.at.lashed)).toBe(true);
    // Nothing aboard is for Calder: unloading here lands nothing.
    expect(quickUnloadable(world, v)).toHaveLength(0);
    // Take it to where the first item is bound.
    // (A port with a berth: anchorage ports are worked at anchor.)
    const to = loaded.map((c) => c.to).find((id) => PORTS.find((p) => p.id === id)?.cargo.berth)!;
    expect(to).toBeTruthy();
    const forThere = loaded.filter((c) => c.to === to).length;
    at(to);
    const delivered0 = world.deliveries;
    const money0 = world.career?.money ?? 0;
    send('cargoQuickUnload');
    expect(world.deliveries - delivered0).toBe(forThere);
    expect(world.career!.money).toBeGreaterThan(money0);
  });

  it('crates in the water within reach lifted aboard in one go; the rescue ends when all are in', () => {
    const { world, v, send } = setup();
    placeVessel(v, 0, 0, -400, 0);
    send('rescueDebugNear', 1, 'lostCargo');
    const inc = world.rescue!.active!;
    // All but one alongside; the last far off.
    inc.targets.forEach((t, i) => {
      const p = vesselToWorld(v, [i === inc.targets.length - 1 ? 60 : 4, 0, i - 1]);
      t.x = p.x;
      t.z = p.z;
    });
    send('crateQuickLift');
    const near = inc.targets.slice(0, -1);
    expect(near.every((t) => t.phase === 'aboard')).toBe(true);
    expect(inc.targets[inc.targets.length - 1].phase).not.toBe('aboard');
    expect(aboard(world, v.id).filter((c) => c.to === 'any')).toHaveLength(near.length);
    const last = inc.targets[inc.targets.length - 1];
    const p = vesselToWorld(v, [5, 0, 2]);
    [last.x, last.z] = [p.x, p.z];
    expect(distanceToHull(v, last.x, last.z)).toBeLessThan(CONFIG.rescue.quickLiftRange);
    send('crateQuickLift');
    expect(world.rescue!.active).toBeNull();
  });

  it('pots: loaded from the pallet (baited), shot, hauled with their catch, the catch sold at a port', () => {
    const { world, v, send, at } = setup();
    send('pottingOn');
    at('calder');
    send('potQuickLoad');
    const pots = () => aboard(world, v.id).filter(isPot);
    expect(pots()).toHaveLength(CONFIG.potting.pots);
    const g = POTTING_GROUNDS[2];
    placeVessel(v, g.x, 0, g.z, 0);
    send('potQuickShoot');
    send('potQuickShoot');
    expect(world.potting!.shot).toHaveLength(2);
    expect(world.potting!.shot.every((s) => s.ground === g.id)).toBe(true);
    expect(pots()).toHaveLength(CONFIG.potting.pots - 2);
    // Not up yet (sinking): nothing to haul.
    send('potQuickHaul');
    expect(world.potting!.shot).toHaveLength(2);
    for (const s of world.potting!.shot) s.shotAt -= CONFIG.potting.sinkTime + CONFIG.potting.soakBest;
    send('potQuickHaul');
    send('potQuickHaul');
    expect(world.potting!.shot).toHaveLength(0);
    const hauled = pots().filter((c) => c.pot && 'crab' in c.pot && c.pot.crab + c.pot.lobster > 0);
    // A good ground, soaked its best: at least one of the two caught something.
    expect(hauled.length).toBeGreaterThan(0);
    at('calder');
    const money0 = world.career?.money ?? 0;
    send('cargoQuickUnload');
    expect(world.career!.money).toBeGreaterThan(money0);
    expect(pots()).toHaveLength(CONFIG.potting.pots); // the pots stay aboard
    expect(pots().every((c) => !c.pot || c.pot.crab + c.pot.lobster === 0)).toBe(true);
  });
});
