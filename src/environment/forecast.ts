/**
 * The VHF shipping forecast. The weather director always knows its next change (preset and
 * time); the coastguard reads that out regularly and soon after each change
 * (WeatherState.forecastAt). It is heard only on a boat whose radio is on (Radio breaker):
 * then it becomes WorldState.forecast, shown on the duty board and spoken on the VHF.
 * Missed (radio off), the board keeps showing the last one received, with its time.
 */
import { CONFIG, type WeatherPresetName } from '../config';
import { homeVessel, type WorldState } from '../core/world';
import { isPowered } from '../vessel/electrics';
import { beaufort, compass8, type WeatherState } from './weather';
import { CURRENTS } from '../world/archipelago';
import { REGIONS } from '../world/regions';
import { raceReading } from '../world/currents';
import type { EnvironmentState } from './environmentState';

export interface Forecast {
  text: string;
  /** Clock time it was received ("HH:MM"). */
  receivedAt: string;
  /** Counts forecasts received (the radio speaks a new one). */
  seq: number;
  /** World time received (s), and the change it announced. */
  at: number;
  next: WeatherPresetName;
}

/** Shipping-forecast words for each preset. */
const SKY: Record<WeatherPresetName, string> = {
  Clear: 'fair',
  Overcast: 'cloudy',
  Fog: 'fog patches',
  Rain: 'rain',
  Squall: 'squally showers, thunder possible',
};

/** Visibility in forecast terms (good > 5 nm, moderate 2-5 nm, poor 1000 m - 2 nm, very poor < 1000 m). */
export function visibilityWord(m: number): string {
  if (m >= 9000) return 'good';
  if (m >= 3700) return 'moderate';
  if (m >= 1000) return 'poor';
  return m < 400 ? 'very poor in fog' : 'very poor';
}

function clock(timeOfDay: number): string {
  const h = Math.floor(timeOfDay) % 24;
  const m = Math.floor((timeOfDay - Math.floor(timeOfDay)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The tidal races (regions): a line each, whether it's running or slack and when the next
 * slack is, so you can judge whether the passage is wise today (world/currents.ts).
 */
export function racesText(env: EnvironmentState): string {
  return CURRENTS.map((z) => {
    const r = raceReading(z, env.timeOfDay, env.raceOverride);
    const slackAt = clock(r.nextSlackH);
    if (r.slack) return `${z.name}: slack water, the race running again by ${clock((r.nextSlackH + 0.5) % 24)}.`;
    return `${z.name}: race running ${compass8(r.dirDeg)} ${r.kn.toFixed(0)} knots, slack about ${slackAt}.`;
  }).join(' ');
}

/**
 * Katabatic gusts (regions with mountains): a warning line each while the weather is light
 * enough for them (in a gale they're lost in it), with the force they reach.
 */
export function gustsText(w: WeatherState): string {
  if (w.now.wind > CONFIG.gusts.maxBaseWind) return '';
  return REGIONS.filter((r) => r.weather?.katabatic && r.gusts?.length)
    .map((r) => `${r.name}: sudden squalls off the mountains without warning, force ${beaufort(Math.max(...r.gusts!.map((g) => g.peakMs)))} at times.`)
    .join(' ');
}

/** The forecast as read out: now, then the next change and roughly when, then the races. */
export function forecastText(w: WeatherState, time: number, env?: EnvironmentState): string {
  const now = w.now;
  const nextP = CONFIG.weather.presets[w.next.preset];
  const gale = w.preset === 'Squall' || w.next.preset === 'Squall';
  const mins = Math.max(1, Math.round((w.next.at - time) / 60));
  const when = w.fixed ? 'later' : mins <= 2 ? 'soon' : `in about ${mins} minutes`;
  const dir = compass8(now.windFrom);
  const parts = [
    gale ? 'Gale warning.' : '',
    `Wind ${dir} ${beaufort(now.wind)}. ${cap(SKY[w.preset])}. Visibility ${visibilityWord(now.visibility)}.`,
    w.next.preset === w.preset
      ? 'No change expected.'
      : `Becoming ${SKY[w.next.preset]} ${when}: wind ${dir} ${beaufort(nextP.wind)}, visibility ${visibilityWord(nextP.visibility)}.`,
    env ? racesText(env) : '',
    gustsText(w),
  ];
  return parts.filter(Boolean).join(' ');
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Broadcast the forecast when it's due; the workboat takes it if her VHF is on (host). */
export function stepForecast(world: WorldState): void {
  const w = world.environment.weather;
  if (!w || world.time < w.forecastAt) return;
  w.forecastAt = world.time + CONFIG.weather.forecast.every / w.speed;
  const v = homeVessel(world);
  if (!v || !isPowered(v, 'radio')) return; // nobody listening
  world.forecast = {
    text: forecastText(w, world.time, world.environment),
    receivedAt: clock(world.environment.timeOfDay),
    seq: (world.forecast?.seq ?? 0) + 1,
    at: world.time,
    next: w.next.preset,
  };
}
