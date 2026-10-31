/**
 * Training M3 (docs/TRAINING.md): the rest of Harbour practice, Rescue practice and the
 * Examiner's Run, each judged as the engine judges it. The boat is placed and worked by hand
 * here (set where she'd be, the controls as a trainee would leave them), so each test checks
 * an exercise's steps, its faults and its verdict, not anyone's boat handling.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

let m: {
  config: typeof import('../src/config');
  world: typeof import('../src/core/world');
  sim: typeof import('../src/core/simulation');
  ids: typeof import('../src/core/ids');
  training: typeof import('../src/training/training');
  ex: typeof import('../src/training/exercises');
  ctl: typeof import('../src/vessel/vesselControl');
  arch: typeof import('../src/world/archipelago');
  fuel: typeof import('../src/vessel/fuelTank');
  tow: typeof import('../src/tow/tow');
  runs: typeof import('../src/training/trainingRuns');
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
    ctl: await import('../src/vessel/vesselControl'),
    arch: await import('../src/world/archipelago'),
    fuel: await import('../src/vessel/fuelTank'),
    tow: await import('../src/tow/tow'),
    runs: await import('../src/training/trainingRuns'),
  };
});

function setup(startIn = 'fishingBoat') {
  const { world, vesselId, localPlayerId } = m.world.createWorld(new m.ids.IdFactory(), startIn, { harbour: true, weather: true, voyage: true, cold: true });
  world.training = m.training.createTraining();
  world.quietCalls = true;
  const home = world.vessels[vesselId];
  const send = (control: string, ref?: string, target: string = home.id, value = 1) => m.sim.stepWorld(world, [{ playerId: localPlayerId, targetId: target, control, value, ...(ref ? { ref } : {}) }], DT);
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      each?.();
      m.sim.stepWorld(world, [], DT);
    }
  };
  const t = () => world.training!;
  /** On until the step is called (or `maxS`). */
  const reach = (step: number, maxS = 90, each?: () => void) => {
    for (let i = 0; i < maxS / DT && !(t().step === step && t().said) && t().id; i++) {
      each?.();
      m.sim.stepWorld(world, [], DT);
    }
    expect(t().step, `step ${step}`).toBe(step);
  };
  const boat = () => m.training.trainingBoat(world)!;
  const place = (x: number, z: number, hdg: number) => {
    m.ctl.placeVessel(boat(), x, 0, z, hdg);
    boat().mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
  };
  return { world, home, send, run, t, reach, boat, place, me: world.players[localPlayerId] };
}

const mark = (name: string) => m.arch.MARKS.find((k) => k.name === name)!;

