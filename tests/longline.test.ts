/**
 * Longlining (owner, 29 Oct 2026: "go ahead with longlining ... a variety of fish and fish sizes
 * coming up so you know how good your catch is"; fishing/longline.ts): a tub from the cargo
 * screen, let go over the side under way, shoots a line behind her; it soaks; hooked by a dan
 * buoy and hauled hand over hand, its hooks come up one at a time with fish of their ground's mix
 * and all sizes, taken off into boxes (the undersize back); off the line it won't come, driven away
 * it parts; the boxes sell by the kilo.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GROUND, aboard, kindOf } from '../src/cargo/cargo';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { waitingHere } from '../src/cargo/order';
import { alongTrack, fishOnHook, haulSummary, hookAt, linesInPlay, nextStretch, sizeWord, type Longline } from '../src/fishing/longline';
import { placeVessel } from '../src/vessel/vesselControl';
import { FISHING_GROUNDS, PORTS } from '../src/world/archipelago';
import { toWorldPt } from '../src/potting/potting';
import { groundHeight } from '../src/world/terrain';

const DT = 1 / 60;
const calder = PORTS.find((p) => p.id === 'calder')!;
const bank = FISHING_GROUNDS.find((g) => g.name === 'Calder Bank')!;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  world.players[localPlayerId].aboardVesselId = v.id;
  const send = (control: string, value = 1, ref?: string, args?: number[], target = v.id) =>
    stepWorld(world, [{ playerId: localPlayerId, targetId: target, control, value, ref, ...(args ? { args } : {}) } as Intent], DT);
  /** Steam north at `speed` m/s for `seconds` (held on her course, as a helmsman would). */
  const steam = (speed: number, seconds: number) => {
    for (let t = 0; t < seconds; t += DT) {
      v.linearVelocity = [0, 0, -speed];
      v.angularVelocity = [0, 0, 0];
      v.position = [v.position[0], v.position[1], v.position[2] - speed * DT];
      send('noop', 0);
    }
  };
  return { world, v, send, steam, me: localPlayerId };
}

/** A line lying north-south across Calder Bank, all out, soaked its best. */
function soakedLine(world: ReturnType<typeof setup>['world'], owner: string): Longline {
  const track: [number, number][] = [];
  for (let d = 0; d <= CONFIG.longline.lengthM; d += 10) track.push([bank.x, bank.z + 150 - d]);
  const hooks = Math.floor(CONFIG.longline.lengthM / CONFIG.longline.hookSpacingM);
  const line: Longline = { id: 'line-t', owner, track, hooks, hookFrom: 0, hookTo: hooks - 1, shotAt: world.time - CONFIG.longline.soakBest - 10, quality: 1, buoys: [track[0], track[track.length - 1]] };
  world.longline = { seq: 1, lines: [line], shooting: [], done: [] };
  return line;
}

