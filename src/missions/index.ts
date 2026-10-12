/**
 * Missions module (placeholder - nothing is built here during the MVP).
 *
 * Intended shape: a mission is a small state machine stored in WorldState
 * (plain data, stable ids) that reads world state each tick and emits events
 * such as "survivor spawned" or "objective complete". It never touches rendering.
 */
export interface MissionState {
  id: string;
  kind: string;
  phase: 'pending' | 'active' | 'complete' | 'failed';
}
