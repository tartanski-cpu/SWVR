/**
 * Hull 'hull.workboat-12m': the starter workboat's hull (modular boats).
 *
 * Her shape, handling and lightship (M6a) and what's built into her (her `fittings`, M6b)
 * come from CONFIG.vessels.workboat, the tunables' home; VESSEL_DEFS.workboat is built
 * from this hull and her recipe. This file
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
 *       sideDoorIn, sideDoorOut    on the port side door's forward jamb (added with the
 *                        side door, after M5a)
 *       engineHatch          the hatch in the floor over the engine (its opening's size)
 *       dipstick, oilCan     in the engine space under it
 *   M4a engine (tagged inboard), fuelTank, batteries, hydraulicPump, bilgePump
 *                        in the engine space; rudder at the rudder stock
 *       navLights, floodFore, floodAft, railLights, cabinLight, searchlight, horn, wipers
 *                        the 12 V devices (only their draw is simulated yet; where nothing
 *                        is drawn for them, their point is nominal). M5b: the searchlight's
 *                        socket takes the searchlight module; the navigation lights moved to
 *                        the mast's masthead socket.
 *   M5a tenderCrane      the crane's column on the foredeck (the cradle comes with it)
 *       anchor           the bow roller (hawse) and windlass
 *       towWinch         the aft deck, forward of the transom
 *       trawl            the aft deck (the net and its drum; nominal)
 *       sternRoller, aFrame    the transom (two stern gantry sockets)
 *   M5b fireMonitor, mast    on the wheelhouse roof (the mast offers 'masthead' for the
 *                        navigation lights)
 *       cleatFwdPort, cleatFwdStbd, cleatAftPort, cleatAftStbd    on the bulwark tops
 *       fenders, swimLadder, lifeRing, boatHook    the fender basket on the aft deck, the
 *                        ladder over the starboard side, the ring on the aft wall, the
 *                        hook's clips on the port bulwark
 *                        Deck gear draws itself in the boat's axes from the hull (its frame
 *                        is 'boat'), so these points say where it is, for the shipyard.
 */
import { CONFIG } from '../config';
import { hullQueries, type HullDefinition } from '../modular/hull';
import { buildHullForm } from '../vessel/hullForm';
import { BREAKERS } from '../vessel/vesselState';
import { hullDataFrom } from './hullData';

const wb = CONFIG.vessels.workboat;
const wh = wb.layout.wheelhouse;
const ct = wb.chartTable;
const eh = wb.layout.engineHatch;
const mt = wb.maintenance;
const db = wb.layout.doorButtons;
const sd = wh.sideDoor;
/** The middle of the engine space under the hatch (machinery not drawn yet: a nominal point). */
const bay: [number, number, number] = [(eh.x0 + eh.x1) / 2, wh.floorY - eh.pitDepth / 2, (eh.z0 + eh.z1) / 2];
const roofTop = wh.roofY + wb.layout.roof.thickness;
/** Her deck line, for the deck gear's points (from her own form). */
const hull = hullQueries({ hull: buildHullForm(wb.hull), layout: wb.layout });
/** The engine's bed, under the wheelhouse floor: the block's centre. */
const engineBed: [number, number, number] = [mt.engine.x, wh.floorY - 0.12 - mt.engine.height / 2, mt.engine.z];
const onDeck = (x: number, z: number): [number, number, number] => [x, hull.deckY(z), z];
const tc = wb.tenderCrane;
const mast = CONFIG.modules.mast;
const mo = wb.mooring;
const gt = wb.layout.sideGate;
/** A deck-gate button on the gate's aft post, facing `face` (+1 starboard, -1 port). */
const gateButton = (face: number): [number, number, number] => [gt.side * (hull.halfBeam(gt.z1) - 0.03) + face * 0.032, hull.deckY(gt.z1) + gt.buttonHeight, gt.z1 + 0.02];
/** The mooring cleats' sockets: id, side, station, where. */
const cleats: [string, number, number, string][] = [
  ['cleatFwdPort', -1, mo.cleatFwdZ, 'forward, port'],
  ['cleatFwdStbd', 1, mo.cleatFwdZ, 'forward, starboard'],
  ['cleatAftPort', -1, mo.cleatAftZ, 'aft, port'],
  ['cleatAftStbd', 1, mo.cleatAftZ, 'aft, starboard'],
  ['cleatMidPort', -1, mo.cleatMidZ, 'amidships, port (the skiff\'s painter)'],
  ['cleatMidStbd', 1, mo.cleatMidZ, 'amidships, starboard (the skiff\'s painter)'],
];

