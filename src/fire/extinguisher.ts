import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import type { PlayerState } from '../player/playerState';
import { VESSEL_DEFS, isWorkboat } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { groundHeight } from '../world/terrain';
import { arcWetting } from './fire';

/**
 * The hand fire extinguisher (owner request): from its bracket in the wheelhouse, carried
 * to a fire (alongside a burning boat, or ashore to a burning shed) and sprayed at it.
 *
 * Who's spraying is part of each player's pose (PlayerState.avatar.gear: the nozzle and its
 * direction, and whether the trigger is held), so the host sees crew-mates' sprays too.
 * The spray is modelled like the monitor's jet, much smaller: leaving the nozzle at
 * `nozzleSpeed`, falling under gravity with air drag (it carries 5-6 m). Where it passes
 * through the fire it knocks it down (fire.ts stepFire, `douse` x the monitor's rate).
 *
 * Its charge (workboat VesselState.extCharge) runs down while it sprays, `seconds` for a
 * full one; empty, nothing comes out. Back on its bracket (nobody holding it) it's full
 * again: swapped for a charged one.
 */

const q = new THREE.Quaternion();
const p0 = new THREE.Vector3();
const d0 = new THREE.Vector3();
const path = Array.from({ length: 40 }, () => new THREE.Vector3());

/** The ship that carries the extinguisher (the first workboat). */
export function extinguisherShip(world: WorldState): VesselState | undefined {
  return Object.values(world.vessels).find((v) => isWorkboat(VESSEL_DEFS[v.defId]));
}

/** A player's hand-gear nozzle and direction in the world (from their pose's frame), or false. */
export function gearWorld(world: WorldState, p: PlayerState, outP: THREE.Vector3, outD: THREE.Vector3): boolean {
  const g = p.avatar?.gear;
  if (!g) return false;
  outP.fromArray(g.p);
  outD.fromArray(g.d);
  const v = p.aboardVesselId ? world.vessels[p.aboardVesselId] : undefined;
  if (v) {
    q.fromArray(v.orientation);
    outP.applyQuaternion(q).add(d0.fromArray(v.position));
    outD.fromArray(g.d).applyQuaternion(q);
  }
  if (outD.lengthSq() < 1e-8) return false;
  outD.normalize();
  return true;
}

/** The spray's path (world points from the nozzle until it meets the sea or the ground). Returns the count. */
export function sprayPath(from: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3[], step = 0.05): number {
  const c = CONFIG.handGear.extinguisher;
  const g = CONFIG.ocean.gravity;
  const pos = from.clone();
  const vel = dir.clone().multiplyScalar(c.nozzleSpeed);
  let n = 0;
  for (; n < out.length; n++) {
    out[n].copy(pos);
    if (n > 0 && pos.y <= Math.max(0, groundHeight(pos.x, pos.z))) {
      n++;
      break;
    }
    vel.x -= c.airDrag * vel.x * step;
    vel.z -= c.airDrag * vel.z * step;
    vel.y += (-g - c.airDrag * vel.y) * step;
    pos.addScaledVector(vel, step);
  }
  return n;
}

/** Is anyone holding the extinguisher (it's off its bracket)? Who's spraying, if anyone? */
function holders(world: WorldState): { held: boolean; spraying: PlayerState[] } {
  let held = false;
  const spraying: PlayerState[] = [];
  for (const p of Object.values(world.players)) {
    const g = p.avatar?.gear;
    if (g?.kind !== 'extinguisher') continue;
    held = true;
    if (g.on) spraying.push(p);
  }
  return { held, spraying };
}

/** One tick, before stepFire: run the charge down while spraying, and wet the fire. */
export function stepExtinguisher(world: WorldState, dt: number): void {
  const ship = extinguisherShip(world);
  if (!ship) return;
  const { held, spraying } = holders(world);
  if (!held) {
    ship.extCharge = 1; // on its bracket: a full one
  } else if (spraying.length) {
    ship.extCharge = Math.max(0, (ship.extCharge ?? 1) - dt / CONFIG.handGear.extinguisher.seconds);
  }
  const job = world.fire?.job;
  if (!job) return;
  let w = 0;
  if ((ship.extCharge ?? 1) > 0) {
    for (const p of spraying) {
      if (!gearWorld(world, p, p0, d0)) continue;
      w = Math.max(w, arcWetting(path, sprayPath(p0, d0, path), job));
    }
  }
  job.handWet = w;
}
