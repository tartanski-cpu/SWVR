/**
 * The player's body when it leaves the deck: jumping, falling, swimming and climbing out.
 * Walking (on deck, ashore) stays in Locomotion; this module handles the
 * moments between frames of reference.
 *
 * Moving frames: aboard, PlayerState.position is in the vessel's axes. A jump converts it
 * to the world frame, and the take-off velocity starts from the deck's own velocity at your
 * feet (v + ω × r), so leaping off a boat doing 5 knots carries you along at 5 knots, just
 * as it would. Landing on a deck converts back. Heading carries over: world yaw = boat yaw
 * + your yaw on deck (heel and trim are dropped, which is a few degrees of head tilt at most).
 *
 * Positions are of the rig origin (the floor point under the play-area centre), but every
 * test uses the BODY point: rig origin moved horizontally to under the head, since in
 * room-scale VR that's where the person actually is.
 *
 * Client-authoritative like the rest of a player's pose: this all runs locally.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { PreparedWave } from '../ocean/waves';
import { surfaceHeight } from '../ocean/waves';
import type { WalkArea } from '../vessel/layout';
import type { VesselState } from '../vessel/vesselState';
import { houseRoofAt, housesOf, VESSEL_DEFS } from '../vessel/vesselDef';
import { gearOf } from '../boats/sims';
import type { GearFacts } from '../modular/module';
import { blockContact, blockTop, nearestBlockEdge, type BlockHit } from '../world/geography';
import type { PlayerState } from './playerState';

/** A vessel as the body sees it: the rendered root (what you see is what you land on). */
export interface BodyVessel {
  id: string;
  root: THREE.Object3D;
  area: WalkArea;
  plan: { halfBeam(z: number): number; deckY(z: number): number; transom: number; stem: number };
  state: VesselState;
}

export type BodyEvent = 'landedDeck' | 'landedLand' | 'splash' | 'climbedOut' | null;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const fwd = new THREE.Vector3();
const hit: BlockHit = { depth: 0, nx: 0, ny: 0, nz: 0, fendered: false };

/** The vessel this player last jumped off (so the gate below doesn't pull you straight back). */
let takeoffFrom: string | null = null;

/** Heading of an object about world +Y (rad), consistent with a rig yaw rotation. */
export function yawOf(q: THREE.Quaternion): number {
  fwd.set(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-fwd.x, -fwd.z);
}

/**
 * Take off. `frame` is what the player stands in (vessel root, or null for the world),
 * `headForward` the world view direction. Leaves the player in the world frame, in the air.
 */
export function jump(p: PlayerState, frame: { root: THREE.Object3D; state: VesselState } | null, headForward: THREE.Vector3): void {
  const cfg = CONFIG.body;
  const feet = tmpA.fromArray(p.position);
  const vel = tmpB.set(0, 0, 0);
  if (frame) {
    frame.root.localToWorld(feet);
    // Deck velocity at the feet: v + ω × r (r from the vessel origin, near enough the CG).
    const s = frame.state;
    const w = tmpC.fromArray(s.angularVelocity);
    const r = fwd.copy(feet).sub(frame.root.position);
    vel.fromArray(s.linearVelocity).add(w.cross(r));
    p.yaw += yawOf(frame.root.quaternion);
  }
  const dir = tmpC.set(headForward.x, 0, headForward.z);
  if (dir.lengthSq() > 1e-6) dir.normalize();
  vel.addScaledVector(dir, cfg.jumpForward);
  vel.y += cfg.jumpUp;
  takeoffFrom = frame?.state.id ?? null;
  p.aboardVesselId = null;
  p.position = [feet.x, feet.y, feet.z];
  p.velocity = [vel.x, vel.y, vel.z];
  p.mode = 'air';
}

/** Jump off whatever the player is on into the air, at an explicit world velocity (tests). */
export function setAirborne(p: PlayerState, pos: THREE.Vector3, vel: THREE.Vector3): void {
  takeoffFrom = null;
  p.aboardVesselId = null;
  p.position = [pos.x, pos.y, pos.z];
  p.velocity = [vel.x, vel.y, vel.z];
  p.mode = 'air';
}

/**
 * One frame of flight: gravity, then the first surface crossed on the way down wins - a
 * deck (back aboard, in its frame), land / quay / platform, or the sea (swimming).
 * `headOffset` is the head's horizontal offset from the rig origin (world).
 */
