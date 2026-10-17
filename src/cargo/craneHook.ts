/**
 * Where a boat's deck cranes' hooks are (modules/deckCrane): for the cargo they lift
 * (cargo.ts: an item on a hook hangs from it), its weight on the boat (payloadOf), and
 * drawing it (cargoView). Plain geometry over her recipe and her state: a crane's hook is
 * found from its socket and the angles and wire in its state (VesselState.modules), so it
 * works the same on the host and on crew.
 */
import * as THREE from 'three';
import { simOf } from '../boats/sims';
import { matrixOf } from '../modular/vesselAssembly';
import { craneHook, DECK_CRANE, type DeckCraneConfig, type DeckCraneState } from '../modules/deckCrane';
import type { VesselState } from '../vessel/vesselState';

/** A deck crane on a boat: its path (its key in VesselState.modules), config and place on her. */
export interface CraneOnBoat {
  path: string;
  config: DeckCraneConfig;
  place: THREE.Matrix4;
}

const found = new WeakMap<object, CraneOnBoat[]>();

/** Her deck cranes (none on a boat without one). */
export function cranesOf(v: { defId: string }): CraneOnBoat[] {
  const sim = simOf(v.defId);
  if (!sim) return [];
  let list = found.get(sim);
  if (!list) {
    // Deck sockets are the hull's own, so a socket's transform is its place on the boat.
    list = sim.mounts.filter((m) => m.def.id === DECK_CRANE.id).map((m) => ({ path: m.path, config: m.config as DeckCraneConfig, place: matrixOf(m.socket.transform) }));
    found.set(sim, list);
  }
  return list;
}

/** A crane's state on her (undefined until her machinery has first run). */
export function craneStateOf(v: VesselState, path: string): DeckCraneState | undefined {
  return v.modules?.[path]?.s as DeckCraneState | undefined;
}

/** Where a crane's hook is, in her axes (null: no such crane on her, or no state yet). */
export function hookOnBoat(v: VesselState, path: string, out = new THREE.Vector3()): THREE.Vector3 | null {
  const crane = cranesOf(v).find((c) => c.path === path);
  const s = craneStateOf(v, path);
  if (!crane || !s) return null;
  return out.fromArray(craneHook(crane.config, s)).applyMatrix4(crane.place);
}
