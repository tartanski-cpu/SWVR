/**
 * Module steering.rudder: the rudder and its steering gear (modular boats M4a). Simulation
 * only (the rudder is drawn with the hull).
 *
 *   steering gear   follows the helm ('helm.demand'): straight to it for mechanical
 *                   (cable) steering, at a fixed rate for hydraulic
 *   rudder force    a normal-force model from the water flowing past it and the propeller's
 *                   slipstream ('propulsion.thrust'), scaled by how much of the propeller
 *                   is in the water ('propulsion.immersion'): physics/propulsion.ts
 *
 * It pushes on the hull through the physics port, after the propeller (it needs this
 * tick's thrust). Its state is the rudder angle, today's VesselState.rudder (until 6d).
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { rudderForceAt, steeringStep, type RudderSpec } from '../../vessel/physics/propulsion';

const wb = CONFIG.vessels.workboat;

export type RudderConfig = RudderSpec;

/** The rudder's state: its angle (rad, + trailing edge to starboard). */
export interface RudderState {
  angle: number;
}

export const RUDDER: ModuleDefinition<RudderConfig, RudderState> = {
  id: 'steering.rudder',
  version: 1,
  fits: ['hull.rudder'],
  defaults: { rudder: wb.rudder, propeller: { wake: wb.propeller.wake, diameter: wb.propeller.diameter } },
  validateConfig: (c) => (c.rudder.area > 0 ? [] : ['the rudder needs an area']),
  provides: () => [{ gear: 'rudder' }],
  gear: (c) => ({ rudder: c.rudder }),
  ports: {
    helm: { dir: 'read', key: 'helm.demand' },
    // No propeller ahead of it (a sailing boat): no slipstream, fully in the water.
    thrust: { dir: 'read', key: 'propulsion.thrust', required: false },
    immersion: { dir: 'read', key: 'propulsion.immersion', required: false },
  },
  sim: {
    init: () => ({ angle: 0 }),
    // Today's VesselState keeps the angle as a bare number: a view of it.
    legacyState: (v) => ({
      get angle() {
        return v.rudder;
      },
      set angle(a: number) {
        v.rudder = a;
      },
    }),
    physics(port, { config: c, io }, s, dt) {
      s.angle = steeringStep(s.angle, io.num('helm'), c.rudder, dt);
      const flow = port.flowAt(c.rudder.position);
      rudderForceAt(s.angle, c, flow.x, flow.z, io.num('thrust'), force);
      const wet = io.num('immersion');
      port.addForce(c.rudder.position, force.x * wet, 0, force.z * wet);
    },
    tick: () => {},
  },
};

const force = { x: 0, z: 0 };
