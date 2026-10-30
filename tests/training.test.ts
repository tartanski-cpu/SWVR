/**
 * Training mode (docs/TRAINING.md, milestone 1): the training page is a Voyage on the
 * training harbour alone, its boat the fishing boat; the harbour has water where the
 * exercises need it; the exercise engine places her, counts faults, and judges an attempt
 * passed or try again, driven by intents through stepWorld as the host runs it.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

let m: {
  mode: typeof import('../src/mode');
  config: typeof import('../src/config');
  regions: typeof import('../src/world/regions');
  terrain: typeof import('../src/world/terrain');
  berths: typeof import('../src/world/berths');
  world: typeof import('../src/core/world');
  sim: typeof import('../src/core/simulation');
  ids: typeof import('../src/core/ids');
  training: typeof import('../src/training/training');
  ex: typeof import('../src/training/exercises');
};

const DT = 1 / 60;

beforeAll(async () => {
  // The mode is read once at import (src/mode.ts): the training page, then the world fresh.
  vi.stubGlobal('location', { pathname: '/training.html', search: '', href: 'https://localhost/training.html' });
  vi.resetModules();
  await import('../src/boats/library');
  m = {
    mode: await import('../src/mode'),
    config: await import('../src/config'),
    regions: await import('../src/world/regions'),
    terrain: await import('../src/world/terrain'),
    berths: await import('../src/world/berths'),
    world: await import('../src/core/world'),
    sim: await import('../src/core/simulation'),
    ids: await import('../src/core/ids'),
    training: await import('../src/training/training'),
    ex: await import('../src/training/exercises'),
  };
});

function setup() {
  const { world, vesselId, localPlayerId } = m.world.createWorld(new m.ids.IdFactory(), m.config.CONFIG.training.boat, { harbour: true, weather: true, voyage: true, cold: true });
  world.training = m.training.createTraining();
  world.quietCalls = true;
  const v = world.vessels[vesselId];
  const send = (control: string, ref?: string) => m.sim.stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control, value: 1, ...(ref ? { ref } : {}) }], DT);
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      each?.();
      m.sim.stepWorld(world, [], DT);
    }
  };
  return { world, v, send, run };
}

describe('training mode', { timeout: 120000 }, () => {
  it('is a Voyage on the training harbour alone, starting in the fishing boat at Berth B', () => {
    expect(m.mode.TRAINING).toBe(true);
    expect(m.mode.MODE).toBe('voyage');
    expect(m.regions.REGIONS.map((r) => r.id)).toEqual(['training']);
    const { world, v } = setup();
    expect(v.defId).toBe('fishingBoat');
    expect(world.voyage).toBe(true);
    expect(v.mooring.phase).toBe('moored');
    expect(v.mooring.berthId).toBe('training-b');
  });

  it('has water where each exercise needs it, and land behind the quay', () => {
    const depth = (x: number, z: number) => -m.terrain.groundHeight(x, z);
    // The named berths, the lane's corners and middle, the dock, the entrance and the approach.
    for (const id of ['training-slot', 'training-a', 'training-b', 'training-c']) {
      const b = m.berths.berthWithId(id)!;
      expect(depth(b.x, b.z), id).toBeGreaterThan(4);
    }
    for (const [x, z] of [[-140, 40], [-140, 70], [140, 40], [140, 70], [0, 55], [77.5, 184], [77.5, 170], [0, -80], [0, -140]]) expect(depth(x, z), `${x}, ${z}`).toBeGreaterThan(4);
    // The breakwater stands above the water; the land behind the quay too.
    expect(m.terrain.groundHeight(-200, 50)).toBeGreaterThan(1);
    expect(m.terrain.groundHeight(0, 300)).toBeGreaterThan(0);
  });

  it('every exercise places her free or alongside, with the engine started, and talks over the VHF', () => {
    for (const e of m.ex.EXERCISES) {
      const { world, v, send, run } = setup();
      send('trainingStart', e.id);
      expect(world.training!.id).toBe(e.id);
      // The brief goes out at once; the first step's call waits until it has been said.
      expect(world.rescue!.radio!.text, e.id).toContain(e.name);
      run(4);
      expect(v.engine.phase, e.id).toBe('running');
      expect(world.training!.said, e.id).toBe(false);
      // Its steps on the duty board.
      expect(world.duties!.items.some((d) => d.kind === 'training' && d.steps.length === e.steps.length), e.id).toBe(true);
    }
  });

  it('H5 stop on course: down the lane at 4 kn, stopped on the call, judged with its numbers', () => {
    const { world, v, send, run } = setup();
    send('trainingStart', 'stopOnCourse');
    run(3);
    // Up to about four knots (a simple governor on the lever), the helm amidships.
    let stopping = false;
    run(180, () => {
      const t = world.training!;
      if (!t.id) return;
      if (t.step === 1 && t.said) stopping = true;
      const kn = m.ex.speedKn(v);
      // Ahead: hold ~4 kn. Stopping: full astern until she has nearly stopped, then neutral.
      v.controls.lever = stopping ? (kn > 0.6 ? -1 : 0) : kn < 4 ? 0.6 : 0.3;
      v.controls.helm = 0;
    });
    const r = world.training!.result!;
    if (process.env.TRAINING_DEBUG) console.log('H5', JSON.stringify(r));
    expect(r).toBeTruthy();
    expect(r.numbers.find((n) => n[0] === 'Stopping distance')![1]).toMatch(/m$/);
    // A plain crash stop with no helm lets her stern walk: the heading change is measured either way.
    expect(world.training!.data.maxTurned).toBeGreaterThan(0);
    expect(world.training!.id).toBeNull();
  });

  it('H6: out of the dock before she is round fails at once; a second attempt is given', () => {
    const { world, v, send, run } = setup();
    send('trainingStart', 'turnInDock');
    run(3);
    // Straight out astern, never turned.
    run(60, () => {
      if (world.training!.id) v.controls.lever = -0.5;
    });
    const r = world.training!.result!;
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/before she was round/);
    expect(r.attempt).toBe(1);
    send('trainingRetry');
    expect(world.training!.id).toBe('turnInDock');
    expect(world.training!.attempt).toBe(2);
    expect(v.position[2]).toBeGreaterThan(170); // back in the dock
  });

  it('H8: fenders out ticks the first step; stop gives no verdict; restart keeps the attempt', () => {
    const { world, v, send, run } = setup();
    send('trainingStart', 'alongsideWindOff');
    // The brief, then the first step's call.
    run(30);
    expect(world.training!.step).toBe(0);
    expect(world.training!.said).toBe(true);
    v.controls.fenders = 1;
    run(1);
    expect(world.training!.step).toBe(1);
    send('trainingRestart');
    expect(world.training!.step).toBe(0);
    expect(world.training!.attempt).toBe(1);
    expect(v.controls.fenders).toBe(0);
    send('trainingAbort');
    expect(world.training!.id).toBeNull();
    expect(world.training!.result).toBeNull();
  });

  it('a fault over the speed limit is counted once per gap, not every tick', () => {
    const { world, v, send, run } = setup();
    send('trainingStart', 'turnInDock');
    run(2);
    // Pretend she is going 5 kn (over the dock's 3 kn) for 3 s: one fault.
    run(3, () => {
      v.linearVelocity = [5 * m.ex.KN, 0, 0];
    });
    expect(world.training!.faults.filter((f) => f.kind === 'speed').length).toBe(1);
  });
});
