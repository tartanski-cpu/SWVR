/**
 * Dive sites: wrecks for the submersible game (owner, Oct 2026: a submersible launched off the
 * back of a dive support ship, going into its own game "to search for wrecks and to retrieve
 * things in a little ROV that can go inside"). This game marks where they are: named areas on
 * the chartplotter and the paper chart, like the potting and fishing grounds, each over a
 * wreck at a charted depth; the submersible game builds the wreck and its missions from the
 * site's id (docs/dive-contract.md: the same table in both repositories).
 *
 * The wrecks are left unnamed and undescribed here (owner, 26 Oct 2026: generic, so the
 * submersible game's procedural wreck engine makes each one up): the charts say "wreck" and
 * her depth until a dive identifies her, then her name (dive/diveReturn.ts `foundNames`).
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
  /** Where she lies, in a few words (the place, not the wreck): for the notices. */
  near: string;
  /** The game's own wreck drawn at this place, if any (the paper chart marks it once). */
  scenery?: string;
  /** Which map: the career archipelago, or a Voyage coast map's id. */
  map: 'career' | 'oban';
  /** Where: the game's metres (career), or WGS84 latitude and longitude (a coast map). */
  at: { x: number; z: number } | { lat: number; lon: number };
  depthM: number;
  band: DiveBand;
}

export const DIVE_SITES: readonly DiveSite[] = [
  // ── The career archipelago ──
  {
    id: 'career-margaret-ann',
    near: 'west of Calder Haven',
    scenery: 'Margaret Ann',
    map: 'career',
    at: { x: 60, z: 470 },
    depthM: 8,
    band: 'shallow',
  },
  {
    id: 'career-ellen-rose',
    near: 'off Brannock',
    map: 'career',
    at: { x: -750, z: 750 },
    depthM: 27,
    band: 'mid',
  },
  {
    id: 'career-sgarbh',
    near: 'north of Eilean Garbh',
    map: 'career',
    at: { x: -1200, z: -1600 },
    depthM: 40,
    band: 'deep',
  },
  // ── Oban and Lorn (Voyage) ──
  {
    id: 'oban-lorn-trader',
    near: 'north-west of Maiden Island',
    map: 'oban',
    at: { lat: 56.4375, lon: -5.499 },
    depthM: 54,
    band: 'deep',
  },
  {
    id: 'oban-gylen',
    near: 'under Gylen Castle',
    map: 'oban',
    at: { lat: 56.37866, lon: -5.53406 },
    depthM: 40,
    band: 'deep',
  },
  {
    id: 'oban-morven-lass',
    near: 'off Slatrach Bay',
    map: 'oban',
    at: { lat: 56.41463, lon: -5.55377 },
    depthM: 28,
    band: 'mid',
  },
  {
    id: 'oban-sound-spirit',
    near: 'off the north end of Kerrera',
    map: 'oban',
    at: { lat: 56.42667, lon: -5.50236 },
    depthM: 13,
    band: 'shallow',
  },
  {
    id: 'oban-selene',
    near: 'off Dunstaffnage',
    map: 'oban',
    at: { lat: 56.45797, lon: -5.43614 },
    depthM: 12,
    band: 'shallow',
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

/** A site in words: the wreck's name once a dive has identified her, else "the wreck" and where. */
export function siteLabel(s: DiveSite, names: Record<string, string> = {}): string {
  return names[s.id] ? `the ${names[s.id]}` : `the wreck ${s.near}`;
}

/** Which band a depth is in (m). */
export function bandOf(depthM: number): DiveBand {
  return depthM < 20 ? 'shallow' : depthM < 40 ? 'mid' : 'deep';
}
