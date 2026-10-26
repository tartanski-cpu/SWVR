/**
 * Each player's own boat (multi-boat M3: docs/MULTI_BOAT.md). A player asks the host for a
 * boat with the `launchBoat` environment intent (ref: a fleet boat's id, or her design token:
 * a Shipyard code or a document, boats/library.ts boatType). The host puts her at the game's
 * harbour (where the home boat lies): moored at a free berth her length fits
 * (world/slots.ts), lines fast; or, when no face has room, anchored off (the owner: the
 * biggest boats go to anchor). She belongs to that player (`VesselState.owner`): launching
 * again replaces her, `withdrawBoat` hands her back. When her player leaves the game she waits
 * CONFIG.net.crewBoatGraceS for them (owner, 26 Oct 2026: two minutes, so a reload or a
 * dropped link doesn't lose her, her tow or her cargo), and is theirs again if they rejoin from
 * the same browser tab (`ownerClient`: `reclaimBoats`); after that she goes. A boat taken out
 * of the world (`removeBoat`) sets her cargo down on the harbour's goods row, casts off her
 * lines and puts anyone aboard onto the game's own boat. The player's own page boards her when
 * she appears (App.ts): bodies are each page's own.
 */
import { CONFIG } from '../config';
import { PORTS } from '../world/archipelago';
import { berthWithId } from '../world/berths';
import { anchorSpotFor, freeBerthFor, vesselLength } from '../world/slots';
import { groundHeight } from '../world/terrain';
import { placeVessel } from '../vessel/vesselControl';
import { berthPose } from '../vessel/physics/mooring';
import { hasWheelhouse, VESSEL_DEFS } from '../vessel/vesselDef';
import { createVesselState, type VesselState } from '../vessel/vesselState';
import type { EntityId } from './ids';
import type { Intent } from './intents';
import { homeVessel, moorAtBerth, type WorldState } from './world';
import { freeStackSpot } from '../cargo/cargo';
import { castOffKey, vesselKey } from '../tow/tow';
import { releaseHolds } from '../vessel/vesselControl';

/** Turns a design token into a vessel type id (boats/library.ts boatType registers itself here: core code can't import the library). */
let resolveToken: (token: string) => string | null = () => null;
export function setBoatResolver(fn: (token: string) => string | null): void {
  resolveToken = fn;
}

/** The vessel type a launch asks for: a fleet boat (or any type with a wheelhouse) by id, else a design token. */
export function launchType(ref: string): string | null {
  const def = VESSEL_DEFS[ref];
  if (def) return hasWheelhouse(def) && !def.tow ? ref : null;
  return resolveToken(ref);
}

/** The players' boats (multi-boat M5): the home boat and every launched one; boats with a wheelhouse, not tows or tenders. */
export function playerBoats(world: WorldState): VesselState[] {
  return Object.values(world.vessels).filter((v) => {
    const def = VESSEL_DEFS[v.defId];
    return !!def && hasWheelhouse(def) && !def.tow && !v.tender && (v.id === world.homeVesselId || !!v.owner);
  });
}

/** The boat a player is aboard if it's one of the players' boats, else the home boat. */
export function boatOf(world: WorldState, playerId: EntityId | null | undefined): VesselState | undefined {
  const aboard = playerId ? world.players[playerId]?.aboardVesselId : null;
  const v = aboard ? world.vessels[aboard] : undefined;
  return v && playerBoats(world).includes(v) ? v : homeVessel(world);
}

/**
 * The boat the game's calls follow (multiplayer study #27: the host left his boat moored and
 * went out with a crew-mate in her tug, and no call ever came): of the players' boats that
 * `can` (her gear for the job), the one with the most players aboard; the home boat on a tie,
 * or when nobody's aboard any of them.
 */
export function missionBoat(world: WorldState, can: (v: VesselState) => boolean = () => true): VesselState | undefined {
  const crew = new Map<string, number>();
  for (const p of Object.values(world.players)) if (p.aboardVesselId) crew.set(p.aboardVesselId, (crew.get(p.aboardVesselId) ?? 0) + 1);
  let best: VesselState | undefined;
  let most = -1;
  for (const v of playerBoats(world)) {
    if (!can(v)) continue;
    const n = (crew.get(v.id) ?? 0) + (v.id === world.homeVesselId ? 0.5 : 0);
    if (n > most) {
      best = v;
      most = n;
    }
  }
  return best;
}

/** Whose boat she is, for the chart and the lookout: her owner's name, the host's boat the name of whoever is aboard, else "the host". */
export function boatOwnerName(world: WorldState, v: VesselState): string {
  if (v.owner) return world.players[v.owner]?.name ?? 'a crew-mate';
  const aboard = Object.values(world.players).find((p) => p.aboardVesselId === v.id);
  return aboard?.name ?? 'the host';
}

