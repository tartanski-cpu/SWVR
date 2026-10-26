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
 *
 * Azimuth drives (`azimuth`; owner, Oct 2026: the harbour tug's ASD drives): twin engines
 * worked separately, each driving a Z-drive under her stern in place of its shaft and rudder.
 * Each drive turns right round on its upright axis, following its lever at `slewDegPerS`,
 * and its propeller (in its nozzle, pulling, forward of the leg) pushes the way it points:
 * its lever's power is its engine's throttle, always ahead through the gearbox; astern is the
 * drive turned round. Its leg is a little rudder in the water past it. TRANSIT: the wheel
 * swings both together as rudders, each lever setting its engine's power (ahead in its forward
 * half, astern, the drives turned round, in its after half). Each drive's heading is kept in
 * its engine's state (EngineState.azimuth), so it's saved and sent to the crew. Drawn: the two
 * drives (one instanced mesh), each swung to its heading.
 */
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import type { ModuleDefinition } from '../../modular/module';
import { fuelAndHeatStep } from '../../vessel/physics/engineThermal';
import * as THREE from 'three';
import { engineStep, rudderForceAt, starboardEngine, twinStep, type DieselInputs, type RudderSpec } from '../../vessel/physics/propulsion';
import type { PhysicsPort, PortIO } from '../../modular/module';
import { TickSmoother } from '../../mechanisms/tickSmoother';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { oilStep } from '../../vessel/maintenance';
import { engineWearStep } from '../../vessel/wear';
import { engineParts, oilShelfParts, waterStop } from '../../vessel/view/engineLook';
import { engineGeometry } from '../../vessel/view/engineModels';
import type { EngineState } from '../../vessel/vesselState';

const wb = CONFIG.vessels.workboat;

