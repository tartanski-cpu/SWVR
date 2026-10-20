/**
 * A tug's work (owner, Oct 2026): the big tows (a loaded coaster) only come to a tug-class
 * boat (the slow-revving tug diesel, or the heavy towing post), their share of the time.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { isTugClass, shipBerthed, startTowCall } from '../src/tow/tow';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { BERTHS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -600, 0);
  const send = (control: string, value = 1, ref?: string) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value, ref } as Intent], DT);
  return { world, v, send };
}

/** Call after call (the job dropped between), what kinds come. */
function kinds(world: ReturnType<typeof setup>['world'], v: ReturnType<typeof setup>['v'], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const job = startTowCall(world, v);
    out.push(job.defId);
    delete world.vessels[job.vesselId];
    world.tow!.job = null;
  }
  return out;
}

describe("a tug's tows", () => {
  it('the workboat is not tug class and never hears of the coaster; with the heavy towing post she is, and gets the big tows their share of the time', () => {
    const { world, v } = setup();
    expect(isTugClass(world, v)).toBe(false);
    const plain = kinds(world, v, 60);
    expect(plain).not.toContain('coaster');
    world.career!.upgrades.push('towPost');
    expect(isTugClass(world, v)).toBe(true);
    const tug = kinds(world, v, 60);
    const share = tug.filter((k) => k === 'coaster').length / tug.length;
    expect(share).toBeGreaterThan(CONFIG.tow.bigShare - 0.2);
    expect(share).toBeLessThan(CONFIG.tow.bigShare + 0.2);
    expect(world.rescue!.radio?.text).toMatch(/PAN PAN|SÉCURITÉ/);
  });

  it("the coaster's call asks for a tug and warns of her hawser; the debug menu's Ship puts her astern", () => {
    const { world, v, send } = setup();
    world.career!.upgrades.push('towPost');
    const job = startTowCall(world, v, 'coaster');
    expect(job.defId).toBe('coaster');
    expect(world.rescue!.radio?.text).toMatch(/^PAN PAN\. Tug wanted: a loaded coaster/);
    expect(world.rescue!.radio?.text).toMatch(/heavy hawser/);
    expect(VESSEL_DEFS.coaster.tow?.lineFactor).toBe(3);
    delete world.vessels[job.vesselId];
    world.tow!.job = null;
    send('towDebugNear', 1, 'ship');
    const near = world.tow!.job as { defId: string } | null;
    expect(near?.defId).toBe('coaster');
    expect(VESSEL_DEFS.coaster.mass).toBeGreaterThan(8 * VESSEL_DEFS.pontoon.mass);
  });

  it('a ship is delivered only laid alongside a quay: slow in the middle of the harbour is not enough; pushed onto the berth she is', () => {
    const { world, v, send } = setup();
    world.career!.upgrades.push('towPost');
    send('towDebugNear', 1, 'ship');
    const job = world.tow!.job!;
    const ship = world.vessels[job.vesselId];
    const b = BERTHS.find((x) => x.id === 'calder-cargo')!;
    // In the harbour, 45 m off the quay, stopped: inside deliverRadius but not alongside.
    placeVessel(ship, b.x - b.shoreX * 45, 0, b.z - b.shoreZ * 45, b.headingDeg);
    placeVessel(v, b.x - b.shoreX * 80, 0, b.z - b.shoreZ * 80, b.headingDeg);
    expect(shipBerthed(ship)).toBe(false);
    for (let i = 0; i < (CONFIG.tow.deliverTime + 3) / DT; i++) {
      ship.linearVelocity = [0, 0, 0];
      stepWorld(world, [], DT);
    }
    expect(job.phase).toBe('accepted');
    // Alongside: her side a metre off the face.
    const half = Math.max(...VESSEL_DEFS.coaster.hull.stations.map((st) => st.halfBeamDeck));
    placeVessel(ship, b.x - b.shoreX * (half + 1 - b.shoreDist), 0, b.z - b.shoreZ * (half + 1 - b.shoreDist), b.headingDeg);
    expect(shipBerthed(ship)).toBe(true);
    for (let i = 0; i < (CONFIG.tow.deliverTime + 3) / DT && job.phase === 'accepted'; i++) {
      ship.linearVelocity = [0, 0, 0];
      stepWorld(world, [], DT);
    }
    expect(job.phase).toBe('delivered');
    expect(world.rescue!.radio?.text).toMatch(/lines are ashore/);
    expect(world.tow!.delivered).toBe(1);
    // She lies there a good while before the harbour takes her over.
    for (let i = 0; i < 30 / DT; i++) stepWorld(world, [], DT);
    expect(world.vessels[job.vesselId]).toBeTruthy();
  });

  it('pushing her bow-on moves the ship: boat against boat', () => {
    const { world, v, send } = setup();
    world.career!.upgrades.push('towPost');
    send('towDebugNear', 1, 'ship');
    const ship = world.vessels[world.tow!.job!.vesselId];
    // The ship lying east-west in open water; our bow against her side, pushing north at full ahead.
    placeVessel(ship, 0, 0, -600, 90);
    const half = Math.max(...VESSEL_DEFS.coaster.hull.stations.map((st) => st.halfBeamDeck));
    const stem = Math.abs(VESSEL_DEFS.workboat.hull.stations[VESSEL_DEFS.workboat.hull.stations.length - 1].z);
    placeVessel(v, 0, 0, -600 + half + stem + 0.3, 0);
    for (let i = 0; i < 2 / DT; i++) stepWorld(world, [], DT);
    send('quickStart', 1);
    for (let i = 0; i < 4 / DT; i++) stepWorld(world, [], DT);
    send('lever', 1);
    for (let i = 0; i < 40 / DT; i++) stepWorld(world, [], DT);
    expect(ship.position[2]).toBeLessThan(-603); // pushed a few metres north
    expect(Math.hypot(ship.linearVelocity[0], ship.linearVelocity[2])).toBeGreaterThan(0.1);
  });

  it('asked for a coaster by name, a boat that is not tug class gets an ordinary tow instead', () => {
    const { world, v } = setup();
    const job = startTowCall(world, v, 'coaster');
    expect(job.defId).not.toBe('coaster');
  });
});
