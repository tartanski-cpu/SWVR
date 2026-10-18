import { CONFIG } from '../config';
import type { Handedness } from './xrInput';

/**
 * Hand gestures in VR (owner request): with nothing in the hand, grip and the stick of the
 * same hand pick what the hand does, so crew-mates (and you, looking at your own hands) see it:
 *
 *   nothing pressed                  rest    the mitt, relaxed round the controller
 *   grip                             fist    (grip with nothing in reach also grabs the world,
 *                                             as before: you pull yourself along with a fist)
 *   grip, then the stick forward     point   the index finger out
 *   grip, then the stick back        rude    the middle finger up
 *
 * A finger stays out while the grip is held (the stick can come back to the middle), until
 * the grip is let go. While the grip is held on a free hand, that hand's stick is the
 * gesture's: it doesn't walk (left) or turn (right). Pointing or giving the finger, the
 * hand doesn't grab the world either, so it stays where you hold it.
 *
 * A hand holding or working anything (a control, cargo, gear, the binoculars...) makes a fist
 * on its grip and no gesture; its stick works as usual.
 */
export type HandPose = 'rest' | 'fist' | 'point' | 'rude';

/** Network codes for the poses (PlayerState.avatar.poses). */
export const HAND_POSES: readonly HandPose[] = ['rest', 'fist', 'point', 'rude'];

export interface GestureInput {
  grip: boolean;
  /** The thumbstick (x, y): WebXR's y is negative pushed forward. */
  stick: readonly [number, number];
  /** The hand is holding or working something. */
  busy: boolean;
}

export class HandGestures {
  readonly pose: Record<Handedness, HandPose> = { left: 'rest', right: 'rest' };
  /** The finger chosen while this grip is held. */
  private finger: Record<Handedness, 'point' | 'rude' | null> = { left: null, right: null };
  /** Whether the hand's stick is the gesture's this frame (not walking or turning). */
  private stickTaken: Record<Handedness, boolean> = { left: false, right: false };

  update(h: Handedness, inp: GestureInput): HandPose {
    const t = CONFIG.avatar.gesture.stick;
    this.stickTaken[h] = false;
    if (!inp.grip || inp.busy) {
      this.finger[h] = null;
      return (this.pose[h] = inp.grip ? 'fist' : 'rest');
    }
    this.stickTaken[h] = true;
    const y = inp.stick[1];
    if (y < -t) this.finger[h] = 'point';
    else if (y > t) this.finger[h] = 'rude';
    return (this.pose[h] = this.finger[h] ?? 'fist');
  }

  /** The hand's stick is making a gesture: it mustn't walk or turn you. */
  ownsStick(h: Handedness): boolean {
    return this.stickTaken[h];
  }

  /** A finger is out: the hand doesn't grab the world. */
  gesturing(h: Handedness): boolean {
    return this.pose[h] === 'point' || this.pose[h] === 'rude';
  }

  /** Not in VR (or the hands not tracked): relaxed hands, nothing held. */
  reset(): void {
    for (const h of ['left', 'right'] as const) {
      this.pose[h] = 'rest';
      this.finger[h] = null;
      this.stickTaken[h] = false;
    }
  }

  /** The poses as network codes [left, right]. */
  codes(): [number, number] {
    return [HAND_POSES.indexOf(this.pose.left), HAND_POSES.indexOf(this.pose.right)];
  }
}

/** A pose from its network code; anything unknown is a relaxed hand. */
export function poseFromCode(code: unknown): HandPose {
  return (typeof code === 'number' && HAND_POSES[code]) || 'rest';
}