export interface DieselInboardConfig {
  engine: typeof wb.engine;
  propeller: typeof wb.propeller;
  /** The propeller in a Kort nozzle (the Shipyard; CONFIG.nozzle): harder pull at a standstill, slower free-running. */
  nozzle?: boolean;
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
   * gives that thrust; fuel, mass and power are doubled. `split` (the twin lever control;
   * owner, Oct 2026): worked separately instead, a lever and a START each, the starboard
   * engine with a state of its own (EngineState.stbd): each gives its own thrust on its own
   * side, so different thrusts turn her (twin-screw manoeuvring).
   */
  twin?: { x: number; split?: boolean };
  /** How it sounds (CONFIG.engineVoices); unset, the workboat's straight six. */
  voice?: keyof typeof CONFIG.engineVoices;
  /**
   * The engine as built into her (a Shipyard design: where her shaft line puts it), drawn as
   * its model (vessel/view/engineModels.ts) under its hatch: the model (the Shipyard's
   * engine type), its size (length, width, height, m), each engine's distance off the
   * centreline (one, or a twin's two), its gearbox flange (height, place along her) and the
   * shaft's angle. Unset, the generic engine under the wheelhouse floor (engineLook.ts).
   */
  installed?: { model: number; size: [number, number, number]; xs: number[]; flangeY: number; flangeZ: number; angleDeg: number };
  /**
   * Azimuth drives in place of the shafts and rudders (see above; with `twin.split`): each
   * drive's upright axis at x = -+`twin.x`, z = `legZ`; the drive's head just inside her bottom
   * (`headY`) and its propeller's centre `propY`. The rest: CONFIG.modules.azimuth.
   */
  azimuth?: { legZ: number; headY: number; propY: number };
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
    // Twin engines worked separately: the starboard engine's lever and START, its state and revs.
    throttle2: { dir: 'read', key: 'throttle.demand2', required: false },
    start2: { dir: 'read', key: 'ignition.start2', required: false },
    state2: { dir: 'write', key: 'propulsion.state2', required: false },
    rpm2: { dir: 'write', key: 'propulsion.rpm2', required: false },
    // Azimuth drives: each lever's direction, TRANSIT and the wheel; where each drive points.
    angle: { dir: 'read', key: 'azimuth.demand', required: false },
    angle2: { dir: 'read', key: 'azimuth.demand2', required: false },
    transit: { dir: 'read', key: 'azimuth.transit', required: false },
    helm: { dir: 'read', key: 'helm.demand', required: false },
    heading: { dir: 'write', key: 'azimuth.angle', required: false },
    heading2: { dir: 'write', key: 'azimuth.angle2', required: false },
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
  gear: (c) => ({ diesel: { engine: c.engine, propeller: c.propeller, maintenance: c.maintenance, voice: c.voice, ...(c.nozzle ? { nozzle: true } : {}), ...(c.twin ? { twin: true, twinX: c.twin.x, ...(c.twin.split ? { split: true } : {}) } : {}), ...(c.azimuth ? { azimuth: true } : {}) } }),
  // Its mass at its bed (the socket): it's part of the boat's mass, CG and inertia (M6).
  physical: (c) => ({ powerKw: c.engine.powerKw * (c.twin ? 2 : 1), massKg: c.massKg * (c.twin ? 2 : 1) }),
  power: (c) => [
    // The alternator: full output from idle (its pulley is sized for the engine's revs).
    { role: 'source', amps: (io) => (io.get('state') === 'running' ? c.alternatorAmps * clamp(io.num('rpm') / c.engine.idleRpm, 0, 1) : 0) },
    // The starter and the glow plugs are on the master alone.
    { role: 'load', amps: (io) => (io.get('state') === 'cranking' ? c.starterAmps : 0) },
    // (The starboard engine's alternator and starter, worked separately.)
    { role: 'source', amps: (io) => (io.has('state2') && io.get('state2') === 'running' ? c.alternatorAmps * clamp(io.num('rpm2') / c.engine.idleRpm, 0, 1) : 0) },
    { role: 'load', amps: (io) => (io.has('state2') && io.get('state2') === 'cranking' ? c.starterAmps : 0) },
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
      const p = c.propeller;
      if (c.azimuth && c.twin) {
        azimuthStep(port, c as DieselInboardConfig & { azimuth: NonNullable<DieselInboardConfig['azimuth']>; twin: { x: number } }, io, e, inputs, dt);
        return;
      }
      if (c.twin?.split) {
        // Worked separately: each engine from its own lever and START (twinStep), each thrust
        // T(1 - t) along its own shaft (forward is -z), on its own side: more thrust on one
        // side turns her away from it. Counter-rotating: no walk.
        const t = twinStep(e, c, inputs, io.has('throttle2') ? io.num('throttle2') : inputs.lever, io.num('start2'), -flow.z, wet, dt);
        // The rudders see the two propellers' wash: as one, the mean.
        io.set('thrust', (t.port + t.stbd) / 2);
        io.set('immersion', wet);
        io.set('fuel', t.fuelL);
        port.addForce([-c.twin.x, p.position[1], p.position[2]], 0, 0, -t.port * (1 - p.thrustDeduction));
        port.addForce([c.twin.x, p.position[1], p.position[2]], 0, 0, -t.stbd * (1 - p.thrustDeduction));
        return;
      }
      const thrust = engineStep(e, c, inputs, -flow.z, wet, dt);
      // One shaft's thrust (the rudder sees one propeller's wash: twin rudders, each behind its own).
      io.set('thrust', thrust);
      io.set('immersion', wet);
      const left = fuelAndHeatStep(e, c, fuelL, dt);
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
      const space = hull.engineSpace;
      const drives = c.azimuth && c.twin ? azimuthDrives(c, c.azimuth, c.twin.x) : null;
      const inst = c.installed;
      const parts = inst && space
        ? [...inst.xs.flatMap((x) => engineGeometry(inst.model, inst.size, { x, flangeY: inst.flangeY, flangeZ: inst.flangeZ, angleDeg: inst.angleDeg })), ...oilShelfParts(c.maintenance, space.top, space.outboardX)]
        : hull.cabinFloor !== null && space
          ? engineParts(c.maintenance, hull.cabinFloor, space)
          : [];
      return {
        staticParts: parts,
        movingParts: [...waterStop(space), ...(drives ? [drives.mesh] : [])],
        controls: [],
        update: (_read, e, dt) => drives?.update(e, dt),
      };
    },
  },
};


// ── Azimuth drives (see the header) ──────────────────────────────────────────

