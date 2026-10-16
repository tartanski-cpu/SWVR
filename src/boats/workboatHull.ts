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
 *       overhead    the overhead switch panel (its slots: deck light switches, the FM set)
 *       breakerPanel     the voltmeter and breakers, on the starboard wall by the helm
 *       batteryMaster    the battery master and selector, low on the aft wall by the door
 *       batterySelector
 *       vhf, chartplotter    hung from the roof either side, turned toward the helm
 *       chartTable           the floor along the port wall, aft half (the leaf's hinge corner)
 *       dutyBoard, whiteboard    the starboard wall aft; the aft wall, port of the door
 *       doorIn, doorOut      on the aft door's frame, inside and out
 *       engineHatch          the hatch in the floor over the engine (its opening's size)
 *       dipstick, oilCan     in the engine space under it
 *   M4a engine (tagged inboard), fuelTank, batteries, hydraulicPump, bilgePump
 *                        in the engine space; rudder at the rudder stock
 *       navLights, floodFore, floodAft, railLights, cabinLight, searchlight, horn, wipers
 *                        the 12 V devices (only their draw is simulated yet; where nothing
 *                        is drawn for them, their point is nominal)
 */
import { CONFIG } from '../config';
import type { HullDefinition } from '../modular/hull';
import { BREAKERS } from '../vessel/vesselState';

const wb = CONFIG.vessels.workboat;
const wh = wb.layout.wheelhouse;
const ct = wb.chartTable;
const eh = wb.layout.engineHatch;
const mt = wb.maintenance;
const db = wb.layout.doorButtons;
/** The middle of the engine space under the hatch (machinery not drawn yet: a nominal point). */
const bay: [number, number, number] = [(eh.x0 + eh.x1) / 2, wh.floorY - eh.pitDepth / 2, (eh.z0 + eh.z1) / 2];
const roofTop = wh.roofY + wb.layout.roof.thickness;

export const WORKBOAT_HULL: HullDefinition = {
  id: 'hull.workboat-12m',
  version: 1,
  name: 'Workboat, 12 m',
  legacyDef: 'workboat',
  helm: { stand: wb.boardingSpot, yawDeg: 0 },
  sockets: [
    { id: 'helm', type: 'helm.console', transform: { position: wb.bridge.console.position }, label: 'Helm console, across the front of the wheelhouse' },
    { id: 'navDisplay', type: 'cabin.overhead', transform: { position: wb.bridge.navDisplay.position }, label: 'Overhead, on the centreline ahead of the helm' },
    { id: 'overhead', type: 'cabin.overhead', transform: { position: wb.overheadPanel.position }, label: 'Under the roof, above and ahead of the helm' },
    // Facing inboard (-x) from the starboard wall, tilted back so its face looks up at you.
    { id: 'breakerPanel', type: 'wall.panel', transform: { position: wb.electrics.panel.position, rotationDeg: [-wb.electrics.panel.tiltDeg, -90, 0] }, label: 'Starboard wall, under the sill by the helm' },
    // Facing forward, into the wheelhouse.
    { id: 'batteryMaster', type: 'wall.panel', transform: { position: wb.electrics.masterSwitch.position, rotationDeg: [0, 180, 0] }, label: 'Aft wall, starboard of the door, low' },
    { id: 'batterySelector', type: 'wall.panel', transform: { position: wb.electrics.selectorSwitch.position, rotationDeg: [0, 180, 0] }, label: 'Aft wall, beside the battery master' },
    { id: 'vhf', type: 'cabin.overhead', transform: { position: wb.bridge.radio.position, rotationDeg: [0, wb.bridge.radio.yawDeg, 0] }, label: 'Under the roof, out to port' },
    { id: 'chartplotter', type: 'cabin.overhead', transform: { position: wb.bridge.chart.position, rotationDeg: [0, wb.bridge.chart.yawDeg, 0] }, label: 'Under the roof, out to starboard' },
    // The floor along the port wall, aft half, from the wall out and up to the roof.
    { id: 'chartTable', type: 'cabin.furniture', transform: { position: [ct.x0, wh.floorY, ct.z0] }, capacity: { size: [ct.x1 - ct.x0, wh.roofY - wh.floorY, ct.z1 - ct.z0] }, label: 'Port wall, aft half' },
    { id: 'dutyBoard', type: 'wall.panel', transform: { position: wb.dutyBoard.position, rotationDeg: [0, -90, 0] }, label: 'Starboard wall, aft half of the window' },
    { id: 'whiteboard', type: 'wall.panel', transform: { position: wb.whiteboard.position, rotationDeg: [0, 180, 0] }, label: 'Aft wall, port of the door' },
    // Facing into the wheelhouse; and the same on the outside, turned to face aft.
    { id: 'doorIn', type: 'wall.panel', transform: { position: [db.x, wh.floorY + db.height, wh.aft - wh.wall], rotationDeg: [-90, 0, 0] }, label: 'Door frame, inside' },
    { id: 'doorOut', type: 'wall.panel', transform: { position: [db.x, wh.floorY + db.height, wh.aft], rotationDeg: [-90, 180, 0] }, label: 'Door frame, outside' },
    // The hatch's hinged (outboard) edge, mid-length, at floor level; its size is the opening's.
    { id: 'engineHatch', type: 'deck.fitting', transform: { position: [eh.x1, wh.floorY, (eh.z0 + eh.z1) / 2] }, capacity: { size: [eh.x1 - eh.x0, 0.035, eh.z1 - eh.z0] }, label: 'Wheelhouse floor, over the engine' },
    // On the engine's inboard side, the ring well under the shut hatch (the rocker cover is 0.12 m below the floor).
    { id: 'dipstick', type: 'deck.fitting', transform: { position: [mt.dipstick[0], wh.floorY - 0.12 - 0.2, mt.dipstick[1]] }, label: 'Engine space, the engine\'s inboard side' },
    // On the shelf on the engine space's outboard wall, spout inboard toward the filler.
    { id: 'engine', type: 'engine.bay', transform: { position: [mt.engine.x, wh.floorY - 0.12 - mt.engine.height / 2, mt.engine.z] }, tags: ['inboard'], label: 'Engine bed, under the wheelhouse floor' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: bay }, label: 'Engine space (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: bay }, label: 'Engine space (nominal)' },
    { id: 'hydraulicPump', type: 'engine.bay', transform: { position: bay }, label: 'On the engine\'s power take-off (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [bay[0], wh.floorY - eh.pitDepth, bay[2]] }, label: 'Bottom of the engine space (nominal)' },
    { id: 'rudder', type: 'hull.rudder', transform: { position: wb.rudder.position }, label: 'Rudder stock, aft' },
    { id: 'navLights', type: 'hull.light', transform: { position: wb.navLights.masthead }, label: 'Masthead (and the sidelights and stern light)' },
    { id: 'floodFore', type: 'hull.light', transform: { position: wb.deckLights.fore.position }, label: 'Roof edge, forward' },
    { id: 'floodAft', type: 'hull.light', transform: { position: wb.deckLights.aft.position }, label: 'Roof edge, aft' },
    { id: 'railLights', type: 'hull.light', transform: { position: [0, roofTop, 0] }, label: 'Along the bulwark tops (nominal)' },
    { id: 'cabinLight', type: 'cabin.overhead', transform: { position: wb.cabinLight.position }, label: 'Wheelhouse ceiling' },
    { id: 'searchlight', type: 'roof.mount', transform: { position: wb.spotlight.position }, label: 'Wheelhouse roof, forward' },
    { id: 'horn', type: 'roof.mount', transform: { position: [0, roofTop, -0.5] }, label: 'Wheelhouse roof (nominal)' },
    { id: 'wipers', type: 'window.wiper', transform: { position: [0, wh.roofY - 0.2, wh.front] }, label: 'Over the front windows (nominal)' },
    { id: 'oilCan', type: 'deck.fitting', transform: { position: [mt.oilCan[0], wh.floorY - mt.shelfDrop, mt.oilCan[1]], rotationDeg: [0, 90, 0] }, label: 'Engine space, the shelf' },
  ],
  // Her wiring: the breakers' circuits. (The batteries, the engine's power take-off, the deck
  // hydraulics and the diesel are her modules', M4a.)
  provides: [{ power: 'electrical', circuits: BREAKERS }],
  features: [
    { id: 'door.aft', kind: 'door', openKey: 'door.aft.open' },
    { id: 'hatch.engine', kind: 'hatch', openKey: 'hatch.engine.open' },
  ],
};
