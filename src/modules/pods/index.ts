/**
 * Module propulsion.pods (owner, Oct 2026: "two drives... they attach to the bottom of the
 * ship, and the propellers are at the front"; for the planing hulls): pod drives. Our own
 * design (look.ts): two steerable pods hung under her bottom, forward of the transom, each
 * driven by its own inboard diesel just forward of it.
 *
 *   engines    as the outboards' (modules/outboard): one engine model worked for both, in
 *              lockstep from the one throttle and key, its state her engine's
 *              (VesselState.engine); fuel and power times two. Drawn inside (`installed`).
 *   pods       each pod's steering axis at x = `units[i]`, z = `mount.z`, from her bottom
 *              (`mount.y`) down its strut to the nacelle; its propellers `look.propFwd`
 *              FORWARD of the axis, pulling (a tractor drive: they work in clean water, ahead
 *              of the strut and clear of her hull's wake). Each pushes along its own heading
 *              from its propellers; its strut steers a little as a rudder from the water past
 *              it (`steering.legArea`).
 *   wheel      the pods swing together with the wheel, as the outboards do (same convention:
 *              + swing turns the push to port, her bow to starboard; it is her rudder angle,
 *              VesselState.rudder, on the ENGINE screen as DRIVES).
 *   joystick   vector mode (the helm joystick, modules/helmJoystick; its JOYSTICK button):
 *              the wheel and throttle stand aside and each pod points and pushes on its own,
 *              ahead or astern, for what the stick asks: push it sideways and she crabs that
 *              way, forward or back and she creeps, twist it and she turns on the spot
 *              (physics/podAllocation.ts shares the work out). Both engines run together at
 *              the most that the busiest pod needs, up to `joystick.lever` of the throttle's
 *              travel; the other pod's share is its gears' (slipping, as a trolling valve).
 *              It works only with the throttle in neutral: move the throttle and the pods go
 *              back to the wheel.
 * Each pod's heading is kept in VesselState.pods (sent to the crew and saved), so the view
 * swings each one by its own.
 *
 * Electric (`electric`; owner, 27 Oct 2026, the Shipyard's solar catamaran): an electric motor
 * in place of each diesel, from her battery (physics/electricMotor.ts): the key switches the
 * motors on, the throttle sets their speed ahead or astern; no fuel, heat, oil or wear, no
 * starter, and in place of the alternators her battery's converter keeps the 12 V side charged
 * while they're on. Her battery's charge is VesselState.battery.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import { TickSmoother } from '../../mechanisms/tickSmoother';
import type { ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts } from '../../render/geometryUtils';
import { fuelAndHeatStep } from '../../vessel/physics/engineThermal';
import { allocatePods } from '../../vessel/physics/podAllocation';
import { motorStep, type MotorSpec } from '../../vessel/physics/electricMotor';
import { engineStep, rudderForceAt, steeringStep, type DieselInputs, type RudderSpec } from '../../vessel/physics/propulsion';
import { oilStep } from '../../vessel/maintenance';
import { engineWearStep } from '../../vessel/wear';
import type { EngineState, VesselControls } from '../../vessel/vesselState';
import { oilShelfParts, waterStop } from '../../vessel/view/engineLook';
import { engineGeometry } from '../../vessel/view/engineModels';
import { podFairing, podParts } from './look';

const wb = CONFIG.vessels.workboat;
const pc = CONFIG.modules.pods;

export interface PodsConfig {
  engine: typeof wb.engine;
  /** Each pod's propellers (its `position` is worked out: see above). */
  propeller: typeof wb.propeller;
  /** Each pod's steering axis off the centreline (m), port then starboard: two of them. */
  units: number[];
  /** Where each strut meets her bottom: its height, and the steering axis along her (m, boat axes). */
  mount: { y: number; z: number };
  /** The strut, her bottom to the nacelle's centre (m): the propellers' tips clear of her bottom. */
  strut: number;
  steering: typeof pc.steering;
  look: typeof pc.look;
  joystick: typeof pc.joystick;
  /** Her centre of gravity along her (m, boat z): what the joystick turns her about. */
  centreZ: number;
  alternatorAmps: number;
  oilUse: number;
  starterAmps: number;
  /** Each engine and its pod (kg). */
  massKg: number;
  maintenance: typeof wb.maintenance;
  voice?: keyof typeof CONFIG.engineVoices;
  /** Electric motors in place of the diesels (see above): their efficiency, inertia and controller, and her battery's usable kWh. */
  electric?: MotorSpec;
  installed?: { model: number; size: [number, number, number]; xs: number[]; flangeY: number; flangeZ: number; angleDeg: number };
}

