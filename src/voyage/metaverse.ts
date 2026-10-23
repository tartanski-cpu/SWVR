/**
 * The handoff between Workboat World and the Timber game (docs/metaverse-contract.md, the
 * owner's spec of 23 Oct 2026): anchor in a marked bay, go ashore to the timber camp (the
 * Timber game, a separate web app), cut and deliver logs there, and come back to the boat
 * with a barge of them to tow to market.
 *
 * The two games share nothing but the address: state crosses as one JSON envelope,
 * base64url-encoded, in the query parameter `mv`. This file is the Workboat side of that
 * contract, plain functions with no page or scene in them:
 *   - the envelope: build, encode, decode (defensively: anything malformed is ignored);
 *   - the site registry: the hotspots, in real WGS84 lat/lon as in the contract's table;
 *   - real lat/lon to world metres on a coast map, by the coast pipeline's own projection
 *     (tools/coast/src/common.ts `projection`): an equirectangular grid about the centre of
 *     the map's request box, then the map's place in the world (its region's offset);
 *   - the handoff ids: issued on the way out, consumed once on the way back.
 */
import { CONFIG } from '../config';

/** The contract's envelope (version 1). Each game reads only what it needs. */
export interface Envelope {
  v: 1;
  /** Random 6-character handoff id: Timber echoes it back; consumed once here. */
  id: string;
  from: 'workboat' | 'timber';
  site: string;
  /** Where Timber sends the player back to (without `mv`). */
  return: string;
  boat: { id: string; name: string };
  pos: { lat: number; lon: number; hdg: number };
  time: { hour: number };
  status: 'none' | 'barge_ready';
  cargo: { logs: number };
}

/** One row of the contract's site table. */
export interface MetaverseSite {
  id: string;
  name: string;
  /** The Voyage map she's on (src/world/maps.ts). */
  mapId: string;
  /** Hotspot centre and radius (WGS84, m). */
  lat: number;
  lon: number;
  radiusM: number;
  /** Where Timber's logs are delivered on the beach (for the Timber side; unused here). */
  beach: { lat: number; lon: number };
  /** Where the barge appears on the way back: about 80 m offshore of the beach. */
  bargeSpawn: { lat: number; lon: number };
  /** The Timber game's address for this site. */
  targetUrl: string;
}

/**
 * The site registry (docs/metaverse-contract.md, the same table in both repos). The first:
 * the timber proof-of-concept bay, Ardantrive Bay on Kerrera, across the sound from Oban.
 * The beach and the barge spawn were picked from the Oban map's ground (the head of the bay,
 * and 5 m of water off it clear of where you anchor).
 */
export const SITES: readonly MetaverseSite[] = [
  {
    id: 'loch-timber-1',
    name: 'Ardentrive, Kerrera',
    mapId: 'oban',
    lat: 56.4117,
    lon: -5.50156,
    radiusM: 60,
    beach: { lat: 56.41237, lon: -5.50156 },
    bargeSpawn: { lat: 56.41178, lon: -5.50078 },
    targetUrl: 'https://tartanski-cpu.github.io/BigTImberVR/',
  },
];

export const siteById = (id: string): MetaverseSite | undefined => SITES.find((s) => s.id === id);

/**
 * Each coast map's geography for the projection: its request box (tools/coast/requests/<id>.yaml
 * `bbox`, lon/lat min and max) and where the package's origin lies in the world (its region's
 * offset, src/world/regions/<id>.ts). tests/metaverse.test.ts checks both against those files.
 */
export const MAP_GEO: Record<string, { bbox: [number, number, number, number]; at: { x: number; z: number } }> = {
  oban: { bbox: [-5.56, 56.375, -5.37, 56.475], at: { x: 4970, z: -7460 } },
};

/** The coast pipeline's mean Earth radius (m) and projection constants for a box. */
const R = 6371008.8;
const DEG = Math.PI / 180;
function grid(mapId: string) {
  const g = MAP_GEO[mapId];
  if (!g) return null;
  const [lonA, latA, lonB, latB] = g.bbox;
  const lon0 = (lonA + lonB) / 2;
  const lat0 = (latA + latB) / 2;
  return { lon0, lat0, kx: R * DEG * Math.cos(lat0 * DEG), kz: R * DEG, at: g.at };
}

