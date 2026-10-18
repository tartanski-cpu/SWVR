/**
 * Module propulsion.diesel-inboard: the diesel, its gearbox and shaft, and the propeller
 * (modular boats M4a). Drawn under the hatch in the wheelhouse floor (M6c,
 * vessel/view/engineLook.ts: fixed parts, in the boat's axes from its upkeep config) where
 * the hull has an engine space there.
 *
 *   ignition   key (the glow plugs preheat with it), START (the starter, from the bus voltage), the fuel
 *              solenoid (12 V on the bus)
 *   shaft      governor, clutch, torque curve, propeller thrust and torque (physics/propulsion.ts)
 *   fuel/heat  fuel drawn from the tank, coolant and oil temperatures, overheat derate and
 *              shutdown, running dry (physics/engineThermal.ts)
 *   upkeep     lube oil used while running, wear from running hot or dry
 *   energy     the alternator charges the batteries; the starter and the glow plugs draw
 *
 * It pushes on the hull through the physics port, inside the rigid-body step, where the
 * engine always was: the shaft-line thrust and the prop walk at the propeller. The
 * propeller's inflow and its immersion are taken just aft of it, at the rudder (as always).
 *
 * Its state is today's VesselState.engine (until 6d). Its defaults are the workboat's
 * 400 kW engine and propeller; another boat gives her own in her recipe.
 */
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import type { ModuleDefinition } from '../../modular/module';
import { fuelAndHeatStep } from '../../vessel/physics/engineThermal';
import { engineStep, type DieselInputs } from '../../vessel/physics/propulsion';
import { oilStep } from '../../vessel/maintenance';
import { engineWearStep } from '../../vessel/wear';
import { engineParts } from '../../vessel/view/engineLook';
import type { EngineState } from '../../vessel/vesselState';

const wb = CONFIG.vessels.workboat;

export interface DieselInboardConfig {
  engine: typeof wb.engine;
  propeller: typeof wb.propeller;
  /** Where the propeller's inflow and immersion are taken (boat axes, m): just aft of it, at the rudder. */
  sampleAt: readonly [number, number, number];
  /** The alternator's full output (A, from the engine's idle speed up: 600 rpm on an 1800 rpm engine). */
  alternatorAmps: number;
  /** Lube oil burnt, as a fraction of the sump per second at no load. */
  oilUse: number;
  /** What the starter and the glow plugs draw (A). */
  starterAmps: number;
  glowAmps: number;
  /** Dry mass with its gearbox (kg), at its bed. */
  massKg: number;
  /** Its upkeep: oil at the start, the checks, the OIL lamp; the block's place under the floor, its dipstick and filler. */
  maintenance: typeof wb.maintenance;
  /**
   * Twin engines (the Shipyard): two of this engine, each with its own gearbox and propeller,
   * the propellers `x` m either side of the centreline (the `propeller.position` x is then
   * ignored) and counter-rotating, so their prop walk cancels. Worked from one lever and one
   * key, they run in lockstep: one engine's revs and thrust are worked out, and each shaft
   * gives that thrust; fuel, mass and power are doubled. (Separate levers, twin-screw
   * manoeuvring, need an engine state each: modular boats 6d.)
   */
  twin?: { x: number };
  /** How it sounds (CONFIG.engineVoices); unset, the workboat's straight six. */
  voice?: keyof typeof CONFIG.engineVoices;
}

