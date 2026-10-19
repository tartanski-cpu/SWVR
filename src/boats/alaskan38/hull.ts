/**
 * Hull 'hull.alaskan-38' (owner, Oct 2026): the Alaskan 38, a one-off boat. Her lines are
 * her own design (design.ts), lofted into the game's stations; her mass, handling, deck
 * layout and the places of her sockets are CONFIG.vessels.alaskan38; what her stations and
 * layout don't draw (the outboard bracket, the outboards, spray rails, bow rail) is
 * view.ts, hung on her VesselView through boats/oneOffViews.ts.
 *
 * Her working parts are modules, as any boat's (boats/alaskan38.json): her two outboards are
 * the outboard module (propulsion.outboard) on her bracket; they steer by swinging, so she
 * has no rudder.
 *
 * Sockets (vessel axes):
 *   helm                 the console behind the faceted front, to starboard of the companionway
 *   chartTable           the dinette table in the saloon (the chart lives on it)
 *   dutyBoard, whiteboard   the saloon's starboard wall; its aft wall, port of the door
 *   breakerPanel,        the starboard wall by the helm; the aft wall, starboard of the door
 *   batteryMaster/Selector
 *   vhf, fm              under the roof, out to port and starboard
 *   doorIn / doorOut     the cockpit door's jamb, inside and out
 *   engineHatch,         the lazarette hatch in the cockpit deck, its dipstick and oil can
 *   dipstick, oilCan
 *   outboards            the bracket's aft face, the mount's top: her outboards
 *   fuelTank, batteries, the lazarette
 *   bilgePump
 *   cabinLight           the house ceiling
 *   searchlight, navLights, horn   the roof
 *   cleat*               the bulwark tops, at the bow and stern stations
 */
import { CONFIG } from '../../config';
import type { HullDesign } from '../../hulls/loft';
import { hullQueries, type HullDefinition } from '../../modular/hull';
import { inertiaFromGyradius, lightshipOf } from '../../modular/massProperties';
import { hullFormFromDesign } from '../../vessel/hullForm';
import type { Livery } from '../../vessel/vesselDef';
import { BREAKERS } from '../../vessel/vesselState';
import { ALASKAN_38_DESIGN } from './design';

const a = CONFIG.vessels.alaskan38;
const wh = a.layout.wheelhouse;
const eh = a.layout.engineHatch;
const db = a.layout.doorButtons;
const at = a.places;
const design = ALASKAN_38_DESIGN;
const hull = hullQueries({ hull: hullFormFromDesign(design), layout: a.layout });
const roofTop = wh.roofY + a.layout.roof.thickness;
const cleat = (side: number, z: number): [number, number, number] => [side * (hull.halfBeam(z) - 0.03), hull.bulwarkTop(z), z];
/** Her outboards' mount: the bracket's aft face, at the cowls' undersides. */
const mount: [number, number, number] = [0, a.bracket.mountY, hull.transom + a.bracket.length];
/** The cockpit deck's height at the lazarette hatch. */
const hatchY = hull.deckY((eh.z0 + eh.z1) / 2);

/** As weighed: her outboards and her two house batteries come off for the lightship (they are modules, put back where their sockets are). */
const weighed = { massKg: a.mass, cg: [...a.cg] as [number, number, number], inertia: inertiaFromGyradius(a.mass, a.gyradius) };

