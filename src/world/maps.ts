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

export interface VoyageMap {
  id: string;
  name: string;
  /** A line for the landing page. */
  blurb: string;
  /** The map's region, built in; or for a big map, made at start from its fetched package. */
  region?: RegionDef;
  remote?: CoastPlacement;
  startBerth: string;
}

export const VOYAGE_MAPS: readonly VoyageMap[] = [
  { id: 'oban', name: 'Oban and Lorn', blurb: 'Oban Bay, Kerrera and its sound, Dunstaffnage and the Falls of Lora: 12 km of Argyll coast at full scale.', region: OBAN, startBerth: 'oban-cargo' },
  { id: 'clyde', name: 'The Firth of Clyde', blurb: 'Bute and Rothesay, the Kyles and Loch Striven, Dunoon and the Holy Loch, Gourock, Greenock and Helensburgh, Largs and the Cumbraes: 35 by 37 km at full scale.', remote: { x: 0, z: 0, weather: SOUNDS.weather }, startBerth: 'rothesay-harbour-cargo' },
  { id: 'syros', name: 'Syros', blurb: 'The whole island in the Cyclades: Ermoupoli and its harbour under Ano Syros, Foinikas and Posidonia, Kini, Vari and the islets off the east coast: 15 by 19 km at full scale.', remote: { x: 0, z: 0, weather: AEGEAN_WEATHER }, startBerth: 'ermoupoli-cargo' },
  { id: 'tayvallich', name: 'Tayvallich and Loch Sween', blurb: 'Tayvallich and its bay, Caol Scotnish and the Fairy Isles, Loch Sween to Achnamara, and the Sound of Jura shore: 11 by 16 km at full scale.', region: TAYVALLICH, startBerth: 'tayvallich-cargo' },
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
