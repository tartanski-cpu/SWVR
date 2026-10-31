/**
 * Training M4 (docs/TRAINING.md course 3): Coast practice, each exercise judged as the engine
 * judges it. The boat is sailed along a path by hand here (placed each tick, her velocity set
 * to match), so each test checks an exercise's steps, its faults and its verdict, not anyone's
 * boat handling. Also: the harbour's coast marks, and the binoculars' bearing.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

let m: {
  config: typeof import('../src/config');
  world: typeof import('../src/core/world');
  sim: typeof import('../src/core/simulation');
  ids: typeof import('../src/core/ids');
  training: typeof import('../src/training/training');
  ctl: typeof import('../src/vessel/vesselControl');
  arch: typeof import('../src/world/archipelago');
  terrain: typeof import('../src/world/terrain');
  kit: typeof import('../src/training/exerciseKit');
};

const DT = 1 / 60;
const KN = 1852 / 3600;

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
    ctl: await import('../src/vessel/vesselControl'),
    arch: await import('../src/world/archipelago'),
    terrain: await import('../src/world/terrain'),
    kit: await import('../src/training/exerciseKit'),
  };
});

function setup(startIn = 'fishingBoat') {
  const { world, vesselId, localPlayerId } = m.world.createWorld(new m.ids.IdFactory(), startIn, { harbour: true, weather: true, voyage: true, cold: true });
  world.training = m.training.createTraining();
  world.quietCalls = true;
  const home = world.vessels[vesselId];
  const send = (control: string, ref?: string, value = 1, args?: number[]) => m.sim.stepWorld(world, [{ playerId: localPlayerId, targetId: home.id, control, value, ...(ref ? { ref } : {}), ...(args ? { args } : {}) }], DT);
  const t = () => world.training!;
  const boat = () => m.training.trainingBoat(world)!;
  const tick = () => m.sim.stepWorld(world, [], DT);
  /** Her place and motion set by hand: at (x, z) heading `hdg`, making `kn` along it. */
  const place = (x: number, z: number, hdg: number, kn = 0) => {
    m.ctl.placeVessel(boat(), x, 0, z, hdg);
    boat().mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
    const h = (hdg * Math.PI) / 180;
    boat().linearVelocity = [Math.sin(h) * kn * KN, 0, -Math.cos(h) * kn * KN];
  };
  /** On, held where she is, until the step is called (or `maxS`). */
  const reach = (step: number, maxS = 90) => {
    const [x, , z] = boat().position;
    const hdg = m.kit.heading(boat());
    for (let i = 0; i < maxS / DT && !(t().step === step && t().said) && t().id; i++) {
      place(x, z, hdg);
      tick();
    }
    expect(t().step, `step ${step}`).toBe(step);
  };
  /** Sail her along the points at `kn`, heading along each leg, until done or `until()` says stop. */
  const sail = (pts: [number, number][], kn: number, until?: () => boolean) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const hdg = m.kit.bearingTo(ax, az, bx, bz);
      for (let s = 0; s < len; s += kn * KN * DT) {
        place(ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len, hdg, kn);
        tick();
        if (until?.() || !t().id) return;
      }
    }
  };
  return { world, home, send, t, boat, tick, place, reach, sail };
}

const mark = (name: string) => m.arch.MARKS.find((k) => k.name === name)!;
const run = (s: { tick: () => void }, secs: number) => {
  for (let i = 0; i < secs / DT; i++) s.tick();
};

describe('Training M4: the harbour outside', () => {
  it('has the wreck and her cardinals, the rock, the leading lights in line through the entrance, the stream', () => {
    for (const n of ['Kittiwake N', 'Kittiwake E', 'Kittiwake S', 'Kittiwake W', 'Gull Rock', 'Race W', 'Race E', 'Datum']) expect(mark(n), n).toBeTruthy();
    expect(m.arch.MARKS.filter((k) => k.name.startsWith('Fast slalom'))).toHaveLength(8);
    expect(m.arch.WRECKS.find((w) => w.name === 'Kittiwake')).toBeTruthy();
    // The rock and the wreck stand up out of the water; the leading line is clear water.
    expect(m.terrain.groundHeight(200, -330)).toBeGreaterThan(-1);
    for (let z = -400; z <= -90; z += 20) expect(-m.terrain.groundHeight(0, z), `line at ${z}`).toBeGreaterThan(4);
    const lead = m.arch.LIGHTS.filter((l) => l.name.includes('leading'));
    expect(lead).toHaveLength(2);
    expect(lead.every((l) => l.x === 0 && l.period === 0)).toBe(true);
    expect(m.arch.CURRENTS.some((c) => c.id === 'training-stream')).toBe(true);
    // Water for every exercise's start.
    const c = m.config.CONFIG.training.coast;
    for (const [x, z] of [c.steer.start, c.forMark.start, c.fix.start, c.fastSlalom.start, c.marks.start, c.marks.nightStart, c.stream.start]) expect(-m.terrain.groundHeight(x, z), `${x}, ${z}`).toBeGreaterThan(4);
  });
});