/** The module's state: her engine, the pods' swing from the wheel (rad), each pod's own heading, and the joystick switch (in her controls). */
export interface PodsState {
  engine: EngineState;
  swing: number;
  angles: number[];
  controls: VesselControls;
  /** Electric: her battery's charge, 0 (flat) .. 1 (full). */
  battery: number;
}

/** The propellers' centre straight ahead (boat axes, the row's middle: x 0). */
function placed(c: PodsConfig): PodsConfig {
  return { ...c, propeller: { ...c.propeller, position: [0, c.mount.y - c.strut, c.mount.z - c.look.propFwd] } };
}

/** The struts as a rudder (their lift from the water past them), swung from the wheel (`maxAngleDeg`) or the joystick (its own). */
function strutSpec(c: PodsConfig, joystick = false): RudderSpec {
  const s = joystick ? { maxAngleDeg: c.joystick.maxAngleDeg, rateDegPerS: c.joystick.rateDegPerS } : c.steering;
  return {
    rudder: { ...wb.rudder, area: c.steering.legArea, maxAngleDeg: s.maxAngleDeg, rateDegPerS: s.rateDegPerS, washFactor: 0, washMaxFraction: 0, coastSteer: 1, coastFadeThrust: 1, position: [0, c.mount.y - c.strut / 2, c.mount.z] },
    propeller: { wake: c.propeller.wake, diameter: c.propeller.diameter },
  };
}