const RAD = Math.PI / 180;
/** An angle brought into (-pi, pi]. */
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/**
 * Where each drive is asked to point (rad) and how hard (its engine's lever, 0..1): from its
 * own lever; or in TRANSIT from the wheel, both together, ahead or turned round astern by
 * which half each lever leans into. (+ to starboard: the wheel to starboard swings the push
 * to port, the stern to port, her bow to starboard.) A throttle below zero (the keys, a game
 * controller, the sea trials' astern run, which know only ahead and astern) is that much power
 * with the drive turned round: astern.
 */
export function azimuthDemand(io: Pick<PortIO, 'num' | 'has' | 'get'>): { want: [number, number]; power: [number, number] } {
  const a = CONFIG.modules.azimuth;
  const raw = [io.num('throttle'), io.has('throttle2') ? io.num('throttle2') : io.num('throttle')];
  const angle = [io.num('angle'), io.has('angle2') ? io.num('angle2') : io.num('angle')].map((d, i) => (raw[i] < 0 ? d + 180 : d));
  const power = raw.map((p) => Math.max(0, Math.min(1, Math.abs(p)))) as [number, number];
  if (!io.get('transit')) return { want: [wrap(angle[0] * RAD), wrap(angle[1] * RAD)], power };
  const steer = -io.num('helm') * a.transitMaxDeg;
  const want = angle.map((d) => (Math.abs(wrap(d * RAD)) <= Math.PI / 2 ? steer : 180 - steer) * RAD) as [number, number];
  return { want: [wrap(want[0]), wrap(want[1])], power };
}

/**
 * One tick of the two drives and their engines: each drive turned toward where it's asked (the
 * shortest way, at its steering rate), each engine from its power (twinStep: its own START,
 * the quick start's queue, the fuel), each propeller's push T(1 - t) the way its drive points,
 * from the propeller's place (ahead of its leg along that way); and each leg's lift, as a
 * rudder at the leg's angle to the water. Its speed of advance: the water along its push.
 */
function azimuthStep(port: PhysicsPort, c: DieselInboardConfig & { azimuth: NonNullable<DieselInboardConfig['azimuth']>; twin: { x: number } }, io: PortIO, e: EngineState, inputs: DieselInputs, dt: number): void {
  const a = CONFIG.modules.azimuth;
  const az = c.azimuth;
  const p = c.propeller;
  const s = (e.stbd ??= starboardEngine(e));
  const engines = [e, s];
  const { want, power } = azimuthDemand(io);
  const rate = a.slewDegPerS * RAD * dt;
  const xs = [-c.twin.x, c.twin.x];
  const props: [number, number, number][] = [];
  const speeds: number[] = [];
  const flows: { x: number; z: number }[] = [];
  let wet = 0;
  for (let i = 0; i < 2; i++) {
    const x = engines[i];
    const th = (x.azimuth = wrap((x.azimuth ?? 0) + Math.max(-rate, Math.min(rate, wrap(want[i] - (x.azimuth ?? 0))))));
    const fwd = a.propFwd * p.diameter;
    props.push([xs[i] + Math.sin(th) * fwd, az.propY, az.legZ - Math.cos(th) * fwd]);
    const f = port.flowAt(props[i]);
    flows.push(f);
    // The water along its push (its speed of advance): her motion through it, ahead of the propeller.
    speeds.push(-f.z * Math.cos(th) + f.x * Math.sin(th));
    wet += Math.min(1, Math.max(0, (port.depthAt(props[i]) + p.diameter / 2) / p.diameter)) / 2;
  }
  const t = twinStep(e, c, { ...inputs, lever: power[0] }, power[1], io.num('start2'), speeds[0], wet, dt, speeds[1]);
  io.set('thrust', (t.port + t.stbd) / 2);
  io.set('immersion', wet);
  io.set('fuel', t.fuelL);
  io.set('heading', ((e.azimuth ?? 0) * 180) / Math.PI);
  io.set('heading2', ((s.azimuth ?? 0) * 180) / Math.PI);
  const spec: RudderSpec = {
    rudder: { ...CONFIG.vessels.workboat.rudder, area: a.legArea, maxAngleDeg: 90, washFactor: 0, washMaxFraction: 0, coastSteer: 1, coastFadeThrust: 1 },
    propeller: { wake: p.wake, diameter: p.diameter },
  };
  [t.port, t.stbd].forEach((thrust, i) => {
    const th = engines[i].azimuth ?? 0;
    const T = thrust * (1 - p.thrustDeduction);
    port.addForce(props[i], Math.sin(th) * T, 0, -Math.cos(th) * T);
    // The leg: its chord along the drive (either way round), a rudder at that angle (+ is the
    // rudder's to starboard, the drive's push to port).
    const leg = wrap(2 * th) / 2;
    rudderForceAt(-leg, spec, flows[i].x, flows[i].z, 0, lift);
    port.addForce([xs[i], (az.headY + az.propY) / 2, az.legZ], lift.x * wet, 0, lift.z * wet);
  });
}
const lift = { x: 0, z: 0 };

