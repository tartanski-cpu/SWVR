import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { GROUND, spawnCargo } from '../src/cargo/cargo';
import { buoyUp, catchFor, depthAt, groundAt, isPot, potReady, potsOwned, soakFactor } from '../src/potting/potting';
import { placeVessel } from '../src/vessel/vesselControl';
import * as THREE from 'three';
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

describe('potting, milestone 3: hauling and the catch', () => {
  /** Potting on, a ready pot shot just off the boat's starboard side at Gull Rocks, the hook in hand. */
  function readyPot() {
    const t = setup();
    const { world, v, send, run, pots } = t;
    const g = POTTING_GROUNDS[0];
    placeVessel(v, g.x, 0, g.z, 0);
    send('pottingOn');
    const pot = pots()[0];
    send('cargoTake', 1, pot.id, v.id);
    // 5 m off the starboard side (heading north: starboard is +x).
    const off = (dx: number, dz: number) => new THREE.Vector3(dx, 0, dz).applyQuaternion(new THREE.Quaternion().fromArray(v.orientation)).add(new THREE.Vector3().fromArray(v.position));
    const at = off(7, 0);
    send('cargoPlace', 1, pot.id, GROUND, [at.x, 0.5, at.z, 0]);
    const shot = world.potting!.shot[0];
    shot.shotAt -= CONFIG.potting.sinkTime + CONFIG.potting.soakBest;
    send('hookTake', 1, undefined, v.id);
    run(0.1);
    return { ...t, shot, off, pid: Object.keys(world.players)[0] };
  }

  it('hooked, drawn alongside, aboard, hauled hand over hand: the pot comes over onto the deck with its catch', () => {
    const { world, v, send, shot, off } = readyPot();
    expect(potReady(world, shot)).toBe(true);
    // Not aboard while it's still out there.
    send('potHook', 1, shot.id, v.id);
    expect(shot.haul?.phase).toBe('hooked');
    send('potAboard', 1, shot.id, v.id);
    expect(shot.haul?.phase).toBe('hooked');
    // Draw it in to the side.
    const side = off(3, 0);
    for (let i = 0; i < 5; i++) send('potTow', 1, shot.id, v.id, [side.x, side.z]);
    send('potAboard', 1, shot.id, v.id);
    expect(shot.haul?.phase).toBe('line');
    const line0 = shot.haul!.line!;
    expect(line0).toBeCloseTo(depthAt(shot) + CONFIG.potting.haul.slack, 0);
    // Hand over hand.
    let pulls = 0;
    while (world.potting!.shot.length && pulls < 100) {
      send('potHaul', 1.5, shot.id, v.id);
      pulls++;
    }
    expect(pulls).toBeGreaterThan(3);
    const item = world.cargo[shot.id];
    expect(item).toBeTruthy();
    expect('vessel' in item.at).toBe(true);
    expect(item.pot).toBeTruthy();
  });

  it('drawn in with the hook, the buoy stays outside the hull on its own side', () => {
    const { v, send, shot, off } = readyPot();
    send('potHook', 1, shot.id, v.id);
    // The hook tip swung right across the deck to the far side.
    const across = off(-3, 0);
    for (let i = 0; i < 8; i++) send('potTow', 1, shot.id, v.id, [across.x, across.z]);
    const local = new THREE.Vector3(shot.x - v.position[0], 0, shot.z - v.position[2]).applyQuaternion(new THREE.Quaternion().fromArray(v.orientation).invert());
    expect(local.x).toBeGreaterThan(1.5);
  });

  it('the catch stays in the pot; set down on a harbour quay it is sold, lobster for more than crab; on a ground it fishes far better than off one', () => {
    const { world, v, send, shot } = readyPot();
    send('potHook', 1, shot.id, v.id);
    shot.haul = { by: Object.keys(world.players)[0], phase: 'line', vessel: v.id, lead: [2.2, 1.3, 3], line: 0.5, lastPull: world.time };
    send('potHaul', 1, shot.id, v.id);
    const item = world.cargo[shot.id];
    // Force a known haul to check the sale.
    item.pot = { crab: 3, lobster: 1, bycatch: 'boot' };
    const money0 = world.career?.money ?? 0;
    // Carried ashore and set down on the Calder Haven quay (by the pallet).
    send('cargoTake', 1, item.id, v.id);
    const { x, z } = CONFIG.potting.pallet;
    send('cargoPlace', 1, item.id, GROUND, [x + 2, standingHeight(x + 2, z), z, 0]);
    expect('ground' in item.at).toBe(true);
    expect(world.cargo[item.id]).toBe(item); // the pot stays, empty, to take back aboard
    expect(item.pot).toMatchObject({ crab: 0, lobster: 0, bycatch: null });
    const paid = (world.career?.money ?? 0) - money0;
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBe(Math.round(paid)); // a whole sum
    expect(world.career!.ledger[0].text).toMatch(/1 lobster, 3 crabs sold at Calder/);
    expect(CONFIG.potting.price.lobster).toBeGreaterThan(CONFIG.potting.price.crab * 3);
    // Every pot is baited (no bait tub): on a good ground, soaked, it fishes far better than off one.
    const base = { id: 'p', owner: v.id, x: 0, z: 0, shotAt: world.time - 1e5 };
    let onGround = 0;
    let off = 0;
    for (let i = 0; i < 200; i++) {
      const b = catchFor(world, { ...base, id: `p${i}`, ground: POTTING_GROUNDS[2].id });
      const n = catchFor(world, { ...base, id: `p${i}`, ground: null });
      onGround += b.crab + b.lobster;
      off += n.crab + n.lobster;
    }
    expect(onGround).toBeGreaterThan(off * 1.8);
  });

  it('let the hook go and the buoy comes off it; in a heavy swell an idle line slips back', () => {
    const { world, v, send, run, shot } = readyPot();
    send('potHook', 1, shot.id, v.id);
    send('hookStow', 1, undefined, v.id);
    run(0.1);
    expect(shot.haul).toBeUndefined();
    shot.haul = { by: 'x', phase: 'line', vessel: v.id, lead: [2.2, 1.3, 3], line: 3, lastPull: world.time };
    world.environment.waves = [{ amplitude: 1.2, period: 8, directionDeg: 0, steepness: 0.2, phase: 0 }]; // Hs 3.4 m
    run(5);
    expect(shot.haul!.line!).toBeGreaterThan(3);
  });
});
