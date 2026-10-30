/**
 * Training mode's recording and review (docs/TRAINING.md section 6, milestone 2): an attempt
 * recorded from its start to its verdict (samples, keyframes, events), a restart ending a run
 * without one, the file's round trip, and the review's numbers at a moment.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

let m: {
  config: typeof import('../src/config');
  world: typeof import('../src/core/world');
  sim: typeof import('../src/core/simulation');
  ids: typeof import('../src/core/ids');
  training: typeof import('../src/training/training');
  ex: typeof import('../src/training/exercises');
  rec: typeof import('../src/training/recording');
  review: typeof import('../src/training/review');
  berths: typeof import('../src/world/berths');
};

const DT = 1 / 60;

beforeAll(async () => {
  vi.stubGlobal('location', { pathname: '/training.html', search: '', href: 'https://localhost/training.html' });
  vi.resetModules();
  await import('../src/boats/library');
  m = {
    config: await import('../src/config'),
    world: await import('../src/core/world'),
    sim: await import('../src/core/simulation'),
    ids: await import('../src/core/ids'),
    training: await import('../src/training/training'),
    ex: await import('../src/training/exercises'),
    rec: await import('../src/training/recording'),
    review: await import('../src/training/review'),
    berths: await import('../src/world/berths'),
  };
});

function setup() {
  const { world, vesselId, localPlayerId } = m.world.createWorld(new m.ids.IdFactory(), m.config.CONFIG.training.boat, { harbour: true, weather: true, voyage: true, cold: true });
  world.training = m.training.createTraining();
  const v = world.vessels[vesselId];
  const runs: import('../src/training/recording').Run[] = [];
  let wall = Date.parse('2026-10-30T10:00:00Z');
  const recorder = new m.rec.Recorder((r) => runs.push(r), () => (wall += 1000));
  const step = (intents: import('../src/core/intents').Intent[] = []) => {
    m.sim.stepWorld(world, intents, DT);
    recorder.tick(world);
  };
  const send = (control: string, ref?: string) => step([{ playerId: localPlayerId, targetId: v.id, control, value: 1, ...(ref ? { ref } : {}) }]);
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      each?.();
      step();
    }
  };
  return { world, v, send, run, runs, recorder };
}

/** H5 driven as a skipper who corrects the walk would: ~4 kn down the lane, then astern with a kick ahead against the swing. */
function driveH5(world: import('../src/core/world').WorldState, v: import('../src/vessel/vesselState').VesselState) {
  let hdg0: number | null = null;
  return () => {
    const t = world.training!;
    if (!t.id) return;
    const kn = m.ex.speedKn(v);
    if (!(t.step === 1 && t.said)) {
      v.controls.lever = kn < 4 ? 0.6 : 0.3;
      v.controls.helm = Math.max(-1, Math.min(1, -m.ex.turnFrom(m.ex.heading(v), 90) * 0.05));
      return;
    }
    hdg0 ??= m.ex.heading(v);
    const err = m.ex.turnFrom(m.ex.heading(v), hdg0);
    if (kn < 0.25) [v.controls.lever, v.controls.helm] = [0, 0];
    else if (Math.abs(err) > 4) [v.controls.lever, v.controls.helm] = [0.3, err > 0 ? -1 : 1];
    else [v.controls.lever, v.controls.helm] = [-0.7, err > 0 ? -1 : 1];
  };
}

