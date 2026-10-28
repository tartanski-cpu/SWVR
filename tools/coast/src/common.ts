/**
 * Shared bits of the coast pipeline: the region request, where its files go, and the map
 * projection. Offline tooling: none of this runs in the game.
 *
 * Projection: a local east/north grid in metres around the box's centre, in the game's axes
 * (x east, z SOUTH: north is -z). An equirectangular projection about the centre latitude;
 * over a ~12 km box its error is a few centimetres, well under a cell.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export interface RegionRequest {
  id: string;
  name: string;
  /** [lonMin, latMin, lonMax, latMax] */
  bbox: [number, number, number, number];
  theme: string;
  /** A big region (Voyage mode only): the mesh is written in chunk files the game streams in round the boat, plus a coarse grid of the whole (mesh.ts). */
  chunked?: boolean;
  /** Spine roles: a harbour's name, "auto", or for the anchorage a named spot ({ name, at: [lon, lat] }). */
  spine?: Record<string, string | { name: string; at: [number, number] }>;
  /** Tidal races; `whirls`: whirlpools in it (points that knock the helm, drawn as whirls), none unless given (a Corryvreckan has them, the Falls of Lora don't). */
  currentZones?: { name: string; polygon: [number, number][]; direction: number; peakKts: number; periodHours: number; whirls?: number }[];
  weatherProfile?: string;
  fish?: string[];
  goods?: string[];
  /** The game's trade per harbour id (package.ts): products, needs, repairs. */
  economy?: Record<string, { products?: string[]; needs?: string[]; repairs?: { hull: number; engine: number } }>;
  /** A harbour's cargo berth on a face looking this way (deg, the bearing out from the face), by harbour id (package.ts). */
  berthFacing?: Record<string, number>;
  /**
   * Where the map marks every private jetty as a pier (Finland: each summer cottage has one):
   * a group of piers with no name of its own (no marina, harbour or ferry terminal by it, no
   * name on a pier) and no quay wall is drawn and solid, but not a port, with no boats on
   * moorings and only the buildings right by it (harbours.ts, package.ts, boats.ts).
   */
  privateJetties?: boolean;
  /** Potting grounds no closer together than this (m): a sea of charted rocks (the Archipelago Sea) would give one at every one (package.ts). */
  pottingApart?: number;
  /** Only the map's named ferry routes, the longest piece of each name (the Archipelago Sea maps dozens of unnamed and split ones) (package.ts). */
  ferriesNamed?: boolean;
  /**
   * Ships under construction at a shipyard (package.ts): in a mapped dry dock (`dock`: its
   * name, or "largest"), or alongside a berth (`berth`: its id, the outfitting quay); how far
   * on she is (`stage`, 0 to 1: hull blocks, then the superstructure deck by deck, then paint),
   * her length (m) and which way her bow points along the dock or berth (`bow`: 1 or -1);
   * `painted` in fresh paint whatever her stage, `seed` her blocks' pattern (two ships with
   * the same seed, stage and length are the same shape).
   */
  yardShips?: { dock?: string; berth?: string; stage: number; length: number; bow?: 1 | -1; painted?: boolean; seed?: number }[];
  /** The lettering along a yard's gantry cranes' girders (both faces), as the owner asks (package.ts). */
  gantrySign?: string;
  /**
   * A river port with no coastline in the map data (Hamburg): its water from the map's river,
   * canal and dock outlines (each outline a boundary, each patch between them water where most
   * of it is water in the land cover), and its depth no more than `inlandDepth` m (a dredged
   * fairway's; reconcile.ts).
   */
  inlandWater?: boolean;
  inlandDepth?: number;
  /** Deck heights (m) of high bridges the map doesn't give, by name: every piece of it (package.ts). */
  bridgeDecks?: Record<string, number>;
  /** Pylon heights (m) of cable-stayed bridges, by name: their main span over the water drawn with pylons and stays (package.ts). */
  bridgePylons?: Record<string, number>;
  /** Landmarks modelled from the map's own 3D building parts, by Wikidata id (features.ts): `crown: wave` gives the tallest part a wave-crested roof (the Elbphilharmonie). */
  landmarkModels?: { wikidata?: string; osm?: string; name?: string; radius?: number; crown?: string; lean?: number; leanBearing?: number; wall?: string }[];
  /* (`lean`: the building leans this far (m) at its top toward `leanBearing` (deg): the Dockland, a parallelogram in elevation.) */
  /** Museum ships moored for good, by Wikidata id, with the game's design for each (`cargo`, `barque` with `masts`) (features.ts). */
  museumShips?: { wikidata: string; name?: string; design: string; masts?: number; hull?: string }[];
  /* (`osm`: a way's id, `way/<n>`, where its building has no Wikidata id of its own.) */
}

