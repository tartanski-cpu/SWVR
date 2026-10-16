import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { GROUND, spawnCargo } from '../src/cargo/cargo';
import { buoyUp, groundAt, isPot, potReady, potsOwned, soakFactor } from '../src/potting/potting';
import { createWeather } from '../src/environment/weather';
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

describe('potting, milestone 2: soak, drift, the radio', () => {
  /** A world with potting on and one pot shot at the middle of the Gull Rocks ground. */
  function shotOne() {
    const t = setup();
    t.send('pottingOn');
    const pot = t.pots()[0];
    t.send('cargoTake', 1, pot.id, t.v.id);
    const g = POTTING_GROUNDS[0];
    t.send('cargoPlace', 1, pot.id, GROUND, [g.x, 0.5, g.z, 0]);
    return { ...t, shot: t.world.potting!.shot[0], g };
  }

  it('ready to haul after the soak time; the catch improves until the best soak, then no more', () => {
    const { world, run, shot, send } = shotOne();
    expect(potReady(world, shot)).toBe(false);
    // (World time follows the tick count, so wind the shot time back instead.)
    shot.shotAt -= CONFIG.potting.sinkTime + CONFIG.potting.soakReady - 1;
    expect(potReady(world, shot)).toBe(false);
    run(1.1);
    expect(potReady(world, shot)).toBe(true);
    expect(soakFactor(world, shot)).toBeCloseTo(CONFIG.potting.soakReady / CONFIG.potting.soakBest, 2);
    shot.shotAt -= CONFIG.potting.soakBest * 3;
    expect(soakFactor(world, shot)).toBe(1);
    // Debug: set ready.
    const t2 = shotOne();
    t2.send('potDebugReady');
    expect(potReady(t2.world, t2.shot)).toBe(true);
    void send;
  });

  it('in a squall the pot drags downwind; in a breeze it stays put', () => {
    const { world, run, shot } = shotOne();
    const w = (world.environment.weather = createWeather('Clear', 0));
    w.fixed = true;
    w.now = { ...w.now, wind: 8, windFrom: 270 };
    w.target = { ...w.now };
    run(5);
    const x0 = shot.x;
    run(30);
    expect(shot.x).toBeCloseTo(x0, 6);
    w.now = { ...w.now, wind: 17 };
    w.target = { ...w.now };
    run(60);
    // From the west: east (+x), about dragRate x 6 m/s x 60 s.
    const moved = shot.x - x0;
    expect(moved).toBeGreaterThan(0.8 * CONFIG.potting.dragRate * 6 * 60);
    expect(moved).toBeLessThan(1.2 * CONFIG.potting.dragRate * 6 * 60);
  });

  it('now and then a local potter tips a ground on the VHF', () => {
    const { world, run } = setup();
    stepWorld(world, [{ playerId: Object.keys(world.players)[0], targetId: Object.keys(world.vessels)[0], control: 'pottingOn', value: 1 } as Intent], DT);
    run(CONFIG.potting.tipFirst + 1);
    const msg = world.rescue?.radio;
    expect(msg?.kind).toBe('info');
    expect(POTTING_GROUNDS.some((g) => msg!.text.includes(g.name))).toBe(true);
  });
});
