import type { RegionDef } from './defs';
import { fromCoastPackage, remotePackage, type CoastPlacement } from './coastRegion';
import { SOUNDS } from './regions/sounds';
import { OBAN } from './regions/oban';
import { TAYVALLICH } from './regions/tayvallich';

/**
 * Voyage mode's maps (owner, Oct 2026): each a region made from real coastline by the coast
 * pipeline (tools/coast, docs/COAST_PIPELINE.md), sailed on its own: the world is the map.
 * The landing page lists them; `voyage.html?map=<id>` starts in one, moored at `startBerth`
 * (one of the map's berths, in a sheltered harbour). A new map: run the pipeline for it,
 * place its region (regions/<id>.ts) and add a line here.
 *
 * A big map (the Clyde, a request with `chunked: true`) isn't built into the game: its
 * package is fetched when it's chosen (main.ts, public/regions/<id>/package.json) and its
 * region made from it here (`remote`: where its origin goes and what it brings), and its
 * ground streams in round the boat (world/coastStream.ts).
 */
/**
 * The Aegean's summer weather (Syros): clear most of the time, the odd hazy or grey spell,
 * rarely rain, fog almost never; a squall now and then for the meltemi's blows. Clear
 * spells last longest.
 */
const AEGEAN_WEATHER = {
  next: {
    Clear: { Clear: 4, Overcast: 1, Squall: 0.3 },
    Overcast: { Clear: 3, Rain: 0.5, Squall: 0.5 },
    Fog: { Clear: 2, Overcast: 1 },
    Rain: { Overcast: 2, Clear: 1 },
    Squall: { Clear: 2, Overcast: 1 },
  },
  hold: [600, 1500] as [number, number],
};

/**
 * The Archipelago Sea's weather (Turku): grey and changeable, overcast spells the longest,
 * rain often, fog in the calm spells off the cold water, now and then a clear day; the odd
 * squall. The islands keep the sea down: the waves come from the ground's fetch (fetchSeas).
 */
const BALTIC_WEATHER = {
  next: {
    Clear: { Clear: 2, Overcast: 2, Fog: 0.4 },
    Overcast: { Overcast: 3, Clear: 1.5, Rain: 1.5, Fog: 0.6, Squall: 0.3 },
    Fog: { Overcast: 2, Clear: 1 },
    Rain: { Overcast: 2, Rain: 1, Squall: 0.3 },
    Squall: { Overcast: 2, Rain: 1 },
  },
  hold: [600, 1500] as [number, number],
};

/**
 * Hamburg's weather: the North Sea's, a hundred kilometres inland: grey and changeable,
 * overcast and rain often, fog on the river in the calm spells, the odd squall, now and then
 * a clear day.
 */
const ELBE_WEATHER = {
  next: {
    Clear: { Clear: 2, Overcast: 2, Fog: 0.3 },
    Overcast: { Overcast: 3, Clear: 1, Rain: 2, Fog: 0.5, Squall: 0.4 },
    Fog: { Overcast: 2, Clear: 1 },
    Rain: { Overcast: 2, Rain: 1, Squall: 0.4 },
    Squall: { Overcast: 2, Rain: 1 },
  },
  hold: [600, 1500] as [number, number],
};

export interface VoyageMap {
  id: string;
  name: string;
  /** A line for the landing page. */
  blurb: string;
  /** The map's region, built in; or for a big map, made at start from its fetched package. */
  region?: RegionDef;
  remote?: CoastPlacement;
  startBerth: string;
  /** Where its live weather is read (world/coastWeather.ts): a point in open water on the map (deg). */
  weatherAt: { lat: number; lon: number };
}

export const VOYAGE_MAPS: readonly VoyageMap[] = [
  { id: 'oban', name: 'Oban and Lorn', blurb: 'Oban Bay, Kerrera and its sound, Dunstaffnage and the Falls of Lora: 12 km of Argyll coast at full scale.', region: OBAN, startBerth: 'oban-cargo', weatherAt: { lat: 56.415, lon: -5.49 } },
  { id: 'clyde', name: 'The Firth of Clyde', blurb: 'Bute and Rothesay, the Kyles and Loch Striven, Dunoon and the Holy Loch, Gourock, Greenock and Helensburgh, Largs and the Cumbraes: 35 by 37 km at full scale.', remote: { x: 0, z: 0, weather: SOUNDS.weather }, startBerth: 'rothesay-harbour-cargo', weatherAt: { lat: 55.86, lon: -4.98 } },
  { id: 'syros', name: 'Syros', blurb: 'The whole island in the Cyclades: Ermoupoli and its harbour under Ano Syros, Foinikas and Posidonia, Kini, Vari and the islets off the east coast: 15 by 19 km at full scale.', remote: { x: 0, z: 0, weather: AEGEAN_WEATHER }, startBerth: 'ermoupoli-cargo', weatherAt: { lat: 37.44, lon: 24.95 } },
  { id: 'turku', name: 'Turku and the Archipelago Sea', blurb: 'Turku and its port, the Meyer Turku yard at Perno, Ruissalo, the Airisto fairway, Pargas, Nagu and the islands between: 37 by 38 km at full scale.', remote: { x: 0, z: 0, weather: BALTIC_WEATHER }, startBerth: 'port-of-turku-cargo', weatherAt: { lat: 60.3, lon: 22.1 } },
  { id: 'hamburg', name: 'The Port of Hamburg', blurb: 'The Elbe from Finkenwerder and Övelgönne to the Elbe bridges: the Landungsbrücken, the Speicherstadt and HafenCity, the container terminals and the Köhlbrand: 14 by 8 km at full scale.', remote: { x: 0, z: 0, weather: ELBE_WEATHER }, startBerth: 'HAMBURG_START', weatherAt: { lat: 53.54, lon: 9.95 } },
  { id: 'tayvallich', name: 'Tayvallich and Loch Sween', blurb: 'Tayvallich and its bay, Caol Scotnish and the Fairy Isles, Loch Sween to Achnamara, and the Sound of Jura shore: 11 by 16 km at full scale.', region: TAYVALLICH, startBerth: 'tayvallich-cargo', weatherAt: { lat: 55.95, lon: -5.7 } },
];

export function voyageMap(id: string | null): VoyageMap | undefined {
  return VOYAGE_MAPS.find((m) => m.id === id);
}

/** A map's region: built in, or made from its fetched package (which must be in by now: main.ts). */
export function mapRegion(m: VoyageMap): RegionDef {
  if (m.region) return m.region;
  const pkg = remotePackage(m.id);
  if (!pkg) throw new Error(`voyage map ${m.id}: its package isn't loaded`);
  return fromCoastPackage(pkg, m.remote!);
}
