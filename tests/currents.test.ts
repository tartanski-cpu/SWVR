/**
 * Tidal races as current zones (regions, milestone 3; world/currents.ts): the clock, the
 * water's velocity, the standing waves, the boats against it, the whirl points, the drift,
 * the forecast line.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { createEnvironment } from '../src/environment/environmentState';
import { racesText } from '../src/environment/forecast';
import { createWeather } from '../src/environment/weather';
import { prepareWaves, restPosition, sampleSurface, surfaceHeight } from '../src/ocean/waves';
import { decodeDesign, DEFAULT_DESIGN } from '../src/shipyard/design';
import { matchGear } from '../src/shipyard/trial';
import { placeVessel } from '../src/vessel/vesselControl';
import { CURRENTS, type CurrentZoneDef } from '../src/world/archipelago';
import { addCurrent, knockPoints, nextSlack, raceFactor, raceReading, raceRoarLevel, raceWaveFactor, setRaceClock, slackTimes, zoneWeight } from '../src/world/currents';
import { driftVelocity } from '../src/world/drift';
import { fakeCanvas } from './modular/fakes';

const DT = 1 / 60;
const KN = 0.514444;
const RACE = CURRENTS.find((z) => z.id === 'sruth-tarsk')!;
/** The Shipyard pilot boat of the in-game tests: twin engines, 23.9 kn. */
const PILOT = '064GC-J03DJ-35TTG-49K0G';

beforeAll(fakeCanvas);
afterAll(() => {
  useDesign(DEFAULT_DESIGN);
  setRaceClock(CONFIG.environment.startTimeOfDay);
});

/** Her speed over the ground along her heading (kn; her bow is -z in her own axes). */
function headwayKn(v: { linearVelocity: number[]; orientation: number[] }): number {
  const [qx, qy, qz, qw] = v.orientation;
  // Forward (0, 0, -1) turned by the orientation.
  const fx = -(2 * (qx * qz + qw * qy));
  const fz = -(1 - 2 * (qx * qx + qy * qy));
  return (v.linearVelocity[0] * fx + v.linearVelocity[2] * fz) / KN;
}

function boat(defId: string, heading: number) {
  const { world, vesselId } = createWorld(new IdFactory(), defId);
  const v = world.vessels[vesselId];
  world.environment.waves = [];
  world.environment.timeScale = 0;
  // At the north end of the race (its set is north), heading `heading`; geography on (the
  // knocks run in the archipelago). A run of half a minute stays well inside the zone.
  const start = () => placeVessel(v, RACE.x, 0, RACE.z - RACE.length / 2 + 120, heading);
  start();
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run, start };
}