export const WORKBOAT_HULL: HullDefinition = {
  id: 'hull.workboat-12m',
  version: 1,
  name: 'Workboat, 12 m',
  helm: { stand: wb.boardingSpot, yawDeg: 0 },
  // Her shape and handling, and her lightship: the weighed boat less her engine and the
  // house batteries, which count as modules (M6a; modular/massProperties.ts).
  ...hullDataFrom(wb, [
    { massKg: CONFIG.modules.dieselInboard.massKg, at: engineBed },
    { massKg: 2 * CONFIG.modules.batteryBank.massKg, at: bay },
  ]),
  // Built into her (6b): the exhaust outlet, where a rescued casualty is put.
  fittings: { exhaust: wb.exhaust, rescueGear: wb.rescueGear },
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
    // The port side door's buttons, on its forward jamb (wheelhouse.sideDoor).
    { id: 'sideDoorIn', type: 'wall.panel', transform: { position: [-wh.halfWidth + wh.wall, wh.floorY + sd.buttonHeight, sd.z0 - 0.04], rotationDeg: [-90, -90, 0] }, label: 'Side door jamb, inside' },
    { id: 'sideDoorOut', type: 'wall.panel', transform: { position: [-wh.halfWidth, wh.floorY + sd.buttonHeight, sd.z0 - 0.04], rotationDeg: [-90, 90, 0] }, label: 'Side door jamb, outside' },
    // The deck gate's buttons, on its aft post facing inboard and outboard (layout.sideGate).
    { id: 'sideGateIn', type: 'wall.panel', transform: { position: gateButton(-gt.side), rotationDeg: [-90, gt.side * 90, 0] }, label: 'Deck gate post, inboard' },
    { id: 'sideGateOut', type: 'wall.panel', transform: { position: gateButton(gt.side), rotationDeg: [-90, -gt.side * 90, 0] }, label: 'Deck gate post, outboard' },
    // The hatch's hinged (outboard) edge, mid-length, at floor level; its size is the opening's.
    { id: 'engineHatch', type: 'deck.fitting', transform: { position: [eh.x1, wh.floorY, (eh.z0 + eh.z1) / 2] }, capacity: { size: [eh.x1 - eh.x0, 0.035, eh.z1 - eh.z0] }, label: 'Wheelhouse floor, over the engine' },
    // On the engine's inboard side, the ring well under the shut hatch (the rocker cover is 0.12 m below the floor).
    { id: 'dipstick', type: 'deck.fitting', transform: { position: [mt.dipstick[0], wh.floorY - 0.12 - 0.2, mt.dipstick[1]] }, label: 'Engine space, the engine\'s inboard side' },
    // On the shelf on the engine space's outboard wall, spout inboard toward the filler.
    { id: 'engine', type: 'engine.bay', transform: { position: engineBed }, tags: ['inboard'], label: 'Engine bed, under the wheelhouse floor' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: bay }, label: 'Engine space (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: bay }, label: 'Engine space (nominal)' },
    { id: 'hydraulicPump', type: 'engine.bay', transform: { position: bay }, label: 'On the engine\'s power take-off (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [bay[0], wh.floorY - eh.pitDepth, bay[2]] }, label: 'Bottom of the engine space (nominal)' },
    { id: 'rudder', type: 'hull.rudder', transform: { position: wb.rudder.position }, label: 'Rudder stock, aft' },
    { id: 'floodFore', type: 'hull.light', transform: { position: wb.deckLights.fore.position }, label: 'Roof edge, forward' },
    { id: 'floodAft', type: 'hull.light', transform: { position: wb.deckLights.aft.position }, label: 'Roof edge, aft' },
    { id: 'railLights', type: 'hull.light', transform: { position: [0, roofTop, 0] }, label: 'Along the bulwark tops (nominal)' },
    { id: 'cabinLight', type: 'cabin.overhead', transform: { position: wb.cabinLight.position }, label: 'Wheelhouse ceiling' },
    { id: 'searchlight', type: 'roof.mount', transform: { position: wb.spotlight.position }, label: 'Wheelhouse roof, forward' },
    { id: 'fireMonitor', type: 'roof.mount', transform: { position: wb.fireMonitor.position }, label: 'Wheelhouse roof, forward of the mast' },
    // The navigation lights hang on the mast's own masthead socket.
    { id: 'mast', type: 'roof.mount', transform: { position: [mast.x, roofTop, mast.z] }, label: 'Wheelhouse roof, the signal mast' },
    // M5b: the deck fittings.
    ...cleats.map(([id, side, z, where]) => ({ id, type: 'deck.fitting' as const, transform: { position: [side * (hull.halfBeam(z) - 0.03), hull.bulwarkTop(z), z] as [number, number, number] }, label: `Bulwark top, ${where}` })),
    { id: 'fenders', type: 'deck.fitting', transform: { position: onDeck(wb.fenders.basket[0], wb.fenders.basket[1]) }, label: 'Aft deck, starboard: the fender basket' },
    { id: 'swimLadder', type: 'deck.fitting', transform: { position: onDeck(hull.halfBeam(wb.swimLadder.z), wb.swimLadder.z) }, label: 'Starboard side, aft: over the bulwark' },
    { id: 'lifeRing', type: 'deck.fitting', transform: { position: wb.rescueGear.ringStow }, label: 'Wheelhouse aft wall: the life ring (its line on the starboard quarter cleat)' },
    { id: 'boatHook', type: 'deck.fitting', transform: { position: [wb.rescueGear.hookStow[0], wb.rescueGear.hookStow[1], wb.rescueGear.hookStow[2]] }, label: 'Port bulwark, aft: the boat-hook clips' },
    { id: 'horn', type: 'roof.mount', transform: { position: [0, roofTop, -0.5] }, label: 'Wheelhouse roof (nominal)' },
    { id: 'wipers', type: 'window.wiper', transform: { position: [0, wh.roofY - 0.2, wh.front] }, label: 'Over the front windows (nominal)' },
    { id: 'oilCan', type: 'deck.fitting', transform: { position: [mt.oilCan[0], wh.floorY - mt.shelfDrop, mt.oilCan[1]], rotationDeg: [0, 90, 0] }, label: 'Engine space, the shelf' },
    { id: 'tenderCrane', type: 'deck.equipment', transform: { position: onDeck(tc.column[0], tc.column[1]) }, label: 'Foredeck, starboard: the crane column (and the cradle to port)' },
    { id: 'anchor', type: 'bow.windlass', transform: { position: wb.anchor.hawse }, label: 'The bow roller and the windlass behind it' },
    { id: 'towWinch', type: 'deck.equipment', transform: { position: onDeck(0, wb.towWinch.z) }, label: 'Aft deck, forward of the transom' },
    { id: 'trawl', type: 'deck.equipment', transform: { position: onDeck(0, wb.towWinch.z) }, label: 'Aft deck: the net (nominal)' },
    { id: 'sternRoller', type: 'stern.gantry', transform: { position: onDeck(0, hull.transom) }, label: 'Transom, centreline: the notch in the bulwark' },
    { id: 'aFrame', type: 'stern.gantry', transform: { position: onDeck(0, hull.transom) }, label: 'Transom, across the quarters' },
  ],
  // Her wiring: the breakers' circuits. (The batteries, the engine's power take-off, the deck
  // hydraulics and the diesel are her modules', M4a.)
  provides: [{ power: 'electrical', circuits: BREAKERS }],
  features: [
    { id: 'door.aft', kind: 'door', openKey: 'door.aft.open' },
    { id: 'door.side', kind: 'door', openKey: 'door.side.open' },
    { id: 'gate.side', kind: 'door', openKey: 'gate.side.open' },
    { id: 'hatch.engine', kind: 'hatch', openKey: 'hatch.engine.open' },
  ],
};
