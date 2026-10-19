/**
 * Module propulsion.outboard (owner, Oct 2026: "an outboard engine module for the Shipyard
 * where you can add 2, 3 or 4 outboards to the back of the vessel... animate when you turn
 * the wheel"): petrol V8 outboards on a bracket off the transom. Their figures are the
 * Alaskan 38's (CONFIG.modules.outboard).
 *
 *   engines    one engine model (the diesel's: physics/propulsion.ts, a petrol torque curve,
 *              no glow plugs) for all the units: worked from one lever and one key they run
 *              in lockstep, so one engine's revs and thrust are worked out and every unit
 *              gives that thrust; fuel, mass and power are times the count. Its state is her
 *              engine's (VesselState.engine), so the instruments, start card, sound and sea
 *              trials read it as they read an inboard's ('diesel' is the game's name for her
 *              engine gear, whatever it burns).
 *   steering   no rudder: the units swing together with the wheel ('helm.demand'), up to
 *              `steering.maxAngleDeg` either way at `steering.rateDegPerS`, and each pushes
 *              along its own heading from its propeller. The swing turns the propeller end
 *              to starboard for a starboard turn, as a rudder's trailing edge (thrust then
 *              points forward and to port, pushing her stern to port: her bow comes to
 *              starboard). Their lower units also steer a little as a rudder does, from the
 *              water flowing past them (`steering.legArea` each), which is what steers her
 *              when she coasts with the engines in neutral. The swing is her rudder angle
 *              (VesselState.rudder, 'rudder.angle'): the RUDDER screen shows it, the view
 *              swings the units by it.
 *   where      each unit's steering axis at x = `units[i]`, z = `mount.z` + `look.pivotAft`;
 *              its propeller `look.propAft` aft of that, `look.shaftLength + gearDrop` below
 *              the mount's top (`mount.y`). Its `propeller.position` is worked out from these.
 *   drawn      the units (one instanced mesh: one draw call however many), each on a clamp
 *              plate, and (if `bracket` is given: the Shipyard's) the bracket off the transom
 *              that carries them. The Alaskan 38 draws her own bracket.
 *   sterndrive (owner, Oct 2026) the same module as a stern drive: an inboard engine package
 *              (`engine`, a diesel with its glow plugs) against the transom, drawn inside
 *              (`installed`), each unit an outdrive leg (no cowl) on a transom shield.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import type { ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { fuelAndHeatStep } from '../../vessel/physics/engineThermal';
import { engineStep, rudderForceAt, steeringStep, type DieselInputs, type RudderSpec } from '../../vessel/physics/propulsion';
import { oilStep } from '../../vessel/maintenance';
import { engineWearStep } from '../../vessel/wear';
import type { EngineState } from '../../vessel/vesselState';
import { oilShelfParts, waterStop } from '../../vessel/view/engineLook';
import { engineGeometry } from '../../vessel/view/engineModels';
import { mountPlate, outboardUnitParts } from './look';

const wb = CONFIG.vessels.workboat;
const ob = CONFIG.modules.outboard;

export interface OutboardConfig {
  engine: typeof wb.engine;
  /** Each unit's propeller (its `position` is worked out: see above). */
  propeller: typeof wb.propeller;
  /** Each unit's steering axis off the centreline (m), port to starboard: 2, 3 or 4 of them. */
  units: number[];
  /** The mount's top (the cowls' undersides) and its aft face, where the clamp plates are (m, boat axes). */
  mount: { y: number; z: number };
  steering: typeof ob.steering;
  look: typeof ob.look;
  /** The bracket off the transom (boat axes, m): from the transom `z0` aft to `z1`, `y0` up to `y1`, `halfWidth` either side. Unset: none drawn (the boat draws her own). */
  bracket?: { z0: number; z1: number; y0: number; y1: number; halfWidth: number };
  alternatorAmps: number;
  oilUse: number;
  starterAmps: number;
  /** Each unit, dry (kg). */
  massKg: number;
  /** Her upkeep (the oil checks): as the inboard's. */
  maintenance: typeof wb.maintenance;
  voice?: keyof typeof CONFIG.engineVoices;
  /**
   * Stern drives (owner, Oct 2026; CONFIG.modules.sternDrive): the engine is inside, against
   * the transom (`installed`: drawn as the diesel draws its own, vessel/view/engineModels.ts),
   * and each unit is an outdrive leg: no cowl, a gimbal housing on a shield on the transom.
   * Its physics is an outboard's (the leg swings to steer; the engine is the inboard package's).
   */
  sterndrive?: boolean;
  installed?: { model: number; size: [number, number, number]; xs: number[]; flangeY: number; flangeZ: number; angleDeg: number };
}

/** The module's state: her engine, and the units' swing (rad, + propellers to starboard). */
export interface OutboardState {
  engine: EngineState;
  swing: number;
}

/** Where each unit's steering axis and propeller are (boat axes), from its config. */
export function outboardGeometry(c: Pick<OutboardConfig, 'units' | 'mount' | 'look'>): { pivotZ: number; propY: number; propZ: number; plateY: number } {
  const pivotZ = c.mount.z + c.look.pivotAft;
  const plateY = c.mount.y - c.look.shaftLength;
  return { pivotZ, propY: plateY - c.look.gearDrop, propZ: pivotZ + c.look.propAft, plateY };
}