/**
 * The Voyage tab's Go (the `teleportToPort` intent, with several boats about): her at the
 * port's berth as before when it's free for her; another boat lying there, at the next free
 * berth her length fits; none, in the bay or at the anchorage spot (world/slots.ts). Returns
 * false when the port has no room at all (she stays where she is).
 */
export function teleportToPortSlot(world: WorldState, v: VesselState, portId: string): boolean {
  const port = PORTS.find((p) => p.id === portId);
  if (!port) return false;
  const berth = freeBerthFor(world.vessels, port.id, v.defId, v.id);
  const at = berth ? berthPose(v, berth) : null;
  // No berth: a spot in the anchorage circle (or off the port) in water deep enough, clear of
  // the other boats and the harbour boats' moorings (world/slots.ts). The other boats are
  // listed without her (review, Oct 2026: an empty entry for her made the search throw, and Go
  // silently did nothing at Tayvallich's Ashfield, Syros' Kini and Foinikas, and 7 Clyde harbours).
  const others = Object.fromEntries(Object.entries(world.vessels).filter(([id]) => id !== v.id));
  const free = at ? null : anchorSpotFor(others, port, vesselLength(v.defId));
  const spot = at ? { x: at.x, z: at.z, headingDeg: at.headingDeg } : free ? { ...free, headingDeg: 0 } : null;
  if (!spot) return false;
  v.controls.lever = 0;
  v.refuelling = false;
  // Voyage (owner, Oct 2026): a boat that comes into a harbour this way is made fast, not
  // left to blow away: alongside, her lines fast; in the bay, lying to her anchor. (The
  // career's Go is the Debug menu's: there she lies ready to make fast, as before.)
  if (!world.voyage) {
    placeVessel(v, spot.x, 0, spot.z, spot.headingDeg);
    v.anchor = { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false };
    v.controls.anchor = 0;
    v.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
  } else if (berth) {
    v.anchor = { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false };
    v.controls.anchor = 0;
    moorAtBerth(v, berth);
  } else anchorAt(v, spot, port);
  return true;
}

/**
 * Lying to her anchor at `spot`, heading for `toward` (the harbour): the anchor set ahead of
 * her, the chain out to the usual scope, the windlass left down so it holds (vessel/physics/anchor.ts).
 */
function anchorAt(v: VesselState, spot: { x: number; z: number }, toward: { x: number; z: number }): void {
  const toPort = Math.atan2(toward.x - spot.x, -(toward.z - spot.z));
  placeVessel(v, spot.x, 0, spot.z, (toPort * 180) / Math.PI);
  v.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
  const depth = Math.max(1, -groundHeight(spot.x, spot.z));
  const cfg = CONFIG.vessels.workboat.anchor;
  const ahead = Math.min(cfg.chainM, cfg.scopeRatio * depth) * 0.8;
  v.anchor = { phase: 'set', x: spot.x + Math.sin(toPort) * ahead, z: spot.z - Math.cos(toPort) * ahead, rodeM: Math.min(cfg.chainM, cfg.scopeRatio * depth), tension: 0, dragging: false };
  v.controls.anchor = 1;
}

/**
 * A boat new to the harbour (a launch, a spawn): moored at a free berth her size, else at
 * anchor off it, else off the home boat. Null if there's no room anywhere.
 */
export function berthOrAnchor(world: WorldState, v: VesselState, port: { id: string; x: number; z: number }): 'moored' | 'anchored' | null {
  const berth = freeBerthFor(world.vessels, port.id, v.defId, v.id);
  if (berth) {
    moorAtBerth(v, berth);
    return 'moored';
  }
  const L = vesselLength(v.defId);
  const home = homeVessel(world);
  const others = Object.fromEntries(Object.entries(world.vessels).filter(([id]) => id !== v.id));
  const spot = anchorSpotFor(others, port, L) ?? (home ? anchorSpotFor(others, { x: home.position[0], z: home.position[2] }, L) : null);
  if (!spot) return null;
  anchorAt(v, spot, port);
  return 'anchored';
}

/** The boat this player launched, if any. */
export function ownedBoat(world: WorldState, playerId: EntityId): VesselState | undefined {
  return Object.values(world.vessels).find((v) => v.owner === playerId);
}

