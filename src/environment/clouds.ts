import { CONFIG } from '../config';
import type { WeatherState } from './weather';

/**
 * What the cloud layer shows (drawn by the sky dome, environment/skyView.ts; owner request:
 * not 3D, but it should tell you a storm is coming and it's getting darker).
 *
 * The sky is split by the wind: overhead and downwind is the weather you have now; the
 * upwind side shows the weather on its way. Each has a cover (how much of the sky is cloud,
 * 0..1) and a darkness (the grey of rain cloud, from the weather's rain).
 *   - Upwind: when the weather's next change is less than `lead` seconds off, its clouds
 *     build on the upwind horizon, more the nearer it is: a dark wall before rain or a
 *     squall, breaking cloud before it clears. Otherwise it's the weather now settling to.
 *   - At the change the new weather becomes the target, so upwind already shows it while
 *     overhead the cover eases over (CONFIG.weather.transition): the front comes over you.
 * Plain numbers from the shared weather state, so everyone sees the same sky.
 */
export interface CloudSky {
  /** Overhead / downwind: cover and darkness now. */
  cover: number;
  dark: number;
  /** Upwind: what's coming. */
  coverAhead: number;
  darkAhead: number;
  /** How near the next change is, 0 (beyond `lead`) .. 1 (now). */
  approach: number;
}

/** A weather's darkness: rain cloud is dark, the heavier the rain the darker; plain cloud a little. */
export function cloudDark(rain: number, cloud: number): number {
  return Math.min(1, rain * CONFIG.clouds.rainDark + cloud * CONFIG.clouds.cloudDark);
}

export function cloudSky(w: WeatherState | undefined, time: number): CloudSky {
  if (!w) return { cover: 0, dark: 0, coverAhead: 0, darkAhead: 0, approach: 0 };
  const p = CONFIG.weather.presets;
  const lead = CONFIG.clouds.lead / Math.max(1e-6, w.speed);
  const approach = w.fixed ? 0 : Math.min(1, Math.max(0, 1 - (w.next.at - time) / lead));
  const next = p[w.next.preset];
  const t = w.target;
  return {
    cover: w.now.cloud,
    dark: cloudDark(w.now.rain, w.now.cloud),
    coverAhead: t.cloud + (next.cloud - t.cloud) * approach,
    darkAhead: cloudDark(t.rain, t.cloud) + (cloudDark(next.rain, next.cloud) - cloudDark(t.rain, t.cloud)) * approach,
    approach,
  };
}