describe('training recording', { timeout: 120000 }, () => {
  it('records an attempt from its start to its verdict: samples at 10 Hz, keyframes, events', () => {
    const { world, v, send, run, runs, recorder } = setup();
    send('trainingStart', 'stopOnCourse');
    expect(recorder.recording).toBe(true);
    run(150, driveH5(world, v));
    run(0.1);
    expect(runs).toHaveLength(1);
    const r = runs[0];
    expect(r.header.passed).toBe(true);
    expect(r.header.name).toBe('H5 Stop on course');
    expect(r.header.boat).toBe('fishingBoat');
    expect(r.header.numbers.length).toBeGreaterThan(2);
    const n = m.rec.sampleCount(r);
    expect(Math.abs(n - r.header.duration * 10)).toBeLessThan(3);
    expect(r.keyframes.length).toBe(Math.ceil(r.header.duration / 30));
    expect(JSON.parse(r.keyframes[0].world).training.id).toBe('stopOnCourse');
    const kinds = r.events.map((e) => e.kind);
    expect(kinds[0]).toBe('start');
    expect(kinds.filter((k) => k === 'step')).toHaveLength(2);
    expect(kinds.at(-1)).toBe('result');
    expect(kinds).toContain('radio');
    // The track goes east down the lane.
    const first = m.rec.sampleAt(r, 0);
    const last = m.rec.sampleAt(r, r.header.duration);
    expect(last.x - first.x).toBeGreaterThan(80);
    expect(recorder.recording).toBe(false);
  });

  it('Start again ends the run with no verdict, and the new attempt is recorded on its own', () => {
    const { world, v, send, run, runs } = setup();
    send('trainingStart', 'turnInDock');
    run(5);
    send('trainingRestart');
    expect(runs).toHaveLength(1);
    expect(runs[0].header.passed).toBeNull();
    expect(runs[0].header.reason).toMatch(/Started again/);
    // Out astern without turning: a verdict (try again) for the second run.
    run(60, () => {
      if (world.training!.id) v.controls.lever = -0.5;
    });
    run(0.1);
    expect(runs).toHaveLength(2);
    expect(runs[1].header.passed).toBe(false);
    expect(runs[1].events.some((e) => e.kind === 'fault' && e.weight === 3)).toBe(true);
    send('trainingRetry');
    send('trainingAbort');
    expect(runs).toHaveLength(3);
    expect(runs[2].header.attempt).toBe(2);
    expect(runs[2].header.reason).toMatch(/Stopped/);
  });

  it('a run goes to a gzipped file and back unchanged; anything else is turned away', async () => {
    const { world, v, send, run, runs } = setup();
    send('trainingStart', 'stopOnCourse');
    run(40, driveH5(world, v));
    send('trainingAbort');
    const r = runs[0];
    const bytes = await m.rec.encodeRun(r);
    expect(bytes.length).toBeLessThan(r.samples.byteLength + r.keyframes.reduce((s, k) => s + k.world.length, 0));
    const back = await m.rec.decodeRun(bytes);
    expect(back.header).toEqual(r.header);
    expect(Array.from(back.samples)).toEqual(Array.from(r.samples));
    expect(back.events).toEqual(r.events);
    expect(back.keyframes).toEqual(r.keyframes);
    expect(m.rec.runFileName(r.header)).toMatch(/^swvr-training-H5-2026-10-30-\d{4}-a1\.json\.gz$/);
    await expect(m.rec.decodeRun(new TextEncoder().encode('hello'))).rejects.toThrow(/not a training recording/);
    const newer = await m.rec.encodeRun({ ...r, header: { ...r.header, layout: m.rec.LAYOUT + 1 } });
    await expect(m.rec.decodeRun(newer)).rejects.toThrow(/newer version/);
  });

  it('the review: the numbers at a moment, the events either side, the chart framed on the track', () => {
    const { world, v, send, run, runs } = setup();
    send('trainingStart', 'stopOnCourse');
    run(150, driveH5(world, v));
    run(0.1);
    const r = runs[0];
    const mid = r.header.duration / 2;
    const nums = Object.fromEntries(m.review.reviewNumbers(r, mid));
    expect(Object.keys(nums)).toEqual(['Time', 'Speed', 'Heading', 'Lever', 'Rudder', 'Engine', 'Off the quay', 'Lines']);
    expect(nums.Engine).toMatch(/rpm/);
    expect(nums.Lines).toBe('free');
    const call = r.events.find((e) => e.kind === 'step' && /lane/.test(e.text))!;
    expect(m.review.nextEvent(r, call.t - 1)?.t).toBe(call.t);
    expect(m.review.prevEvent(r, call.t + 1)?.t).toBe(call.t);
    const view = m.review.frameRuns([r], 950, 730);
    expect(view.span).toBeGreaterThan(80);
    expect(Math.abs(view.cx - (m.rec.sampleAt(r, 0).x + m.rec.sampleAt(r, r.header.duration).x) / 2)).toBeLessThan(view.span / 2);
    // Alongside Berth B her centre is the berth's 2.5 m off the quay face.
    const b = m.berths.berthWithId('training-b')!;
    expect(m.review.offQuay(b.x, b.z)).toBeCloseTo(2.5, 1);
    expect(m.review.clock(125)).toBe('2:05');
  });
});
