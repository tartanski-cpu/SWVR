/**
 * Fish farm service (owner, 29 Oct 2026: "go ahead with fish farm service first, everything should
 * be possible single player but better with crew"; aqua/farmService.ts): the farm's fish eat its
 * silo down and it calls for feed; the cargo screens make feed for it (sacks at the feed pier, bags
 * by crane from a cargo quay); feed landed on the barge fills the silo and is paid by the kilo; a
 * harvest run's salmon, ordered at the barge, is bound for its harbour and pays less once stale.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { aboard, kindOf } from '../src/cargo/cargo';
import { waitingHere } from '../src/cargo/order';
import { FARM_SITES, farmLine, feedNow, raiseFarmCall, setFeed } from '../src/aqua/farmService';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';
import { ringCentres } from '../src/world/farms';
import { groundHeight } from '../src/world/terrain';
import { berthWithId } from '../src/world/berths';

const DT = 1 / 60;
const port = (id: string) => PORTS.find((p) => p.id === id)!;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string, args?: number[]) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value, ref, ...(args ? { args } : {}) } as Intent], DT);
  const at = (id: string) => {
    const b = port(id).cargo.berth!;
    placeVessel(v, b.x, 0, b.z, (berthWithId(`${id}-cargo`)?.headingDeg ?? 0) * (Math.PI / 180));
    v.linearVelocity = [0, 0, 0];
  };
  return { world, v, send, at, site: () => world.aqua!.sites.tarskfarm };
}

describe('fish farm service', () => {
  it('the Tarsk farm and its feed barge: cages in deep water, a berth alongside the barge', () => {
    const tarsk = FARM_SITES.find((s) => s.port.id === 'tarskfarm')!;
    expect(tarsk).toBeTruthy();
    expect(FARM_SITES.some((s) => s.port.id === 'kvassfarm')).toBe(true);
    for (const [x, z] of ringCentres(tarsk.farm)) expect(groundHeight(x, z)).toBeLessThan(-15);
    const b = berthWithId('tarskfarm-cargo')!;
    expect(groundHeight(b.x - 2, b.z)).toBeLessThan(-5);
  });

  it('the fish eat the silo down; the farm calls for feed only in the game (tests raise calls by hand)', () => {
    const { world, send, site } = setup();
    const kg = feedNow(world, site());
    for (let i = 0; i < 60; i++) send('noop', 0);
    expect(feedNow(world, site())).toBeCloseTo(kg - CONFIG.aqua.eatKgPerS, 1);
    // (Kept as a level and a time: the state doesn't change as they eat.)
    expect(site().feedKg).toBe(kg);
    setFeed(world, site(), 100);
    for (let i = 0; i < 10; i++) send('noop', 0);
    expect(site().call).toBeNull();
    world.aqua!.spawn = true;
    send('noop', 0);
    expect(site().call?.kind).toBe('feed');
    expect(world.rescue?.radio?.text).toMatch(/Tarsk salmon farm.*feed/);
    // On the duty board.
    send('noop', 0);
    expect(world.duties?.items.some((d) => d.kind === 'farm' && /feed for Tarsk salmon farm/.test(d.title))).toBe(true);
  });

  it('a feed call: sacks from the feed pier and bags by crane from a cargo quay are bound for the farm; landed, they fill the silo and pay by the kilo', () => {
    const { world, v, send, at, site } = setup();
    setFeed(world, site(), 600);
    raiseFarmCall(world, 'tarskfarm', 'feed');
    // Garbh Pier makes feed sacks: crates there are feed for the farm.
    at('garbh');
    expect(farmLine(world, port('garbh'))).toMatch(/Crates are feed sacks/);
    send('cargoOrder', 4, 'garbh', [0]);
    const sacks = waitingHere(world, port('garbh'), 'crates');
    expect(sacks).toHaveLength(4);
    expect(sacks.every((c) => kindOf(c).name === 'Feed sack' && c.to === 'tarskfarm')).toBe(true);
    // Loch Tarsk has a cargo quay: its crane lifts are feed bags for the farm.
    send('cargoOrder', 1, 'tarsk', [1]);
    const bag = waitingHere(world, port('tarsk'), 'crane')[0];
    expect(kindOf(bag).name).toBe('Feed bag');
    expect(bag.to).toBe('tarskfarm');
    // The sacks aboard; the bag too (as her crane would put it).
    send('cargoQuickLoad');
    expect(aboard(world, v.id)).toHaveLength(4);
    bag.at = { vessel: v.id, pos: [0, 1, 1], yaw: 0, vel: [0, 0], lashed: true };
    const sacksKg = sacks.reduce((m, c) => m + c.mass, 0);
    const money0 = world.career!.money;
    const kg0 = feedNow(world, site());
    at('tarskfarm');
    send('cargoQuickUnload');
    expect(aboard(world, v.id)).toHaveLength(0);
    expect(feedNow(world, site())).toBeCloseTo(kg0 + sacksKg + 500, -1);
    expect(world.career!.money - money0).toBeGreaterThan((sacksKg + 500) * CONFIG.aqua.feedPerKg * 0.5);
    expect(world.career!.ledger[0].text).toMatch(/Feed to Tarsk salmon farm/);
  });

  it('the call ends when the silo is back over its mark; an empty silo pays more for feed', () => {
    const { world, send, site } = setup();
    setFeed(world, site(), 0);
    send('noop', 0);
    expect(site().hungry).toBe(true);
    raiseFarmCall(world, 'tarskfarm', 'feed');
    setFeed(world, site(), CONFIG.aqua.fullAt * CONFIG.aqua.siloKg + 10);
    send('noop', 0);
    expect(site().call).toBeNull();
  });

  it('a harvest run: crates at the barge are salmon on ice for its harbour; all landed fresh pays a bonus, a stale box pays less', () => {
    const { world, v, send, at, site } = setup();
    raiseFarmCall(world, 'tarskfarm', 'harvest');
    const call = site().call!;
    expect(call.kind).toBe('harvest');
    expect(call.to).toBeTruthy();
    at('tarskfarm');
    expect(farmLine(world, port('tarskfarm'))).toMatch(/Harvest: 0\//);
    send('cargoOrder', call.boxes!, 'tarskfarm', [0]);
    const boxes = waitingHere(world, port('tarskfarm'), 'crates');
    expect(boxes).toHaveLength(call.boxes!);
    expect(boxes.every((c) => kindOf(c).name === 'Salmon box' && c.to === call.to && c.bestBy !== undefined)).toBe(true);
    send('cargoQuickLoad');
    expect(aboard(world, v.id)).toHaveLength(call.boxes!);
    // One box goes stale (as if it sat a long while): it pays less than a fresh one.
    const [stale, ...fresh] = aboard(world, v.id);
    stale.bestBy = world.time - CONFIG.aqua.harvest.freshS;
    at(call.to!);
    const ledger0 = world.career!.ledger.length;
    send('cargoQuickUnload');
    const lines = world.career!.ledger.slice(0, world.career!.ledger.length - ledger0 + 1);
    expect(lines.some((l) => /past its best/.test(l.text))).toBe(true);
    expect(lines.some((l) => /Harvest run.*all landed fresh/.test(l.text))).toBe(true);
    expect(site().call).toBeNull();
    expect(fresh.length).toBe(call.boxes! - 1);
  });
});