export function updateAir(
  p: PlayerState,
  dt: number,
  headOffset: THREE.Vector3,
  vessels: readonly BodyVessel[],
  world: WalkArea,
  waves: readonly PreparedWave[],
): BodyEvent {
  const g = CONFIG.body.gravity;
  const v = p.velocity ?? [0, 0, 0];
  const before = tmpA.fromArray(p.position).add(tmpC.set(headOffset.x, 0, headOffset.z));
  v[1] -= g * dt;
  p.position = [p.position[0] + v[0] * dt, p.position[1] + v[1] * dt, p.position[2] + v[2] * dt];
  p.velocity = v;
  const body = tmpB.fromArray(p.position).add(tmpC.set(headOffset.x, 0, headOffset.z));

  // Quay and pier walls: hit the side within reach of the top and you clamber up onto it
  // (as you would, hands on the edge); lower down you slide down it into the water.
  if (blockContact(body.x, body.y + 0.3, body.z, hit) && hit.ny === 0) {
    const top = blockTop(body.x - hit.nx * 0.3, body.z - hit.nz * 0.3);
    if (top !== null && top - body.y < CONFIG.body.clamberHeight) {
      p.position = [p.position[0] - hit.nx * 0.3, top, p.position[2] - hit.nz * 0.3];
      p.mode = 'walk';
      delete p.velocity;
      return 'landedLand';
    }
    p.position[0] += hit.nx * hit.depth;
    p.position[2] += hit.nz * hit.depth;
    const vn = v[0] * hit.nx + v[2] * hit.nz;
    if (vn < 0) {
      v[0] -= vn * hit.nx;
      v[2] -= vn * hit.nz;
    }
    body.x += hit.nx * hit.depth;
    body.z += hit.nz * hit.depth;
  }

  // House walls (every house: P2a): you bounce off (back to where you were, falling straight
  // down). Tested as "entered a house's footprint below its roof this frame", so a long
  // frame can't step through a thin wall.
  for (const ves of vessels) {
    const houses = housesOf(VESSEL_DEFS[ves.state.defId].layout);
    if (!houses.length) continue;
    const inHouse = (l: THREE.Vector3) => houses.some((wh) => Math.abs(l.x) < wh.halfWidth && l.z > wh.front && l.z < wh.aft && l.y < houseRoofAt(wh, l.z));
    const wasIn = inHouse(ves.root.worldToLocal(tmpD.copy(before)));
    const ln = ves.root.worldToLocal(tmpC.copy(body));
    if (!wasIn && inHouse(ln)) {
      const back = before.x - body.x;
      const backZ = before.z - body.z;
      p.position[0] += back;
      p.position[2] += backZ;
      body.x += back;
      body.z += backZ;
      v[0] = ves.state.linearVelocity[0];
      v[2] = ves.state.linearVelocity[2];
    }
  }

  // An open deck gate (layout.sideGate): jump at it from the skiff alongside (off its step)
  // and you're up through it, onto the deck inside. Not from the boat it's in: jumping out
  // through it, you go on down into the skiff.
  for (const ves of vessels) {
    if (ves.id === takeoffFrom) continue;
    const g = VESSEL_DEFS[ves.state.defId].layout.sideGate;
    if (!g || (ves.state.controls.sideGate ?? 0) <= 0.5) continue;
    const l = ves.root.worldToLocal(tmpC.copy(body));
    const z = Math.min(g.z1 - 0.3, Math.max(g.z0 + 0.3, l.z));
    const hb = ves.plan.halfBeam(z);
    const out = g.side * l.x - hb;
    const deck = ves.plan.deckY(z);
    if (l.z < g.z0 - 0.3 || l.z > g.z1 + 0.3 || out < -0.4 || out > g.boardRange || l.y < deck - 1.8 || l.y > deck + 0.8) continue;
    const x = g.side * (hb - 0.5);
    const floors = ves.area.floorsAt(x, z);
    if (!floors.length) continue;
    p.aboardVesselId = ves.id;
    p.position = [x, Math.min(...floors), z];
    p.yaw -= yawOf(ves.root.quaternion);
    p.mode = 'walk';
    delete p.velocity;
    return 'landedDeck';
  }

  // Decks, in each vessel's (moving) frame.
  if (v[1] <= 0) {
    for (const ves of vessels) {
      const lb = ves.root.worldToLocal(tmpC.copy(before));
      const prevY = lb.y;
      const ln = ves.root.worldToLocal(tmpC.copy(body));
      const lx = ln.x;
      const lz = ln.z;
      const lnY = ln.y;
      const floors = ves.area.floorsAt(lx, lz).sort((a, b) => b - a);
      // Coming down on the bulwark or the deck edge (inside the hull, no walkable floor
      // just there): you land on the deck just inboard of it.
      const { plan } = ves;
      if (!floors.length && lz > plan.stem && lz < plan.transom && Math.abs(lx) < plan.halfBeam(lz) + 0.1) {
        const d = plan.deckY(lz);
        if (prevY >= d - 0.05 && lnY <= d + 0.02) {
          // Nearest open-deck floor athwartships (inboard of a bulwark, outboard of the
          // wheelhouse), never inside a house.
          const houses = housesOf(VESSEL_DEFS[ves.state.defId].layout);
          const inHouse = (x: number) => houses.some((wh) => Math.abs(x) < wh.halfWidth + 0.05 && lz > wh.front && lz < wh.aft);
          for (let k = 1; k <= 20; k++) {
            const x = lx + (k % 2 ? -1 : 1) * Math.sign(lx || 1) * Math.ceil(k / 2) * 0.1;
            if (inHouse(x)) continue;
            const f = ves.area.floorsAt(x, lz).filter((h) => Math.abs(h - d) < 0.4);
            if (f.length) {
              landOn(p, ves, x - lx, f[0]);
              return 'landedDeck';
            }
          }
        }
      }
      for (const f of floors) {
        if (prevY >= f - 0.05 && lnY <= f + 0.02) {
          landOn(p, ves, 0, f);
          return 'landedDeck';
        }
      }
    }
    // Land and quays.
    for (const f of world.floorsAt(body.x, body.z)) {
      if (before.y >= f - 0.3 && body.y <= f + 0.02) {
        p.position[1] = f;
        p.mode = 'walk';
        delete p.velocity;
        return 'landedLand';
      }
    }
  }
  // The sea.
  if (body.y < surfaceHeight(waves, body.x, body.z) - 0.25) {
    p.mode = 'swim';
    delete p.velocity;
    return 'splash';
  }
  return null;
}

