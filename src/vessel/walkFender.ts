import { CONFIG } from '../config';
import { gearOf } from '../boats/sims';
import type { Intent } from '../core/intents';
import { hullPlan } from './layout';
import { FENDER_HANG } from './physics/guards';
import { VESSEL_DEFS } from './vesselDef';
import type { VesselState } from './vesselState';

/**
 * The roving fender (owner request, Oct 2026): what a deckhand does coming alongside. The
 * boat's fenders hang at fixed stations; whatever part of her is about to touch the quay
 * (or another boat) between them, someone walks there with a fender in hand and jams it in.
 * Never a boat hook, never a foot: that's how legs get broken.
 *
 * In the game: with the fenders out (the basket), stand at the rail where she's going to
 * touch, look at the quay (or the other boat) alongside, and press with an empty hand
 * (player/fenderHands.ts). The fender is hung there, at your station on that side,
 * `VesselState.walkFender`; it stays until it's moved (press again elsewhere) or the fenders
 * are taken in. One per boat. Out, it's a guard point like the others
 * (physics/vesselPhysics.ts, physics/vesselContact.ts): her plating meets the quay on it.
 *
 * Intent `fenderWalk`: value 1 hangs it, args [side (-1 port, 1 starboard), z (her axes)];
 * value 0 takes it in. Only on a boat that has fenders, and only with them out.
 */
export interface WalkFender {
  side: -1 | 1;
  z: number;
  /** Who hung it. */
  by?: string;
}

/** Can this boat have a roving fender out now: she carries fenders, and they're out. */
export function canWalkFender(s: VesselState): boolean {
  return !!gearOf(s, 'fenders') && s.controls.fenders > 0;
}

/** Host: the `fenderWalk` intent. Returns whether it was applied. */
export function applyWalkFenderIntent(s: VesselState, intent: Intent): boolean {
  if (intent.value <= 0.5) {
    s.walkFender = null;
    return true;
  }
  if (!canWalkFender(s)) return false;
  const a = intent.args ?? [];
  if (a.length < 2 || !a.every(Number.isFinite)) return false;
  const plan = hullPlan(VESSEL_DEFS[s.defId]);
  const m = CONFIG.fenderWalk.endClear;
  const z = Math.min(plan.transom - m, Math.max(plan.stem + m, a[1]));
  s.walkFender = { side: a[0] < 0 ? -1 : 1, z: Math.round(z * 100) / 100, by: intent.playerId };
  return true;
}

/** Where the roving fender's outer face is (her axes), or null: none out. */
export function walkFenderProbe(s: VesselState): readonly [number, number, number] | null {
  const f = s.walkFender;
  if (!f || !canWalkFender(s)) return null;
  const plan = hullPlan(VESSEL_DEFS[s.defId]);
  return [f.side * (plan.halfBeam(f.z) + FENDER_HANG.off + FENDER_HANG.radius), plan.deckY(f.z) - FENDER_HANG.drop, f.z];
}
