/**
 * The seamanship mechanics added for Training's M3 (owner, 30 Oct 2026: "including missing
 * mechanics"), in the training harbour: the anchor's chosen scope (a short one drags, the
 * windlass veers to a longer one), a spring (she pivots on it, motoring ahead against it, her
 * bow held), a mooring buoy (picked up from the bow, she lies to its pennant) and the kill
 * cord (the motor stops when its wearer leaves the helm; in Training, no motor without it).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

let m: {
  world: typeof import('../src/core/world');
  sim: typeof import('../src/core/simulation');
  ids: typeof import('../src/core/ids');
  training: typeof import('../src/training/training');
  ex: typeof import('../src/training/exercises');
  ctl: typeof import('../src/vessel/vesselControl');
  vs: typeof import('../src/vessel/vesselState');
  weather: typeof import('../src/environment/weather');
  coastWeather: typeof import('../src/world/coastWeather');
  berths: typeof import('../src/world/berths');
  arch: typeof import('../src/world/archipelago');
  defs: typeof import('../src/vessel/vesselDef');
  autopilot: typeof import('../src/vessel/autopilot');
};

const DT = 1 / 60;
const KN = 1852 / 3600;

beforeAll(async () => {
  vi.stubGlobal('location', { pathname: '/training.html', search: '', href: 'https://localhost/training.html' });
  vi.resetModules();
  await import('../src/boats/library');
  m = {
    world: await import('../src/core/world'),
    sim: await import('../src/core/simulation'),
    ids: await import('../src/core/ids'),
    training: await import('../src/training/training'),
    ex: await import('../src/training/exercises'),
    ctl: await import('../src/vessel/vesselControl'),
    vs: await import('../src/vessel/vesselState'),
    weather: await import('../src/environment/weather'),
    coastWeather: await import('../src/world/coastWeather'),
    berths: await import('../src/world/berths'),
    arch: await import('../src/world/archipelago'),
    defs: await import('../src/vessel/vesselDef'),
    autopilot: await import('../src/vessel/autopilot'),
  };
});

function setup(boat = 'fishingBoat') {
  const { world, vesselId, localPlayerId } = m.world.createWorld(new m.ids.IdFactory(), boat, { harbour: true, weather: true, voyage: true });
  world.quietCalls = true;
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, target = v.id) => m.sim.stepWorld(world, [{ playerId: localPlayerId, targetId: target, control, value }], DT);
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      each?.();
      m.sim.stepWorld(world, [], DT);
    }
  };
  const wind = (kn: number, from: number) => m.weather.setManualWeather(world.environment, { wind: kn * KN, windFrom: from, rain: 0, hs: 0.1 }, world.time, m.coastWeather.seaScaleFor(0.1));
  return { world, v, send, run, wind, me: world.players[localPlayerId] };
}

const free = (v: import('../src/vessel/vesselState').VesselState, x: number, z: number, hdg: number) => {
  m.ctl.placeVessel(v, x, 0, z, hdg);
  v.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
};

describe('seamanship mechanics', { timeout: 120000 }, () => {
  it('anchor scope: 2:1 in weed drags in a strong breeze; 7:1 holds; raising it veers more chain', () => {
    const port = m.arch.PORTS.find((p) => p.id === 'training-weed')!;
    const result: Record<number, { dragged: number; rode: number; dragTicks: number }> = {};
    for (const scope of [2, 7]) {
      const { v, send, run, wind } = setup();
      wind(24, 0);
      free(v, port.x, port.z, 0);
      send('anchorScope', scope);
      send('anchor', 1);
      run(40);
      const at = [v.anchor.x, v.anchor.z];
      let dragTicks = 0;
      run(120, () => {
        if (v.anchor.dragging) dragTicks++;
      });
      result[scope] = { dragged: Math.hypot(v.anchor.x - at[0], v.anchor.z - at[1]), rode: v.anchor.rodeM, dragTicks };
    }
    expect(result[2].rode).toBeLessThan(result[7].rode / 2.5);
    // 2:1 in weed in a strong breeze: her anchor ploughs off metres; 7:1 holds her (a snatch
    // or two shifts it a little).
    expect(result[2].dragTicks).toBeGreaterThan(50);
    expect(result[2].dragged).toBeGreaterThan(1.5);
    expect(result[7].dragged).toBeLessThan(0.8);
    // Veer: set at 3:1, then 7:1 chosen with the anchor down pays out more.
    const { v, send, run, wind } = setup();
    wind(6, 0);
    free(v, port.x, port.z, 0);
    send('anchorScope', 3);
    send('anchor', 1);
    run(40);
    const short = v.anchor.rodeM;
    expect(v.anchor.phase).toBe('set');
    send('anchorScope', 7);
    run(40);
    expect(v.anchor.rodeM).toBeGreaterThan(short * 2);
    expect(v.anchor.phase).toBe('set');
    // And back to 3:1: hove in to it, the anchor still down.
    send('anchorScope', 3);
    run(90);
    expect(v.anchor.rodeM).toBeLessThan(short + 1);
    expect(v.anchor.phase).toBe('set');
  });

  it('a fore spring: lines let go, ahead against it with the helm to the quay, her stern swings out and her bow stays', () => {
    const { v, send, run } = setup();
    v.controls.fenders = 1;
    m.autopilot.quickStart(v);
    run(5);
    expect(v.mooring.berthId).toBe('training-b');
    send('spring', 1);
    expect(v.mooring.spring?.end).toBe('fore');
    // Bow and stern lines off (their cleats on the quay side, which toggles them).
    send('cleat', v.mooring.bow! < 0 ? 0 : 1);
    send('cleat', v.mooring.stern! < 0 ? 2 : 3);
    expect(v.mooring.phase).toBe('free');
    const bow0 = [...v.position];
    const hdg0 = m.ex.heading(v);
    // Quay to the south, she lies east: helm to starboard puts her stern out to the north.
    run(40, () => {
      v.controls.lever = 0.25;
      v.controls.helm = 1;
    });
    const swung = Math.abs(m.ex.turnFrom(m.ex.heading(v), hdg0));
    expect(swung).toBeGreaterThan(20);
    expect(Math.hypot(v.position[0] - bow0[0], v.position[2] - bow0[2])).toBeLessThan(8);
    expect(v.mooring.spring).toBeTruthy();
    send('spring', 0);
    expect(v.mooring.spring).toBeUndefined();
  });

  it('a mooring buoy: picked up from close under the bow, she lies to its pennant', () => {
    const { v, send, run, wind } = setup();
    const buoy = m.arch.MARKS.find((mk) => mk.kind === 'mooring')!;
    wind(10, 0);
    // Her bow cleat a couple of metres short of the buoy, heading north into the wind.
    free(v, buoy.x, buoy.z + 6.5, 0);
    send('buoy', 1);
    expect(v.mooring.buoy?.id).toBe('The mooring');
    run(90);
    // Lying to it downwind of it, not drifted away.
    expect(Math.hypot(v.position[0] - buoy.x, v.position[2] - buoy.z)).toBeLessThan(13);
    expect(v.position[2]).toBeGreaterThan(buoy.z);
    send('buoy', 1);
    expect(v.mooring.buoy).toBeUndefined();
    // Too far off: nothing to pick up.
    free(v, buoy.x, buoy.z + 30, 0);
    send('buoy', 1);
    expect(v.mooring.buoy).toBeUndefined();
  });

  it('the kill cord: the motor stops when its wearer leaves the helm; in Training none runs without it', () => {
    const { world, send, run, me } = setup();
    const id = 'rib-test';
    const rib = m.vs.createVesselState(id, 'rib');
    world.vessels[id] = rib;
    free(rib, 0, 60, 90);
    me.aboardVesselId = id;
    me.position = [...m.defs.VESSEL_DEFS.rib.boardingSpot];
    send('killCord', 1, id);
    expect(rib.killCord?.by).toBe(me.id);
    rib.engine.phase = 'running';
    rib.engine.key = 1;
    run(1);
    expect(rib.engine.phase).toBe('running');
    // Over the side: three metres from the helm.
    me.position = [me.position[0] + 3, me.position[1], me.position[2]];
    run(0.1);
    expect(rib.engine.phase).toBe('off');
    expect(rib.killCord?.pulled).toBe(true);
    // In Training, no motor without the cord clipped on.
    world.training = m.training.createTraining();
    rib.engine.phase = 'running';
    run(0.1);
    expect(rib.engine.phase).toBe('off');
    me.position = [...m.defs.VESSEL_DEFS.rib.boardingSpot];
    send('killCord', 1, id);
    rib.engine.phase = 'running';
    rib.engine.key = 1;
    run(1);
    expect(rib.engine.phase).toBe('running');
  });
});
