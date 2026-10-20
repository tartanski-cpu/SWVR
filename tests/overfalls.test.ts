/**
 * Overfalls (owner, Oct 2026: steeper seas in some places, harder to travel through): wind
 * waves meeting a tidal race running against them stand up and sharpen, with a short chop
 * on top; with the flow the sea eases. The crest-loop limit holds at the worst case, and
 * the added resistance in waves slows a boat through the overfalls.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { seaStateWaves } from '../src/environment/environmentState';
import { racesText } from '../src/environment/forecast';
import { localSeaAt, prepareWaves, sampleSurface, wavenumberFromPeriod } from '../src/ocean/waves';
import { placeVessel } from '../src/vessel/vesselControl';
import { CURRENTS } from '../src/world/archipelago';
import { addCurrent, raceAt, raceOpposition, setRaceClock } from '../src/world/currents';

const RACE = CURRENTS.find((z) => z.id === 'sruth-tarsk')!; // set 000: floods north, ebbs south
const EBB = RACE.phaseH + (3 * RACE.periodH) / 4; // sin = -1: the ebb at full strength
const FLOOD = RACE.phaseH + RACE.periodH / 4;
/** The sea's main waves travel toward 25-80 degrees (CONFIG.ocean.waves): against the ebb, with the flood. */
const sea = (scale: number) => prepareWaves(seaStateWaves(scale), 100);
/** Mean |slope| and the biggest crest over a grid in (or beside) the race. */
function roughness(waves: ReturnType<typeof sea>, cx: number, cz: number): { slope: number; peak: number } {
  let slope = 0;
  let peak = 0;
  let n = 0;
  for (let dx = -40; dx <= 40; dx += 8)
    for (let dz = -40; dz <= 40; dz += 8) {
      const s = sampleSurface(waves, cx + dx, cz + dz);
      slope += Math.hypot(s.normal[0], s.normal[2]) / Math.max(1e-6, s.normal[1]);
      peak = Math.max(peak, s.height);
      n++;
    }
  return { slope: slope / n, peak };
}

afterAll(() => setRaceClock(CONFIG.environment.startTimeOfDay));

