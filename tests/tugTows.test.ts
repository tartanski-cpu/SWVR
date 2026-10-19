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
import { isTugClass, startTowCall } from '../src/tow/tow';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

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

  it('asked for a coaster by name, a boat that is not tug class gets an ordinary tow instead', () => {
    const { world, v } = setup();
    const job = startTowCall(world, v, 'coaster');
    expect(job.defId).not.toBe('coaster');
  });
});
