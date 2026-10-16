import { CONFIG } from '../config';
import { landFloor } from '../world/landWalkArea';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { PlayerState } from './playerState';

/** Put a player ashore on the quay where a new game starts (CONFIG.start), facing the boat. */
export function placeAshore(p: PlayerState): void {
  const q = CONFIG.start.quay;
  p.aboardVesselId = null;
  p.position = [q.x, landFloor(q.x, q.z) ?? 1.6, q.z];
  p.yaw = (q.yawDeg * Math.PI) / 180;
  p.mode = 'walk';
  delete p.velocity;
}

/**
 * Player intents. Boarding is simulation state (not just a camera trick) so that other
 * players will see who is aboard which vessel once networking exists.
 */
export function applyPlayerIntent(world: WorldState, p: PlayerState, intent: Intent): void {
  switch (intent.control) {
    case 'board': {
      const vessel = intent.ref ? world.vessels[intent.ref] : undefined;
      p.mode = 'walk';
      delete p.velocity;
      if (!vessel) {
        placeAshore(p);
        break;
      }
      p.aboardVesselId = vessel.id;
      p.position = [...VESSEL_DEFS[vessel.defId].boardingSpot];
      p.yaw = 0;
      break;
    }
  }
}
