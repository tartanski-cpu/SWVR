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
import { craneHook, craneSeatAt, DECK_CRANE, type DeckCraneConfig, type DeckCraneState } from '../modules/deckCrane';
import { hullQueries } from '../modular/hull';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';

/** A deck crane on a boat: its path (its key in VesselState.modules), config, and its column's place on her. */
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
    // Deck sockets are the hull's own, so a socket's transform is its place on the boat; the
    // crane stands from it where it chooses (out at the deck edge: craneSeat), and its axes
    // are its column's.
    const hull = hullQueries(VESSEL_DEFS[v.defId]);
    list = sim.mounts
      .filter((m) => m.def.id === DECK_CRANE.id)
      .map((m) => {
        const config = m.config as DeckCraneConfig;
        const socket = matrixOf(m.socket.transform);
        const place = socket.clone().multiply(new THREE.Matrix4().makeTranslation(craneSeatAt(config, hull, socket).dx, 0, 0));
        return { path: m.path, config, place };
      });
    found.set(sim, list);
  }
  return list;
}

/** A crane's state on her (undefined until her machinery has first run). */
export function craneStateOf(v: VesselState, path: string): DeckCraneState | undefined {
  return v.modules?.[path]?.s as DeckCraneState | undefined;
}

/** Where a crane's hook is, in her axes (null: no such crane on her, or no state yet); held by its motion compensation if that's working. */
export function hookOnBoat(v: VesselState, path: string, out = new THREE.Vector3()): THREE.Vector3 | null {
  const crane = cranesOf(v).find((c) => c.path === path);
  const s = craneStateOf(v, path);
  if (!crane || !s) return null;
  return out.fromArray(s.hookAt ?? craneHook(crane.config, s)).applyMatrix4(crane.place);
}

const qBoat = new THREE.Quaternion();
const qLevel = new THREE.Quaternion();
const euler = new THREE.Euler();
const nominal = new THREE.Vector3();
const held = new THREE.Vector3();
const inv = new THREE.Matrix4();

/**
 * Motion compensation (the 'craneComp' upgrade), each tick: where the hook is held, in the
 * crane's axes. The hook is put where it would hang if she floated upright and steady: her
 * heading kept (you still slew it round with her), her roll and pitch taken out, and her
 * height as `s.refY` (averaged over `settleS`, so her heave on the waves is taken out but a
 * change of draught isn't). From there back into her axes as she lies now: the crane moves
 * the hook that far from where the boom would leave it, up to its `stroke`.
 */
export function compensatedHook(v: VesselState, crane: CraneOnBoat, s: DeckCraneState): [number, number, number] {
  const c = crane.config;
  nominal.fromArray(craneHook(c, s)).applyMatrix4(crane.place);
  qBoat.fromArray(v.orientation);
  qLevel.setFromEuler(euler.set(0, euler.setFromQuaternion(qBoat, 'YXZ').y, 0, 'YXZ'));
  // Her steady self's hook, from her origin in the world (level, at her averaged height);
  // then in her axes as she lies now.
  held.copy(nominal).applyQuaternion(qLevel);
  held.y += (s.refY ?? v.position[1]) - v.position[1];
  held.applyQuaternion(qBoat.invert());
  // No further than its stroke from where the boom would leave it.
  held.sub(nominal);
  if (held.length() > c.motionComp.stroke) held.setLength(c.motionComp.stroke);
  held.add(nominal);
  return held.applyMatrix4(inv.copy(crane.place).invert()).toArray() as [number, number, number];
}
