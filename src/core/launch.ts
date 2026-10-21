/**
 * Each player's own boat (multi-boat M3: docs/MULTI_BOAT.md). A player asks the host for a
 * boat with the `launchBoat` environment intent (ref: a fleet boat's id, or her design token:
 * a Shipyard code or a document, boats/library.ts boatType). The host puts her at the game's
 * harbour (where the home boat lies): moored at a free berth her length fits
 * (world/slots.ts), lines fast; or, when no face has room, anchored off (the owner: the
 * biggest boats go to anchor). She belongs to that player (`VesselState.owner`): launching
 * again replaces her, `withdrawBoat` hands her back, and when her player leaves the game she
 * goes with them (the owner's rule). The player's own page boards her when she appears
 * (App.ts): bodies are each page's own.
 */
import { CONFIG } from '../config';
import { PORTS } from '../world/archipelago';
import { berthWithId } from '../world/berths';
import { anchorSpotFor, freeBerthFor, vesselLength } from '../world/slots';
import { groundHeight } from '../world/terrain';
import { placeVessel } from '../vessel/vesselControl';
import { hasWheelhouse, VESSEL_DEFS } from '../vessel/vesselDef';
import { createVesselState, type VesselState } from '../vessel/vesselState';
import type { EntityId } from './ids';
import type { Intent } from './intents';
import { homeVessel, moorAtBerth, type WorldState } from './world';

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
  const old = ownedBoat(world, playerId);
  if (old) delete world.vessels[old.id];
  const n = (world.launched = (world.launched ?? 0) + 1);
  const v = createVesselState(`boat-${playerId}-${n}`, defId);
  v.owner = playerId;
  const L = vesselLength(defId);
  const berth = freeBerthFor(world.vessels, port.id, defId);
  if (berth) {
    moorAtBerth(v, berth);
    world.vessels[v.id] = v;
    return { vessel: v, how: 'moored' };
  }
  const spot = anchorSpotFor(world.vessels, port, L);
  if (!spot) return { error: 'no room at the harbour or its anchorage' };
  // Anchored: lying to her anchor, set ahead of her, the chain out to the usual scope, the
  // windlass left down so it holds (vessel/physics/anchor.ts).
  const toPort = Math.atan2(port.x - spot.x, -(port.z - spot.z));
  placeVessel(v, spot.x, 0, spot.z, (toPort * 180) / Math.PI);
  v.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
  const depth = Math.max(1, -groundHeight(spot.x, spot.z));
  const cfg = CONFIG.vessels.workboat.anchor;
  const ahead = Math.min(cfg.chainM, cfg.scopeRatio * depth) * 0.8;
  v.anchor = { phase: 'set', x: spot.x + Math.sin(toPort) * ahead, z: spot.z - Math.cos(toPort) * ahead, rodeM: Math.min(cfg.chainM, cfg.scopeRatio * depth), tension: 0, dragging: false };
  v.controls.anchor = 1;
  world.vessels[v.id] = v;
  return { vessel: v, how: 'anchored' };
}

export function withdrawBoat(world: WorldState, playerId: EntityId): boolean {
  const v = ownedBoat(world, playerId);
  if (!v) return false;
  delete world.vessels[v.id];
  return true;
}

export const isLaunchIntent = (control: string): boolean => control === 'launchBoat' || control === 'withdrawBoat';

export function applyLaunchIntent(world: WorldState, intent: Intent): void {
  if (intent.control === 'launchBoat' && intent.ref) launchBoat(world, intent.playerId, intent.ref);
  else if (intent.control === 'withdrawBoat') withdrawBoat(world, intent.playerId);
}

/** A boat whose player has left the game goes with them. */
export function stepLaunched(world: WorldState): void {
  for (const v of Object.values(world.vessels)) if (v.owner && !world.players[v.owner]) delete world.vessels[v.id];
}
