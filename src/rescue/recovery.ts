/**
 * Getting them aboard: the life ring and its line, the boat hook, a survivor climbing over
 * the stern, and the propeller rule. Shared simulation state in WorldState.rescue (ring,
 * hook) and the incident's targets; players' hands act on it through intents.
 *
 *   ring   'stowed' on the wheelhouse | 'held' by a player | 'flying' (thrown: ballistic)
 *          | 'water' (floating, on a line from the quarter cleat). Its line can only be
 *          shortened (reeled in); while it's longer than the ring is far, the ring floats
 *          free; once taut, reeling drags the ring (and whoever holds it) toward the cleat.
 *   person 'floating' -> 'onLine' (grabbed the ring) -> 'climbing' (at the stern, engine in
 *          neutral) -> 'aboard' (sitting on deck, vessel frame).
 *   crate  'floating' -> 'hooked' (follows the hook tip of whoever hooked it) -> lifted
 *          aboard: it becomes an ordinary cargo item in the lifter's hands (destination
 *          'any': recovered cargo can be landed at any harbour).
 *
 * Propeller rule: a survivor on the line near the stern with the engine in gear shouts and
 * swims away until it's in neutral - no failure, just the lesson.
 */
import { windVector } from '../environment/weather';
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { Vec3 } from '../core/math';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { hullPlan } from '../vessel/layout';
import { asWorkboat, VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { quickDeckPoint, stowOnDeck, type CargoItem } from '../cargo/cargo';
import type { RescueState, RescueTarget } from './rescue';

export interface RingState {
  state: 'stowed' | 'held' | 'flying' | 'water';
  holder: string | null;
  /** World position and velocity (flying / water). */
  pos: Vec3;
  vel: Vec3;
  /** Line paid out (m). */
  line: number;
}

export interface HookState {
  holder: string | null;
  /** Laid down on deck (not in its clips): butt position (vessel axes) and the pole's yaw. */
  deck?: [number, number, number, number];
}

/** A short message shouted by a survivor (views show / speak it when the id changes). */
export interface Shout {
  id: number;
  text: string;
}

export function createRing(): RingState {
  return { state: 'stowed', holder: null, pos: [0, 0, 0], vel: [0, 0, 0], line: 0 };
}

const q = new THREE.Quaternion();
const p = new THREE.Vector3();

/** A point in vessel axes -> world. */
export function vesselToWorld(v: VesselState, local: readonly number[], out = new THREE.Vector3()): THREE.Vector3 {
  q.fromArray(v.orientation);
  return out.set(local[0], local[1], local[2]).applyQuaternion(q).add(p.fromArray(v.position));
}

/** A world point -> vessel axes. */
export function worldToVessel(v: VesselState, world: readonly number[], out = new THREE.Vector3()): THREE.Vector3 {
  q.fromArray(v.orientation).invert();
  return out.set(world[0] - v.position[0], world[1] - v.position[1], world[2] - v.position[2]).applyQuaternion(q);
}

/** Horizontal distance from a world point to the vessel's hull side (0 inside the hull plan). */
export function distanceToHull(v: VesselState, x: number, z: number): number {
  const l = worldToVessel(v, [x, 0, z]);
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  const lz = Math.min(plan.transom, Math.max(plan.stem, l.z));
  const dz = Math.abs(l.z - lz);
  const dx = Math.max(0, Math.abs(l.x) - plan.halfBeam(lz));
  return Math.hypot(dx, dz);
}

function shout(r: RescueState, text: string): void {
  r.shoutSeq = (r.shoutSeq ?? 0) + 1;
  r.shout = { id: r.shoutSeq, text };
}

function persons(r: RescueState): RescueTarget[] {
  return (r.active?.targets ?? []).filter((t) => t.kind === 'person');
}

/** The free seat for the next survivor aboard (vessel axes). */
export function freeSeat(r: RescueState, v: VesselState): Vec3 {
  const seats = asWorkboat(VESSEL_DEFS[v.defId]).rescueGear.seats;
  const taken = persons(r).filter((t) => t.phase === 'aboard').length;
  const [x, z] = seats[Math.min(taken, seats.length - 1)];
  return [x, hullPlan(VESSEL_DEFS[v.defId]).deckY(z), z];
}

/** Everything still in the water recovered? Then the rescue moves on to landing them. */
function checkRecovered(world: WorldState, r: RescueState): void {
  const inc = r.active;
  if (!inc || inc.phase !== 'accepted') return;
  const left = inc.targets.filter((t) => t.phase !== 'aboard');
  if (left.length) return;
  inc.phase = 'recovered';
  r.cheer = (r.cheer ?? 0) + 1;
  void world;
}

/** One tick of the ring, the line, survivors and hooked crates. */
export function stepRecovery(world: WorldState, v: VesselState, waves: readonly PreparedWave[], dt: number): void {
  const cfg = CONFIG.rescue;
  const r = world.rescue!;
  const ring = (r.ring ??= createRing());
  const gear = asWorkboat(VESSEL_DEFS[v.defId]).rescueGear;
  const cleat = vesselToWorld(v, gear.ringCleat);

  const wind = windVector(world.environment, { x: 0, z: 0 });
  if (ring.state === 'flying') {
    ring.vel[1] -= CONFIG.ocean.gravity * dt;
    // The wind pushes it off line a little in flight.
    ring.vel[0] += wind.x * CONFIG.weather.ringPushPerWind * dt;
    ring.vel[2] += wind.z * CONFIG.weather.ringPushPerWind * dt;
    for (let i = 0; i < 3; i++) ring.pos[i] += ring.vel[i] * dt;
    const h = surfaceHeight(waves, ring.pos[0], ring.pos[2]);
    const dist = Math.hypot(ring.pos[0] - cleat.x, ring.pos[2] - cleat.z);
    if (ring.pos[1] <= h || dist > cfg.maxLine) {
      // Splash (or the line fetched up): it floats here, the line as long as it took.
      ring.state = 'water';
      ring.pos[1] = h;
      ring.vel = [0, 0, 0];
      ring.line = Math.min(cfg.maxLine, Math.max(dist, 1));
    }
  }
  if (ring.state === 'water') {
    ring.pos[0] += (cfg.drift[0] + wind.x * CONFIG.weather.driftPerWind) * dt;
    ring.pos[2] += (cfg.drift[1] + wind.z * CONFIG.weather.driftPerWind) * dt;
    // The line: no longer than paid out. Taut, it drags the ring toward the cleat.
    const dx = ring.pos[0] - cleat.x;
    const dz = ring.pos[2] - cleat.z;
    const d = Math.hypot(dx, dz);
    if (d > ring.line && d > 1e-6) {
      ring.pos[0] = cleat.x + (dx / d) * ring.line;
      ring.pos[2] = cleat.z + (dz / d) * ring.line;
    }
    ring.pos[1] = surfaceHeight(waves, ring.pos[0], ring.pos[2]);
    // Reeled right in with nobody on it: back on its hook.
    const onLine = persons(r).some((t) => t.phase === 'onLine');
    if (!onLine && ring.line < 1.6) ring.state = 'stowed';
  }

  const inc = r.active;
  if (!inc) return;
  const stern = vesselToWorld(v, gear.stern);
  for (const t of inc.targets) {
    if (t.kind === 'person') {
      if ((!t.phase || t.phase === 'floating') && ring.state === 'water' && inc.phase === 'accepted') {
        if (Math.hypot(t.x - ring.pos[0], t.z - ring.pos[2]) < cfg.catchRadius) t.phase = 'onLine';
      }
      if (t.phase === 'onLine') {
        t.x = ring.pos[0];
        t.z = ring.pos[2];
        const toStern = Math.hypot(t.x - stern.x, t.z - stern.z);
        if (v.engine.gear !== 0 && toStern < cfg.propRadius) {
          // Propeller! Swim (and pay the line) away until it stops.
          if (!inc.propWarned || world.time - inc.propWarned > 6) {
            inc.propWarned = world.time;
            shout(r, 'Stop your propeller! Put her in neutral!');
          }
          ring.line = Math.min(cfg.maxLine, ring.line + cfg.swimAway * dt);
          const dx = ring.pos[0] - stern.x;
          const dz = ring.pos[2] - stern.z;
          const d = Math.hypot(dx, dz) || 1;
          ring.pos[0] += (dx / d) * cfg.swimAway * dt;
          ring.pos[2] += (dz / d) * cfg.swimAway * dt;
        } else if (toStern < cfg.climbRange && v.engine.gear === 0) {
          t.phase = 'climbing';
          t.t = 0;
          t.seat = freeSeat(r, v);
          ring.state = 'stowed';
          ring.holder = null;
        }
      } else if (t.phase === 'climbing') {
        t.t = (t.t ?? 0) + dt;
        if (t.t >= cfg.climbTime) {
          t.phase = 'aboard';
          shout(r, 'Thank you! Thank you so much!');
        }
      }
    }
  }
  checkRecovered(world, r);
}

/** Recovery intents. Returns true if it was one. */
export function applyRecoveryIntent(world: WorldState, v: VesselState | undefined, intent: Intent): boolean {
  const r = world.rescue!;
  const ring = (r.ring ??= createRing());
  const hook = (r.hook ??= { holder: null });
  const who = intent.playerId;
  const cfg = CONFIG.rescue;
  switch (intent.control) {
    case 'ringTake':
      if (ring.state === 'stowed' || (ring.state === 'water' && !persons(r).some((t) => t.phase === 'onLine'))) {
        ring.state = 'held';
        ring.holder = who;
      }
      return true;
    case 'ringStow':
      if (ring.state === 'held' && ring.holder === who) {
        ring.state = 'stowed';
        ring.holder = null;
      }
      return true;
    case 'ringThrow': {
      const a = intent.args ?? [];
      if (ring.state !== 'held' || ring.holder !== who || a.length < 6 || !a.every(Number.isFinite)) return true;
      ring.state = 'flying';
      ring.holder = null;
      ring.pos = [a[0], a[1], a[2]];
      ring.vel = [a[3], a[4], a[5]];
      ring.line = cfg.maxLine;
      return true;
    }
    case 'ringPull':
      if (ring.state === 'water' && v) {
        const cleat = vesselToWorld(v, asWorkboat(VESSEL_DEFS[v.defId]).rescueGear.ringCleat);
        const d = Math.hypot(ring.pos[0] - cleat.x, ring.pos[2] - cleat.z);
        ring.line = Math.max(0.5, Math.min(ring.line, d) - Math.max(0, Math.min(5, intent.value)));
      }
      return true;
    case 'hookTake':
      if (!hook.holder) {
        hook.holder = who;
        delete hook.deck;
      }
      return true;
    case 'hookStow':
    case 'hookDrop':
      // Back in its clips, or laid down on deck (args: butt x, y, z in vessel axes, yaw).
      // Let go of it over the side and it's back in the clips: a lost hook is no fun.
      if (hook.holder === who) {
        hook.holder = null;
        delete hook.deck;
        const a = intent.args ?? [];
        if (intent.control === 'hookDrop' && v && a.length >= 4 && a.every(Number.isFinite)) {
          const plan = hullPlan(VESSEL_DEFS[v.defId]);
          const z = Math.min(plan.transom - 0.2, Math.max(plan.stem + 0.5, a[2]));
          const x = Math.max(-(plan.halfBeam(z) - 0.2), Math.min(plan.halfBeam(z) - 0.2, a[0]));
          if (Math.abs(a[0] - x) < 0.6 && Math.abs(a[2] - z) < 0.6) hook.deck = [x, plan.deckY(z) + 0.03, z, a[3]];
        }
        for (const t of r.active?.targets ?? []) if (t.phase === 'hooked' && t.hookedBy === who) t.phase = 'floating';
      }
      return true;
    case 'crateHook': {
      const t = r.active?.targets.find((x) => x.id === intent.ref);
      if (t && t.kind === 'crate' && (!t.phase || t.phase === 'floating') && hook.holder === who) {
        t.phase = 'hooked';
        t.hookedBy = who;
      }
      return true;
    }
    case 'crateTow': {
      const t = r.active?.targets.find((x) => x.id === intent.ref);
      const a = intent.args ?? [];
      if (t && t.phase === 'hooked' && t.hookedBy === who && a.length >= 2 && a.every(Number.isFinite)) {
        // At most a few metres per update (it's being towed, not teleported).
        const dx = a[0] - t.x;
        const dz = a[1] - t.z;
        const d = Math.hypot(dx, dz);
        const k = d > 3 ? 3 / d : 1;
        t.x += dx * k;
        t.z += dz * k;
      }
      return true;
    }
    case 'crateQuickLift': {
      // The menu's quick version (no hook): every crate floating within quickLiftRange of
      // the hull lifted aboard and lashed, while there's room on deck.
      const inc = r.active;
      if (!inc || !v) return true;
      const [dx, dz] = quickDeckPoint(v);
      for (const t of inc.targets) {
        if (t.kind !== 'crate' || t.phase === 'aboard' || distanceToHull(v, t.x, t.z) > cfg.quickLiftRange) continue;
        const item: CargoItem = { id: `rescued-${t.id}`, kind: 0, mass: 40, from: 'sea', to: 'any', at: { carriedBy: who } };
        if (!stowOnDeck(world, v, item, dx, dz)) break;
        world.cargo[item.id] = item;
        t.phase = 'aboard';
        t.cargoId = item.id;
      }
      checkRecovered(world, r);
      return true;
    }
    case 'crateLift': {
      const inc = r.active;
      const t = inc?.targets.find((x) => x.id === intent.ref);
      if (!inc || !t || t.kind !== 'crate' || !v || t.phase === 'aboard') return true;
      if (distanceToHull(v, t.x, t.z) > cfg.liftRange) return true;
      const item: CargoItem = { id: `rescued-${t.id}`, kind: 0, mass: 40, from: 'sea', to: 'any', at: { carriedBy: who } };
      world.cargo[item.id] = item;
      t.phase = 'aboard';
      t.cargoId = item.id;
      checkRecovered(world, r);
      return true;
    }
  }
  return false;
}
