/**
 * Module propulsion.electric-outboard: an electric outboard on a transom bracket, with its
 * battery (modular boats M6a; the skiff's). A motor and propeller steered by swinging the
 * whole unit on its tiller: thrust along the motor's centreline, from the twist grip
 * ('throttle.demand', 0..1) in the gear selected ('outboard.gear'), with the motor switched
 * on ('outboard.on'); the tiller ('helm.demand') swings it. It draws its battery down
 * (vessel/physics/outboard.ts has the arithmetic) and pushes on the hull at the propeller
 * through the physics port, inside the hull's step, where the outboard always was.
 *
 * Its state is today's VesselState (the battery is `battery`; its thrust and swing are
 * `thrust` and `rudder`, read by the views) until 6d. Its defaults are CONFIG.vessels.skiff.outboard; the world reads it as
 * her 'outboard' gear (M6b). Its tiller is still the app's until 6c.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { stepOutboard } from '../../vessel/physics/outboard';
import type { OutboardConfig } from '../../vessel/vesselDef';
import type { VesselState } from '../../vessel/vesselState';

const dir = { x: 0, z: -1 };

export const ELECTRIC_OUTBOARD: ModuleDefinition<OutboardConfig, VesselState> = {
  id: 'propulsion.electric-outboard',
  version: 1,
  fits: ['transom.mount'],
  defaults: CONFIG.vessels.skiff.outboard,
  validateConfig: (c) => (c.staticThrustN > 0 && c.batteryKWh > 0 ? [] : ['the outboard needs thrust and a battery']),
  provides: () => [{ gear: 'outboard' }],
  gear: (c) => ({ outboard: c }),
  ports: {
    on: { dir: 'read', key: 'outboard.on' },
    gear: { dir: 'read', key: 'outboard.gear' },
    // Her tiller's twist grip and swing: the tiller is still the app's (not a module) until
    // 6b, so nothing in her recipe writes these yet.
    throttle: { dir: 'read', key: 'throttle.demand', required: false },
    helm: { dir: 'read', key: 'helm.demand', required: false },
    // Its own outputs (kept in its state; declared so a reader knows who keeps them).
    battery: { dir: 'write', key: 'outboard.battery' },
    thrust: { dir: 'write', key: 'propulsion.thrust' },
    swing: { dir: 'write', key: 'rudder.angle' },
  },
  physical: (c) => ({ powerKw: c.powerKw }),
  sim: {
    init: () => {
      throw new Error('the outboard keeps its state in VesselState until 6d');
    },
    legacyState: (v) => v,
    tick: () => {},
    physics(port, { config: ob, io }, v, dt) {
      // Thrust fades as the propeller comes out of the water (wet over 0.24 m round 0.12 m down).
      const wet = Math.min(1, Math.max(0, (port.depthAt(ob.position) + 0.12) / 0.24));
      // Speed of advance: the flow through the propeller, along her, level.
      const flow = port.flowAt(ob.position, true);
      const helm = io.num('helm');
      const thrust = stepOutboard(ob, { on: !!io.get('on'), gear: io.num('gear'), throttle: io.num('throttle'), helm }, v, -flow.z, wet, dt, dir);
      v.thrust = thrust;
      // For the views: the motor's swing, like a rudder angle.
      v.rudder = (Math.max(-1, Math.min(1, helm)) * ob.maxSteerDeg * Math.PI) / 180;
      if (thrust !== 0) port.addForce(ob.position, dir.x * thrust, 0, dir.z * thrust);
    },
  },
};