export const DIESEL_INBOARD: ModuleDefinition<DieselInboardConfig, EngineState> = {
  id: 'propulsion.diesel-inboard',
  version: 1,
  fits: ['engine.bay'],
  needsTags: ['inboard'],
  defaults: {
    engine: wb.engine,
    propeller: wb.propeller,
    sampleAt: wb.rudder.position,
    oilUse: wb.maintenance.use,
    maintenance: wb.maintenance,
    ...CONFIG.modules.dieselInboard,
  },
  validateConfig: (c) => [
    ...(c.propeller.diameter > 0 ? [] : ['the propeller needs a diameter']),
    ...(c.alternatorAmps >= 0 ? [] : ['alternatorAmps should be 0 or more']),
    ...(c.voice === undefined || c.voice in CONFIG.engineVoices ? [] : [`no engine voice '${c.voice}' (${Object.keys(CONFIG.engineVoices).join(', ')})`]),
  ],
  ports: {
    throttle: { dir: 'read', key: 'throttle.demand' },
    key: { dir: 'read', key: 'ignition.key' },
    heat: { dir: 'read', key: 'ignition.heat' },
    // The GLOW lamp is wired with the glow plugs: lit while they draw.
    glowLamp: { dir: 'read', key: 'lamp.glow', required: false },
    start: { dir: 'read', key: 'ignition.start' },
    powered: { dir: 'read', key: 'electrical.powered' },
    volts: { dir: 'read', key: 'electrical.busVoltage', required: false },
    fuel: { dir: 'write', key: 'fuel.litres' },
    thrust: { dir: 'write', key: 'propulsion.thrust' },
    immersion: { dir: 'write', key: 'propulsion.immersion' },
    // Its own outputs (kept in its state; written here so a reader knows who keeps them).
    state: { dir: 'write', key: 'propulsion.state' },
    rpm: { dir: 'write', key: 'propulsion.rpm' },
    load: { dir: 'write', key: 'propulsion.load' },
    gear: { dir: 'write', key: 'propulsion.gear' },
  },
  needs: () => [{ fuel: 'diesel' }],
  provides: () => [{ power: 'pto' }, { gear: 'diesel' }],
  gear: (c) => ({ diesel: { engine: c.engine, propeller: c.propeller, maintenance: c.maintenance, voice: c.voice, ...(c.twin ? { twin: true } : {}) } }),
  // Its mass at its bed (the socket): it's part of the boat's mass, CG and inertia (M6).
  physical: (c) => ({ powerKw: c.engine.powerKw * (c.twin ? 2 : 1), massKg: c.massKg * (c.twin ? 2 : 1) }),
  power: (c) => [
    // The alternator: full output from idle (its pulley is sized for the engine's revs).
    { role: 'source', amps: (io) => (io.get('state') === 'running' ? c.alternatorAmps * clamp(io.num('rpm') / c.engine.idleRpm, 0, 1) : 0) },
    // The starter and the glow plugs are on the master alone.
    { role: 'load', amps: (io) => (io.get('state') === 'cranking' ? c.starterAmps : 0) },
    { role: 'load', amps: (io) => (io.has('glowLamp') && io.get('glowLamp') === 'on' ? c.glowAmps : 0) },
  ],
  sim: {
    init: () => {
      throw new Error('the diesel keeps its state in VesselState.engine until 6d');
    },
    legacyState: (v) => v.engine,
    physics(port, { config: c, io }, e, dt) {
      const flow = port.flowAt(c.sampleAt);
      const D = c.propeller.diameter;
      // Immersion: full thrust with the disc under water, fading as it comes out.
      const wet = Math.min(1, Math.max(0, (port.depthAt(c.propeller.position, c.sampleAt) + D / 2) / D));
      const fuelL = io.num('fuel');
      const inputs: DieselInputs = {
        lever: io.num('throttle'),
        heat: io.num('heat'),
        start: io.num('start'),
        powered: !!io.get('powered'),
        // A tired battery cranks slowly, a flat one not at all; no electrics: a full starter.
        starterFactor: io.has('volts') ? clamp((io.num('volts') - 9) / 2.5, 0, 1) : 1,
        fuelL,
      };
      const thrust = engineStep(e, c, inputs, -flow.z, wet, dt);
      // One shaft's thrust (the rudder sees one propeller's wash: twin rudders, each behind its own).
      io.set('thrust', thrust);
      io.set('immersion', wet);
      const left = fuelAndHeatStep(e, c, fuelL, dt);
      const p = c.propeller;
      if (c.twin) {
        // The other engine burns as much.
        io.set('fuel', Math.max(0, left - (fuelL - left)));
        e.fuelFlowLph *= 2;
        // Net propulsive force T(1 - t) along each shaft (forward is -z); counter-rotating, no walk.
        for (const side of [-1, 1]) port.addForce([side * c.twin.x, p.position[1], p.position[2]], 0, 0, -thrust * (1 - p.thrustDeduction));
        return;
      }
      io.set('fuel', left);
      // Net propulsive force T(1 - t) along the shaft (forward is -z).
      port.addForce(p.position, 0, 0, -thrust * (1 - p.thrustDeduction));
      // Prop walk: sideways at the prop from the blades' uneven bite (strongest slow and
      // going astern). Right-handed: stern to starboard ahead, to port astern.
      const walkFrac = thrust >= 0 ? p.propWalkAhead : -p.propWalkAstern;
      const walk = (Math.abs(thrust) * walkFrac * (p.rightHanded ? 1 : -1)) / (1 + (flow.z / p.propWalkFadeSpeed) ** 2);
      port.addForce(p.position, walk, 0, 0);
    },
    tick({ config: c }, e, dt) {
      oilStep(e, c.oilUse, dt);
      engineWearStep(e, dt);
    },
  },
  view: {
    frame: 'boat',
    build({ config: c, hull }) {
      const parts = hull.cabinFloor !== null && hull.engineSpace ? engineParts(c.maintenance, hull.cabinFloor, hull.engineSpace) : [];
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};
