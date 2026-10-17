/**
 * Hull 'hull.landing-craft-9m' (modular boats M7): the hull study's landing craft, the second
 * boat built from modules. Her lines are the study's design (src/hulls/designs.ts
 * `landingCraft`), lofted into the game's stations; her mass, handling, deck layout and
 * the places of her sockets are CONFIG.vessels.landingCraft.
 *
 * Sockets (vessel axes):
 *   helm                 the helm console across the front of the cabin; its space is the
 *                        cabin's width (a console wider than that is refused)
 *   breakerPanel,        the starboard wall by the helm; the aft wall, starboard of the door
 *   batteryMaster/Selector
 *   vhf                  under the cabin roof, out to port
 *   fm                   under the cabin roof, out to starboard (the FM set)
 *   doorIn / doorOut     the cabin door's jamb, inside and out
 *   rampCabin, rampBow   the bow ramp's buttons: the cabin's port wall by the helm, the port
 *                        bulwark by the bow (the ramp itself is her hull's: layout.bowRamp)
 *   engineHatch,         the hatch in the cabin floor over the engine, its dipstick and the
 *   dipstick, oilCan     oil can's shelf
 *   engine, fuelTank,    the engine space under the cabin floor
 *   batteries, bilgePump
 *   rudder               the rudder stock under her transom
 *   cabinLight           the cabin ceiling
 *   searchlight, navLights, horn   the cabin roof
 *   cleat*               the bulwark tops, at the bow and stern stations
 */
import { CONFIG } from '../config';
import { DESIGNS } from '../hulls/designs';
import type { HullDesign } from '../hulls/loft';
import { hullQueries, type HullDefinition } from '../modular/hull';
import { inertiaFromGyradius, lightshipOf } from '../modular/massProperties';
import { hullFormFromDesign } from '../vessel/hullForm';
import type { Livery } from '../vessel/vesselDef';
import { BREAKERS } from '../vessel/vesselState';

const lc = CONFIG.vessels.landingCraft;
const wh = lc.layout.wheelhouse;
const eh = lc.layout.engineHatch;
const db = lc.layout.doorButtons;
const at = lc.places;
const design = DESIGNS.find((d) => d.id === 'landingCraft');
if (!design) throw new Error("the hull study has no 'landingCraft' design");
const hull = hullQueries({ hull: hullFormFromDesign(design), layout: lc.layout });
const roofTop = wh.roofY + lc.layout.roof.thickness;
const br = lc.layout.bowRamp;
/** The bow ramp's button on the inboard face of the port bulwark (its plate 0.05 thick). */
const rampBow: [number, number, number] = [-(hull.halfBeam(br.button.z) - 0.03 - 0.03), hull.deckY(br.button.z) + br.button.y, br.button.z];
const cleat = (side: number, z: number): [number, number, number] => [side * (hull.halfBeam(z) - 0.03), hull.bulwarkTop(z), z];

/** As weighed: her engine and her two house batteries come off for the lightship (they're modules). */
const weighed = { massKg: lc.mass, cg: [...lc.cg] as [number, number, number], inertia: inertiaFromGyradius(lc.mass, lc.gyradius) };