describe('Training M3: harbour practice', { timeout: 120000 }, () => {
  it('H1: cold and dark to running and back, in order', () => {
    const { send, run, t, reach, boat } = setup();
    send('trainingStart', 'startUp');
    expect(boat().engine.phase).toBe('off');
    reach(0);
    boat().electrics!.master = 1;
    reach(1);
    for (const k of Object.keys(boat().electrics!.breakers) as (keyof NonNullable<ReturnType<typeof boat>['electrics']>['breakers'])[]) boat().electrics!.breakers[k] = 1;
    reach(2);
    boat().engine.phase = 'running';
    boat().engine.key = 1;
    reach(3);
    reach(4, 60);
    boat().engine.key = 0;
    boat().engine.phase = 'off';
    reach(5);
    boat().electrics!.master = 0;
    run(1);
    expect(t().result?.passed).toBe(true);
  });

  it('H2: fuelled with the engine off passes; fuelling with it running fails at once', () => {
    const a = setup();
    a.send('trainingStart', 'fuelUp');
    a.reach(0);
    a.boat().engine.phase = 'off';
    a.boat().engine.key = 0;
    a.reach(1);
    a.boat().refuelling = true;
    a.reach(2);
    a.boat().engine.fuelL = m.fuel.fuelTankL(a.boat()) * 0.97;
    a.reach(3);
    a.boat().refuelling = false;
    a.run(1);
    expect(a.t().result?.passed).toBe(true);
    const b = setup();
    b.send('trainingStart', 'fuelUp');
    b.reach(0);
    b.boat().refuelling = true;
    b.run(1);
    expect(b.t().result?.passed).toBe(false);
    expect(b.t().result?.reason).toMatch(/engine running/);
  });

  it('H3: lines in the order called; the wrong one is a fault and a try again', () => {
    const a = setup();
    a.send('trainingStart', 'linesFenders');
    a.reach(0);
    a.boat().controls.fenders = 1;
    a.reach(1);
    // The bow line let go when the stern was asked.
    a.boat().mooring.bow = 0;
    a.run(1);
    expect(a.t().faults.some((f) => f.kind === 'wrongLine')).toBe(true);
    const b = setup();
    b.send('trainingStart', 'linesFenders');
    b.reach(0);
    b.boat().controls.fenders = 1;
    b.reach(1);
    const side = b.boat().mooring.stern!;
    b.boat().mooring.stern = 0;
    b.reach(2);
    b.boat().mooring.stern = side;
    b.reach(3);
    b.boat().mooring.bow = 0;
    b.reach(4);
    b.boat().mooring.bow = side;
    b.reach(5);
    b.send('spring', undefined, b.boat().id, 1);
    b.reach(6);
    b.send('spring', undefined, b.boat().id, 0);
    b.run(1);
    expect(b.t().result?.passed).toBe(true);
  });

  it('H7: 90 s with her bow by the mark passes; three times off it fails', () => {
    const a = setup();
    a.send('trainingStart', 'holdOff');
    const mk = mark('Hold-off mark');
    // Her bow 4 m south of the mark, heading north, held there.
    const hold = () => a.place(mk.x, mk.z + 4 + 4.9, 0);
    a.reach(0, 60, hold);
    a.reach(1, 30, hold);
    a.run(95, hold);
    expect(a.t().result?.passed).toBe(true);
    const b = setup();
    b.send('trainingStart', 'holdOff');
    b.reach(1, 90, () => b.place(mk.x, mk.z + 9, 0));
    for (let k = 0; k < 3; k++) {
      b.run(2, () => b.place(mk.x, mk.z + 40, 0));
      b.run(2, () => b.place(mk.x, mk.z + 9, 0));
    }
    expect(b.t().result?.passed).toBe(false);
    expect(b.t().result?.reason).toMatch(/Off the mark 3 times/);
  });

  it('H11: anchored at 5:1 in sand passes; 3:1 in weed is too short', () => {
    for (const [id, scope, pass] of [['anchorSand', 5, true], ['anchorWeed', 3, false]] as const) {
      const a = setup();
      a.send('trainingStart', id);
      const p = m.arch.PORTS.find((x) => x.id === `training-${id.slice(6).toLowerCase()}`)!.cargo.anchorage!;
      a.reach(0, 60);
      a.send('anchorScope', undefined, a.boat().id, scope);
      a.place(p.x, p.z, 0);
      a.boat().controls.lever = 0;
      a.reach(1, 30);
      a.send('anchor', undefined, a.boat().id, 1);
      a.reach(2, 30);
      a.reach(3, 120);
      a.reach(4, 90);
      a.send('anchor', undefined, a.boat().id, 0);
      a.run(150);
      expect(a.t().result?.passed, id).toBe(pass);
      if (!pass) expect(a.t().result?.reason).toMatch(/weed/);
    }
  });

  it('H12: the right number of blasts before each manoeuvre; a wrong count is a fault', () => {
    const { t, reach, boat, run, place, send } = setup();
    send('trainingStart', 'hornSignals');
    reach(0);
    boat().controls.navLights = 1;
    reach(1);
    place(0, 55, 90);
    reach(2);
    const blast = (n: number) => {
      for (let k = 0; k < n; k++) {
        run(0.8, () => (boat().controls.horn = 1));
        run(0.8, () => (boat().controls.horn = 0));
      }
      run(3);
    };
    // Two blasts when one was called: a fault; then one, and the turn.
    blast(2);
    expect(t().faults.some((f) => f.kind === 'signal1')).toBe(true);
    blast(1);
    place(0, 55, 120);
    reach(3, 10);
    blast(2);
    place(0, 55, 90);
    reach(4, 10);
    blast(3);
    run(0.5, () => (boat().linearVelocity = [-1, 0, 0]));
    reach(5, 10, () => (boat().linearVelocity = [-1, 0, 0]));
    expect(t().faults.filter((f) => f.kind.startsWith('signal'))).toHaveLength(1);
  });

  it('H13: through the slalom alternately there and back passes; a mark the wrong side fails', () => {
    const weave = (wrongAt: number | null) => {
      const a = setup();
      a.send('trainingStart', 'slalom');
      a.reach(0, 60);
      const marks = m.arch.MARKS.filter((k) => k.name.startsWith('Slalom ')).sort((p, q) => p.x - q.x);
      // East: the first to port (she passes south of it, z greater), then alternately; west back the same way round.
      const pass = (xs: typeof marks, east: boolean) =>
        xs.forEach((mk, i) => {
          const port = i % 2 === 0;
          let south = east ? port : !port;
          if (wrongAt === i && east) south = !south;
          const z = mk.z + (south ? 8 : -8);
          a.place(mk.x + (east ? -5 : 5), z, east ? 90 : 270);
          a.run(0.1);
          a.place(mk.x + (east ? 5 : -5), z, east ? 90 : 270);
          a.run(0.1);
        });
      pass(marks, true);
      a.reach(1, 10);
      pass([...marks].reverse(), false);
      a.run(1);
      return a.t().result;
    };
    expect(weave(null)?.passed).toBe(true);
    expect(weave(2)?.passed).toBe(false);
  });

  it('H14: spring on, lines off, stern swung out, then away astern', () => {
    const { send, run, t, reach, boat } = setup();
    send('trainingStart', 'springOff');
    reach(0);
    send('spring', undefined, boat().id, 1);
    reach(1);
    send('cleat', undefined, boat().id, boat().mooring.bow! < 0 ? 0 : 1);
    send('cleat', undefined, boat().id, boat().mooring.stern! < 0 ? 2 : 3);
    reach(2);
    run(60, () => {
      boat().controls.lever = 0.3;
      boat().controls.helm = 1;
    });
    reach(3, 30, () => {
      boat().controls.lever = 0;
    });
    send('spring', undefined, boat().id, 0);
    // Away astern, two lengths clear.
    run(1);
    m.ctl.placeVessel(boat(), boat().position[0], 0, 170, 120);
    boat().linearVelocity = [-0.6, 0, 0.3];
    run(0.1);
    expect(t().result?.passed, t().result?.reason).toBe(true);
    expect(Number(t().result!.numbers[0][1].replace('°', ''))).toBeGreaterThanOrEqual(30);
  });

  it('H15: up to the buoy slowly, made fast, lain to, slipped', () => {
    const { send, run, t, reach, boat, place } = setup();
    send('trainingStart', 'pickUpMooring');
    const b = mark('The mooring');
    reach(0, 60);
    place(b.x, b.z + 6.5, 0);
    boat().controls.lever = 0;
    reach(1, 10);
    send('buoy', undefined, boat().id);
    reach(2, 10);
    run(25);
    send('buoy', undefined, boat().id);
    place(b.x, b.z + 30, 0);
    run(1);
    expect(t().result?.passed, t().result?.reason).toBe(true);
  });

  it('H5T: in the skiff, aboard her; no motor without the kill cord', () => {
    const { send, run, t, boat, me } = setup();
    send('trainingStart', 'stopOnCourseSkiff');
    expect(boat().defId).toBe('skiff');
    expect(me.aboardVesselId).toBe(boat().id);
    boat().controls.obOn = 1;
    run(0.1);
    expect(boat().controls.obOn).toBe(0);
    send('killCord', undefined, boat().id);
    boat().controls.obOn = 1;
    run(1);
    expect(boat().controls.obOn).toBe(1);
    expect(t().id).toBe('stopOnCourseSkiff');
    // Another exercise: the skiff goes, you're back in the fishing boat.
    send('trainingStart', 'castOff');
    expect(boat().defId).toBe('fishingBoat');
    expect(me.aboardVesselId).toBe(boat().id);
  });
});