describe('the race clock', () => {
  it('floods, slackens, ebbs and slackens again over its period, from its phase', () => {
    const z: CurrentZoneDef = { ...RACE, periodH: 6, phaseH: 1 };
    expect(raceFactor(z, 1)).toBeCloseTo(0);
    expect(raceFactor(z, 2.5)).toBeCloseTo(1);
    expect(raceFactor(z, 4)).toBeCloseTo(0);
    expect(raceFactor(z, 5.5)).toBeCloseTo(-1);
    expect(raceFactor(z, 7)).toBeCloseTo(0);
    expect(raceFactor(z, 2.5, 'slack')).toBe(0);
    expect(raceFactor(z, 1, 'peak')).toBe(1);
  });
  it('knows its slack times and the next one', () => {
    expect(slackTimes(RACE)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    expect(nextSlack(RACE, 10.5)).toBe(12);
    expect(nextSlack(RACE, 12)).toBe(15);
    expect(nextSlack(RACE, 23)).toBe(0);
    const z: CurrentZoneDef = { ...RACE, periodH: 6, phaseH: 1 };
    expect(slackTimes(z)).toEqual([1, 4, 7, 10, 13, 16, 19, 22]);
  });
  it('a reading: running with the set on the flood, against it on the ebb, slack between', () => {
    expect(raceReading(RACE, 1.5)).toMatchObject({ kn: 9, dirDeg: 0, slack: false, nextSlackH: 3 });
    expect(raceReading(RACE, 4.5)).toMatchObject({ kn: 9, dirDeg: 180, slack: false, nextSlackH: 6 });
    expect(raceReading(RACE, 3.02).slack).toBe(true);
  });
});

describe('the water in the zone', () => {
  it('is in the zone fully inside, not outside, fading over the edge', () => {
    expect(zoneWeight(RACE, RACE.x, RACE.z)).toBe(1);
    expect(zoneWeight(RACE, RACE.x + RACE.width / 2 + 1, RACE.z)).toBe(0);
    expect(zoneWeight(RACE, RACE.x, RACE.z + RACE.length / 2 + 1)).toBe(0);
    const edge = zoneWeight(RACE, RACE.x + RACE.width / 2 - CONFIG.currents.edgeFade / 2, RACE.z);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });
  it('runs along the set at the peak rate at peak, the other way on the ebb, nothing outside', () => {
    setRaceClock(1.5); // flood peak: north (-z)
    const v = { x: 0, z: 0 };
    expect(addCurrent(RACE.x, RACE.z, v)).toBe(1);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(-9 * KN, 5);
    setRaceClock(4.5);
    v.x = v.z = 0;
    addCurrent(RACE.x, RACE.z, v);
    expect(v.z).toBeCloseTo(9 * KN, 5);
    v.x = v.z = 0;
    expect(addCurrent(0, 0, v)).toBe(0);
    expect(v.z).toBe(0);
  });
  it('every surface sample carries it: the water moves, the drift moves with it', () => {
    setRaceClock(1.5);
    const waves = prepareWaves(createEnvironment().waves, 10);
    const inRace = sampleSurface(waves, RACE.x, RACE.z);
    const outside = sampleSurface(waves, RACE.x + 2000, RACE.z);
    expect(inRace.velocity[2] - outside.velocity[2]).toBeLessThan(-8 * KN);
    const env = createEnvironment();
    const d = driftVelocity(env, RACE.x, RACE.z, { x: 0, z: 0 });
    expect(d.z).toBeLessThan(-8 * KN);
    const d0 = driftVelocity(env, 0, 0, { x: 0, z: 0 });
    expect(d0.x).toBeCloseTo(CONFIG.rescue.drift[0]);
    expect(d0.z).toBeCloseTo(CONFIG.rescue.drift[1]);
  });
  it('the waves stand up inside a running race (the same factor the shader applies), and still converge', () => {
    const waves = prepareWaves(createEnvironment().waves, 10);
    setRaceClock(1.5);
    expect(raceWaveFactor(RACE.x, RACE.z)).toBeCloseTo(RACE.waveFactor);
    expect(raceWaveFactor(0, 0)).toBe(1);
    // The crest in the race is waveFactor times the open sea's, sampled over a wavelength.
    let maxIn = 0;
    let maxOut = 0;
    for (let x = -150; x <= 150; x += 2)
      for (let z = -300; z <= 300; z += 10) {
        maxIn = Math.max(maxIn, surfaceHeight(waves, RACE.x + x, RACE.z + z));
        maxOut = Math.max(maxOut, surfaceHeight(waves, RACE.x + x + 3000, RACE.z + z));
      }
    expect(maxIn / maxOut).toBeGreaterThan(1.5);
    expect(maxIn / maxOut).toBeLessThan(RACE.waveFactor + 0.1);
    // The rest-position iteration still lands on the point (the steepness stays under 1).
    const [x0, z0] = restPosition(waves, RACE.x + 7, RACE.z + 3);
    expect(Number.isFinite(x0 + z0)).toBe(true);
    setRaceClock(3); // slack: as the open sea
    expect(raceWaveFactor(RACE.x, RACE.z)).toBe(1);
  });
  it('is heard from outside, louder inside and when it runs harder', () => {
    setRaceClock(1.5);
    expect(raceRoarLevel(RACE.x, RACE.z)).toBeCloseTo(1);
    const near = raceRoarLevel(RACE.x + RACE.width / 2 + 200, RACE.z);
    expect(near).toBeGreaterThan(0.5);
    expect(near).toBeLessThan(1);
    expect(raceRoarLevel(RACE.x + RACE.width / 2 + CONFIG.currents.roar.hearRange + 1, RACE.z)).toBe(0);
    setRaceClock(3);
    expect(raceRoarLevel(RACE.x, RACE.z)).toBe(0);
  });
});

describe('boats in the race', () => {
  it('the workboat flat out against the 9 kn race: slowed to a crawl over the ground, her speed through the water kept', () => {
    const { world, v, send, run, start } = boat('workboat', 180); // heading south, into the flood
    world.environment.raceOverride = 'slack';
    send('quickStart', 1);
    run(3);
    send('lever', 1);
    run(40);
    const slackKn = headwayKn(v);
    expect(slackKn).toBeGreaterThan(11);
    start();
    world.environment.raceOverride = 'peak';
    run(40);
    const peakKn = headwayKn(v);
    // Over the ground: her 13 kn less the 9 kn of water, within the knocks' stirring.
    expect(peakKn).toBeLessThan(slackKn - 7);
    expect(peakKn).toBeGreaterThan(0);
    // Through the water she still makes her speed: SOG + the current she's fighting.
    expect(peakKn + RACE.peakKn).toBeGreaterThan(slackKn - 1.5);
  });
  it('against a race stronger than she is, she goes backwards over the ground', () => {
    const strong = CURRENTS.indexOf(RACE);
    const saved = RACE.peakKn;
    (CURRENTS[strong] as { peakKn: number }).peakKn = 16;
    try {
      const { world, v, send, run } = boat('workboat', 180);
      // From the south end: carried north (backwards) she stays in the zone.
      placeVessel(v, RACE.x, 0, RACE.z + RACE.length / 2 - 120, 180);
      world.environment.raceOverride = 'peak';
      send('quickStart', 1);
      run(3);
      send('lever', 1);
      run(50);
      expect(headwayKn(v)).toBeLessThan(-1.5);
    } finally {
      (CURRENTS[strong] as { peakKn: number }).peakKn = saved;
    }
  });
  it('a Shipyard pilot boat punches through at peak', () => {
    const read = decodeDesign(PILOT);
    if (!('design' in read)) throw new Error(read.error);
    // (Her gearbox matched to her, as the Shipyard does.)
    useDesign({ ...read.design, gear: matchGear(read.design).gear });
    const { world, v, send, run } = boat('design', 180);
    world.environment.raceOverride = 'peak';
    send('quickStart', 1);
    run(3);
    send('lever', 1);
    run(25);
    expect(headwayKn(v)).toBeGreaterThan(10);
  });
  it('the whirl points knock her head about at peak, not at slack', () => {
    const k = knockPoints(RACE);
    expect(k).toHaveLength(RACE.knocks);
    for (const p of k) expect(zoneWeight(RACE, p.x, p.z)).toBeGreaterThan(0.5);
    const yawAfter = (override: 'peak' | 'slack') => {
      const { world, v, run } = boat('workboat', 0);
      world.environment.raceOverride = override;
      placeVessel(v, k[0].x, 0, k[0].z, 0);
      run(0.5);
      return Math.abs(v.angularVelocity[1]);
    };
    expect(yawAfter('peak')).toBeGreaterThan(yawAfter('slack') + 0.005);
  });
});

describe('the forecast', () => {
  it('says whether each race is running and when the next slack is', () => {
    const env = createEnvironment();
    env.timeOfDay = 1.5;
    env.weather = createWeather();
    expect(racesText(env)).toMatch(/Sruth Tarsk: race running north 9 knots, slack about 03:00/);
    env.timeOfDay = 3.05;
    expect(racesText(env)).toMatch(/Sruth Tarsk: slack water, the race running again by/);
    env.timeOfDay = 4.5;
    expect(racesText(env)).toMatch(/running south 9 knots, slack about 06:00/);
  });
});
