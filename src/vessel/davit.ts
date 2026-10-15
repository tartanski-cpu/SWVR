/**
 * The workboat's stern davit and her tender (the skiff).
 *
 * A tender on the davit is not simulated as a floating body: she hangs from the ship and
 * rides it exactly (kinematically), like the crew standing on deck. Her pose is written
 * each tick from the ship's pose and a point in the ship's axes:
 *
 *   stowed    hung:     origin at `davit.hang`, turned `yawDeg` (athwartships)
 *   lowering  hung -> water (`waterY`) over `lowerTime`; then let go: from that tick on
 *             she is a free body again, starting with the velocity the ship's motion gave
 *             her, so there is no jolt
 *   hoisting  her pose when hooked on -> water spot (`alignTime`), then water -> hung
 *             (`hoistTime`)
 *
 * One intent drives it all (`davit`, aimed at the tender): stowed -> launch; afloat and
 * close under the stern, slow -> recover. Stowed, the battery charges from the ship.
 */
import * as THREE from 'three';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS, type VesselDef } from './vesselDef';
import type { TenderState, VesselState } from './vesselState';

type Davit = NonNullable<VesselDef['davit']>;

const qHost = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const qRel = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();

/** Smooth start and stop for the falls (no jerk at either end). */
const ease = (t: number) => t * t * (3 - 2 * t);

function davitOf(world: WorldState, t: TenderState): { host: VesselState; davit: Davit } | null {
  const host = world.vessels[t.hostId];
  const davit = host && VESSEL_DEFS[host.defId].davit;
  return host && davit ? { host, davit } : null;
}

/** Hang a tender on a ship's davit (world creation). */
export function stowTender(world: WorldState, tender: VesselState, hostId: string): void {
  tender.tender = { hostId, phase: 'stowed', t: 0 };
  stepTender(world, tender, 0);
}

/** On the davit (not floating free): skip her physics and boat-against-boat contact. */
export function onDavit(v: VesselState): boolean {
  return !!v.tender && v.tender.phase !== 'free';
}

/**
 * Can she be recovered now? Afloat, within `recoverRange` of the spot under the davit and
 * moving with the ship (relative speed under `recoverSpeed`).
 */
export function recoverCheck(world: WorldState, tender: VesselState): { ok: boolean; why: string } {
  const t = tender.tender;
  const d = t && davitOf(world, t);
  if (!t || !d) return { ok: false, why: 'no davit' };
  if (t.phase !== 'free') return { ok: false, why: t.phase };
  const { host, davit } = d;
  const spot = v1.set(davit.hang[0], davit.waterY, davit.hang[2]).applyQuaternion(qHost.fromArray(host.orientation)).add(v2.fromArray(host.position));
  const dist = Math.hypot(tender.position[0] - spot.x, tender.position[2] - spot.z);
  if (dist > davit.recoverRange) return { ok: false, why: `bring her under the stern (${dist.toFixed(0)} m)` };
  const rel = Math.hypot(tender.linearVelocity[0] - host.linearVelocity[0], tender.linearVelocity[2] - host.linearVelocity[2]);
  if (rel > davit.recoverSpeed) return { ok: false, why: 'too fast: match speed' };
  return { ok: true, why: '' };
}

/** The `davit` intent (aimed at the tender): launch her if stowed, recover her if alongside. */
export function applyDavitIntent(world: WorldState, intent: Intent): void {
  const tender = world.vessels[intent.targetId];
  const t = tender?.tender;
  if (!t || !davitOf(world, t)) return;
  if (t.phase === 'stowed') {
    t.phase = 'lowering';
    t.t = 0;
  } else if (t.phase === 'free' && recoverCheck(world, tender).ok) {
    const host = world.vessels[t.hostId];
    // Her pose in the ship's axes now, to line her up from.
    qHost.fromArray(host.orientation);
    const local = v1.fromArray(tender.position).sub(v2.fromArray(host.position)).applyQuaternion(qRel.copy(qHost).invert());
    qRel.multiply(qYaw.fromArray(tender.orientation)); // ship -> tender rotation
    const fwd = v3.set(0, 0, -1).applyQuaternion(qRel);
    const yaw = Math.atan2(-fwd.x, -fwd.z); // her heading relative to ours (rad, + = bow to port)
    t.phase = 'hoisting';
    t.t = 0;
    t.from = [local.x, local.y, local.z, yaw];
    tender.controls.lever = 0;
    tender.controls.obOn = 0;
    tender.controls.obGear = 0;
  }
}

