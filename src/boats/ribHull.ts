/**
 * Hull 'hull.rib-6': the fast rescue boat (owner, Oct 2026), a 6 m deep-V RIB carried as a
 * ship's tender by a bigger crane. Her shape and handling come from CONFIG.vessels.rib (as
 * weighed: her outboard and battery come off for the lightship, as they're modules put back
 * where their sockets are). Sockets: her tubes along her sides; the centre console's foot
 * on deck and its top (the helm console, on its aft face); her outboard on the transom; her
 * fuel tank and battery inside the console; her bow and stern cleats.
 */
import { CONFIG } from '../config';
import type { HullDefinition } from '../modular/hull';
import { hullQueries } from '../modular/hull';
import { buildHullForm } from '../vessel/hullForm';
import { BREAKERS } from '../vessel/vesselState';
import { hullDataFrom } from './hullData';

const r = CONFIG.vessels.rib;
const hull = hullQueries({ hull: buildHullForm(r.hull), layout: r.layout });
const ob = CONFIG.modules.outboard;
/** Her outboard's mount: on her transom, its clamp's top a shaft's length above the plate (the plate a little above her keel there). */
const plateY = Math.round(Math.max(-0.35, Math.min(-0.08, r.hull.keelY + 0.35)) * 100) / 100;
export const RIB_MOUNT: [number, number, number] = [0, Math.round((plateY + r.motor.look.shaftLength) * 100) / 100, Math.round((hull.transom + 0.05) * 100) / 100];
/** Inside the console, low: her tank and battery. */
const inConsole: [number, number, number] = [0, hull.deckY(0.1) + 0.3, (r.console.front + r.console.aft) / 2];

export const RIB_HULL: HullDefinition = {
  id: 'hull.rib-6',
  version: 1,
  name: 'Rescue boat (RIB), 6 m',
  helm: { stand: r.boardingSpot, yawDeg: 0 },
  ...hullDataFrom(r, [
    { massKg: r.motor.massKg, at: RIB_MOUNT },
    { massKg: CONFIG.modules.batteryBank.massKg, at: inConsole },
  ]),
  planing: r.planing,
  fittings: { livery: r.livery },
  sockets: [
    { id: 'tubes', type: 'hull.side', transform: { position: [0, 0, 0] }, label: 'Her sides: the tubes' },
    { id: 'console', type: 'deck.equipment', transform: { position: [0, hull.deckY((r.console.front + r.console.aft) / 2), (r.console.front + r.console.aft) / 2] }, label: 'Amidships: the centre console and the leaning post' },
    { id: 'helm', type: 'helm.console', transform: { position: [0, r.console.top, r.console.aft] }, capacity: { size: [2 * r.console.halfWidth + 0.3, 1.2, 1.0] }, label: 'The centre console\'s top, at its aft face' },
    { id: 'outboards', type: 'transom.outboards', transform: { position: RIB_MOUNT }, label: 'Transom: her outboard' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: inConsole }, label: 'Inside the console: her tank' },
    { id: 'batteries', type: 'engine.bay', transform: { position: inConsole }, label: 'Inside the console: her battery' },
    { id: 'bowCleat', type: 'deck.fitting', transform: { position: r.cleats.bow }, label: 'Her bow, over the tubes\' nose: the bow cleat' },
    { id: 'sternCleat', type: 'deck.fitting', transform: { position: r.cleats.stern }, label: 'Port quarter\'s tube: the stern cleat' },
  ],
  provides: [{ power: 'electrical', circuits: BREAKERS }],
};

/** (Her outboard's settings, from CONFIG.vessels.rib.motor over the main boats' outboard's: the recipe's config.) */
export function ribOutboard() {
  const o = r.motor;
  const e = ob.engine;
  return {
    engine: {
      ...e,
      powerKw: o.powerKw,
      torqueCurve: e.torqueCurve.map(([rpm, nm]) => [rpm, Math.round(nm * o.torqueScale)] as [number, number]),
      inertia: o.inertia,
      gearRatio: o.gearRatio,
      fuel: { ...e.fuel, tankL: o.tankL, startL: Math.round(o.tankL * 0.75) },
      thermal: { ...e.thermal, exchangerKwPerK: o.exchangerKwPerK },
    },
    propeller: { ...ob.propeller, diameter: o.propellerM, j0: o.j0, jq0: o.jq0 },
    units: [0],
    mount: { y: RIB_MOUNT[1], z: RIB_MOUNT[2] },
    look: o.look,
    massKg: o.massKg,
    alternatorAmps: o.alternatorAmps,
    starterAmps: o.starterAmps,
  };
}
