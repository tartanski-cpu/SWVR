/**
 * Hull 'hull.workboat-12m': the starter workboat's hull (modular boats).
 *
 * For now (until M6) it stands on today's vessel definition, VESSEL_DEFS.workboat: her
 * shape, physics, mesh and walk area still come from CONFIG.vessels.workboat. This file
 * adds the SOCKETS, one milestone at a time, each at the place today's hand-built part
 * stands (read from the same config, so there is one source of truth for where it is).
 *
 *   M2  throttle    the throttle lever's place (M3: moved into the console's slots)
 *   M3  helm        the helm console (its own slots hold the controls and dash screens)
 *       navDisplay  the NAV / WIND screen hung under the roof
 */
import { CONFIG } from '../config';
import type { HullDefinition } from '../modular/hull';
import { BREAKERS } from '../vessel/vesselState';

const wb = CONFIG.vessels.workboat;

export const WORKBOAT_HULL: HullDefinition = {
  id: 'hull.workboat-12m',
  version: 1,
  name: 'Workboat, 12 m',
  legacyDef: 'workboat',
  helm: { stand: wb.boardingSpot, yawDeg: 0 },
  sockets: [
    { id: 'helm', type: 'helm.console', transform: { position: wb.bridge.console.position }, label: 'Helm console, across the front of the wheelhouse' },
    { id: 'navDisplay', type: 'cabin.overhead', transform: { position: wb.bridge.navDisplay.position }, label: 'Overhead, on the centreline ahead of the helm' },
  ],
  // Until the electrics and the engine are modules (M4), the hull stands in for today's
  // code: 12 V on the existing circuits, deck hydraulics, the engine's power take-off, diesel.
  provides: [{ power: 'electrical', circuits: BREAKERS }, { power: 'hydraulic' }, { power: 'pto' }, { fuel: 'diesel' }],
  features: [
    { id: 'door.aft', kind: 'door', openKey: 'door.aft.open' },
    { id: 'hatch.engine', kind: 'hatch', openKey: 'hatch.engine.open' },
  ],
};
