/**
 * A Voyage map's live weather (world/coastWeather.ts, applied by app/App.ts at the start of a
 * session) in words, as the players are told it: the notice and the Voyage tab's line.
 */
import { compass8 } from '../environment/weather';
import type { LiveWeather } from '../world/coastWeather';

/**
 * "Live weather, Oban and Lorn 15:30 GMT+1: wind north-west 10 kn, gusts 17, overcast, sea 0.8 m":
 * what the map's real weather is, as the players are told it.
 */
export function liveWeatherText(place: string, w: LiveWeather): string {
  const kn = (ms: number) => Math.round(ms * 1.944);
  const sky = w.preset === 'Clear' ? (w.cloud > 0.3 ? 'some cloud' : 'clear') : w.preset === 'Squall' ? 'squally' : w.preset.toLowerCase();
  const at = w.time.slice(11, 16);
  const when = at ? ` ${at}${w.zone ? ` ${w.zone}` : ''}` : '';
  const sea = w.sea ? `, sea ${w.sea.height.toFixed(1)} m` : '';
  return `Live weather, ${place}${when}: wind ${compass8(w.windFrom)} ${kn(w.wind)} kn, gusts ${kn(w.gust)}, ${sky}${sea}`;
}
