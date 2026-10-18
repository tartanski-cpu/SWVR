import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';

/**
 * The recording camera picked up by a VR crew-mate (owner request: "handling it like a
 * GoPro"). A desktop player in camera mode (player/cameraMode.ts) is a flying camera to the
 * others; a VR player can grip it and it's in their hand, the camera's view following that
 * hand, until they let go. Host state, plain JSON: `world.cameraHolds` by camera player.
 *
 *   cameraGrab     ref: the camera player's id, value: 0 left hand, 1 right. Only a camera
 *                  (its pose says so), not held already, not by a camera, not your own.
 *   cameraRelease  ref: the camera player's id: let go (only by whoever holds it).
 *   cameraFlip     ref: the camera player's id: turn it round in the hand (only by whoever
 *                  holds it). Picked up, it faces the holder (filming them, `back` false);
 *                  flipped, it looks out ahead of their hand (`back` true), and back again.
 *
 * Held, the camera is locked to the hand (its own flying is off). A holder or camera that
 * leaves the game, or a camera that stops being one, is let go (stepCameraHolds).
 */
export const isCameraIntent = (control: string): boolean => control === 'cameraGrab' || control === 'cameraRelease' || control === 'cameraFlip';

/** Is this player a camera (their pose says camera mode)? */
export const isCamera = (world: WorldState, id: string | undefined): boolean => !!id && !!world.players[id]?.avatar?.camera;

export function applyCameraIntent(world: WorldState, intent: Intent): void {
  const cam = intent.ref;
  if (!cam) return;
  const holds = (world.cameraHolds ??= {});
  if (intent.control === 'cameraGrab') {
    const by = intent.playerId;
    if (by === cam || !world.players[by] || !isCamera(world, cam) || isCamera(world, by) || holds[cam]) return;
    holds[cam] = { by, hand: intent.value > 0.5 ? 'right' : 'left' };
  } else if (intent.control === 'cameraRelease') {
    if (holds[cam]?.by === intent.playerId) delete holds[cam];
  } else if (intent.control === 'cameraFlip') {
    const h = holds[cam];
    if (h?.by === intent.playerId) h.back = !h.back;
  }
}

/** Each tick: let go of cameras whose holder or camera has gone, or that aren't cameras now. */
export function stepCameraHolds(world: WorldState): void {
  const holds = world.cameraHolds;
  if (!holds) return;
  for (const [cam, h] of Object.entries(holds)) if (!isCamera(world, cam) || !world.players[h.by]) delete holds[cam];
}