/** The config with each propeller's straight-ahead place filled in (the centre of the row: x 0). */
function placed(c: OutboardConfig): OutboardConfig {
  const g = outboardGeometry(c);
  return { ...c, propeller: { ...c.propeller, position: [0, g.propY, g.propZ] } };
}

/** The lower units as a rudder (their lift from the water past them; no slipstream: the thrust is steered itself). */
function legSpec(c: OutboardConfig): RudderSpec {
  return {
    rudder: { ...wb.rudder, area: c.steering.legArea, maxAngleDeg: c.steering.maxAngleDeg, rateDegPerS: c.steering.rateDegPerS, washFactor: 0, washMaxFraction: 0, coastSteer: 1, coastFadeThrust: 1, position: c.propeller.position },
    propeller: { wake: c.propeller.wake, diameter: c.propeller.diameter },
  };
}

export const OUTBOARD: ModuleDefinition<OutboardConfig, OutboardState> = {
  id: 'propulsion.outboard',
  version: 1,
  fits: ['transom.outboards'],
  defaults: {
    engine: ob.engine,
    propeller: ob.propeller,
    units: [-ob.spacing / 2, ob.spacing / 2],
    mount: { y: 0.7, z: 0 },
    steering: ob.steering,
    look: ob.look,
    alternatorAmps: ob.alternatorAmps,
    oilUse: wb.maintenance.use,
    starterAmps: ob.starterAmps,
    massKg: ob.massKg,
    maintenance: wb.maintenance,
    voice: 'outboardV8',
  },
  validateConfig: (c) => [
    ...(c.units.length >= 1 && c.units.length <= 4 ? [] : ['1 to 4 outboards']),
    ...(c.propeller.diameter > 0 ? [] : ['the propeller needs a diameter']),
    ...(c.steering.maxAngleDeg > 0 ? [] : ['the outboards need to swing (maxAngleDeg > 0)']),
    ...(c.voice === undefined || c.voice in CONFIG.engineVoices ? [] : [`no engine voice '${c.voice}' (${Object.keys(CONFIG.engineVoices).join(', ')})`]),
  ],
  ports: {
    throttle: { dir: 'read', key: 'throttle.demand' },
    key: { dir: 'read', key: 'ignition.key' },
    heat: { dir: 'read', key: 'ignition.heat' },
    start: { dir: 'read', key: 'ignition.start' },
    powered: { dir: 'read', key: 'electrical.powered' },
    volts: { dir: 'read', key: 'electrical.busVoltage', required: false },
    helm: { dir: 'read', key: 'helm.demand' },
    fuel: { dir: 'write', key: 'fuel.litres' },
    thrust: { dir: 'write', key: 'propulsion.thrust' },
    immersion: { dir: 'write', key: 'propulsion.immersion' },
    // Its own outputs (kept in its state; written here so a reader knows who keeps them).
    state: { dir: 'write', key: 'propulsion.state' },
    rpm: { dir: 'write', key: 'propulsion.rpm' },
    load: { dir: 'write', key: 'propulsion.load' },
    gear: { dir: 'write', key: 'propulsion.gear' },
    swing: { dir: 'write', key: 'rudder.angle' },
  },
  // (The game has one fuel: her tank's. Petrol at the fuel berth is for later.)
  needs: () => [{ fuel: 'diesel' }],
  // Power for the deck hydraulics' pump and the fire pump while the engines run (the game's
  // rule: vessel/electrics.ts hydraulicsOn): on a stern drive, off the inboard engine's power
  // take-off, as an inboard's; on outboards, which have none, it stands for the deck's own
  // hydraulic power pack and fire pump, run while the engines are. Without it a Shipyard boat
  // on outboards or stern drives with a crane, winch, skiff or fire monitor wouldn't start.
  provides: () => [{ gear: 'diesel' }, { gear: 'rudder' }, { power: 'pto' }],
  gear: (raw) => {
    const c = placed(raw);
    return {
      diesel: { engine: c.engine, propeller: c.propeller, maintenance: c.maintenance, voice: c.voice, units: c.units, ...(c.units.length >= 2 ? { twin: true, twinX: Math.max(...c.units.map(Math.abs)) } : {}) },
      // The RUDDER screen shows the units' swing.
      rudder: legSpec(c).rudder,
    };
  },
  // Their mass at the mount (the socket): part of the boat's mass, CG and inertia.
  physical: (c) => ({ powerKw: c.engine.powerKw * c.units.length, massKg: c.massKg * c.units.length }),
  power: (c) => [
    { role: 'source', amps: (io) => (io.get('state') === 'running' ? c.alternatorAmps * clamp(io.num('rpm') / c.engine.idleRpm, 0, 1) : 0) },
    { role: 'load', amps: (io) => (io.get('state') === 'cranking' ? c.starterAmps : 0) },
  ],
  sim: {
    init: () => {
      throw new Error('the outboards keep their state in VesselState (engine, rudder) until 6d');
    },
    legacyState: (v) => ({
      get engine() {
        return v.engine;
      },
      get swing() {
        return v.rudder;
      },
      set swing(a: number) {
        v.rudder = a;
      },
    }),
    physics(port, { config: raw, io }, s, dt) {
      const c = placed(raw);
      const g = outboardGeometry(c);
      const p = c.propeller;
      const e = s.engine;
      // The units swing with the wheel (hydraulic steering: at a set rate).
      s.swing = steeringStep(s.swing, io.num('helm'), legSpec(c).rudder, dt);
      const d = s.swing;
      // The water at the propellers (straight ahead; one sample does for the row).
      const flow = port.flowAt(p.position);
      const D = p.diameter;
      const wet = Math.min(1, Math.max(0, (port.depthAt(p.position) + D / 2) / D));
      const fuelL = io.num('fuel');
      const inputs: DieselInputs = {
        lever: io.num('throttle'),
        heat: io.num('heat'),
        start: io.num('start'),
        powered: !!io.get('powered'),
        starterFactor: io.has('volts') ? clamp((io.num('volts') - 9) / 2.5, 0, 1) : 1,
        fuelL,
      };
      // Each unit's speed of advance: the water's along its own heading.
      const along = -flow.z * Math.cos(d) - flow.x * Math.sin(d);
      const thrust = engineStep(e, c, inputs, along, wet, dt);
      io.set('thrust', thrust);
      io.set('immersion', wet);
      const left = fuelAndHeatStep(e, c, fuelL, dt);
      // The other units burn as much.
      const n = c.units.length;
      io.set('fuel', Math.max(0, fuelL - n * (fuelL - left)));
      e.fuelFlowLph *= n;
      // Each unit: its net thrust T(1 - t) along its heading (forward and to port when the
      // propellers swing to starboard), from its propeller where the swing has carried it;
      // and its lower unit's lift from the water past it.
      const fx = -Math.sin(d) * thrust * (1 - p.thrustDeduction);
      const fz = -Math.cos(d) * thrust * (1 - p.thrustDeduction);
      rudderForceAt(d, legSpec(c), flow.x, flow.z, 0, lift);
      for (const x of c.units) {
        const at: [number, number, number] = [x + Math.sin(d) * c.look.propAft, g.propY, g.pivotZ + Math.cos(d) * c.look.propAft];
        port.addForce(at, fx + lift.x * wet, 0, fz + lift.z * wet);
      }
    },
    tick({ config: c }, s, dt) {
      oilStep(s.engine, c.oilUse, dt);
      engineWearStep(s.engine, dt);
    },
  },
  view: {
    frame: 'boat',
    build({ config: c, keys, hull }) {
      const g = outboardGeometry(c);
      // The fixed parts: each unit's clamp plate, and the bracket if this module draws it.
      const staticParts = c.units.map((x) => mountPlate(c.look, x, c.mount.y, c.mount.z, !!c.sterndrive));
      // A stern drive's engines inside, against the transom, and the oil can's shelf by them.
      const inst = c.installed;
      const space = hull.engineSpace;
      if (inst) for (const x of inst.xs) staticParts.push(...engineGeometry(inst.model, inst.size, { x, flangeY: inst.flangeY, flangeZ: inst.flangeZ, angleDeg: inst.angleDeg }));
      if (inst && space) staticParts.push(...oilShelfParts(c.maintenance, space.top, space.outboardX));
      const b = c.bracket;
      if (b) {
        staticParts.push(part(new THREE.BoxGeometry(2 * b.halfWidth, b.y1 - b.y0, b.z1 - b.z0).translate(0, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2), 0x9aa0a6));
        staticParts.push(part(new THREE.BoxGeometry(2 * b.halfWidth + 0.04, 0.04, b.z1 - b.z0 + 0.04).translate(0, b.y1 + 0.02, (b.z0 + b.z1) / 2), 0xb4b9be)); // its grating top
      }
      // The units: one shape, drawn once per unit (one draw call), each swung by the rudder angle.
      const unit = mergeParts(outboardUnitParts(c.look, c.propeller.diameter, !!c.sterndrive));
      const mesh = new THREE.InstancedMesh(unit, flatVertexColorMaterial(), c.units.length);
      mesh.name = 'outboards';
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      const up = new THREE.Vector3(0, 1, 0);
      let last = NaN;
      const place = (deg: number) => {
        q.setFromAxisAngle(up, (deg * Math.PI) / 180);
        c.units.forEach((x, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, c.mount.y, g.pivotZ), q, one)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        last = deg;
      };
      place(0);
      return {
        staticParts,
        // (And the water stop for her lazarette, the engine space her oil checks are in.)
        movingParts: [mesh, ...waterStop(hull.engineSpace)],
        controls: [],
        update: (read) => {
          const deg = read.num(keys.swing);
          if (Math.abs(deg - last) > 0.05) place(deg);
        },
        dispose: () => unit.dispose(),
      };
    },
  },
};

const lift = { x: 0, z: 0 };
