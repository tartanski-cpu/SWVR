/**
 * The solar catamaran charging from the sun (owner, 27 Oct 2026: "plan the implementation of
 * solar charging from the sun with a realistic model"; environment/sunlight.ts,
 * modules/solarRoof `charge`): the sky model, her panels by the way they face, real-time power
 * into her battery, the cloud, the night, and a full battery taking less.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { RECIPES } from '../../src/boats/library';
import { IdFactory } from '../../src/core/ids';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { panelGroups, type SolarRoofConfig } from '../../src/modules/solarRoof';
import { planeIrradiance, sunlight } from '../../src/environment/sunlight';
import { sunDirection } from '../../src/environment/timeOfDay';
import { createWeather } from '../../src/environment/weather';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { SOLAR_CAT } from '../../src/shipyard/parts/catalog';
import { placeVessel } from '../../src/vessel/vesselControl';
import type { WeatherPresetName } from '../../src/config';
import type { Intent } from '../../src/core/intents';

afterAll(() => useDesign(DEFAULT_DESIGN));

const cat: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[SOLAR_CAT].defaults, hull: SOLAR_CAT };
const DT = 1 / 60;

/** Her lying still on calm water at `hour`, the clock stopped, heading `deg`, in the weather given (none: a clear sky). */
function lying(hour: number, deg = 0, weather?: WeatherPresetName) {
  useDesign(cat);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, deg);
  world.environment.waves = [];
  world.geography = 'openSea';
  world.environment.timeOfDay = hour;
  world.environment.timeScale = 0;
  if (weather) {
    world.environment.weather = createWeather(weather);
    world.environment.weather.fixed = true;
  }
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
  return { v, run, send };
}

describe('sunlight (environment/sunlight.ts)', () => {
  it('about 800 W/m2 at the game’s noon in a clear sky, a quarter of it overcast, none at night', () => {
    const noon = sunlight(sunDirection(12), 0, 0);
    expect(noon.ghi).toBeGreaterThan(750);
    expect(noon.ghi).toBeLessThan(860);
    // Clear: mostly the direct beam.
    expect(noon.dhi / noon.ghi).toBeLessThan(0.25);
    const grey = sunlight(sunDirection(12), 1, 0);
    expect(grey.ghi / noon.ghi).toBeCloseTo(0.25, 2);
    expect(grey.dhi / grey.ghi).toBeGreaterThan(0.95);
    expect(sunlight(sunDirection(23), 0, 0).ghi).toBe(0);
    // A panel square to the sun gets more than a level one; one facing away, only the sky's and the sea's.
    const sq = noon.sun;
    expect(planeIrradiance(noon, sq)).toBeGreaterThan(planeIrradiance(noon, [0, 1, 0]));
    const away: [number, number, number] = [-sq[0], 0, -sq[2]];
    const l = Math.hypot(away[0], away[2]);
    expect(planeIrradiance(noon, [away[0] / l, 0, away[2] / l])).toBeLessThan(noon.dhi);
  });
});

describe('the solar catamaran charging from the sun', () => {
  it('has her panels in groups: the roof level, the sloped front facing ahead and up', () => {
    useDesign(cat);
    const roof = RECIPES.design.modules.find((m) => m.module === 'deck.solar-roof')!.config as unknown as SolarRoofConfig;
    expect(roof.charge!.batteryKWh).toBeCloseTo(90, 5);
    const [flat, slope] = panelGroups(roof);
    expect(flat.n).toEqual([0, 1, 0]);
    expect(flat.area).toBeGreaterThan(20);
    // Her front sloped back 60° from upright (design.kick 12): its panels 30° off level, facing ahead.
    expect(slope.n[1]).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 2);
    expect(slope.n[2]).toBeLessThan(0);
  });

  it('charges about 4.5-6 kW at noon in a clear sky, in real time, with the motors off', () => {
    const { v, run } = lying(12);
    v.battery = 0.5;
    run(60);
    expect(v.solar!.wm2).toBeGreaterThan(750);
    expect(v.solar!.panelKw).toBeGreaterThan(4.5);
    expect(v.solar!.panelKw).toBeLessThan(6.5);
    // A minute's worth on real-time power: about 0.09 kWh of her 90.
    const kWh = (v.battery! - 0.5) * 90;
    expect(kWh).toBeCloseTo((v.solar!.chargeKw * 60) / 3600, 2);
  });

  it('her sloped front gives more facing the sun than facing away from it', () => {
    // The game's sun at noon is to the south (+z): bow south (180°) faces it, north (0°) away.
    const toward = lying(12, 180);
    const away = lying(12, 0);
    toward.run(1);
    away.run(1);
    expect(toward.v.solar!.panelKw).toBeGreaterThan(away.v.solar!.panelKw * 1.05);
  });

  it('gives a quarter of that overcast, less in rain, and nothing at night', () => {
    const clear = lying(12);
    const grey = lying(12, 0, 'Overcast');
    const rain = lying(12, 0, 'Rain');
    const night = lying(23);
    for (const x of [clear, grey, rain, night]) x.run(1);
    expect(grey.v.solar!.panelKw / clear.v.solar!.panelKw).toBeGreaterThan(0.3);
    expect(grey.v.solar!.panelKw / clear.v.solar!.panelKw).toBeLessThan(0.65);
    expect(rain.v.solar!.panelKw).toBeLessThan(grey.v.solar!.panelKw);
    expect(night.v.solar!.panelKw).toBe(0);
  });

  it('a full battery takes less and less, but the sun still runs her motors', () => {
    const { v, run, send } = lying(12);
    v.battery = 0.99;
    run(1);
    expect(v.solar!.chargeKw).toBeLessThan(v.solar!.panelKw * 0.2);
    // Under way slowly, her motors take what the panels make: all of it is used.
    send('quickStart', 1);
    send('lever', 0.5);
    run(20);
    expect(v.engine.powerKw!).toBeGreaterThan(v.solar!.panelKw);
    expect(v.solar!.chargeKw).toBeCloseTo(v.solar!.panelKw * CONFIG.shipyard.solarCat.solar.chargeEff, 1);
  });
});
