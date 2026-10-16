import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { GROUND, stackPoint, type CargoItem } from '../src/cargo/cargo';
import { parseCareer, serializeCareer } from '../src/career/career';
import { TUTORIAL, tutorialLine } from '../src/career/tutorial';
import { PORTS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), undefined, { cold: true, harbour: true });
  world.environment.waves = [];
  world.career!.tutorial = { step: 0, base: 0, said: false };
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string, targetId: string = v.id, args?: number[]) =>
    stepWorld(world, [{ playerId: localPlayerId, targetId, control, value, ref, args } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run, me: world.players[localPlayerId] };
}

describe('first voyage (tutorial)', { timeout: 60000 }, () => {
  it('a new game: moored in Calder Haven, you on the quay beside her', () => {
    const { v, me } = setup();
    expect(v.mooring.phase).toBe('moored');
    expect(v.mooring.berthId).toBe(CONFIG.start.berthId);
    const calder = PORTS.find((p) => p.id === 'calder')!;
    expect(Math.hypot(v.position[0] - calder.x, v.position[2] - calder.z)).toBeLessThan(CONFIG.rescue.harbourRadius);
    expect(me.aboardVesselId).toBeNull();
    expect(Math.hypot(me.position[0] - v.position[0], me.position[2] - v.position[2])).toBeLessThan(6); // right beside her
    expect(me.position[1]).toBeGreaterThan(1); // up on the quay, not in the water
  });

  it('talks a new skipper from the quay through start-up, loading, casting off and a delivery, then pays a welcome', () => {
    const { world, v, send, run, me } = setup();
    const t = world.career!.tutorial!;
    const duty = () => world.duties!.items.find((d) => d.kind === 'tutorial');
    run(0.2);
    expect(world.rescue!.radio?.text).toMatch(/step aboard/);
    expect(duty()?.steps.length).toBe(TUTORIAL.length);
    expect(tutorialLine(world)).toMatch(/^First voyage 1\//);
    // 1. aboard
    me.aboardVesselId = v.id;
    me.position = [0, 1.2, 2];
    run(0.2);
    expect(t.step).toBe(1);
    expect(world.rescue!.radio?.text).toMatch(/battery master/);
    // 2-3. power
    v.electrics!.master = 1;
    run(0.2);
    v.electrics!.breakers.instruments = 1;
    run(0.2);
    expect(t.step).toBe(3);
    // 4. engine (key on, running)
    v.engine.key = 1;
    v.engine.phase = 'running';
    v.engine.rpm = 700;
    run(0.2);
    expect(t.step).toBe(4);
    // 5. cargo aboard, still alongside
    const id = 'tut-crate';
    const item: CargoItem = { id, kind: 0, mass: 40, from: 'calder', to: 'brannock', at: { vessel: v.id, pos: [0, 1, 3], yaw: 0, vel: [0, 0], lashed: false } };
    world.cargo[id] = item;
    run(0.2);
    expect(t.step).toBe(5);
    // 6. cast off and out of the harbour
    send('dock');
    expect(v.mooring.phase).toBe('free');
    send('teleportToPort', 1, 'brannock');
    run(0.5);
    expect(t.step).toBe(6);
    expect(duty()!.steps.slice(0, 5).every((s) => s.done)).toBe(true);
    // 7. delivered at Brannock
    const m = world.career!.money;
    item.at = { carriedBy: me.id };
    const [x, y, z] = stackPoint(PORTS.find((p) => p.id === 'brannock')!, 0);
    send('cargoPlace', 1, id, GROUND, [x, y, z, 0]);
    run(0.2);
    expect(t.step).toBe(TUTORIAL.length);
    expect(tutorialLine(world)).toBeNull();
    expect(world.career!.money - m).toBeGreaterThan(CONFIG.career.tutorialBonus); // the cargo pay and the welcome
    expect(world.career!.ledger.some((e) => /welcome bonus/.test(e.text))).toBe(true);
    expect(world.rescue!.radio?.text).toMatch(/first job done/);
  });

  it('skip and restart; the step is saved with the career (and an old career has none)', () => {
    const { world, send, run } = setup();
    run(0.1);
    send('tutorialSkip', 1, undefined, 'env');
    expect(tutorialLine(world)).toBeNull();
    send('tutorialRestart', 1, undefined, 'env');
    expect(world.career!.tutorial!.step).toBe(0);
    world.career!.tutorial!.step = 4;
    const back = parseCareer(serializeCareer(world.career!))!;
    expect(back.tutorial?.step).toBe(4);
    expect(back.tutorial?.said).toBe(false); // the harbour master says it again on load
    expect(parseCareer(JSON.stringify({ money: 10, ledger: [], rep: {}, upgrades: [] }))!.tutorial).toBeUndefined();
  });
});