/**
 * Advance a tender on the davit by dt: write her pose (and the velocity that pose implies)
 * from the ship's, move her along the falls, charge her, step the crew off when stowed.
 * Call after the ship has been stepped this tick. Free tenders are left alone.
 */
export function stepTender(world: WorldState, tender: VesselState, dt: number): void {
  const t = tender.tender;
  if (!t || t.phase === 'free') return;
  const d = davitOf(world, t);
  if (!d) {
    t.phase = 'free';
    return;
  }
  const { host, davit } = d;
  t.t += dt;

  // Where along the falls she is: a point and a heading in the ship's axes.
  const hung = davit.hang;
  const hungYaw = (davit.yawDeg * Math.PI) / 180;
  let x = hung[0];
  let y = hung[1];
  let z = hung[2];
  let yaw = hungYaw;
  let vy = 0; // speed along the falls (ship's up), m/s
  if (t.phase === 'lowering') {
    const f = Math.min(1, t.t / davit.lowerTime);
    y = hung[1] + (davit.waterY - hung[1]) * ease(f);
    vy = f < 1 ? ((davit.waterY - hung[1]) * 6 * f * (1 - f)) / davit.lowerTime : 0;
  } else if (t.phase === 'hoisting') {
    const from = t.from ?? [x, davit.waterY, z, yaw];
    if (t.t < davit.alignTime) {
      const f = ease(t.t / davit.alignTime);
      x = from[0] + (hung[0] - from[0]) * f;
      y = from[1] + (davit.waterY - from[1]) * f;
      z = from[2] + (hung[2] - from[2]) * f;
      // Shortest way round to the hung heading.
      const dy = Math.atan2(Math.sin(hungYaw - from[3]), Math.cos(hungYaw - from[3]));
      yaw = from[3] + dy * f;
    } else {
      const f = Math.min(1, (t.t - davit.alignTime) / davit.hoistTime);
      y = davit.waterY + (hung[1] - davit.waterY) * ease(f);
      vy = f < 1 ? ((hung[1] - davit.waterY) * 6 * f * (1 - f)) / davit.hoistTime : 0;
      if (f >= 1) {
        t.phase = 'stowed';
        t.t = 0;
        delete t.from;
        stepOffCrew(world, tender, host, davit);
      }
    }
  }

  // Pose: ship pose x (point, heading) in the ship's axes.
  qHost.fromArray(host.orientation);
  const pos = v1.set(x, y, z).applyQuaternion(qHost).add(v2.fromArray(host.position));
  tender.position = [pos.x, pos.y, pos.z];
  const q = qRel.copy(qHost).multiply(qYaw.setFromAxisAngle(up, yaw));
  tender.orientation = [q.x, q.y, q.z, q.w];
  // Velocity: the ship's at that point (v + w x r, r from the ship's CG), plus the falls.
  const hostDef = VESSEL_DEFS[host.defId];
  const r = v2.fromArray(hostDef.cg).applyQuaternion(qHost).add(v3.fromArray(host.position)).negate().add(pos);
  const w = v3.fromArray(host.angularVelocity);
  const vel = w.cross(r).add(v2.fromArray(host.linearVelocity)).add(v1.set(0, vy, 0).applyQuaternion(qHost));
  tender.linearVelocity = [vel.x, vel.y, vel.z];
  tender.angularVelocity = [...host.angularVelocity];
  tender.thrust = 0;

  if (t.phase === 'stowed' && tender.battery !== undefined) {
    tender.battery = Math.min(1, tender.battery + dt / (davit.chargeMinutes * 60));
  }
  // At the water: let go of the falls. From the next tick she floats on her own.
  if (t.phase === 'lowering' && t.t >= davit.lowerTime) {
    t.phase = 'free';
    t.t = 0;
  }
}

/** Crew still in the tender when she's hoisted home step across onto the ship's aft deck. */
function stepOffCrew(world: WorldState, tender: VesselState, host: VesselState, davit: Davit): void {
  let i = 0;
  for (const p of Object.values(world.players)) {
    if (p.aboardVesselId !== tender.id) continue;
    p.aboardVesselId = host.id;
    p.position = [davit.stepOff[0] - 0.7 * i++, davit.stepOff[1], davit.stepOff[2]];
    p.yaw += (davit.yawDeg * Math.PI) / 180; // keep facing the same way
    p.mode = 'walk';
    delete p.velocity;
  }
}