/** Land aboard: rig origin into the vessel's frame (shifted athwartships by `dx`), at floor `f`. */
function landOn(p: PlayerState, ves: BodyVessel, dx: number, f: number): void {
  const feet = ves.root.worldToLocal(tmpC.fromArray(p.position));
  p.aboardVesselId = ves.id;
  p.position = [feet.x + dx, f, feet.z];
  p.yaw -= yawOf(ves.root.quaternion);
  p.mode = 'walk';
  delete p.velocity;
}

/** A WalkArea for swimming: anywhere that isn't inside a quay or pier; no floors to settle on. */
export function swimArea(): WalkArea {
  return {
    floorsAt: () => [],
    walkable: (x, z) => !blockContact(x, -0.5, z, hit),
    ladderAt: () => null,
    insideSolid: () => false,
  };
}

/**
 * After a swimming frame's movement: float with the head just above the (smoothed) surface,
 * keep clear of hulls, and stand up where it's shallow enough.
 * `headHeight` is the head's height above the rig origin (m).
 */
export function updateSwim(
  p: PlayerState,
  dt: number,
  body: THREE.Vector3,
  headHeight: number,
  vessels: readonly BodyVessel[],
  world: WalkArea,
  waves: readonly PreparedWave[],
): BodyEvent {
  const cfg = CONFIG.body;
  // Hulls push you aside (you can't swim through the boat).
  for (const ves of vessels) {
    const l = ves.root.worldToLocal(tmpA.copy(body));
    const { plan } = ves;
    if (l.z < plan.stem || l.z > plan.transom || l.y > plan.deckY(l.z) + 0.5) continue;
    const clear = plan.halfBeam(l.z) + 0.35;
    if (Math.abs(l.x) < clear) {
      const out = ves.root.localToWorld(tmpB.set((Math.sign(l.x) || 1) * clear, l.y, l.z)).sub(ves.root.localToWorld(tmpC.copy(l)));
      p.position[0] += out.x;
      p.position[2] += out.z;
      body.x += out.x;
      body.z += out.z;
    }
  }
  // Shallow enough to stand: you walk out.
  const floors = world.floorsAt(body.x, body.z);
  if (floors.length && Math.max(...floors) > -CONFIG.body.wadeDepth - 0.05) {
    p.position[1] = Math.max(...floors);
    p.mode = 'walk';
    return 'landedLand';
  }
  // Float: head a little above the water, following the swell with a short lag.
  const target = surfaceHeight(waves, body.x, body.z) + cfg.swimHeadAbove - headHeight;
  p.position[1] += (target - p.position[1]) * Math.min(1, dt / cfg.swimSmoothing);
  return null;
}