describe('longlining', () => {
  it('line tubs are ordered at the cargo screen, up to the lines in play', () => {
    const { world, v, send } = setup();
    placeVessel(v, calder.cargo.berth!.x, 0, calder.cargo.berth!.z, 0);
    send('cargoOrder', 2, 'calder', [3]);
    const tubs = waitingHere(world, calder, 'tubs');
    expect(tubs).toHaveLength(2);
    expect(kindOf(tubs[0]).name).toBe('Line tub');
    for (let i = 0; i < CONFIG.longline.maxLines + 2; i++) send('cargoOrder', 1, 'calder', [3]);
    expect(linesInPlay(world)).toBe(CONFIG.longline.maxLines);
  });

  it('a tub let go over the side under way shoots its line behind her: dan buoys at both ends, its hooks along it, well shot', () => {
    const { world, v, send, steam } = setup();
    placeVessel(v, bank.x, 0, bank.z + 150, 0);
    send('cargoOrder', 1, 'calder', [3]);
    const tub = Object.values(world.cargo).find((c) => kindOf(c).name === 'Line tub')!;
    send('cargoTake', 1, tub.id);
    steam(2.5, 1);
    const stern = toWorldPt(v, [0, 0, 6]);
    send('cargoPlace', 1, tub.id, [stern.x, 0, stern.z, 0], GROUND);
    expect(world.cargo[tub.id]).toBeUndefined();
    expect(world.longline?.shooting).toHaveLength(1);
    steam(2.5, CONFIG.longline.lengthM / 2.5 + 2);
    expect(world.longline!.shooting).toHaveLength(0);
    const line = world.longline!.lines[0];
    expect(line.buoys[0]).toBeTruthy();
    expect(line.buoys[1]).toBeTruthy();
    expect(line.hooks).toBe(Math.floor(CONFIG.longline.lengthM / CONFIG.longline.hookSpacingM));
    expect(line.quality).toBeGreaterThan(0.9);
  });

  it('stopped part way, the end buoy goes in where she is: a shorter line', () => {
    const { world, v, send, steam } = setup();
    placeVessel(v, bank.x, 0, bank.z, 0);
    send('cargoOrder', 1, 'calder', [3]);
    const tub = Object.values(world.cargo).find((c) => kindOf(c).name === 'Line tub')!;
    send('cargoTake', 1, tub.id);
    const stern = toWorldPt(v, [0, 0, 6]);
    send('cargoPlace', 1, tub.id, [stern.x, 0, stern.z, 0], GROUND);
    steam(2.5, 60);
    steam(0, CONFIG.longline.stopS + 1);
    const line = world.longline!.lines[0];
    expect(line).toBeTruthy();
    expect(line.hooks).toBeLessThan(Math.floor(CONFIG.longline.lengthM / CONFIG.longline.hookSpacingM));
    expect(line.hooks).toBeGreaterThan(15);
  });

  it('the catch: the ground\'s own fish most, a variety of others, all sizes (most small, a few big), the undersize named', () => {
    const { world, v } = setup();
    const line = soakedLine(world, v.id);
    const fish = [];
    // Many lines' worth on Calder Bank (a haddock ground).
    for (let n = 0; n < 40; n++) for (let i = 0; i < line.hooks; i++) {
      const f = fishOnHook(world, { ...line, id: `l${n}` }, i);
      if (f) fish.push(f);
    }
    const hooks = 40 * line.hooks;
    expect(fish.length / hooks).toBeGreaterThan(0.15);
    expect(fish.length / hooks).toBeLessThan(0.6);
    const by = new Map<string, number>();
    for (const f of fish) by.set(f.species, (by.get(f.species) ?? 0) + 1);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe('Haddock');
    expect(by.size).toBeGreaterThanOrEqual(6);
    for (const f of fish) {
      const sp = CONFIG.longline.species.find((s) => s.name === f.species)!;
      expect(f.kg).toBeGreaterThanOrEqual(sp.kg[0]);
      expect(f.kg).toBeLessThanOrEqual(sp.kg[1]);
    }
    const words = new Set(fish.map(sizeWord));
    for (const w of ['small', 'fair', 'good', 'big'] as const) expect(words.has(w)).toBe(true);
    // Fewer big than small.
    expect(fish.filter((f) => sizeWord(f) === 'big').length).toBeLessThan(fish.filter((f) => sizeWord(f) === 'small').length);
    // Unsoaked, it catches less.
    const fresh = { ...line, shotAt: world.time };
    let freshFish = 0;
    for (let n = 0; n < 40; n++) for (let i = 0; i < line.hooks; i++) if (fishOnHook(world, { ...fresh, id: `l${n}` }, i)) freshFish++;
    expect(freshFish).toBeLessThan(fish.length * 0.3);
  });

  it('hooked, brought aboard and hauled along the line: each fish at the rail is taken off into a box, the undersize go back; the line comes in, with a summary, back into its tub', () => {
    const { world, v, send } = setup();
    const line = soakedLine(world, v.id);
    send('hookTake', 1);
    const [bx, bz] = line.buoys[0]!;
    placeVessel(v, bx + 3.5, 0, bz, 0);
    send('llHook', 1, line.id, [0]);
    expect(line.haul?.phase).toBe('hooked');
    send('llAboard', 1, line.id);
    expect(line.haul?.phase).toBe('line');
    let taken = 0;
    let released = 0;
    for (let n = 0; n < 400 && world.longline!.lines.includes(line); n++) {
      // Keep her up along the line: her lead over its next stretch.
      const [x, z] = nextStretch(line);
      placeVessel(v, x + 2.2, 0, z, 0);
      v.linearVelocity = [0, 0, 0];
      if (line.haul?.fish) {
        if (sizeWord(line.haul.fish) === 'undersize') released++;
        else taken++;
        send('llTake', 1, line.id);
      } else send('llHaul', CONFIG.longline.deskPull, line.id);
    }
    expect(world.longline!.lines).not.toContain(line);
    const done = world.longline!.done.at(-1)!;
    expect(done.fish.length).toBe(taken);
    const boxes = aboard(world, v.id).filter((c) => c.from === 'line');
    expect(boxes.length).toBeGreaterThan(0);
    const inBoxes = boxes.flatMap((b) => b.fish ?? []);
    expect(inBoxes.length).toBe(taken);
    for (const b of boxes) expect((b.fish ?? []).reduce((m, f) => m + f.kg, 0)).toBeLessThanOrEqual(CONFIG.longline.boxKg);
    expect(haulSummary(done.fish)).toMatch(/fish, [\d.]+ kg/);
    expect(released + taken).toBeGreaterThan(5);
    // The line back in its tub on her deck, to shoot again (still one of the lines in play).
    expect(aboard(world, v.id).filter((c) => c.from === 'tubs')).toHaveLength(1);
    expect(linesInPlay(world)).toBe(1);
  });

  it('off the line it won\'t come; driven away, it parts, and the rest is hauled from its other buoy', () => {
    const { world, v, send } = setup();
    const line = soakedLine(world, v.id);
    send('hookTake', 1);
    const [bx, bz] = line.buoys[0]!;
    placeVessel(v, bx + 3.5, 0, bz, 0);
    send('llHook', 1, line.id, [0]);
    send('llAboard', 1, line.id);
    const from = line.hookFrom;
    // Further off its next stretch than the depth and the slack: it won't come.
    const [x, z] = nextStretch(line);
    const depth = Math.max(2, -groundHeight(x, z));
    placeVessel(v, x + depth + CONFIG.longline.leadSlackM + 5, 0, z, 0);
    send('llHaul', CONFIG.longline.deskPull, line.id);
    expect(line.hookFrom).toBe(from);
    // Far off: it parts.
    placeVessel(v, x + depth + CONFIG.longline.partM + 15, 0, z, 0);
    send('noop', 0);
    expect(line.haul).toBeUndefined();
    expect(line.buoys[0]).toBeNull();
    expect(line.buoys[1]).toBeTruthy();
    expect(world.longline!.done.at(-1)!.parted).toBe(true);
    // From its other end.
    const [cx, cz] = line.buoys[1]!;
    placeVessel(v, cx + 3.5, 0, cz, 0);
    send('llHook', 1, line.id, [1]);
    send('llAboard', 1, line.id);
    expect(line.haul?.end).toBe(1);
    expect(alongTrack(line.track, hookAt(line.hookTo))).toEqual(nextStretch(line));
  });

  it('the boxes sell by the kilo, by species', () => {
    const { world, v, send } = setup();
    const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === 'Fish box');
    world.cargo.b1 = { id: 'b1', kind, mass: 20, from: 'line', to: 'any', fish: [{ species: 'Cod', kg: 5 }, { species: 'Haddock', kg: 2 }], at: { vessel: v.id, pos: [0, 1, 1], yaw: 0, vel: [0, 0], lashed: true } };
    placeVessel(v, calder.cargo.berth!.x, 0, calder.cargo.berth!.z, 0);
    v.linearVelocity = [0, 0, 0];
    const m0 = world.career!.money;
    send('cargoQuickUnload');
    expect(world.cargo.b1).toBeUndefined();
    const paid = world.career!.money - m0;
    const value = 5 * 3.2 + 2 * 2.6;
    expect(paid).toBeGreaterThan(value * 0.5);
    expect(paid).toBeLessThan(value * 3);
    expect(world.career!.ledger[0].text).toMatch(/Longline fish landed/);
  });
});
