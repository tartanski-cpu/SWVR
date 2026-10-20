/**
 * The deck crane's radio remote (owner, Oct 2026: as in Stormworks, a remote you pick up, for
 * desktop and game-controller players; in VR you work the two joysticks on the crane's post
 * with your hands). Real deck cranes are worked this way: a "belly box" on a strap with two
 * proportional joysticks, the operator standing where they can see the load.
 *
 * It hangs on the crane's post (modules/deckCrane). Beside it, F (or a controller's A) takes
 * it; then, where you stand:
 *   - left stick, or W A S D: slew (sideways) and boom (push to raise);
 *   - right stick, or the arrow keys: telescope (sideways: right out) and hoist (pull the
 *     stick back, or the up arrow, to hoist; push, or the down arrow, to lower);
 *   - A, or Space: HOOK;
 *   - B, or F: hang it back.
 * You stay where you are while you hold it (the sticks are working the crane), and look
 * round with the mouse, or the right stick while LB is held.
 *
 * It works the post's own joysticks and HOOK button (InteractionSystem.remoteDrive): they're
 * seen to move, and send what a hand on them would. So it's the same for crew and the
 * simulation as working them by hand.
 */
import { CONFIG } from '../config';
import { PAD, type PadState } from '../player/gamepad';

/** A crane's controls on its post, by their ids (modules/deckCrane: `<socket>Joystick`, `Joystick2`, `Hook`). */
export interface CranePost {
  left: string;
  right: string;
  hook: string;
}

/** The cranes on board, from the controls' ids (each crane's right stick is `<socket>Joystick2`). */
export function cranePosts(controlIds: readonly string[]): CranePost[] {
  return controlIds.filter((id) => id.endsWith('Joystick2')).map((id) => {
    const socket = id.slice(0, -'Joystick2'.length);
    return { left: `${socket}Joystick`, right: id, hook: `${socket}Hook` };
  });
}

/** The keys the remote takes while it's held (their usual actions don't fire). */
export const REMOTE_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF'];

/**
 * The remote's sticks and HOOK from the keys and the controller: each stick x right, y
 * forward (as a hand pushing it), -1..1. The arrow keys hoist with up (the stick pulled back).
 */
export function remoteInput(isDown: (code: string) => boolean, pad: PadState | null): { left: { x: number; y: number }; right: { x: number; y: number }; hook: boolean } {
  const key = (code: string) => (isDown(code) ? 1 : 0);
  const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
  // (A controller's stick y is + down: pushed forward is -.)
  const lookOnly = !!pad?.down[PAD.lb];
  return {
    left: { x: clamp1(key('KeyD') - key('KeyA') + (pad?.lx ?? 0)), y: clamp1(key('KeyW') - key('KeyS') - (pad?.ly ?? 0)) },
    right: {
      x: clamp1(key('ArrowRight') - key('ArrowLeft') + (lookOnly ? 0 : (pad?.rx ?? 0))),
      y: clamp1(key('ArrowDown') - key('ArrowUp') - (lookOnly ? 0 : (pad?.ry ?? 0))),
    },
    hook: !!isDown('Space') || !!pad?.down[PAD.a],
  };
}

/** How near the post you must be to take the remote or hang it back (m). */
export const REMOTE_REACH = CONFIG.gamepad.helmReach;