/**
 * Climbing out of the water. With a `hand` (VR grip pressed), only a hand on a gunwale or
 * the transom of a boat counts; without (jump button), being near a hull or a quay face
 * does. Puts the player on deck (in the vessel's frame) or on the quay. Returns whether
 * it happened.
 */
export function climbOut(p: PlayerState, body: THREE.Vector3, hand: THREE.Vector3 | null, vessels: readonly BodyVessel[], waves: readonly PreparedWave[]): boolean {
  const cfg = CONFIG.body;
  // A swim ladder first: grip a rung, or jump near its foot, and you're up it.
  for (const ves of vessels) {
    const lad = swimLadderOf(ves);
    if (!lad) continue;
    const l = ves.root.worldToLocal(tmpA.copy(hand ?? body));
    const near = hand
      ? Math.abs(l.x - lad.x) < 0.45 && Math.abs(l.z - lad.z) < 0.5 && l.y > lad.bottom - 0.3 && l.y < lad.top + 0.4
      : Math.hypot(l.x - lad.x, l.z - lad.z) < lad.range;
    if (!near) continue;
    const floors = ves.area.floorsAt(lad.deckX, lad.z);
    if (!floors.length) continue;
    p.aboardVesselId = ves.id;
    p.position = [lad.deckX, Math.min(...floors), lad.z];
    p.yaw -= yawOf(ves.root.quaternion);
    p.mode = 'walk';
    delete p.velocity;
    return true;
  }
  for (const ves of vessels) {
    const { plan, area } = ves;
    let at: THREE.Vector3 | null = null;
    if (hand) {
      const h = ves.root.worldToLocal(tmpA.copy(hand));
      if (h.z < plan.stem + 1 || h.z > plan.transom + cfg.climbReach) continue;
      const deck = plan.deckY(Math.min(h.z, plan.transom));
      if (h.y < deck - 1.6 || h.y > deck + 0.6) continue;
      const hb = plan.halfBeam(Math.min(h.z, plan.transom));
      const atSide = Math.abs(Math.abs(h.x) - hb) < cfg.climbReach && h.z <= plan.transom;
      const atTransom = h.z > plan.transom - 0.3 && Math.abs(h.x) < hb;
      if (atSide || atTransom) at = h;
    } else {
      const b = ves.root.worldToLocal(tmpA.copy(body));
      if (b.z < plan.stem || b.z > plan.transom + cfg.climbOutRange) continue;
      const hb = plan.halfBeam(Math.min(b.z, plan.transom));
      if (Math.abs(b.x) > hb + cfg.climbOutRange) continue;
      at = b;
    }
    if (!at) continue;
    // Nearest walkable deck point, searching along the side from where you are.
    const z0 = Math.max(plan.stem + 2, Math.min(plan.transom - 0.5, at.z));
    for (let k = 0; k < 24; k++) {
      const z = z0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.4;
      const x = Math.sign(at.x || 1) * Math.min(Math.abs(at.x), plan.halfBeam(z) - 0.7);
      const floors = area.floorsAt(x, z);
      if (!floors.length) continue;
      const f = Math.min(...floors);
      p.aboardVesselId = ves.id;
      p.position = [x, f, z];
      p.yaw -= yawOf(ves.root.quaternion);
      p.mode = 'walk';
      delete p.velocity;
      return true;
    }
  }
  if (!hand) {
    const edge = nearestBlockEdge(body.x, body.z, cfg.climbOutRange);
    if (edge && edge.top - surfaceHeight(waves, body.x, body.z) <= cfg.quayClimbMax) {
      p.position = [edge.x, edge.top, edge.z];
      p.mode = 'walk';
      return true;
    }
  }
  return false;
}

/**
 * A vessel's swim ladder (vessel axes), if it has one: its outboard line (x, z), foot and
 * head heights, where you step aboard (deckX, inboard of the bulwark) and the desktop's
 * jump range. It's her swim ladder module's (modules/swimLadder; the workboat's hangs over
 * the starboard side).
 */
export function swimLadderOf(ves: { state: VesselState }): GearFacts['swimLadder'] | null {
  return gearOf(ves.state, 'swimLadder');
}