export const LANDING_CRAFT_HULL: HullDefinition = {
  id: 'hull.landing-craft-9m',
  version: 1,
  name: 'Landing craft, 9 m',
  helm: { stand: lc.boardingSpot, yawDeg: 0 },
  form: { kind: 'lofted', design },
  lightship: lightshipOf(weighed, [
    { massKg: lc.engineKg, at: at.engineBed },
    { massKg: 2 * CONFIG.modules.batteryBank.massKg, at: at.engineSpace },
  ]),
  addedMass: lc.addedMass,
  damping: lc.damping,
  resistance: lc.resistance,
  planing: lc.planing,
  windage: lc.windage,
  layout: lc.layout,
  cargo: lc.cargo,
  spawn: lc.spawn,
  fittings: { exhaust: lc.exhaust, stowage: lc.stowage, livery: liveryOf(design.colours ?? {}) },
  sockets: [
    // The console across the front of the cabin: no wider than the cabin inside.
    { id: 'helm', type: 'helm.console', transform: { position: at.console }, capacity: { size: [2 * (wh.halfWidth - wh.wall) - 0.04, 1.6, 1.0] }, label: 'Helm console, across the front of the cabin' },
    { id: 'breakerPanel', type: 'wall.panel', transform: { position: at.breakerPanel, rotationDeg: [-40, -90, 0] }, label: 'Starboard wall, by the helm' },
    { id: 'batteryMaster', type: 'wall.panel', transform: { position: at.batteryMaster, rotationDeg: [0, 180, 0] }, label: 'Aft wall, starboard of the door, low' },
    { id: 'batterySelector', type: 'wall.panel', transform: { position: at.batterySelector, rotationDeg: [0, 180, 0] }, label: 'Aft wall, beside the battery master' },
    { id: 'vhf', type: 'cabin.overhead', transform: { position: at.vhf, rotationDeg: [0, 20, 0] }, label: 'Under the roof, out to port' },
    { id: 'fm', type: 'cabin.overhead', transform: { position: at.fm, rotationDeg: [0, -20, 0] }, label: 'Under the roof, out to starboard' },
    { id: 'doorIn', type: 'wall.panel', transform: { position: [db.x, wh.floorY + db.height, wh.aft - wh.wall], rotationDeg: [-90, 0, 0] }, label: 'Door frame, inside' },
    { id: 'doorOut', type: 'wall.panel', transform: { position: [db.x, wh.floorY + db.height, wh.aft], rotationDeg: [-90, 180, 0] }, label: 'Door frame, outside' },
    { id: 'rampCabin', type: 'wall.panel', transform: { position: at.rampButton, rotationDeg: [-90, -90, 0] }, label: 'Port wall, by the helm' },
    { id: 'rampBow', type: 'wall.panel', transform: { position: rampBow, rotationDeg: [-90, -90, 0] }, label: 'Port bulwark, by the bow ramp' },
    { id: 'engineHatch', type: 'deck.fitting', transform: { position: [eh.x1, wh.floorY, (eh.z0 + eh.z1) / 2] }, capacity: { size: [eh.x1 - eh.x0, 0.035, eh.z1 - eh.z0] }, label: 'Cabin floor, over the engine' },
    { id: 'dipstick', type: 'deck.fitting', transform: { position: [eh.x0 + 0.15, wh.floorY - 0.32, eh.z0 + 0.2] }, label: 'Engine space, the engine\'s inboard side' },
    { id: 'oilCan', type: 'deck.fitting', transform: { position: [eh.x1 - 0.08, wh.floorY - 0.3, eh.z1 - 0.15], rotationDeg: [0, 90, 0] }, label: 'Engine space, the shelf' },
    { id: 'engine', type: 'engine.bay', transform: { position: at.engineBed }, tags: ['inboard'], capacity: { maxPowerKw: 300 }, label: 'Engine bed, under the cabin floor' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [at.engineSpace[0], wh.floorY - eh.pitDepth, at.engineSpace[2]] }, label: 'Bottom of the engine space (nominal)' },
    { id: 'rudder', type: 'hull.rudder', transform: { position: at.rudder }, label: 'Rudder stock, under the transom' },
    { id: 'cabinLight', type: 'cabin.overhead', transform: { position: at.cabinLight }, label: 'Cabin ceiling' },
    { id: 'searchlight', type: 'roof.mount', transform: { position: at.searchlight }, label: 'Cabin roof, forward' },
    { id: 'navLights', type: 'hull.light', transform: { position: at.navLights }, label: 'Cabin roof: the navigation lights' },
    { id: 'horn', type: 'roof.mount', transform: { position: [0, roofTop, 1.5] }, label: 'Cabin roof (nominal)' },
    { id: 'wipers', type: 'window.wiper', transform: { position: [0, wh.roofY - 0.2, wh.front] }, label: 'Over the front windows (nominal)' },
    { id: 'cleatFwdPort', type: 'deck.fitting', transform: { position: cleat(-1, at.cleats.bow) }, label: 'Bulwark top, forward, port' },
    { id: 'cleatFwdStbd', type: 'deck.fitting', transform: { position: cleat(1, at.cleats.bow) }, label: 'Bulwark top, forward, starboard' },
    { id: 'cleatAftPort', type: 'deck.fitting', transform: { position: cleat(-1, at.cleats.stern) }, label: 'Bulwark top, aft, port' },
    { id: 'cleatAftStbd', type: 'deck.fitting', transform: { position: cleat(1, at.cleats.stern) }, label: 'Bulwark top, aft, starboard' },
  ],
  // Her wiring: the breakers' circuits.
  provides: [{ power: 'electrical', circuits: BREAKERS }],
  features: [
    { id: 'door.aft', kind: 'door', openKey: 'door.aft.open' },
    { id: 'hatch.engine', kind: 'hatch', openKey: 'hatch.engine.open' },
    { id: 'ramp.bow', kind: 'door', openKey: 'ramp.bow.down' },
  ],
};

/**
 * Her paint: the hull study's for her (the bare-aluminium grey of the reference boats),
 * its inner bulwark grey for her rails, the deck's for the cabin floor.
 */
function liveryOf(c: NonNullable<HullDesign['colours']>): Livery {
  return { bottom: c.bottom, topsides: c.topsides, deck: c.deck, house: c.house, roof: c.roof, rail: c.bulwarkIn, floor: c.deck };
}
