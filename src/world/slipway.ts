import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS, type VesselDef } from '../vessel/vesselDef';
import type { SlipState, VesselState } from '../vessel/vesselState';
import { SLIPWAYS, type SlipwayDef } from './archipelago';
import { hullContactPoints } from '../vessel/physics/contacts';
import { softShore } from './coastShore';
import { groundHeight } from './terrain';

/**
 * Landing on a slipway (owner, Oct 2026): a boat with a bow ramp comes in slowly bow first,
 * her ramp down, and is drawn up onto the slip and held there, as a landing craft lies on a
 * hard with her ramp on the concrete. Landed, the waves no longer move her ("the physics
 * stops"): she's in port, her crew walk off down the ramp onto the slip, and going astern
 * takes her off again.
 *
 *   landed pose  level, at her waterline (y 0: her design floating), her bow up the slip,
 *                on its centreline, as far up it as her bottom allows: every station's keel
 *                clear of the concrete, the first to touch just on it. A beaching bow (the
 *                landing craft's forefoot rakes up to the waterline) rides well up the slip.
 *   the ramp     lowered as always (layout.bowRamp.loweredDeg); its toe flaps lie on the
 *                slip (`flapDeg`, below the horizontal), so the walk is hinge -> lip -> tip.
 *   held         after her machinery runs each tick (engine, electrics: all as usual), her
 *                pose is set back to the landed one and her motion zeroed.
 *
 * Plain JSON (`VesselState.slip`), so the crew see her landed and her flaps down.
 */

const DEG = Math.PI / 180;

/** The unit vector up a slip (world x, z). */
function upSlip(s: SlipwayDef): { x: number; z: number } {
  const a = s.headingDeg * DEG;
  return { x: Math.sin(a), z: -Math.cos(a) };
}

/** The slip's surface height `down` m down it from its top edge. */
function surfaceAt(s: SlipwayDef, down: number): number {
  return s.top - s.slope * down;
}

/** Her bow ramp's line (vessel axes, the boat level), its toe flaps at `flapDeg` below the horizontal. */
export function rampLine(def: VesselDef, flapDeg: number): { hinge: THREE.Vector3; lip: THREE.Vector3; tip: THREE.Vector3; halfWidth: number } | null {
  const br = def.layout.bowRamp;
  if (!br) return null;
  const plan = hullPlan(def);
  const hinge = new THREE.Vector3(0, plan.deckY(plan.stem), plan.stem);
  const a = br.loweredDeg * DEG;
  const lip = hinge.clone().add(new THREE.Vector3(0, br.length * Math.sin(a), -br.length * Math.cos(a)));
  const f = flapDeg * DEG;
  const tip = lip.clone().add(new THREE.Vector3(0, -br.flap.length * Math.sin(f), -br.flap.length * Math.cos(f)));
  return { hinge, lip, tip, halfWidth: br.width / 2 };
}

/**
 * Where she lies landed on this slip: her pose, and her toe flaps' angle to rest on it.
 * `down` is how far down the slip her origin lies (m from its top edge).
 */
export function landedPose(def: VesselDef, s: SlipwayDef): { position: [number, number, number]; orientation: [number, number, number, number]; flapDeg: number; down: number } {
  // Her origin `c` m down the slip: a station at her z is c + z down it (her bow, -z, is up
  // it). Its keel clears the concrete if top - slope (c + z) <= keel, so c >= (top - keel) /
  // slope - z for every station over the slip: the smallest such c is where she just touches.
  let c = -Infinity;
  for (const st of def.hull.stations) {
    const keel = Math.min(...st.polygon.map((p) => p[1]));
    c = Math.max(c, (s.top - keel) / s.slope - st.z);
  }
  // (A station past the toe is over the seabed, not the slip: she's well clear of that.)
  const u = upSlip(s);
  const position: [number, number, number] = [s.x - u.x * c, 0, s.z - u.z * c];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -s.headingDeg * DEG, 0, 'YXZ'));
  // The flaps: the angle below the horizontal at which their tips meet the slip (bisection:
  // a steeper angle drops the tip lower, and nearer the lip, where the slip is higher).
  const line = rampLine(def, 0);
  let flapDeg = CONFIG.vessels.landingCraft.layout.bowRamp.flap.hangDeg;
  if (line) {
    const L = def.layout.bowRamp!.flap.length;
    const gap = (deg: number) => {
      const f = deg * DEG;
      const tipY = line.lip.y - L * Math.sin(f);
      const tipZ = line.lip.z - L * Math.cos(f);
      return tipY - surfaceAt(s, c + tipZ);
    };
    let lo = 0;
    let hi = 90;
    if (gap(lo) <= 0) flapDeg = 0;
    else if (gap(hi) >= 0) flapDeg = 90; // they can't reach: they hang straight down
    else {
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (gap(mid) > 0) lo = mid;
        else hi = mid;
      }
      flapDeg = (lo + hi) / 2;
    }
  }
  return { position, orientation: [q.x, q.y, q.z, q.w], flapDeg, down: c };
}

