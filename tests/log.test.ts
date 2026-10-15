import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { createLog, fuelWord, LOG_TYPES, parseLog, serializeLog } from '../src/log/log';
import { formatPosition } from '../src/nav/geo';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';

const DT = 1 / 60;
const calder = PORTS.find((p) => p.id === 'calder')!;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, calder.x, 0, calder.z, 0);
  const send = (control: string, ref?: string, args?: number[], playerId = localPlayerId) =>
    stepWorld(world, [{ playerId, targetId: 'env', control, value: 1, ref, args } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  /** The log is optional: nothing about it ever goes on the duty board. */
  const logDuty = () => world.duties?.items.find((d) => d.title.startsWith('Log'));
  const write = (type: (typeof LOG_TYPES)[number], fuel: string, playerId?: string) => {
    send('logBegin', undefined, [LOG_TYPES.indexOf(type)], playerId);
    send('logPick', 'fuel', [['Full', '¾', '½', '¼'].indexOf(fuel)], playerId);
    send('logSign', undefined, undefined, playerId);
  };
  return { world, v, send, run, logDuty, write, localPlayerId };
}

describe("ship's log", () => {
  it('leaving harbour: a departure event (but no duty: the log is optional); signing writes the entry', () => {
    const { world, v, run, logDuty, write } = setup();
    run(0.1);
    expect(world.log!.events).toHaveLength(0); // starting in harbour isn't news
    placeVessel(v, calder.x - 800, 0, calder.z, 0);
    run(0.1);
    expect(world.log!.events.some((e) => e.type === 'departure' && e.port === 'Calder Haven')).toBe(true);
    expect(logDuty()).toBeUndefined();
    write('departure', fuelWord(v));
    const e = world.log!.voyages[0].entries[0];
    expect(e.type).toBe('departure');
    expect(e.port).toBe('Calder Haven');
    expect(e.time).toMatch(/^\d\d:\d\d$/);
    expect(e.pos).toMatch(/^\d\d°\d\d\.\d'N 00\d°\d\d\.\d'W$/);
    expect(e.fields[0]).toMatchObject({ key: 'fuel', correct: true });
    run(0.1);
    expect(world.log!.events.find((ev) => ev.type === 'departure')?.logged ?? true).toBe(true);
    expect(world.log!.voyages[0].closed).toBe(false);
  });

  it('a wrong reading is written but not ticked; arrival closes the voyage with its score', () => {
    const { world, v, run, write, logDuty } = setup();
    run(0.1);
    placeVessel(v, calder.x - 800, 0, calder.z, 0);
    run(0.1);
    const wrong = fuelWord(v) === '¼' ? 'Full' : '¼';
    write('departure', wrong);
    expect(world.log!.voyages[0].entries[0].fields[0].correct).toBe(false);
    // Made fast alongside the cargo quay.
    placeVessel(v, 708.5, 0, 660, 0);
    v.mooring = { phase: 'moored', berthId: 'calder-cargo', reversed: false, t: 0 };
    run(0.1);
    expect(world.log!.events.some((e) => e.type === 'arrival' && e.port === 'Calder Haven')).toBe(true);
    expect(logDuty()).toBeUndefined();
    write('arrival', fuelWord(v));
    const voyage = world.log!.voyages[0];
    expect(voyage.closed).toBe(true);
    expect(voyage.entries[1].score).toEqual([1, 2]);
    // The next entry starts a new voyage.
    write('departure', fuelWord(v));
    expect(world.log!.voyages).toHaveLength(2);
  });

  it("can't sign until filled in; one writer at a time, until they leave it", () => {
    const { world, send, run } = setup();
    send('logBegin', undefined, [0]);
    send('logSign');
    expect(world.log!.voyages).toHaveLength(0); // no fuel picked yet
    send('logPick', 'fuel', [1], 'p2');
    expect(world.log!.draft!.values.fuel).toBeUndefined(); // someone else's pen
    send('logBegin', undefined, [1], 'p2');
    expect(world.log!.draft!.type).toBe('departure');
    run(CONFIG.log.draftIdle + 1);
    send('logPick', 'fuel', [1], 'p2'); // left alone long enough: taken over
    expect(world.log!.draft!.values.fuel).toBe('¾');
    expect(world.log!.draft!.by).toBe('p2');
    send('logCancel', undefined, undefined, 'p2');
    expect(world.log!.draft).toBeNull();
  });

  it('signing an entry clears every waiting event of its type (its "due" mark goes at once)', () => {
    const { world, send } = setup();
    world.log = createLog();
    world.log.started = true;
    for (let i = 0; i < 3; i++) world.log.events.push({ id: 100 + i, type: 'hazard', at: world.time, logged: false, truth: { hazard: 'Debris' } });
    world.log.events.push({ id: 200, type: 'weather', at: world.time, logged: false });
    send('logBegin', undefined, [LOG_TYPES.indexOf('hazard')]);
    send('logPick', 'hazard', [0]);
    send('logSign');
    expect(world.log.events.map((e) => e.type)).toEqual(['weather']);
    expect(world.log.voyages[0].entries[0].fields[0]).toMatchObject({ key: 'hazard', value: 'Debris', correct: true });
  });

  it('unlogged events drop off after a while', () => {
    const { world, v, run } = setup();
    run(0.1);
    placeVessel(v, calder.x - 800, 0, calder.z, 0);
    run(0.1);
    expect(world.log!.events.some((e) => e.type === 'departure')).toBe(true);
    run(CONFIG.log.eventLinger + 1);
    expect(world.log!.events.filter((e) => e.type === 'departure')).toHaveLength(0);
  });

  it('saved voyages load back (only the last few kept); junk is ignored', () => {
    const log = createLog();
    for (let i = 1; i <= CONFIG.log.keepVoyages + 2; i++) log.voyages.push({ id: i, closed: true, entries: [{ id: i, type: 'departure', time: '10:00', pos: 'x', fields: [], by: 'A' }] });
    const back = parseLog(serializeLog(log))!;
    expect(back.voyages).toHaveLength(CONFIG.log.keepVoyages);
    expect(back.voyages[0].id).toBe(3);
    expect(back.entrySeq).toBe(CONFIG.log.keepVoyages + 2);
    expect(parseLog('{"voyages": 3}')).toBeNull();
    expect(parseLog('not json')).toBeNull();
  });

  it('positions read like a chart: the origin, a nautical mile north', () => {
    expect(formatPosition(0, 0)).toBe("56°37.2'N 005°57.0'W");
    expect(formatPosition(0, -1852)).toBe("56°38.2'N 005°57.0'W");
  });
});