describe('Training M3: rescue practice', { timeout: 120000 }, () => {
  const casualty = (world: import('../src/core/world').WorldState) => world.rescue!.active!.targets[0];

  it('R1: neutral at once, round and up into the wind, recovered: passed with its numbers', () => {
    const { world, send, run, t, reach, boat, place } = setup();
    send('trainingStart', 'mobIntoWind');
    reach(0, 60);
    place(-100, -230, 90);
    reach(1, 30, () => (boat().linearVelocity = [6 * m.ex.KN, 0, 0]));
    // Man overboard: neutral at once, the bow to port (stern away from them).
    expect(casualty(world)).toBeTruthy();
    boat().controls.lever = 0;
    run(1, () => (boat().controls.lever = 0));
    expect(t().step).toBe(2);
    m.ctl.placeVessel(boat(), boat().position[0], 0, boat().position[2], 60);
    run(6);
    // Round: well off them (carried past), then up to them into the wind (north), dead slow, them by the bow.
    const p = casualty(world);
    reach(2, 30);
    place(p.x, p.z + 40, 0);
    run(1);
    place(p.x, p.z + 5, 5);
    run(1);
    reach(3, 10);
    p.phase = 'aboard';
    run(1);
    expect(t().result?.passed, t().result?.reason).toBe(true);
    expect(t().result!.numbers[0][1]).toMatch(/s$/);
  });

  it('R1: in gear with the swimmer by the propeller fails at once', () => {
    const { world, send, run, t, reach, boat, place } = setup();
    send('trainingStart', 'mobIntoWind');
    reach(0, 60);
    place(-100, -230, 90);
    reach(1, 30, () => (boat().linearVelocity = [6 * m.ex.KN, 0, 0]));
    const p = casualty(world);
    // Her stern over them, in gear astern.
    m.ctl.placeVessel(boat(), p.x, 0, p.z - 4, 0);
    run(2, () => (boat().controls.lever = -0.5));
    expect(t().result?.passed).toBe(false);
    expect(t().result?.reason).toMatch(/propeller/);
  });

  it('R3: the tow needs a towing post; in the pilot boat: up to her, made fast, towed in', () => {
    const a = setup();
    a.send('trainingStart', 'takeInTow');
    expect(a.t().id).toBeNull();
    const { world, run, t, reach, boat, send } = setup('pilotBoat');
    send('trainingStart', 'takeInTow');
    const job = world.tow!.job!;
    const tw = world.vessels[job.vesselId];
    reach(0, 60);
    // Ahead of her, heading away, her stern by the tow's bow, stopped.
    m.ctl.placeVessel(tw, tw.position[0], 0, tw.position[2], 0);
    m.ctl.placeVessel(boat(), tw.position[0], 0, tw.position[2] - 14, 0);
    run(1);
    expect(m.tow.makeFastNow(world, boat().id, tw.id)).toBe(true);
    reach(2, 10);
    // Towed in: both moved inside (the line made fast again, as it would be after the tow).
    m.tow.castOffBoat(world, boat().id);
    m.ctl.placeVessel(tw, 0, 0, -40, 180);
    m.ctl.placeVessel(boat(), 0, 0, -26, 180);
    expect(m.tow.makeFastNow(world, boat().id, tw.id)).toBe(true);
    run(15);
    expect(t().result?.passed, t().result?.reason).toBe(true);
  });

  it('R4: the fire needs a monitor; in the pilot boat it is fought and put out', () => {
    const a = setup();
    a.send('trainingStart', 'fireFight');
    expect(a.t().id).toBeNull();
    const b = setup('pilotBoat');
    b.send('trainingStart', 'fireFight');
    expect(b.t().id).toBe('fireFight');
    const f = b.world.fire!.job!;
    b.reach(0, 60);
    b.place(f.x, f.z + 50, 0);
    b.reach(1, 10);
    f.phase = 'out';
    b.run(1);
    expect(b.t().result?.passed).toBe(true);
  });

  it('R5: under way in fog without a prolonged blast for two minutes is a fault', () => {
    const { send, run, t, reach, boat, place } = setup();
    send('trainingStart', 'fogPen');
    reach(0);
    boat().controls.navLights = 1;
    reach(1);
    place(0, 100, 0);
    run(125, () => (boat().linearVelocity = [0, 0, -1]));
    expect(t().faults.some((f) => f.kind.startsWith('noBlast'))).toBe(true);
  });

  it('R6: the alarm seen and the engine stopped in time passes', () => {
    const { send, run, t, reach, boat, place } = setup();
    send('trainingStart', 'engineAlarm');
    expect(boat().engine.coolingFault).toBe(true);
    reach(0, 60);
    place(-60, 55, 90);
    reach(1, 30, () => (boat().linearVelocity = [4 * m.ex.KN, 0, 0]));
    boat().engine.coolantC = 97;
    run(2, () => (boat().controls.lever = 0.5));
    boat().controls.lever = 0;
    reach(2, 20);
    boat().engine.key = 0;
    boat().engine.phase = 'off';
    run(1);
    expect(t().result?.passed, t().result?.reason).toBe(true);
  });

  it('R7: to the datum, the square searched, the casualty sighted and recovered', () => {
    const { world, send, run, t, reach, place } = setup();
    send('trainingStart', 'search');
    const d = mark('Datum');
    reach(0, 60);
    place(d.x, d.z + 10, 0);
    reach(1, 10);
    // Each leg run on its course (set along it), until the casualty is close.
    const legs = m.config.CONFIG.training.search.legs;
    let x = d.x;
    let z = d.z;
    for (let i = 0; i < legs.length && t().step <= legs.length; i++) {
      const [course, len] = legs[i];
      const dx = Math.sin((course * Math.PI) / 180);
      const dz = -Math.cos((course * Math.PI) / 180);
      for (let s = 0; s <= len && t().step === i + 1; s += 5) {
        place(x + dx * s, z + dz * s, course);
        run(0.5);
      }
      x += dx * len;
      z += dz * len;
    }
    // Sighted: up to them and recovered.
    const p = casualty(world);
    place(p.x, p.z + 6, 0);
    reach(legs.length + 1, 20);
    p.phase = 'aboard';
    run(1);
    expect(t().result?.passed, t().result?.reason).toBe(true);
  });
});