export const ALASKAN_38_HULL: HullDefinition = {
  id: 'hull.alaskan-38',
  version: 1,
  name: 'Alaskan 38',
  helm: { stand: a.boardingSpot, yawDeg: 0 },
  form: { kind: 'lofted', design },
  lightship: lightshipOf(weighed, [
    { massKg: a.engineKg, at: mount },
    { massKg: 2 * CONFIG.modules.batteryBank.massKg, at: at.engineSpace },
  ]),
  addedMass: a.addedMass,
  damping: a.damping,
  resistance: a.resistance,
  planing: a.planing,
  windage: a.windage,
  layout: a.layout,
  cargo: a.cargo,
  spawn: a.spawn,
  fittings: { exhaust: a.exhaust, stowage: a.stowage, livery: liveryOf(design.colours ?? {}) },
  sockets: [
    { id: 'helm', type: 'helm.console', transform: { position: at.console }, capacity: { size: [2 * (wh.halfWidth - wh.wall - at.console[0]) - 0.04, 1.6, 1.0] }, label: 'Helm console, behind the front windows, to starboard of the companionway' },
    { id: 'chartTable', type: 'cabin.furniture', transform: { position: at.chartTable }, capacity: { size: [0.75, 2.2, 0.95] }, label: 'The dinette table, port side of the saloon' },
    { id: 'dutyBoard', type: 'wall.panel', transform: { position: at.dutyBoard, rotationDeg: [0, -90, 0] }, label: 'Saloon, starboard wall over the galley' },
    { id: 'whiteboard', type: 'wall.panel', transform: { position: at.whiteboard, rotationDeg: [0, 180, 0] }, label: 'Saloon, aft wall, port of the door' },
    { id: 'breakerPanel', type: 'wall.panel', transform: { position: at.breakerPanel, rotationDeg: [-40, -90, 0] }, label: 'Starboard wall, by the helm' },
    { id: 'batteryMaster', type: 'wall.panel', transform: { position: at.batteryMaster, rotationDeg: [0, 180, 0] }, label: 'Aft wall, starboard of the door, low' },
    { id: 'batterySelector', type: 'wall.panel', transform: { position: at.batterySelector, rotationDeg: [0, 180, 0] }, label: 'Aft wall, beside the battery master' },
    { id: 'vhf', type: 'cabin.overhead', transform: { position: at.vhf, rotationDeg: [0, 20, 0] }, label: 'Under the roof, out to port' },
    { id: 'fm', type: 'cabin.overhead', transform: { position: at.fm, rotationDeg: [0, -20, 0] }, label: 'Under the roof, out to starboard' },
    { id: 'doorIn', type: 'wall.panel', transform: { position: [db.x, wh.floorY + db.height, wh.aft - wh.wall], rotationDeg: [-90, 0, 0] }, label: 'Door frame, inside' },
    { id: 'doorOut', type: 'wall.panel', transform: { position: [db.x, wh.floorY + db.height, wh.aft], rotationDeg: [-90, 180, 0] }, label: 'Door frame, outside' },
    { id: 'engineHatch', type: 'deck.fitting', transform: { position: [eh.x1, hatchY, (eh.z0 + eh.z1) / 2] }, capacity: { size: [eh.x1 - eh.x0, 0.035, eh.z1 - eh.z0] }, label: 'Cockpit deck: the lazarette hatch' },
    { id: 'dipstick', type: 'deck.fitting', transform: { position: [eh.x0 + 0.15, hatchY - 0.32, eh.z0 + 0.2] }, label: 'Lazarette, inboard' },
    { id: 'oilCan', type: 'deck.fitting', transform: { position: [eh.x1 - 0.08, hatchY - 0.3, eh.z1 - 0.15], rotationDeg: [0, 90, 0] }, label: 'Lazarette, the shelf' },
    { id: 'outboards', type: 'transom.outboards', transform: { position: mount }, label: 'The bracket\'s aft face: her outboards' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Lazarette (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Lazarette (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [at.engineSpace[0], hatchY - eh.pitDepth, at.engineSpace[2]] }, label: 'Bottom of the lazarette (nominal)' },
    { id: 'cabinLight', type: 'cabin.overhead', transform: { position: at.cabinLight }, label: 'House ceiling' },
    { id: 'searchlight', type: 'roof.mount', transform: { position: at.searchlight }, label: 'Roof, forward' },
    { id: 'navLights', type: 'hull.light', transform: { position: at.navLights }, label: 'Roof: the navigation lights' },
    { id: 'horn', type: 'roof.mount', transform: { position: [0, roofTop, 0] }, label: 'Roof (nominal)' },
    { id: 'wipers', type: 'window.wiper', transform: { position: [0, wh.roofY - 0.2, wh.front] }, label: 'Over the front windows (nominal)' },
    { id: 'cleatFwdPort', type: 'deck.fitting', transform: { position: cleat(-1, at.cleats.bow) }, label: 'Bulwark top, forward, port' },
    { id: 'cleatFwdStbd', type: 'deck.fitting', transform: { position: cleat(1, at.cleats.bow) }, label: 'Bulwark top, forward, starboard' },
    { id: 'cleatAftPort', type: 'deck.fitting', transform: { position: cleat(-1, at.cleats.stern) }, label: 'Bulwark top, aft, port' },
    { id: 'cleatAftStbd', type: 'deck.fitting', transform: { position: cleat(1, at.cleats.stern) }, label: 'Bulwark top, aft, starboard' },
  ],
  provides: [{ power: 'electrical', circuits: BREAKERS }],
  features: [
    { id: 'door.aft', kind: 'door', openKey: 'door.aft.open' },
    { id: 'hatch.engine', kind: 'hatch', openKey: 'hatch.engine.open' },
  ],
};

/** Her paint: dark grey topsides and bottom, light grey deck and house, a tan roof (the design's colours). */
function liveryOf(c: NonNullable<HullDesign['colours']>): Livery {
  return { bottom: c.bottom, topsides: c.topsides, deck: c.deck, house: c.house, roof: c.roof, rail: c.bulwarkIn, floor: c.deck };
}
