/**
 * The line hauler (owner, 29 Oct 2026: "go ahead with the line hauler"; modules/lineHauler,
 * fishing/longline.ts): a powered sheave at the starboard rail. The Shipyard places it; the
 * yard fits it to the beginner boat. A dan buoy brought aboard leads its line round it, and
 * its valve hauls it on the deck hydraulics: a hook every few metres, held with each fish at
 * the roller until it's taken off, held off the line, never by hand.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { FLEET } from '../src/boats/fleet';
import { RECIPES } from '../src/boats/library';
import { gearOf, useStarterKit } from '../src/boats/sims';
import { aboard } from '../src/cargo/cargo';
import { buyBlocker, equipmentWithout } from '../src/career/career';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { nextStretch, offTheLine, sizeWord, type Longline } from '../src/fishing/longline';
import { buildDesign } from '../src/shipyard/build';
import { FISHING_GROUNDS } from '../src/world/archipelago';
import { placeVessel } from '../src/vessel/vesselControl';
import { toWorldPt } from '../src/potting/potting';
import { groundHeight } from '../src/world/terrain';
import { startEngine } from './helpers/engine';

const DT = 1 / 60;
const bank = FISHING_GROUNDS.find((g) => g.name === 'Calder Bank')!;
// (With the life ring's boat hook too, to hook the dan buoys.)
const kit = (withHauler: boolean) => useStarterKit(equipmentWithout(withHauler ? ['lineHauler', 'lifeRing'] : []));

afterEach(() => kit(false));

function setup() {
  kit(true);
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'starterBoat');
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  world.players[localPlayerId].aboardVesselId = v.id;
  const send = (control: string, value = 1, ref?: string, args?: number[], target = v.id) =>
    stepWorld(world, [{ playerId: localPlayerId, targetId: target, control, value, ref, ...(args ? { args } : {}) } as Intent], DT);
  // Her engine running and DECK HYD on: hydraulic pressure.
  startEngine(world, v);
  send('breaker.hydraulics', 1);
  return { world, v, send };
}

/** A line north-south across Calder Bank, soaked its best. */
function soakedLine(world: ReturnType<typeof setup>['world'], owner: string): Longline {
  const track: [number, number][] = [];
  for (let d = 0; d <= CONFIG.longline.lengthM; d += 10) track.push([bank.x, bank.z + 150 - d]);
  const hooks = Math.floor(CONFIG.longline.lengthM / CONFIG.longline.hookSpacingM);
  const line: Longline = { id: 'line-h', owner, track, hooks, hookFrom: 0, hookTo: hooks - 1, shotAt: world.time - CONFIG.longline.soakBest - 10, quality: 1, buoys: [track[0], track[track.length - 1]] };
  world.longline = { seq: 1, lines: [line], shooting: [], done: [] };
  return line;
}

/** Her hauler's roller (where the line comes aboard) over the line's next stretch, heading along it. */
function overTheLine(v: ReturnType<typeof setup>['v'], line: Longline): void {
  const hl = gearOf(v, 'lineHauler')!;
  const [x, z] = nextStretch(line);
  placeVessel(v, x - hl.roller[0], 0, z - hl.roller[2], 0);
  v.linearVelocity = [0, 0, 0];
  v.angularVelocity = [0, 0, 0];
}

