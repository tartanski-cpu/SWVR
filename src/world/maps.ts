import type { RegionDef } from './defs';
import { OBAN } from './regions/oban';
import { TAYVALLICH } from './regions/tayvallich';

/**
 * Voyage mode's maps (owner, Oct 2026): each a region made from real coastline by the coast
 * pipeline (tools/coast, docs/COAST_PIPELINE.md), sailed on its own: the world is the map.
 * The landing page lists them; `voyage.html?map=<id>` starts in one, moored at `startBerth`
 * (one of the map's berths, in a sheltered harbour). A new map: run the pipeline for it,
 * place its region (regions/<id>.ts) and add a line here.
 */
export interface VoyageMap {
  id: string;
  name: string;
  /** A line for the landing page. */
  blurb: string;
  region: RegionDef;
  startBerth: string;
}

export const VOYAGE_MAPS: readonly VoyageMap[] = [
  { id: 'oban', name: 'Oban and Lorn', blurb: 'Oban Bay, Kerrera and its sound, Dunstaffnage and the Falls of Lora: 12 km of Argyll coast at full scale.', region: OBAN, startBerth: 'oban-cargo' },
  { id: 'tayvallich', name: 'Tayvallich and Loch Sween', blurb: 'Tayvallich and its bay, Caol Scotnish and the Fairy Isles, Loch Sween to Achnamara, and the Sound of Jura shore: 11 by 16 km at full scale.', region: TAYVALLICH, startBerth: 'tayvallich-cargo' },
];

export function voyageMap(id: string | null): VoyageMap | undefined {
  return VOYAGE_MAPS.find((m) => m.id === id);
}
