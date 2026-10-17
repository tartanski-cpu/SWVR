/**
 * The towing missions' hulls (modular boats M6a): a broken-down motor cruiser, a raft of
 * logs and a work barge. They float, drift and tow like any boat; their recipes mount
 * nothing (a tow is a hull with no modules). What's drawn over each and what the radio
 * calls it are built into the hull (its `fittings`, 6b). Shape and handling from
 * CONFIG.vessels.derelict / logRaft / barge.
 */
import { CONFIG } from '../config';
import type { HullDefinition } from '../modular/hull';
import type { VesselConfig } from '../vessel/vesselDef';
import { hullDataFrom } from './hullData';

function towHull(id: string, name: string, kind: 'derelict' | 'logRaft' | 'barge'): HullDefinition {
  const c: VesselConfig = CONFIG.vessels[kind];
  return { id, version: 1, name, helm: { stand: c.boardingSpot, yawDeg: 0 }, ...hullDataFrom(c), fittings: { tow: c.tow }, sockets: [] };
}

export const DERELICT_HULL = towHull('hull.derelict-cruiser', 'Motor cruiser, 7 m (derelict)', 'derelict');
export const LOG_RAFT_HULL = towHull('hull.log-raft', 'Log raft, 8 m', 'logRaft');
export const BARGE_HULL = towHull('hull.work-barge', 'Work barge, 9 m', 'barge');
