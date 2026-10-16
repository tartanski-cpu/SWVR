import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { GROUND, spawnCargo } from '../src/cargo/cargo';
import { buoyUp, groundAt, isPot, potsOwned } from '../src/potting/potting';
import { POTTING_GROUNDS } from '../src/world/archipelago';
import { groundHeight } from '../src/world/terrain';
import { standingHeight } from '../src/world/geography';

const DT = 1 / 60;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string, targetId: string = v.id, args?: number[]) =>
    stepWorld(world, [{ playerId: localPlayerId, targetId, control, value, ref, args } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const pots = () => Object.values(world.cargo).filter(isPot);
  return { world, v, send, run, pots };
}

describe('potting, milestone 1: pots as cargo, shooting them', () => {
  it('off until switched on; then five pots wait on the pallet on the Calder quay', () => {
    const { world, send, pots } = setup();
    expect(world.potting).toBeUndefined();
    expect(pots()).toHaveLength(0);
    send('pottingOn');
    expect(pots()).toHaveLength(CONFIG.potting.pots);
    for (const p of pots()) {
      expect('ground' in p.at).toBe(true);
      if (!('ground' in p.at)) continue;
      // On the quay top, by the pallet spot.
      const [x, y, z] = p.at.ground;
      expect(y).toBeCloseTo(standingHeight(x, z), 5);
      expect(y).toBeGreaterThan(0.5);
      expect(Math.hypot(x - CONFIG.potting.pallet.x, z - CONFIG.potting.pallet.z)).toBeLessThan(2);
    }
    // Switching on twice doesn't double them.
    send('pottingOn');
    expect(pots()).toHaveLength(CONFIG.potting.pots);
    // Trade cargo never spawns as pots.
    for (let i = 0; i < 30; i++) spawnCargo(world);
    expect(pots()).toHaveLength(CONFIG.potting.pots);
  });

  it('carried aboard, stowed and lashed like cargo; over the side on a ground, it is shot and its buoy pops up', () => {
    const { world, v, send, run, pots } = setup();
    send('pottingOn');
    const pot = pots()[0];
    send('cargoTake', 1, pot.id, v.id);
    expect('carriedBy' in pot.at).toBe(true);
    // On deck, then lashed.
    send('cargoPlace', 1, pot.id, v.id, [0, 1, 3.5, 0]);
    expect('vessel' in world.cargo[pot.id].at).toBe(true);
    send('cargoLash', 1, pot.id, v.id);
    expect((world.cargo[pot.id].at as { lashed: boolean }).lashed).toBe(true);
    send('cargoLash', 0, pot.id, v.id);
    send('cargoTake', 1, pot.id, v.id);
    // Over the side at Gull Rocks: shot.
    const g = POTTING_GROUNDS[0];
    send('cargoPlace', 1, pot.id, GROUND, [g.x, 0.5, g.z, 0]);
    expect(world.cargo[pot.id]).toBeUndefined();
    const shot = world.potting!.shot;
    expect(shot).toHaveLength(1);
    expect(shot[0].ground).toBe(g.id);
    expect(shot[0].owner).toBe(v.id);
    expect(buoyUp(world, shot[0])).toBe(false);
    run(CONFIG.potting.sinkTime + 0.1);
    expect(buoyUp(world, shot[0])).toBe(true);
    // Still five pots: four on the pallet, one in the water.
    expect(potsOwned(world)).toBe(CONFIG.potting.pots);
  });

  it('let go where there is no water to fish (dried out), or lost overboard: a lost pot, replaced on the pallet', () => {
    const { world, v, send, pots } = setup();
    send('pottingOn');
    const pot = pots()[0];
    send('cargoTake', 1, pot.id, v.id);
    // Off the shore of Gull Rocks' islet, in a few cm of water.
    let x = 370;
    let z = 410;
    for (let r = 0; r < 60 && groundHeight(x, z) > -0.5; r++) z += 1;
    expect(groundHeight(x, z)).toBeGreaterThan(-1);
    send('cargoPlace', 1, pot.id, GROUND, [x, 0, z, 0]);
    expect(world.potting!.shot).toHaveLength(0);
    expect(world.potting!.lost).toBe(1);
    expect(potsOwned(world)).toBe(CONFIG.potting.pots); // replaced on the pallet
  });

  it('the grounds are rocky ground in fishable water', () => {
    for (const g of POTTING_GROUNDS) {
      expect(groundAt(g.x, g.z)?.id).toBe(g.id);
      const d = -groundHeight(g.x, g.z);
      expect(d).toBeGreaterThan(5);
      expect(d).toBeLessThan(30);
    }
  });
});
