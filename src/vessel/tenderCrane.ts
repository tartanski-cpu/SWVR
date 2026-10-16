/**
 * The workboat's tender crane and her tender (the skiff).
 *
 * The skiff lives in a cradle on the foredeck (owner request: on the stern davit she was
 * in the way of towing and trawling), under a tarpaulin. A knuckle-boom crane on the
 * starboard foredeck, as yachts use for their tenders, folded away while she's stowed,
 * puts her over the side and takes her back:
 *
 *   rig     the crane unfolds and the hook goes on her bridle (`rigTime`; she stays put)
 *   hoist   straight up out of the cradle, `clear` m: her keel clears the bow rail
 *   slew    the hook swings round the column, forward about through the bow sector, out
 *           to starboard (radius eased from the cradle's to the outboard spot's); a swivel
 *           hook doesn't turn her, so she keeps her heading, bow forward, all the way
 *   lower   down to `waterY` at the outboard spot alongside the starboard bow; let go
 *
 * Recovery runs it backwards: lined up under the hook at the outboard spot (`alignTime`),
 * then lower, slew and hoist in reverse, and set down in the cradle.
 *
 * A tender on the crane is not simulated as a floating body: she rides the ship exactly
 * (kinematically), like the crew standing on deck. Her pose is written each tick from the
 * ship's pose and a point on that path in the ship's axes. At the water, let go, she is a
 * free body again from that tick, starting with the velocity the ship's motion (and the
 * crane's) gave her, so there is no jolt.
 *
 * One intent drives it all (`crane`, aimed at the tender): in the cradle -> launch; afloat
 * close alongside the starboard bow, slow -> recover. In the cradle, the battery charges
 * from the ship.
 *
 * The crane is hydraulic (the deck hydraulics: engine running, DECK HYD breaker on;
 * electrics.ts hydraulicsOn). Without pressure it won't start, and if the pressure goes
 * mid-lift it stops and holds her where she is until it comes back.
 */
import * as THREE from 'three';
import { painterOnLaunch } from './physics/painter';
import type { Intent } from '../core/intents';
import { clamp } from '../core/math';
import type { WorldState } from '../core/world';
import { hydraulicsOn } from './electrics';
import { hullPlan } from './layout';
import { VESSEL_DEFS, type VesselDef } from './vesselDef';
import type { TenderState, VesselState } from './vesselState';

export type TenderCrane = NonNullable<VesselDef['tenderCrane']>;

const qHost = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const qRel = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const p0 = new THREE.Vector3();
const p1 = new THREE.Vector3();

/** Smooth start and stop for each move (no jerk at either end). */
const ease = (t: number) => t * t * (3 - 2 * t);

/** The whole launch path, cradle to water (s). */
export function launchTime(c: TenderCrane): number {
  return c.rigTime + c.hoistTime + c.slewTime + c.lowerTime;
}

/**
 * Her origin (ship axes) `t` s along the launch path (0: in the cradle, launchTime: at the
 * water alongside). Her heading stays 0 (bow forward) throughout.
 */
export function launchPoint(c: TenderCrane, time: number, out: THREE.Vector3): THREE.Vector3 {
  const [sx, sy, sz] = c.stow;
  // Rigging (unfold, hook on): she's still in the cradle.
  const t = time - c.rigTime;
  if (t <= 0) return out.set(sx, sy, sz);
  const [ox, oz] = c.outboard;
  const raised = sy + c.clear;
  const t1 = c.hoistTime;
  const t2 = t1 + c.slewTime;
  if (t <= t1) return out.set(sx, sy + c.clear * ease(clamp(t / t1, 0, 1)), sz);
  if (t <= t2) {
    // The hook (her lifting point) goes round the column; she hangs under it.
    const [cx, cz] = c.column;
    const [lx, , lz] = c.lift;
    const a0 = Math.atan2(sz + lz - cz, sx + lx - cx);
    let a1 = Math.atan2(oz + lz - cz, ox + lx - cx);
    // Forward about (through -z, the bow sector): the angle increases from cradle to outboard.
    if (a1 < a0) a1 += Math.PI * 2;
    const r0 = Math.hypot(sx + lx - cx, sz + lz - cz);
    const r1 = Math.hypot(ox + lx - cx, oz + lz - cz);
    const f = ease((t - t1) / c.slewTime);
    const a = a0 + (a1 - a0) * f;
    const r = r0 + (r1 - r0) * f;
    return out.set(cx + r * Math.cos(a) - lx, raised, cz + r * Math.sin(a) - lz);
  }
  const f = ease(clamp((t - t2) / c.lowerTime, 0, 1));
  return out.set(ox, raised + (c.waterY - raised) * f, oz);
}