export function loadRequest(id = process.argv[2] ?? 'oban'): RegionRequest {
  return yaml.load(readFileSync(join(ROOT, 'requests', `${id}.yaml`), 'utf8')) as RegionRequest;
}

/** Raw downloads (git-ignored, so a region can be rebuilt offline), work files (git-ignored), and the product. */
export function dirs(id: string) {
  const d = { raw: join(ROOT, 'data', 'raw', id), work: join(ROOT, 'data', 'work', id), out: join(ROOT, '..', '..', 'public', 'regions', id) };
  for (const p of Object.values(d)) mkdirSync(p, { recursive: true });
  return d;
}

const R = 6371008.8; // mean Earth radius (m)
const DEG = Math.PI / 180;

export interface Projection {
  lon0: number;
  lat0: number;
  /** lon/lat -> local metres (x east, z south). */
  fwd(lon: number, lat: number): [number, number];
  /** local metres -> lon/lat. */
  inv(x: number, z: number): [number, number];
  /** The box in local metres. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function projection(bbox: RegionRequest['bbox']): Projection {
  const [lonA, latA, lonB, latB] = bbox;
  const lon0 = (lonA + lonB) / 2;
  const lat0 = (latA + latB) / 2;
  const kx = R * DEG * Math.cos(lat0 * DEG);
  const kz = R * DEG;
  const fwd = (lon: number, lat: number): [number, number] => [(lon - lon0) * kx, -(lat - lat0) * kz];
  const inv = (x: number, z: number): [number, number] => [lon0 + x / kx, lat0 - z / kz];
  const [x0, z1] = fwd(lonA, latA);
  const [x1, z0] = fwd(lonB, latB);
  return { lon0, lat0, fwd, inv, x0, x1, z0, z1 };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Names ──
// The game's names and ids are in the Latin alphabet. OpenStreetMap's `name` is the local
// one (Greek on Syros, Ερμούπολη); `name:en` or `int_name` is used where the map has one,
// else the local name is transliterated letter by letter (ELOT 743, simplified).
const GREEK: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o', ϊ: 'i', ϋ: 'y', ΐ: 'i', ΰ: 'y',
};
// Pairs read as one sound.
const GREEK_PAIRS: [RegExp, string][] = [[/ευ/g, 'ev'], [/εύ/g, 'ev'], [/αυ/g, 'av'], [/αύ/g, 'av'], [/ου/g, 'ou'], [/ού/g, 'ou'], [/αι/g, 'ai'], [/αί/g, 'ai'], [/ει/g, 'ei'], [/εί/g, 'ei'], [/οι/g, 'oi'], [/οί/g, 'oi'], [/μπ/g, 'b'], [/ντ/g, 'nt'], [/γκ/g, 'gk'], [/γγ/g, 'ng']];

/** A name in the Latin alphabet: Greek transliterated (capitals kept); other text as it is. */
export function latin(name: string): string {
  if (!/[Ͱ-Ͽἀ-῿]/.test(name)) return name;
  return name
    .split(/(\s+|-)/)
    .map((word) => {
      const lower = word.toLowerCase();
      let s = lower;
      for (const [re, to] of GREEK_PAIRS) s = s.replace(re, to);
      s = [...s].map((ch) => GREEK[ch] ?? ch).join('');
      return word !== lower && s ? s[0].toUpperCase() + s.slice(1) : s;
    })
    .join('');
}

/** A feature's name for the game: its English name, its international one, or its own transliterated. */
export function nameOf(tags: Record<string, string> | undefined, key = 'name'): string {
  if (!tags) return '';
  return tags[`${key}:en`] ?? tags.int_name ?? latin(tags[key] ?? '');
}

/** An id from a name: lower case, dashes. */
export function slug(name: string): string {
  return latin(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
