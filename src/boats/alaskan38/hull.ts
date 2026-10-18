/**
 * Hull 'hull.alaskan-38' (owner, Oct 2026): the Alaskan 38, a one-off boat. Her lines are
 * her own design (design.ts), lofted into the game's stations; her mass, handling, deck
 * layout and the places of her sockets are CONFIG.vessels.alaskan38; what her stations and
 * layout don't draw (the outboard bracket, the outboards, spray rails, bow rail) is
 * view.ts, hung on her VesselView through boats/oneOffViews.ts.
 *
 * Her working parts are modules, as any boat's (boats/alaskan38.json): her twin outboards
 * are a twin diesel-inboard module placed at them (there is no outboard engine module yet;
 * stage 4 writes up what one would take), steered by the rudder module standing where their
 * lower units turn.
 *
 * Sockets (vessel axes):
 *   helm                 the console behind the faceted front; its space is the house's width
 *   breakerPanel,        the starboard wall by the helm; the aft wall, starboard of the door
 *   batteryMaster/Selector
 *   vhf, fm              under the roof, out to port and starboard
 *   doorIn / doorOut     the cockpit door's jamb, inside and out
 *   engineHatch,         the lazarette hatch in the cockpit deck, its dipstick and oil can
 *   dipstick, oilCan
 *   engine, fuelTank,    the lazarette (the engine module: her outboards; its drawn block
 *   batteries, bilgePump stands for their fuel system and electrics)
 *   rudder               at the outboards' lower units
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
    { massKg: a.engineKg, at: at.engineBed },
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
    { id: 'helm', type: 'helm.console', transform: { position: at.console }, capacity: { size: [2 * (wh.halfWidth - wh.wall) - 0.04, 1.6, 1.0] }, label: 'Helm console, behind the front windows' },
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
    { id: 'engine', type: 'engine.bay', transform: { position: at.engineBed }, tags: ['inboard'], capacity: { maxPowerKw: 700 }, label: 'The outboards (their systems in the lazarette)' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Lazarette (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Lazarette (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [at.engineSpace[0], hatchY - eh.pitDepth, at.engineSpace[2]] }, label: 'Bottom of the lazarette (nominal)' },
    { id: 'rudder', type: 'hull.rudder', transform: { position: at.rudder }, label: 'The outboards\' lower units' },
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