describe('Training M4: coast practice', { timeout: 120000 }, () => {
  it('C1: each course taken up at once the right way and held passes; the wrong way fails', () => {
    for (const wrongWay of [false, true]) {
      const s = setup();
      s.send('trainingStart', 'steerCourse');
      s.reach(0);
      const [x0, , z0] = s.boat().position;
      s.sail([[x0, z0], [x0 + 200, z0]], 6, () => s.t().step === 1 && s.t().said);
      for (const [i, [course, len]] of m.config.CONFIG.training.coast.steer.legs.entries()) {
        expect(s.t().step).toBe(i + 1);
        // Round to the new course over 4 s, the right way (or, the second leg, the long way round).
        const from = m.kit.heading(s.boat());
        const turn = m.kit.turnFrom(course, from);
        const by = wrongWay && i === 1 ? turn - Math.sign(turn) * 360 : turn;
        const [x, , z] = s.boat().position;
        for (let k = 1; k <= 240; k++) {
          s.place(x, z, from + (by * k) / 240, 6);
          s.tick();
        }
        const [bx, , bz] = s.boat().position;
        const r = (course * Math.PI) / 180;
        s.sail([[bx, bz], [bx + Math.sin(r) * (len + 50), bz - Math.cos(r) * (len + 50)]], 6, () => s.t().step !== i + 1);
        if (!s.t().id) break;
      }
      run(s, 1);
      if (wrongWay) {
        expect(s.t().result?.passed).toBe(false);
        expect(s.t().result?.reason).toMatch(/wrong way/);
      } else expect(s.t().result?.passed, s.t().result?.reason).toBe(true);
    }
  });

  it('C1: the autopilot on fails at once', async () => {
    const s = setup();
    s.send('trainingStart', 'steerCourse');
    s.reach(0);
    const ap = await import('../src/vessel/autopilot');
    ap.engageAutopilot(s.boat(), true);
    expect(s.boat().controls.autopilot).toBe(1);
    run(s, 0.5);
    expect(s.t().result?.passed).toBe(false);
    expect(s.t().result?.reason).toMatch(/autopilot/);
  });

  it('C2: straight for the mark, then in on the leading line passes; 8 m off the line fails', () => {
    for (const off of [0, 8]) {
      const s = setup();
      s.send('trainingStart', 'steerForMark');
      s.reach(0);
      const d = mark('Datum');
      const [x0, , z0] = s.boat().position;
      s.sail([[x0, z0], [d.x, d.z]], 6, () => s.t().step === 1);
      expect(s.t().step).toBe(1);
      s.sail([[d.x, d.z - 30], [off, -420]], 6, () => s.t().step === 2);
      s.sail([[off, -420], [off, -60]], 5);
      run(s, 1);
      expect(s.t().result?.passed, s.t().result?.reason).toBe(off === 0);
      if (off) expect(s.t().result?.reason).toMatch(/On the line/);
    }
  });

  it('C3: needs a chart table; in the pilot boat two bearings and the fix pass, a fix 100 m out fails', () => {
    const a = setup();
    a.send('trainingStart', 'whereAreWe');
    expect(a.t().id).toBeNull();
    for (const fixOff of [20, 100]) {
      const s = setup('pilotBoat');
      s.send('trainingStart', 'whereAreWe');
      expect(s.t().id).toBe('whereAreWe');
      s.reach(1);
      const [x, , z] = s.boat().position;
      const at = (name: string) => m.kit.bearingTo(x, z, ...((p) => [p.x, p.z] as const)(m.arch.MARKS.find((k) => k.name === name) ?? m.arch.LIGHTS.find((l) => l.name === name)!));
      // A bearing of nothing charted isn't counted.
      s.send('trainingBearing', undefined, 250, [x, z]);
      expect(s.t().data.bearings ?? 0).toBe(0);
      s.send('trainingBearing', undefined, at('Datum') + 1, [x, z]);
      expect(s.t().data.bearings).toBe(1);
      // Too close round to the first: not counted; well round: counted.
      s.reach(2);
      s.send('trainingBearing', undefined, at('Harbour Head Fl W 10s') - 1, [x, z]);
      expect(s.t().data.bearings).toBe(2);
      s.reach(3);
      s.send('trainingFix', undefined, 1, [x + fixOff, z]);
      run(s, 1);
      expect(s.t().result?.passed, s.t().result?.reason).toBe(fixOff < 50);
      expect(s.t().result?.numbers[3][1]).toBe(`${fixOff} m`);
    }
  });

  it('C4: in the RIB, through the eight marks alternately on the plane, round and back, slow to the entrance', () => {
    const s = setup();
    s.send('trainingStart', 'fastSlalom');
    expect(s.boat().defId).toBe('rib');
    s.reach(0);
    const marks = m.arch.MARKS.filter((k) => k.name.startsWith('Fast slalom')).sort((a, b) => b.z - a.z);
    const out: [number, number][] = marks.map((k, i) => [k.x + (i % 2 ? -15 : 15), k.z]);
    const last = marks[marks.length - 1];
    // Out, 30 m on past the last, round it, and back the other side of each.
    const back: [number, number][] = [...marks].reverse().map((k, i) => [k.x + (i % 2 ? -15 : 15), k.z]);
    const [x0, , z0] = s.boat().position;
    s.sail([[x0, z0], [marks[0].x + 15, marks[0].z + 40], ...out, [last.x - 15, last.z - 30], [last.x + 15, last.z - 30], ...back, [marks[0].x - 15, marks[0].z + 40]], 22, () => s.t().step === 1);
    expect(s.t().data.pass).toBe(16);
    expect(s.t().step).toBe(1);
    s.sail([[-200, -250], [0, -200], [0, -60]], 4);
    run(s, 1);
    expect(s.t().result?.passed, s.t().result?.reason).toBe(true);
  });

  it('C5: round the wreck by her cardinals, the rock clear, in red to port passes; a cardinal the wrong side fails', () => {
    const good: [number, number][] = [[560, -700], [380, -640], [250, -560], [250, -450], [130, -330], [0, -200], [0, -60]];
    // (South of the north cardinal and west of the east one, between them and the wreck.)
    const bad: [number, number][] = [[560, -700], [440, -570], [250, -560], [250, -450], [130, -330], [0, -200], [0, -60]];
    for (const path of [good, bad]) {
      const s = setup();
      s.send('trainingStart', 'readMarks');
      s.reach(0);
      s.sail(path, 6);
      run(s, 1);
      expect(s.t().result?.passed, s.t().result?.reason).toBe(path === good);
      if (path === bad) expect(s.t().result?.reason).toMatch(/wrong side/);
    }
  });

  it('C5: into the wreck\'s danger circle fails at once', () => {
    const s = setup();
    s.send('trainingStart', 'readMarks');
    s.reach(0);
    s.sail([[560, -700], [380, -520]], 6);
    expect(s.t().result?.passed).toBe(false);
    expect(s.t().result?.reason).toMatch(/danger circle/);
  });

  it('C6: across the running stream on the line, back at slack, passes; the stream runs only then', () => {
    const s = setup();
    s.send('trainingStart', 'setAndDrift');
    expect(s.world.environment.raceOverride).toBe('slack');
    s.reach(0);
    expect(s.world.environment.raceOverride).toBe('peak');
    s.sail([[-790, 152], [-440, 152]], 5, () => s.t().step === 1);
    s.reach(1);
    expect(s.world.environment.raceOverride).toBe('slack');
    s.sail([[-440, 148], [-760, 148]], 5);
    run(s, 1);
    expect(s.t().result?.passed, s.t().result?.reason).toBe(true);
  });

  it('C7: at night, lights on, the nearest light named by its rhythm, in by the marks; named wrong fails', () => {
    for (const right of [true, false]) {
      const s = setup();
      s.send('trainingStart', 'lightsAtNight');
      expect(s.world.environment.timeOfDay).toBeCloseTo(23, 2);
      s.reach(0);
      s.boat().controls.navLights = 1;
      s.reach(1);
      const ask = s.t().ask!;
      expect(ask.choices).toHaveLength(3);
      // The nearest is Kittiwake E, from the night start.
      expect(ask.choices[s.t().data.right]).toMatch(/^East cardinal/);
      s.send('trainingAnswer', String(right ? s.t().data.right : (s.t().data.right + 1) % 3));
      expect(s.t().ask).toBeUndefined();
      s.reach(2);
      s.sail([[600, -560], [500, -650], [380, -650], [250, -560], [250, -450], [130, -330], [0, -200], [0, -60]], 6);
      run(s, 1);
      expect(s.t().result?.passed, s.t().result?.reason).toBe(right);
    }
  });

  it('C1 joins the Examiner\'s Run as one of the others', async () => {
    const ex = await import('../src/training/exercises');
    expect(ex.EXAM.other).toContain('steerCourse');
  });
});

describe('Training M4: the binoculars\' bearing', () => {
  it('reads the true bearing of where they look, and a press takes it once', async () => {
    const THREE = await import('three');
    const { Binoculars } = await import('../src/player/binoculars');
    const cam = new THREE.PerspectiveCamera();
    const b = new Binoculars(cam);
    cam.rotation.set(0, 0, 0); // looking -Z: north
    cam.updateMatrixWorld();
    expect(b.bearing()).toBeCloseTo(0, 5);
    cam.rotation.set(0, -Math.PI / 2, 0); // turned right: east
    cam.updateMatrixWorld();
    expect(b.bearing()).toBeCloseTo(90, 5);
    cam.position.set(10, 2, -5);
    cam.updateMatrixWorld();
    b.take();
    expect(b.takeBearing()).toEqual({ deg: 90, x: 10, z: -5 });
    expect(b.takeBearing()).toBeNull();
  });
});
