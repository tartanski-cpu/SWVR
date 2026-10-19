/**
 * The cloud layer's weather (environment/clouds.ts): overhead is the weather now; the
 * upwind side shows the next change as it comes within `lead`, and carries straight on
 * into the new weather when it arrives (no jump).
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { cloudDark, cloudSky } from '../src/environment/clouds';
import { createWeather, setWeatherPreset } from '../src/environment/weather';

describe('clouds', () => {
  it('rain cloud is darker than plain cloud, a squall darkest', () => {
    const p = CONFIG.weather.presets;
    const d = (n: keyof typeof p) => cloudDark(p[n].rain, p[n].cloud);
    expect(d('Clear')).toBeLessThan(d('Overcast'));
    expect(d('Overcast')).toBeLessThan(d('Rain'));
    expect(d('Rain')).toBeLessThanOrEqual(d('Squall'));
  });

  it('a storm far off shows nothing upwind; within the lead it builds there, darkening', () => {
    const w = createWeather('Overcast', 0);
    w.next = { preset: 'Rain', at: 10000 };
    const far = cloudSky(w, 10000 - CONFIG.clouds.lead - 10);
    expect(far.approach).toBe(0);
    expect(far.darkAhead).toBeCloseTo(far.dark, 5);
    const half = cloudSky(w, 10000 - CONFIG.clouds.lead / 2);
    const near = cloudSky(w, 10000 - 5);
    expect(half.darkAhead).toBeGreaterThan(far.darkAhead);
    expect(near.darkAhead).toBeGreaterThan(half.darkAhead);
    expect(near.cover).toBeCloseTo(CONFIG.weather.presets.Overcast.cloud, 5); // overhead: still overcast
  });

  it('when the change comes, upwind already shows it: no jump; overhead eases after', () => {
    const w = createWeather('Overcast', 0);
    w.next = { preset: 'Rain', at: 1000 };
    const before = cloudSky(w, 999.99);
    setWeatherPreset(w, 'Rain', 1000);
    const after = cloudSky(w, 1000);
    expect(after.darkAhead).toBeCloseTo(before.darkAhead, 2);
    expect(after.coverAhead).toBeCloseTo(before.coverAhead, 2);
    expect(after.dark).toBeLessThan(after.darkAhead); // overhead hasn't caught up yet
  });

  it('a fixed weather shows no change coming', () => {
    const w = createWeather('Clear', 0);
    w.fixed = true;
    w.next = { preset: 'Overcast', at: 10 };
    expect(cloudSky(w, 9).approach).toBe(0);
  });
});