/** Her bow ramp's commanded state: down (or going down). */
const rampDown = (v: VesselState) => (v.controls.bowRamp ?? 0) > 0.5;

/** The slip she could land on now, or null: ramp down, slow, lined up and close to where she'd lie (the lever not astern: stepSlipway). */
export function slipInRange(v: VesselState): SlipwayDef | null {
  const def = VESSEL_DEFS[v.defId];
  if (!def?.layout.bowRamp || !rampDown(v)) return null;
  const cfg = CONFIG.slipway;
  if (Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) > cfg.maxSpeed) return null;
  const q = new THREE.Quaternion().fromArray(v.orientation);
  const bow = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const bl = Math.hypot(bow.x, bow.z) || 1;
  for (const s of SLIPWAYS) {
    const u = upSlip(s);
    if ((bow.x * u.x + bow.z * u.z) / bl < Math.cos(cfg.maxAngleDeg * DEG)) continue;
    const p = landedPose(def, s).position;
    const dx = v.position[0] - p[0];
    const dz = v.position[2] - p[2];
    if (Math.hypot(dx, dz) > cfg.range || Math.abs(dx * u.z - dz * u.x) > cfg.across) continue;
    return s;
  }
  return null;
}

/** Start landing her on a slip (drawn up onto it from where she is). */
function startLanding(v: VesselState, s: SlipwayDef, at = 0): void {
  const def = VESSEL_DEFS[v.defId];
  const to = landedPose(def, s);
  // At about a walking pace from where she is (the last few metres), at least `landSec`.
  const dur = Math.max(CONFIG.slipway.landSec, Math.hypot(v.position[0] - to.position[0], v.position[2] - to.position[2]) / CONFIG.slipway.landSpeed);
  const state: SlipState = {
    id: s.id,
    phase: at >= 1 ? 'landed' : 'landing',
    t: at * dur,
    dur,
    from: { position: [...v.position], orientation: [...v.orientation] },
    to: { position: to.position, orientation: to.orientation },
    flapDeg: to.flapDeg,
  };
  v.slip = state;
  v.mooring = { ...v.mooring, phase: 'free', bow: 0, stern: 0, t: 0 };
}

/**
 * Beached (the coast extras plan, C3): a boat with a bow ramp, her ramp down, slower than
 * CONFIG.beaching.maxSpeed, her forefoot (the lowest points of her foremost stations) on soft
 * ground: a coast map's sand or shingle (world/coastShore.ts).
 */
export function onBeach(v: VesselState): boolean {
  const def = VESSEL_DEFS[v.defId];
  if (!def?.layout.bowRamp || !rampDown(v)) return false;
  if (Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) > CONFIG.beaching.maxSpeed) return false;
  const pts = hullContactPoints(def.hull);
  const front = Math.min(...pts.map((p) => p[2]));
  const q = new THREE.Quaternion().fromArray(v.orientation);
  const p = new THREE.Vector3();
  for (const [x, y, z] of pts) {
    if (z > front + 1.5) continue;
    p.set(x, y, z).applyQuaternion(q).add(new THREE.Vector3(...v.position));
    if (softShore(p.x, p.z) && groundHeight(p.x, p.z) >= p.y - 0.15) return true;
  }
  return false;
}

/** Hold her where she has run up the beach (her pose as it is: a beach has no plane to lay her on). */
function startBeaching(v: VesselState): void {
  v.slip = {
    id: BEACH,
    phase: 'landed',
    t: 0,
    dur: 0,
    from: { position: [...v.position], orientation: [...v.orientation] },
    to: { position: [...v.position], orientation: [...v.orientation] },
    flapDeg: CONFIG.beaching.flapDeg,
  };
  v.mooring = { ...v.mooring, phase: 'free', bow: 0, stern: 0, t: 0 };
}

/** The slip id a beached boat's landing carries (no slipway has it). */
export const BEACH = 'beach';

