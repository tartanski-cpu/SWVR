/**
 * Dive sites: wrecks for the submersible game (owner, Oct 2026: a submersible launched off the
 * back of a dive support ship, going into its own game "to search for wrecks and to retrieve
 * things in a little ROV that can go inside"). This game marks where they are: named areas on
 * the chartplotter and the paper chart, like the potting and fishing grounds, each over a
 * wreck at a charted depth; the submersible game builds the wreck and its missions from the
 * site's id (docs/dive-contract.md: the same table in both repositories). The launch itself,
 * and the dive support ship, come later.
 *
 * Some shallow, some mid, some deep (the owner's ask): `band` is shallow under 20 m, mid 20 m
 * to under 40 m, deep 40 m and more (the career archipelago's deepest water). The Oban map is real coast at real depths (its deepest water about
 * 55 m, north-west of Maiden Island), so its sites are by latitude and longitude (WGS84: the
 * contract's positions); the career archipelago is made up, 40 m at its deepest, so its sites
 * are by the game's own metres. The wrecks are our own: invented ships, at real places.
 * `depthM` is the charted depth at the site's middle (tests/diveSites.test.ts holds each to
 * the ground's own depth there, within a few metres).
 */
import { worldOf } from '../voyage/metaverse';

export type DiveBand = 'shallow' | 'mid' | 'deep';

export interface DiveSite {
  /** The contract's id: the submersible game picks the wreck and its missions by it. */
  id: string;
  /** The wreck's name, as the chart writes it. */
  name: string;
  /** Which map: the career archipelago, or a Voyage coast map's id. */
  map: 'career' | 'oban';
  /** Where: the game's metres (career), or WGS84 latitude and longitude (a coast map). */
  at: { x: number; z: number } | { lat: number; lon: number };
  depthM: number;
  band: DiveBand;
  /** What she was, for the chart's note and the submersible game's scene. */
  wreck: { kind: string; lengthM: number; lying: string };
  /** A line for the chart and the radio: what's there, near what. */
  note: string;
}

export const DIVE_SITES: readonly DiveSite[] = [
  // ── The career archipelago ──
  {
    id: 'career-margaret-ann',
    name: 'Margaret Ann',
    map: 'career',
    at: { x: 60, z: 470 },
    depthM: 8,
    band: 'shallow',
    wreck: { kind: 'coaster', lengthM: 30, lying: 'on her side, her upper side awash' },
    note: 'The coaster on the rocks west of Calder Haven: her hull is open to an ROV, her hold and engine room under water',
  },
  {
    id: 'career-ellen-rose',
    name: 'Ellen Rose',
    map: 'career',
    at: { x: -750, z: 750 },
    depthM: 27,
    band: 'mid',
    wreck: { kind: 'steam drifter', lengthM: 24, lying: 'upright on sand, her funnel fallen' },
    note: 'A steam drifter lost off Brannock in a winter gale, upright on the sand',
  },
  {
    id: 'career-sgarbh',
    name: 'Sgarbh',
    map: 'career',
    at: { x: -1200, z: -1600 },
    depthM: 40,
    band: 'deep',
    wreck: { kind: 'cargo steamer', lengthM: 52, lying: 'broken in two, her bow on its side' },
    note: 'A cargo steamer north of Eilean Garbh, in the deepest water of the islands, broken in two',
  },
  // ── Oban and Lorn (Voyage) ──
  {
    id: 'oban-lorn-trader',
    name: 'Lorn Trader',
    map: 'oban',
    at: { lat: 56.4375, lon: -5.499 },
    depthM: 54,
    band: 'deep',
    wreck: { kind: 'steel coaster', lengthM: 60, lying: 'upright, her masts gone' },
    note: 'A coaster lost in a gale off Maiden Island, upright in the deepest water of the map',
  },
  {
    id: 'oban-gylen',
    name: 'Gylen wreck',
    map: 'oban',
    at: { lat: 56.37866, lon: -5.53406 },
    depthM: 40,
    band: 'deep',
    wreck: { kind: 'wooden sailing ship', lengthM: 34, lying: 'timbers and ballast stones, her cannon scattered' },
    note: 'An old sailing ship under Gylen Castle on Kerrera, her timbers on the bottom off the castle bay',
  },
  {
    id: 'oban-morven-lass',
    name: 'Morven Lass',
    map: 'oban',
    at: { lat: 56.41463, lon: -5.55377 },
    depthM: 28,
    band: 'mid',
    wreck: { kind: 'fishing boat', lengthM: 20, lying: 'on her keel, her wheelhouse intact' },
    note: 'A fishing boat off Slatrach Bay, on the Firth of Lorn side of Kerrera',
  },
  {
    id: 'oban-sound-spirit',
    name: 'Sound Spirit',
    map: 'oban',
    at: { lat: 56.42667, lon: -5.50236 },
    depthM: 13,
    band: 'shallow',
    wreck: { kind: 'puffer', lengthM: 20, lying: 'on her keel, her hold open' },
    note: 'A cargo puffer off the north end of Kerrera, in the shallows at the mouth of the Sound',
  },
  {
    id: 'oban-selene',
    name: 'Selene',
    map: 'oban',
    at: { lat: 56.45797, lon: -5.43614 },
    depthM: 12,
    band: 'shallow',
    wreck: { kind: 'motor yacht', lengthM: 18, lying: 'on her side' },
    note: 'A motor yacht sunk at her mooring off Dunstaffnage, below the castle',
  },
];

/** A site's place in the game's world (x, z, m), or null for a map with no geography here. */
export function siteWorld(s: DiveSite): { x: number; z: number } | null {
  return 'x' in s.at ? s.at : worldOf(s.map, s.at.lat, s.at.lon);
}

/** The sites on a map: the career's ('career'), or a Voyage map's id. */
export function sitesOn(map: string | null): DiveSite[] {
  return map ? DIVE_SITES.filter((s) => s.map === map) : [];
}

/** Which band a depth is in (m). */
export function bandOf(depthM: number): DiveBand {
  return depthM < 20 ? 'shallow' : depthM < 40 ? 'mid' : 'deep';
}