describe('overfalls', () => {
  it('a wave against the flow opposes, with it is carried; nothing at slack', () => {
    setRaceClock(EBB);
    const r = raceAt(RACE.x, RACE.z);
    expect(r.sw).toBeCloseTo(-1, 2);
    expect(raceOpposition(r, 0, -1)).toBeCloseTo(1, 2); // travelling north, into the ebb running south: against it
    expect(raceOpposition(r, 0, 1)).toBeCloseTo(-1, 2); // travelling south, carried with it
    expect(raceOpposition(r, 1, 0)).toBeCloseTo(0, 2); // across
    setRaceClock(RACE.phaseH); // slack
    expect(raceAt(RACE.x, RACE.z).sw).toBe(0);
  });

  it('the sea has a chop pair that is nothing outside a running race', () => {
    const w = seaStateWaves(1);
    expect(w.filter((c) => c.chop)).toHaveLength(CONFIG.currents.overfalls.chop.periods.length);
    setRaceClock(RACE.phaseH);
    const far = localSeaAt(sea(1), RACE.x + 3000, RACE.z);
    const flat = localSeaAt(prepareWaves(seaStateWaves(1).filter((c) => !c.chop), 100), RACE.x + 3000, RACE.z);
    expect(far.amp).toBeCloseTo(flat.amp, 6);
  });

  it('against the race the sea stands up and sharpens; with it, it eases', () => {
    const waves = sea(1.5);
    setRaceClock(RACE.phaseH); // slack: the race's own standing waves off too
    const calm = roughness(waves, RACE.x, RACE.z);
    setRaceClock(EBB); // the main sea (toward NE) meets the ebb running south: overfalls
    const against = roughness(waves, RACE.x, RACE.z);
    const beside = roughness(waves, RACE.x + 1500, RACE.z);
    setRaceClock(FLOOD); // carried along with the flood: eased (the race's standing waves still up)
    const withIt = roughness(waves, RACE.x, RACE.z);
    expect(against.slope).toBeGreaterThan(calm.slope * 1.6);
    expect(against.slope).toBeGreaterThan(beside.slope * 1.6);
    expect(against.peak).toBeGreaterThan(calm.peak * 1.4);
    expect(withIt.slope).toBeLessThan(against.slope * 0.75);
  });

  it('the crests never loop: the orbits are capped where the race and the overfalls would push Σ Q·k·A past the cap', () => {
    // The roughest sea in the strongest race, dead against: no overhanging slope anywhere
    // (a looping crest would turn the normal over), and the heights still stand.
    const waves = sea(CONFIG.ocean.maxSeaScale);
    const strongest = CURRENTS.reduce((a, b) => (b.waveFactor > a.waveFactor ? b : a));
    setRaceClock(strongest.phaseH + (3 * strongest.periodH) / 4);
    expect(Math.abs(raceAt(strongest.x, strongest.z).sw)).toBeGreaterThan(0.99);
    let peak = 0;
    for (let dx = -60; dx <= 60; dx += 4)
      for (let dz = -60; dz <= 60; dz += 12) {
        const s = sampleSurface(waves, strongest.x + dx, strongest.z + dz);
        expect(s.normal[1]).toBeGreaterThan(0.15);
        expect(Number.isFinite(s.height)).toBe(true);
        peak = Math.max(peak, s.height);
      }
    expect(peak).toBeGreaterThan(1.5);
    expect(wavenumberFromPeriod(2)).toBeGreaterThan(0);
  });

  it('the forecast warns of overfalls when the wind sea runs against the race', () => {
    const { world } = createWorld(new IdFactory());
    world.environment.seaScale = 1.5;
    world.environment.waves = seaStateWaves(1.5);
    world.environment.timeOfDay = EBB;
    expect(racesText(world.environment)).toMatch(/Sruth Tarsk: race running south[^.]*wind against tide/);
    world.environment.timeOfDay = FLOOD;
    expect(racesText(world.environment)).not.toMatch(/Sruth Tarsk: race running north[^.]*wind against tide/);
  });

  it('a boat is slower through the overfalls than she would be without the added resistance in waves', () => {
    const run = (gain: number) => {
      const saved = CONFIG.ocean.addedResistance.gain;
      CONFIG.ocean.addedResistance.gain = gain;
      try {
        const { world, vesselId } = createWorld(new IdFactory(), 'workboat');
        const v = world.vessels[vesselId];
        world.environment.seaScale = 1.5;
        world.environment.waves = seaStateWaves(1.5);
        world.environment.timeOfDay = EBB;
        world.environment.timeScale = 0;
        const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value }], 1 / 60);
        // At the north end of the race heading south: into the ebb, the sea (toward NE) on her bow.
        placeVessel(v, RACE.x, 0, RACE.z - RACE.length / 2 + 120, 180);
        send('quickStart', 1);
        for (let i = 0; i < 3 * 60; i++) stepWorld(world, [], 1 / 60);
        send('lever', 1);
        let through = 0;
        let n = 0;
        for (let i = 0; i < 40 * 60; i++) {
          stepWorld(world, [], 1 / 60);
          if (i < 25 * 60) continue;
          // Speed through the water along her heading: over the ground less the current.
          const cur = { x: 0, z: 0 };
          addCurrent(v.position[0], v.position[2], cur);
          const [qx, qy, qz, qw] = v.orientation;
          const fx = -2 * (qx * qz + qy * qw);
          const fz = -(1 - 2 * (qx * qx + qy * qy));
          through += (v.linearVelocity[0] - cur.x) * fx + (v.linearVelocity[2] - cur.z) * fz;
          n++;
        }
        return through / n;
      } finally {
        CONFIG.ocean.addedResistance.gain = saved;
      }
    };
    const without = run(0);
    const withIt = run(CONFIG.ocean.addedResistance.gain);
    expect(without).toBeGreaterThan(3);
    expect(withIt).toBeLessThan(without * 0.9);
  });
});