function craneOf(world: WorldState, t: TenderState): { host: VesselState; crane: TenderCrane } | null {
  const host = world.vessels[t.hostId];
  const crane = host && VESSEL_DEFS[host.defId].tenderCrane;
  return host && crane ? { host, crane } : null;
}

/** Put a tender in her ship's cradle (world creation). */
export function stowTender(world: WorldState, tender: VesselState, hostId: string): void {
  tender.tender = { hostId, phase: 'stowed', t: 0 };
  stepTender(world, tender, 0);
}

/** On the crane or in the cradle (not floating free): skip her physics and boat-against-boat contact. */
export function onCrane(v: VesselState): boolean {
  return !!v.tender && v.tender.phase !== 'free';
}

/**
 * Can she be recovered now? Afloat, within `recoverRange` of the outboard spot (alongside
 * the starboard bow) and moving with the ship (relative speed under `recoverSpeed`).
 */
export function recoverCheck(world: WorldState, tender: VesselState): { ok: boolean; why: string } {
  const t = tender.tender;
  const d = t && craneOf(world, t);
  if (!t || !d) return { ok: false, why: 'no crane' };
  if (t.phase !== 'free') return { ok: false, why: t.phase };
  const { host, crane } = d;
  const spot = v1.set(crane.outboard[0], crane.waterY, crane.outboard[1]).applyQuaternion(qHost.fromArray(host.orientation)).add(v2.fromArray(host.position));
  const dist = Math.hypot(tender.position[0] - spot.x, tender.position[2] - spot.z);
  if (dist > crane.recoverRange) return { ok: false, why: `bring her alongside the starboard bow (${dist.toFixed(0)} m)` };
  const rel = Math.hypot(tender.linearVelocity[0] - host.linearVelocity[0], tender.linearVelocity[2] - host.linearVelocity[2]);
  if (rel > crane.recoverSpeed) return { ok: false, why: 'too fast: match speed' };
  return { ok: true, why: '' };
}

/** The `crane` intent (aimed at the tender): launch her if stowed, recover her if alongside. */
export function applyCraneIntent(world: WorldState, intent: Intent): void {
  const tender = world.vessels[intent.targetId];
  const t = tender?.tender;
  const d = t && craneOf(world, t);
  if (!t || !d || !hydraulicsOn(d.host)) return;
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
    delete t.painter; // let go: she comes up on the hook
    t.from = [local.x, local.y, local.z, yaw];
    tender.controls.lever = 0;
    tender.controls.obOn = 0;
    tender.controls.obGear = 0;
  }
}

/** Where she is on the crane `t` s into her phase: origin (ship axes) and heading (rad). */
function cranePose(c: TenderCrane, t: TenderState, time: number, out: THREE.Vector3): number {
  const T = launchTime(c);
  if (t.phase === 'lowering') {
    launchPoint(c, time, out);
    return 0;
  }
  if (t.phase === 'hoisting') {
    const from = t.from;
    if (from && time < c.alignTime) {
      // Lined up under the hook at the outboard spot, the shortest way round to bow forward.
      const f = ease(time / c.alignTime);
      launchPoint(c, T, out);
      out.set(from[0] + (out.x - from[0]) * f, from[1] + (out.y - from[1]) * f, from[2] + (out.z - from[2]) * f);
      return from[3] + Math.atan2(Math.sin(-from[3]), Math.cos(-from[3])) * f;
    }
    launchPoint(c, T - (time - c.alignTime), out);
    return 0;
  }
  launchPoint(c, 0, out);
  return 0;
}