describe('the line hauler', () => {
  it('the Shipyard puts it against her starboard bulwark aft of the house, with a hydraulic pump; its roller over the rail', () => {
    const base = FLEET.find((f) => f.id === 'starterBoat')!.design;
    const b = buildDesign({ ...base, lineHauler: 1 }, 'custom', 'haulerTest');
    expect(b.warnings.filter((w) => /line hauler/.test(w))).toEqual([]);
    const mods = b.recipe.modules.map((m) => m.module);
    expect(mods).toContain('deck.line-hauler');
    expect(mods).toContain('hydraulics.pto-pump');
    // And not without it.
    expect(buildDesign(base, 'custom', 'haulerTest2').recipe.modules.map((m) => m.module)).not.toContain('deck.line-hauler');
  });

  it('the yard fits it to the beginner boat (not the old workboat): bought, she has it at her starboard rail', () => {
    kit(false);
    expect(RECIPES.starterBoat.modules.map((m) => m.module)).not.toContain('deck.line-hauler');
    expect(gearOf({ defId: 'starterBoat' }, 'lineHauler')).toBeFalsy();
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'starterBoat');
    const send = (control: string, ref?: string, targetId = 'env') => stepWorld(world, [{ playerId: localPlayerId, targetId, control, value: 1, ref } as Intent], DT);
    send('teleportToPort', 'calder', vesselId);
    for (let i = 0; i < 0.5 / DT; i++) stepWorld(world, [], DT);
    send('careerDebugCash');
    expect(buyBlocker(world, 'lineHauler')).toBeNull();
    kit(true);
    const hl = gearOf({ defId: 'starterBoat' }, 'lineHauler')!;
    expect(hl).toBeTruthy();
    expect(hl.roller[0]).toBeGreaterThan(1); // starboard, out over her side
    expect(hl.roller[1]).toBeGreaterThan(hl.bin[1] + 0.5); // over the rail
    world.vessels[vesselId]!.defId = 'workboat';
    expect(buyBlocker(world, 'lineHauler')).toBe('Not on this boat');
  });

  it('a dan buoy brought aboard leads its line round the hauler; at SLOW it hauls a hook every few metres, held with each fish at the roller till it\'s taken off; never by hand', () => {
    const { world, v, send } = setup();
    const line = soakedLine(world, v.id);
    send('hookTake', 1);
    const [bx, bz] = line.buoys[0]!;
    placeVessel(v, bx - 3.5, 0, bz, 0);
    send('llHook', 1, line.id, [0]);
    send('llAboard', 1, line.id);
    expect(line.haul?.hauler).toBe(true);
    expect(line.haul?.lead).toEqual(gearOf(v, 'lineHauler')!.roller);
    expect(v.hauler?.line).toBe(true);
    // By hand: nothing.
    send('llHaul', CONFIG.longline.deskPull, line.id);
    expect(line.hookFrom).toBe(0);
    // STOP: nothing; SLOW: a hook every hookSpacingM at its speed.
    overTheLine(v, line);
    for (let t = 0; t < 5; t += DT) send('noop', 0);
    expect(line.hookFrom).toBe(0);
    send('hauler.valve', 1);
    expect(v.hauler?.run).toBe(CONFIG.longline.hauler.slow);
    let held = false;
    let taken = 0;
    const t0 = world.time;
    while (world.time - t0 < 1200 && world.longline!.lines.includes(line)) {
      overTheLine(v, line);
      if (line.haul?.fish) {
        // Held at the roller: the sheave still, and the line no further.
        const at = line.hookFrom;
        for (let k = 0; k < 30; k++) send('noop', 0);
        expect(line.hookFrom).toBe(at);
        expect(v.hauler?.held).toBe(true);
        expect(v.hauler?.run).toBe(0);
        held = true;
        if (sizeWord(line.haul.fish) !== 'undersize') taken++;
        send('llTake', 1, line.id);
      } else send('noop', 0);
    }
    expect(held).toBe(true);
    expect(world.longline!.lines).not.toContain(line);
    expect(world.longline!.done.at(-1)!.fish.length).toBe(taken);
    // About its speed: 300 m at 0.5 m/s is ten minutes, with the stops for the fish.
    expect(aboard(world, v.id).filter((c) => c.from === 'tubs')).toHaveLength(1);
    expect(v.hauler?.line).toBe(false);
  });

  it('FAST hauls twice as quick; without hydraulic pressure, or off the line, it doesn\'t turn', () => {
    const { world, v, send } = setup();
    const line = soakedLine(world, v.id);
    line.haul = { by: 'x', phase: 'line', end: 0, vessel: v.id, lead: [...gearOf(v, 'lineHauler')!.roller], fish: null, landed: [], hauler: true };
    // Fish-free, so only the speed counts.
    line.quality = 0;
    line.shotAt = world.time;
    overTheLine(v, line);
    send('hauler.valve', 2);
    for (let t = 0; t < 30; t += DT) {
      overTheLine(v, line);
      send('noop', 0);
    }
    const fast = line.hookFrom;
    expect(fast).toBeGreaterThanOrEqual(Math.floor((30 * CONFIG.longline.hauler.fast) / CONFIG.longline.hookSpacingM) - 1);
    // No pressure: DECK HYD off.
    send('breaker.hydraulics', 0);
    for (let t = 0; t < 10; t += DT) {
      overTheLine(v, line);
      send('noop', 0);
    }
    expect(line.hookFrom).toBe(fast);
    expect(v.hauler?.run).toBe(0);
    send('breaker.hydraulics', 1);
    // Off the line (further than the depth and the slack, short of parting): held.
    const [x, z] = nextStretch(line);
    const hl = gearOf(v, 'lineHauler')!;
    const depth = Math.max(2, -groundHeight(x, z));
    const away = depth + CONFIG.longline.leadSlackM + 6;
    expect(away).toBeLessThan(depth + CONFIG.longline.partM);
    placeVessel(v, x - hl.roller[0] + away, 0, z - hl.roller[2], 0);
    v.linearVelocity = [0, 0, 0];
    expect(offTheLine(line, v)).toBeGreaterThan(depth + CONFIG.longline.leadSlackM);
    const at = line.hookFrom;
    for (let t = 0; t < 10; t += DT) {
      v.linearVelocity = [0, 0, 0];
      send('noop', 0);
    }
    expect(line.haul).toBeTruthy();
    expect(line.hookFrom).toBe(at);
    expect(v.hauler?.held).toBe(true);
    // Spinning free with no line in it, its valve open.
    world.longline = { seq: 1, lines: [], shooting: [], done: [] };
    send('noop', 0);
    expect(v.hauler).toEqual({ run: CONFIG.longline.hauler.fast, line: false, held: false });
    // The roller's where her lead is: in the world, beside her starboard side.
    const p = toWorldPt(v, hl.roller);
    expect(Math.hypot(p.x - v.position[0], p.z - v.position[2])).toBeGreaterThan(1);
  });
});