describe("Training M3: the Examiner's Run and badges", { timeout: 120000 }, () => {
  it('runs its manoeuvres one after another: a second attempt, then on; a compulsory one failed twice ends it', () => {
    const { send, run, t } = setup();
    send('trainingExam');
    const e = t().exam!;
    expect(e.items).toHaveLength(7);
    expect(e.items.filter((x) => x.compulsory)).toHaveLength(3);
    expect(t().id).toBe(e.items[0].id);
    // Fail whatever is running by its clock (out of time), item after item.
    const timeOut = () => {
      t().startedAt -= 100000;
      run(0.1);
    };
    const first = e.items[0];
    timeOut();
    expect(t().exam!.items[0].attempts).toBe(2);
    expect(t().id).toBe(first.id);
    timeOut();
    if (first.compulsory) {
      expect(t().exam).toBeUndefined();
      expect(t().result?.id).toBe('exam');
      expect(t().result?.passed).toBe(false);
      expect(t().result?.reason).toMatch(/compulsory/);
    } else {
      expect(t().exam!.i).toBe(1);
      expect(t().id).toBe(t().exam!.items[1].id);
    }
    // Stop ends it, no verdict.
    if (t().exam) {
      send('trainingAbort');
      expect(t().exam).toBeUndefined();
    }
    expect(m.ex.EXAM.enders).toContain('knock');
  });

  it('a pass earns gold with no faults, silver with a few, bronze with more', () => {
    expect(m.runs.badgeFor(0)).toBe('gold');
    expect(m.runs.badgeFor(2)).toBe('silver');
    expect(m.runs.badgeFor(5)).toBe('bronze');
  });
});