/**
 * Advance a tender on the crane by dt: write her pose (and the velocity that pose implies)
 * from the ship's, move her along the path, charge her, step the crew off when she's back
 * in the cradle. Call after the ship has been stepped this tick. Free tenders are left alone.
 */
export function stepTender(world: WorldState, tender: VesselState, dt: number): void {
  const t = tender.tender;
  if (!t || t.phase === 'free') return;
  const d = craneOf(world, t);
  if (!d) {
    t.phase = 'free';
    return;
  }
  const { host, crane } = d;
  // Moving only with hydraulic pressure; without it she hangs where she is.
  const moving = t.phase !== 'stowed' && hydraulicsOn(host);
  if (moving || t.phase === 'stowed') t.t += dt;
  const T = launchTime(crane);
  if (t.phase === 'hoisting' && t.t >= crane.alignTime + T) {
    t.phase = 'stowed';
    t.t = 0;
    delete t.from;
    stepOffCrew(world, tender, host, crane);
  }

  // Where she is now, and a moment on (for the speed the crane gives her), ship axes.
  const yaw = cranePose(crane, t, t.t, p0);
  cranePose(crane, t, t.t + 0.01, p1);
  const along = p1.sub(p0).multiplyScalar(1 / 0.01);
  if (!moving) along.set(0, 0, 0);

  // Pose: ship pose x (point, heading) in the ship's axes.
  qHost.fromArray(host.orientation);
  const pos = v1.copy(p0).applyQuaternion(qHost).add(v2.fromArray(host.position));
  tender.position = [pos.x, pos.y, pos.z];
  const q = qRel.copy(qHost).multiply(qYaw.setFromAxisAngle(up, yaw));
  tender.orientation = [q.x, q.y, q.z, q.w];
  // Velocity: the ship's at that point (v + w x r, r from the ship's CG), plus the crane's.
  const hostDef = VESSEL_DEFS[host.defId];
  const r = v2.fromArray(hostDef.cg).applyQuaternion(qHost).add(v3.fromArray(host.position)).negate().add(pos);
  const w = v3.fromArray(host.angularVelocity);
  const vel = w.cross(r).add(v2.fromArray(host.linearVelocity)).add(along.applyQuaternion(qHost));
  tender.linearVelocity = [vel.x, vel.y, vel.z];
  tender.angularVelocity = [...host.angularVelocity];
  tender.thrust = 0;

  if (t.phase === 'stowed' && tender.battery !== undefined) {
    tender.battery = Math.min(1, tender.battery + dt / (crane.chargeMinutes * 60));
  }
  // At the water: let go of the hook. From the next tick she floats on her own.
  if (t.phase === 'lowering' && t.t >= T) {
    t.phase = 'free';
    t.t = 0;
    // On her painter from the moment she's afloat (owner: launched in wind, she blew away).
    painterOnLaunch(world, tender);
  }
}

/** Crew still in the tender when she's set down in the cradle step out onto the foredeck. */
function stepOffCrew(world: WorldState, tender: VesselState, host: VesselState, crane: TenderCrane): void {
  const plan = hullPlan(VESSEL_DEFS[host.defId]);
  let i = 0;
  for (const p of Object.values(world.players)) {
    if (p.aboardVesselId !== tender.id) continue;
    const [x, z] = crane.stepOff[i++ % crane.stepOff.length];
    p.aboardVesselId = host.id;
    p.position = [x, plan.deckY(z), z];
    p.mode = 'walk';
    delete p.velocity;
  }
}