/**
 * The two drives drawn (one shape, two instances: one draw call), each swung about its upright
 * axis to its heading: its leg from her bottom down to the propeller's level, the housing, and
 * the nozzle round the propeller ahead of the leg along its push. Drawn smoothly between ticks.
 */
/**
 * A drive's nozzle: a closed duct (its inner face just clear of the blade tips, a thicker
 * foil-shaped wall, the mouth flared forward), so it reads as a ring from any side.
 * Its axis along z, its mouth toward -z.
 */
function nozzleDuct(D: number, length: number, wall: number): THREE.BufferGeometry {
  const r = D / 2 + 0.01;
  const h = length / 2;
  const pts = [
    [r * 1.06, -h],
    [r, -0.2 * h],
    [r, h],
    [r + 0.35 * wall, h],
    [r + wall, -0.2 * h],
    [r * 1.06 + 0.5 * wall, -h],
    [r * 1.06, -h],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  // (The lathe's axis is y: turned so it runs along z, y = -h forward.)
  return new THREE.LatheGeometry(pts, 20).rotateX(Math.PI / 2);
}

function azimuthDrives(c: DieselInboardConfig, az: NonNullable<DieselInboardConfig['azimuth']>, x: number): { mesh: THREE.InstancedMesh; update: (e: EngineState | undefined, dt: number) => void } {
  const a = CONFIG.modules.azimuth;
  const L = a.look;
  const D = c.propeller.diameter;
  const legH = Math.max(0.2, az.headY - az.propY);
  const fwd = a.propFwd * D;
  // In the drive's own axes: the upright axis at the origin, its push toward -z, y from the propeller's centre.
  const unit = mergeParts([
    part(new THREE.BoxGeometry(L.legWidth, legH, L.legChord).translate(0, legH / 2, 0), L.colour),
    part(new THREE.CylinderGeometry(L.housing * D, L.housing * D * 0.7, fwd + L.legChord / 2, 10).rotateX(Math.PI / 2).translate(0, 0, -(fwd - L.legChord / 2) / 2), L.colour),
    part(nozzleDuct(D, L.nozzleLength * D, L.nozzleWall).translate(0, 0, -fwd), L.nozzleColour),
  ]);
  const mesh = new THREE.InstancedMesh(unit, flatVertexColorMaterial(), 2);
  mesh.name = 'azimuthDrives';
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const smooth = new TickSmoother([90, 90]);
  const shown = [NaN, NaN];
  const place = (i: number, th: number) => {
    // (Its push the way it points: -z turned by th toward +x, a turn of -th about y.)
    q.setFromAxisAngle(up, -th);
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(i ? x : -x, az.propY, az.legZ), q, one));
    shown[i] = th;
  };
  place(0, 0);
  place(1, 0);
  return {
    mesh,
    update: (e, dt) => {
      // (Each heading unwrapped toward the last drawn, so the smoothing doesn't spin the long way round.)
      const raw = [e?.azimuth ?? 0, e?.stbd?.azimuth ?? 0].map((th, i) => (Number.isNaN(shown[i]) ? th : shown[i] + wrap(th - shown[i])));
      const [d0, d1] = smooth.update(raw.map((r) => (r * 180) / Math.PI), dt);
      let moved = false;
      [d0, d1].forEach((d, i) => {
        const th = (d * Math.PI) / 180;
        if (Math.abs(th - shown[i]) > 1e-3) {
          place(i, th);
          moved = true;
        }
      });
      if (moved) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
