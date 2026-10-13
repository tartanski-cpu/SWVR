import type { EntityId } from './ids';

/**
 * An intent is a request from a player to change something in the simulation,
 * e.g. "player-1 sets vessel-1 throttle to 0.6".
 *
 * Inputs (VR hands, mouse, keyboard) only ever produce intents; they never mutate
 * simulation state directly. The simulation consumes intents on its fixed tick.
 * This is the seam where a remote player's intents will later arrive over the network.
 */
export interface Intent {
  playerId: EntityId;
  /** Entity the intent acts on (a vessel, the environment, ...). */
  targetId: EntityId;
  /** Control/channel name, e.g. 'throttle', 'rudder', 'engineStart', 'timeOfDay'. */
  control: string;
  value: number;
  /** Optional entity reference, e.g. the vessel to board. */
  ref?: EntityId;
  /** Optional extra numbers, e.g. where a crate is set down (x, y, z, yaw). */
  args?: number[];
}

/** FIFO of intents waiting for the next simulation tick. */
export class IntentQueue {
  private pending: Intent[] = [];

  push(intent: Intent): void {
    this.pending.push(intent);
  }

  /** Returns and clears everything queued so far. */
  drain(): Intent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }
}