/** The game's harbour: the port the home boat is moored at, else the nearest to her. */
export function gameHarbour(world: WorldState) {
  const home = homeVessel(world);
  if (!home) return null;
  const moored = home.mooring.phase === 'moored' && home.mooring.berthId ? berthWithId(home.mooring.berthId) : undefined;
  const port = moored ? PORTS.find((p) => p.id === moored.portId) : undefined;
  return port ?? [...PORTS].sort((a, b) => Math.hypot(a.x - home.position[0], a.z - home.position[2]) - Math.hypot(b.x - home.position[0], b.z - home.position[2]))[0] ?? null;
}

/** How she was placed, for the notice. */
export type Launched = { vessel: VesselState; how: 'moored' | 'anchored' } | { error: string };

export function launchBoat(world: WorldState, playerId: EntityId, ref: string): Launched {
  const defId = launchType(ref);
  if (!defId) return { error: 'no such boat' };
  const port = gameHarbour(world);
  if (!port) return { error: 'no harbour here' };
  // Her old boat out of the way while the new one finds a place (her berth may be the one),
  // and only taken away for good once the new one has one: no room, and she keeps the old.
  const old = ownedBoat(world, playerId);
  if (old) delete world.vessels[old.id];
  const n = (world.launched = (world.launched ?? 0) + 1);
  const v = createVesselState(`boat-${playerId}-${n}`, defId);
  v.owner = playerId;
  const cid = world.players[playerId]?.clientId;
  if (cid) v.ownerClient = cid;
  // At the harbour's free berth, else at anchor off it, else off the home boat herself.
  const how = berthOrAnchor(world, v, port);
  if (!how) {
    if (old) world.vessels[old.id] = old;
    return { error: 'no room at the harbour or its anchorage' };
  }
  if (old) {
    world.vessels[old.id] = old;
    removeBoat(world, old);
  }
  world.vessels[v.id] = v;
  return { vessel: v, how };
}

export function withdrawBoat(world: WorldState, playerId: EntityId): boolean {
  const v = ownedBoat(world, playerId);
  if (!v) return false;
  removeBoat(world, v);
  return true;
}

/**
 * A player's boat taken out of the world (handed back, replaced, her player long gone; the
 * multiplayer study #28: her crates went with her, never counted): what she carries set down
 * on the game harbour's goods row, to be picked up again; her lines cast off (a tow, a painter);
 * her controls let go; anyone aboard put aboard the game's own boat.
 */
export function removeBoat(world: WorldState, v: VesselState): void {
  const port = gameHarbour(world);
  for (const c of Object.values(world.cargo)) {
    if (!('vessel' in c.at && c.at.vessel === v.id) && !('hook' in c.at && c.at.hook === v.id)) continue;
    if (port) c.at = { ground: freeStackSpot(world, port), yaw: 0 };
    else delete world.cargo[c.id];
  }
  castOffKey(world, vesselKey(v.id));
  releaseHolds(v);
  const home = homeVessel(world);
  for (const p of Object.values(world.players))
    if (p.aboardVesselId === v.id && home && home.id !== v.id) {
      p.aboardVesselId = home.id;
      p.position = [...VESSEL_DEFS[home.defId].boardingSpot];
    }
  delete world.vessels[v.id];
}

/**
 * A crew-mate back from the same browser tab (`clientId`) under a new player number: the boats
 * they left waiting are theirs again (her owner and her grace cleared). Returns the first.
 */
export function reclaimBoats(world: WorldState, playerId: EntityId, clientId: string | undefined): VesselState | undefined {
  if (!clientId) return undefined;
  let first: VesselState | undefined;
  for (const v of Object.values(world.vessels)) {
    if (v.ownerClient !== clientId || (v.owner && world.players[v.owner] && v.owner !== playerId)) continue;
    v.owner = playerId;
    delete v.ownerAwayAt;
    first ??= v;
  }
  return first;
}

export const isLaunchIntent = (control: string): boolean => control === 'launchBoat' || control === 'withdrawBoat';

export function applyLaunchIntent(world: WorldState, intent: Intent): void {
  if (intent.control === 'launchBoat' && intent.ref) launchBoat(world, intent.playerId, intent.ref);
  else if (intent.control === 'withdrawBoat') withdrawBoat(world, intent.playerId);
}

/** A boat whose player has left the game waits for them CONFIG.net.crewBoatGraceS, then goes (removeBoat). */
export function stepLaunched(world: WorldState): void {
  for (const v of Object.values(world.vessels)) {
    if (!v.owner) continue;
    if (world.players[v.owner]) {
      if (v.ownerAwayAt !== undefined) delete v.ownerAwayAt;
      continue;
    }
    v.ownerAwayAt ??= world.time;
    if (world.time - v.ownerAwayAt >= CONFIG.net.crewBoatGraceS) removeBoat(world, v);
  }
}