/** Is she beached (landed on a beach, not a slip)? */
export function beached(v: VesselState | undefined): boolean {
  return v?.slip?.id === BEACH;
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/**
 * One tick, after her machinery and physics (core/simulation.ts): land her if she's in a
 * slip's reach with her ramp down; draw her up onto it; hold her landed; let her go astern.
 */
export function stepSlipway(v: VesselState, dt: number): void {
  if (!v.slip) {
    // (Not while going astern: backing off a slip with her ramp still down, she'd land again.)
    const s = v.controls.lever >= 0 ? slipInRange(v) : null;
    if (s) startLanding(v, s);
    else if (v.controls.lever >= 0 && onBeach(v)) startBeaching(v);
    else return;
  }
  const sl = v.slip!;
  if (sl.phase === 'landed' && v.controls.lever <= CONFIG.slipway.releaseLever) {
    // Astern: off she comes (the physics takes her from here).
    delete v.slip;
    return;
  }
  sl.t = Math.min(sl.dur, sl.t + dt);
  if (sl.t >= sl.dur) sl.phase = 'landed';
  const k = sl.dur > 0 ? sl.t / sl.dur : 1;
  const e = k * k * (3 - 2 * k);
  const [a, b] = [sl.from.position, sl.to.position];
  v.position = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
  qa.fromArray(sl.from.orientation).slerp(qb.fromArray(sl.to.orientation), e);
  v.orientation = [qa.x, qa.y, qa.z, qa.w];
  v.linearVelocity = [0, 0, 0];
  v.angularVelocity = [0, 0, 0];
}

/** Is she landed (or landing) on a slip? Which one. */
export function slipOf(v: VesselState | undefined): SlipwayDef | null {
  return (v?.slip && SLIPWAYS.find((s) => s.id === v.slip!.id)) || null;
}

/**
 * Slipway intents (targetId: the vessel):
 *   slipDebugLand  ref: a slip's id (else the nearest): her ramp down and landed on it now
 *   slipLeave      off the slip (as going astern does)
 */
export function applySlipIntent(world: WorldState, intent: Intent): void {
  const v = world.vessels[intent.targetId];
  if (!v || !VESSEL_DEFS[v.defId]?.layout.bowRamp) return;
  if (intent.control === 'slipLeave') {
    delete v.slip;
    return;
  }
  const s = SLIPWAYS.find((x) => x.id === intent.ref) ?? [...SLIPWAYS].sort((a, b) => Math.hypot(a.x - v.position[0], a.z - v.position[2]) - Math.hypot(b.x - v.position[0], b.z - v.position[2]))[0];
  v.controls.bowRamp = 1;
  v.controls.lever = 0;
  v.anchor = { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false };
  v.controls.anchor = 0;
  v.refuelling = false;
  startLanding(v, s, 1);
  stepSlipway(v, 0);
}

export const isSlipIntent = (control: string): boolean => control === 'slipDebugLand' || control === 'slipLeave';

// ── Walking off down the ramp (the app's locomotion uses these; plain geometry) ──

/** Within her ramp's width, with a body's room either side (m off the centreline). */
const RAMP_EDGE = 0.2;

/**
 * The floor on her lowered ramp and its flaps at (x, z) in her axes, or null off them:
 * from her bow (the hinge) down to the lip, then down the flaps to their tips.
 */
export function rampFloor(def: VesselDef, flapDeg: number, x: number, z: number): number | null {
  const r = rampLine(def, flapDeg);
  if (!r || Math.abs(x) > r.halfWidth - RAMP_EDGE || z > r.hinge.z + 0.6 || z < r.tip.z) return null;
  if (z >= r.hinge.z) return r.hinge.y;
  if (z >= r.lip.z) return r.hinge.y + ((r.lip.y - r.hinge.y) * (z - r.hinge.z)) / (r.lip.z - r.hinge.z);
  return r.lip.y + ((r.tip.y - r.lip.y) * (z - r.lip.z)) / (r.tip.z - r.lip.z);
}

/**
 * Stepping between her ramp and the slip, at the flaps' tips (her axes): walking down past
 * `ashoreZ` you're ashore on the slip; walking up onto the flaps past `aboardZ` you're aboard
 * (a gap between the two, so you don't flick back and forth on the line).
 */
export function rampCrossing(def: VesselDef, flapDeg: number): { ashoreZ: number; aboardZ: number; halfWidth: number } | null {
  const r = rampLine(def, flapDeg);
  return r ? { ashoreZ: r.tip.z + 0.15, aboardZ: r.tip.z + 0.35, halfWidth: r.halfWidth - RAMP_EDGE } : null;
}

/** Is she landed with her ramp down, so it can be walked? */
export function rampWalkable(v: VesselState | undefined): boolean {
  return !!v?.slip && v.slip.phase === 'landed' && (v.controls.bowRamp ?? 0) > 0.5;
}