export const PODS: ModuleDefinition<PodsConfig, PodsState> = {
  id: 'propulsion.pods',
  version: 1,
  fits: ['hull.pods'],
  defaults: {
    engine: wb.engine,
    propeller: { ...wb.propeller, diameter: pc.propMaxM },
    units: [-0.8, 0.8],
    mount: { y: -0.4, z: 3 },
    strut: pc.look.strutLength,
    steering: pc.steering,
    look: pc.look,
    joystick: pc.joystick,
    centreZ: 0,
    alternatorAmps: CONFIG.modules.dieselInboard.alternatorAmps,
    oilUse: wb.maintenance.use,
    starterAmps: CONFIG.modules.dieselInboard.starterAmps,
    massKg: 1000,
    maintenance: wb.maintenance,
  },
  validateConfig: (c) => [
    ...(c.units.length === 2 ? [] : ['pods come in pairs: two units']),
    ...(c.propeller.diameter > 0 ? [] : ['the propellers need a diameter']),
    ...(c.steering.maxAngleDeg > 0 && c.joystick.maxAngleDeg > 0 ? [] : ['the pods need to swing (maxAngleDeg > 0)']),
    ...(c.joystick.lever > 0 && c.joystick.lever <= 1 ? [] : ['joystick.lever is a share of the throttle (0 to 1)']),
    ...(c.voice === undefined || c.voice in CONFIG.engineVoices ? [] : [`no engine voice '${c.voice}'`]),
  ],
  ports: {
    throttle: { dir: 'read', key: 'throttle.demand' },
    key: { dir: 'read', key: 'ignition.key' },
    heat: { dir: 'read', key: 'ignition.heat' },
    start: { dir: 'read', key: 'ignition.start' },
    powered: { dir: 'read', key: 'electrical.powered' },
    volts: { dir: 'read', key: 'electrical.busVoltage', required: false },
    helm: { dir: 'read', key: 'helm.demand' },
    jx: { dir: 'read', key: 'joystick.x' },
    jy: { dir: 'read', key: 'joystick.y' },
    jr: { dir: 'read', key: 'joystick.twist' },
    fuel: { dir: 'write', key: 'fuel.litres' },
    thrust: { dir: 'write', key: 'propulsion.thrust' },
    immersion: { dir: 'write', key: 'propulsion.immersion' },
    // Its own outputs (kept in its state; written here so a reader knows who keeps them).
    state: { dir: 'write', key: 'propulsion.state' },
    rpm: { dir: 'write', key: 'propulsion.rpm' },
    load: { dir: 'write', key: 'propulsion.load' },
    gear: { dir: 'write', key: 'propulsion.gear' },
    swing: { dir: 'write', key: 'rudder.angle' },
    portAngle: { dir: 'write', key: 'pods.angle.port' },
    stbdAngle: { dir: 'write', key: 'pods.angle.stbd' },
  },
  needs: (c) => (c.electric ? [] : [{ fuel: 'diesel' }]),
  // Power for the deck hydraulics off the engines' power take-off, as an inboard's.
  provides: () => [{ gear: 'diesel' }, { gear: 'rudder' }, { power: 'pto' }],
  gear: (raw) => {
    const c = placed(raw);
    return {
      diesel: { engine: c.engine, propeller: c.propeller, maintenance: c.maintenance, voice: c.voice, units: c.units, twin: true, twinX: Math.max(...c.units.map(Math.abs)), ...(c.electric ? { electric: c.electric } : {}) },
      // The ENGINE screen shows the pods' swing.
      rudder: strutSpec(c).rudder,
    };
  },
  physical: (c) => ({ powerKw: c.engine.powerKw * c.units.length, massKg: c.massKg * c.units.length }),
  power: (c) =>
    c.electric
      ? // (Electric: her battery's converter charges the 12 V side while the motors are on, at the alternators' rate.)
        [{ role: 'source', amps: (io) => (io.get('state') === 'running' ? c.alternatorAmps * c.units.length : 0) }]
      : [
          { role: 'source', amps: (io) => (io.get('state') === 'running' ? c.alternatorAmps * c.units.length * clamp(io.num('rpm') / c.engine.idleRpm, 0, 1) : 0) },
          { role: 'load', amps: (io) => (io.get('state') === 'cranking' ? c.starterAmps : 0) },
        ],
  sim: {
    init: () => {
      throw new Error('the pods keep their state in VesselState (engine, rudder, pods) until 6d');
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
      get angles() {
        return (v.pods ??= { angles: [v.rudder, v.rudder] }).angles;
      },
      // (The joystick's switch is in her controls: the sim lets it go when the throttle moves.)
      get controls() {
        return v.controls;
      },
      get battery() {
        return v.battery ?? 0;
      },
      set battery(x: number) {
        v.battery = x;
      },
    }),
    physics(port, { config: raw, io }, s, dt) {
      const c = placed(raw);
      const p = c.propeller;
      const e = s.engine;
      const n = c.units.length;
      const lever = io.num('throttle');
      const nb = c.engine.neutralBand;
      // Vector mode: on its button, and only while the throttle stays in neutral.
      if (s.controls.joyMode && Math.abs(lever) > nb) s.controls.joyMode = 0;
      const joy = !!s.controls.joyMode;
      // What each pod does: its heading, and its share of the engines' push (signed).
      const push = pushes;
      push.length = n;
      let throttle = lever;
      if (!joy) {
        // From the wheel: the pods swing together (hydraulic steering, at a set rate).
        s.swing = steeringStep(s.swing, io.num('helm'), strutSpec(c).rudder, dt);
        for (let i = 0; i < n; i++) {
          s.angles[i] = s.swing;
          push[i] = 1;
        }
      } else {
        const j = c.joystick;
        const half = Math.max(...c.units.map(Math.abs));
        const at = c.units.map((x) => ({ x, z: c.mount.z - c.centreZ }));
        const jx = io.num('jx');
        const jy = io.num('jy');
        const jr = io.num('jr');
        // The twist asks for a rate of turn, up to `turnRateDeg` (deg/s), and the pods turn
        // her to it (as the yaw-rate sensor of a real joystick system: so she also holds her
        // head while she crabs or creeps). Her rate of turn from the water past her bow and
        // stern (+ about y: bow to port).
        const ends = Math.max(1, Math.abs(c.mount.z - c.centreZ));
        const yaw = (port.flowAt([0, 0, c.centreZ + ends]).x - port.flowAt([0, 0, c.centreZ - ends]).x) / (2 * ends);
        const asked = Math.abs(jx) > 0.02 || Math.abs(jy) > 0.02 || Math.abs(jr) > 0.02;
        const turn = asked ? clamp(j.turnGain * ((-jr * j.turnRateDeg * Math.PI) / 180 - yaw), -1, 1) : 0;
        // Stick to starboard: a push to starboard; ahead: a push forward (-z); the turn, a
        // moment about y (podAllocation.ts). (A pod running astern is taken to push as hard as
        // ahead: the system runs it that much harder.)
        const orders = allocatePods(at, j.side * jx, -j.surge * jy, j.twist * half * turn, (j.maxAngleDeg * Math.PI) / 180);
        const most = Math.max(...orders.map((o) => Math.abs(o.push)));
        // How hard: the first `slip` of the effort the engines idle in gear and the pods'
        // clutches slip (a share of their idling push), past it the throttle opens to `lever`.
        const effort = Math.min(1, most);
        const grip = Math.min(1, effort / j.slip);
        const rate = ((j.rateDegPerS * Math.PI) / 180) * dt;
        for (let i = 0; i < n; i++) {
          // Stick let go: the pods come back straight. Each swings toward its own heading.
          const want = most > 0.01 ? orders[i].angle : 0;
          s.angles[i] += clamp(want - s.angles[i], -rate, rate);
          // Each pushes its share only as it comes round to its heading (none while it's off by 90°).
          const on = Math.max(0, Math.cos(want - s.angles[i]));
          push[i] = most > 0.01 ? (orders[i].push / most) * grip * on : 0;
        }
        // Both engines at what the busiest pod needs: just in gear, then up to `lever` at the stop.
        throttle = most > 0.01 ? nb + 0.02 + (j.lever - nb - 0.02) * Math.max(0, (effort - j.slip) / (1 - j.slip)) : 0;
        s.swing = s.angles.reduce((a, b) => a + b, 0) / n;
      }
      // The water at the propellers (one sample does for the pair).
      const flow = port.flowAt(p.position);
      const D = p.diameter;
      const wet = Math.min(1, Math.max(0, (port.depthAt(p.position) + D / 2) / D));
      // The speed of advance: the water's along the first pod's heading.
      const d0 = s.angles[0];
      const along = -flow.z * Math.cos(d0) - flow.x * Math.sin(d0);
      let thrust: number;
      if (c.electric) {
        // Electric: both motors from her battery, switched on by the key, with 12 V for their controllers.
        thrust = motorStep(e, c, c.electric, { lever: throttle, on: io.num('key') > 0 && !!io.get('powered'), charge: s.battery }, along, wet, dt, used);
        s.battery = clamp(s.battery - (n * used.kWh) / c.electric.usableKWh, 0, 1);
        e.powerKw = (e.powerKw ?? 0) * n;
      } else {
        const fuelL = io.num('fuel');
        const inputs: DieselInputs = {
          lever: throttle,
          heat: io.num('heat'),
          start: io.num('start'),
          powered: !!io.get('powered'),
          starterFactor: io.has('volts') ? clamp((io.num('volts') - 9) / 2.5, 0, 1) : 1,
          fuelL,
        };
        thrust = engineStep(e, c, inputs, along, wet, dt);
        const left = fuelAndHeatStep(e, c, fuelL, dt);
        io.set('fuel', Math.max(0, fuelL - n * (fuelL - left)));
        e.fuelFlowLph *= n;
      }
      io.set('thrust', thrust);
      io.set('immersion', wet);
      // Each pod: its net push T(1 - t) times its share, along its heading, from its propellers
      // (forward of the axis, where its heading has swung them); and its strut's lift.
      const spec = strutSpec(c, joy);
      const propY = c.mount.y - c.strut;
      for (let i = 0; i < n; i++) {
        const d = s.angles[i];
        const T = thrust * (1 - p.thrustDeduction) * push[i];
        const x = c.units[i];
        port.addForce([x - Math.sin(d) * c.look.propFwd, propY, c.mount.z - Math.cos(d) * c.look.propFwd], -Math.sin(d) * T, 0, -Math.cos(d) * T);
        rudderForceAt(d, spec, flow.x, flow.z, 0, lift);
        port.addForce([x, c.mount.y - c.strut / 2, c.mount.z], lift.x * wet, 0, lift.z * wet);
      }
    },
    tick({ config: c }, s, dt) {
      // (Electric motors: no oil to use, nothing to wear here.)
      if (c.electric) return;
      oilStep(s.engine, c.oilUse, dt);
      engineWearStep(s.engine, dt);
    },
  },
  view: {
    frame: 'boat',
    build({ config: c, keys, hull }) {
      // The fixed parts: the fairing round each strut's foot, the engines inside, the oil can's shelf.
      const staticParts = c.units.map((x) => podFairing(c.look, x, c.mount.y, c.mount.z));
      const inst = c.installed;
      const space = hull.engineSpace;
      if (inst) for (const x of inst.xs) staticParts.push(...engineGeometry(inst.model, inst.size, { x, flangeY: inst.flangeY, flangeZ: inst.flangeZ, angleDeg: inst.angleDeg }));
      if (inst && space && !c.electric) staticParts.push(...oilShelfParts(c.maintenance, space.top, space.outboardX));
      // The pods: one shape, drawn once per pod (one draw call), each swung by its own heading.
      const unit = mergeParts(podParts(c.look, c.strut, c.propeller.diameter));
      const mesh = new THREE.InstancedMesh(unit, flatVertexColorMaterial(), c.units.length);
      mesh.name = 'pods';
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      const up = new THREE.Vector3(0, 1, 0);
      const last = c.units.map(() => NaN);
      const swing = new TickSmoother([45, 45]);
      const place = (i: number, deg: number) => {
        q.setFromAxisAngle(up, (deg * Math.PI) / 180);
        mesh.setMatrixAt(i, m.compose(new THREE.Vector3(c.units[i], c.mount.y, c.mount.z), q, one));
        last[i] = deg;
      };
      c.units.forEach((_, i) => place(i, 0));
      mesh.computeBoundingSphere();
      return {
        staticParts,
        movingParts: [mesh, ...waterStop(hull.engineSpace)],
        controls: [],
        update: (read, _s, dt) => {
          let moved = false;
          // (Their swing drawn smoothly between the simulation's ticks: mechanisms/tickSmoother.ts.)
          const swung = swing.update([read.num(keys.portAngle), read.num(keys.stbdAngle)], dt);
          c.units.forEach((_, i) => {
            const deg = swung[i];
            if (Math.abs(deg - last[i]) > 0.05) {
              place(i, deg);
              moved = true;
            }
          });
          if (moved) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
          }
        },
        dispose: () => unit.dispose(),
      };
    },
  },
};

const lift = { x: 0, z: 0 };
const used = { kWh: 0 };
const pushes: number[] = [];
