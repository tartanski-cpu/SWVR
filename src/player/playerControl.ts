import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { PlayerState } from './playerState';

/** Where a player stands when not aboard anything (the test platform, until there's a quay). */
export function placeOnPlatform(p: PlayerState): void {
  p.aboardVesselId = null;
  p.position = [0, CONFIG.testScene.platformDeckHeight, 0];
  p.yaw = 0;
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
        placeOnPlatform(p);
        break;
      }
      p.aboardVesselId = vessel.id;
      p.position = [...VESSEL_DEFS[vessel.defId].boardingSpot];
      p.yaw = 0;
      break;
    }
  }
}