/** Real lat/lon to world metres on this map (x east, z south), or null for a map with no geography. */
export function worldOf(mapId: string, lat: number, lon: number): { x: number; z: number } | null {
  const p = grid(mapId);
  if (!p) return null;
  return { x: (lon - p.lon0) * p.kx + p.at.x, z: -(lat - p.lat0) * p.kz + p.at.z };
}

/** World metres on this map to real lat/lon (the inverse). */
export function latLonOf(mapId: string, x: number, z: number): { lat: number; lon: number } | null {
  const p = grid(mapId);
  if (!p) return null;
  return { lat: p.lat0 - (z - p.at.z) / p.kz, lon: p.lon0 + (x - p.at.x) / p.kx };
}

// ── The envelope on the address ──

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** The envelope as the `mv` parameter: base64url (no padding) of its compact JSON. */
export function encodeEnvelope(e: Envelope): string {
  return toB64Url(new TextEncoder().encode(JSON.stringify(e)));
}

/** An `mv` parameter read back, or null if it isn't a version-1 envelope (then: play as normal). */
export function decodeEnvelope(text: string | null): Envelope | null {
  if (!text) return null;
  try {
    const e = JSON.parse(new TextDecoder().decode(fromB64Url(text))) as Partial<Envelope>;
    if (!e || e.v !== 1 || typeof e.id !== 'string' || typeof e.site !== 'string') return null;
    if (e.from !== 'workboat' && e.from !== 'timber') return null;
    const logs = Number(e.cargo?.logs);
    return {
      ...(e as Envelope),
      status: e.status === 'barge_ready' ? 'barge_ready' : 'none',
      cargo: { logs: Number.isFinite(logs) ? Math.max(0, Math.floor(logs)) : 0 },
    };
  } catch {
    return null;
  }
}

/** A random 6-character handoff id. */
export function newHandoffId(random: () => number = Math.random): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(random() * chars.length)];
  return s;
}

// ── Handoff ids issued and consumed (this browser's storage) ──

export const ISSUED_KEY = 'swvr.mv.issued';
export const CONSUMED_KEY = 'swvr.mv.consumed';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function readList(store: Store, key: string): string[] {
  try {
    const v = JSON.parse(store.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(store: Store, key: string, list: string[]): void {
  try {
    store.setItem(key, JSON.stringify(list.slice(-CONFIG.voyage.timber.keepIds)));
  } catch {
    // Not saved (storage full or off): the handoff still goes, its return won't count.
  }
}

/** A handoff id issued: put on the list the way back is checked against. */
export function issueId(id: string, store: Store = localStorage): void {
  writeList(store, ISSUED_KEY, [...readList(store, ISSUED_KEY).filter((s) => s !== id), id]);
}

/**
 * A returning envelope, checked and consumed: from Timber, its id one we issued and haven't
 * consumed yet. Then the id moves from issued to consumed, so it can never count twice.
 * Anything else: null (spawn nothing).
 */
export function consumeReturn(e: Envelope | null, store: Store = localStorage): Envelope | null {
  if (!e || e.from !== 'timber') return null;
  const issued = readList(store, ISSUED_KEY);
  const consumed = readList(store, CONSUMED_KEY);
  if (!issued.includes(e.id) || consumed.includes(e.id)) return null;
  writeList(store, ISSUED_KEY, issued.filter((s) => s !== e.id));
  writeList(store, CONSUMED_KEY, [...consumed, e.id]);
  return e;
}

/**
 * The `mv` parameter taken off an address: the envelope (or null) and the address without
 * it (to put back with history.replaceState, so a refresh never replays the handoff).
 */
export function takeEnvelope(href: string): { envelope: Envelope | null; clean: string | null } {
  const u = new URL(href);
  if (!u.searchParams.has('mv')) return { envelope: null, clean: null };
  const envelope = decodeEnvelope(u.searchParams.get('mv'));
  u.searchParams.delete('mv');
  return { envelope, clean: u.toString() };
}

/** The outbound address: the site's Timber page with the envelope on it. */
export function outboundUrl(site: MetaverseSite, e: Envelope): string {
  const u = new URL(site.targetUrl);
  u.searchParams.set('mv', encodeEnvelope(e));
  return u.toString();
}
