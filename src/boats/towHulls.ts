/**
 * The towing missions' hulls (modular boats M6a): a broken-down motor cruiser, a raft of
 * logs and a work barge; then (owner, to test the Shipyard's bigger boats) an open fishing
 * boat, a dismasted yacht, a trawler and a crane pontoon. They float, drift and tow like any boat; their recipes mount
 * nothing (a tow is a hull with no modules). What's drawn over each and what the radio
 * calls it are built into the hull (its `fittings`, 6b). Shape and handling from
 * CONFIG.vessels.derelict / logRaft / barge / dory / yacht / trawler / pontoon / coaster.
 */
import { CONFIG } from '../config';
import type { HullDefinition } from '../modular/hull';
import type { VesselConfig } from '../vessel/vesselDef';
import { hullDataFrom } from './hullData';

function towHull(id: string, name: string, kind: 'derelict' | 'logRaft' | 'barge' | 'dory' | 'yacht' | 'trawler' | 'pontoon' | 'cage' | 'coaster' | 'monopile' | 'tpBarge'): HullDefinition {
  const c: VesselConfig = CONFIG.vessels[kind];
  return { id, version: 1, name, helm: { stand: c.boardingSpot, yawDeg: 0 }, ...hullDataFrom(c), fittings: { tow: c.tow }, sockets: [] };
}

export const DERELICT_HULL = towHull('hull.derelict-cruiser', 'Motor cruiser, 7 m (derelict)', 'derelict');
export const LOG_RAFT_HULL = towHull('hull.log-raft', 'Log raft, 8 m', 'logRaft');
export const BARGE_HULL = towHull('hull.work-barge', 'Work barge, 9 m', 'barge');
export const DORY_HULL = towHull('hull.open-fishing-boat', 'Open fishing boat, 5.5 m', 'dory');
export const YACHT_HULL = towHull('hull.sailing-yacht', 'Sailing yacht, 11 m (dismasted)', 'yacht');
export const TRAWLER_HULL = towHull('hull.fishing-trawler', 'Fishing trawler, 18 m', 'trawler');
export const PONTOON_HULL = towHull('hull.crane-pontoon', 'Crane pontoon, 20 m', 'pontoon');
export const CAGE_HULL = towHull('hull.cage-section', 'Fish-farm cage section, 8 m', 'cage');
/** A tug's tow (owner, Oct 2026): a loaded coaster, dead in the water. */
export const COASTER_HULL = towHull('hull.coaster', 'Coaster, 58 m (dead ship)', 'coaster');
/** A construction project's tow (career/projects.ts): a monopile foundation, floated out sealed. */
export const MONOPILE_HULL = towHull('hull.monopile', 'Monopile, 40 m (floated)', 'monopile');
/** A construction project's tow: the transition pieces on their barge. */
export const TP_BARGE_HULL = towHull('hull.tp-barge', 'Barge, 20 m (transition pieces)', 'tpBarge');
