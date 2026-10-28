/**
 * The foiling ferry's twin pods (owner, 28 Oct 2026: "the bulbs on the stern foils are her
 * motors"; "yes go ahead, twin levers"): an electric pod at the foot of each aft strut, one
 * under each hull, a lever each, so one ahead and one astern turns her on the spot; in SHALLOW
 * the pods slide up with her foils.
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { busOf } from '../../src/modular/bus';
import { hullQueries } from '../../src/modular/hull';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { FOIL_FERRY } from '../../src/shipyard/parts/catalog';
import { placeVessel } from '../../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const DT = 1 / 60;
const ferry: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[FOIL_FERRY].defaults, hull: FOIL_FERRY };

function atSea() {
  const b = useDesign(ferry);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  world.environment.waves = [];
  world.geography = 'openSea';
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  send('quickStart', 1);
  return { b, world, v, send, run };
}

describe("the foiling ferry's twin pods", () => {
  it('one ahead, one astern: she turns on the spot, each motor its own way; both ahead, straight', { timeout: 120000 }, () => {
    const { v, send, run } = atSea();
    const battery = v.battery!;
    send('throttle.demand', 0.5);
    send('throttle.demand2', -1);
    run(20);
    // To starboard (the port pod ahead), making no way ahead or astern: about 2.6°/s, her two
    // 95 kW motors 3.3 m apart. (Her pods are well aft, so she pivots forward of her middle,
    // and her middle swings sideways round it at about 2 kn.)
    expect(v.angularVelocity[1]).toBeLessThan(0);
    expect((Math.abs(v.angularVelocity[1]) * 180) / Math.PI).toBeGreaterThan(2);
    expect(Math.abs(v.linearVelocity[2]) / 0.5144).toBeLessThan(1);
    expect(v.engine.gear).toBe(1);
    expect(v.engine.stbd!.gear).toBe(-1);
    expect(v.battery!).toBeLessThan(battery);
    send('throttle.demand', 0.6);
    send('throttle.demand2', 0.6);
    run(25);
    expect(Math.abs(v.angularVelocity[1])).toBeLessThan(0.01);
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144).toBeGreaterThan(8);
  });

  it('in SHALLOW the pods slide up with her foils, and still drive her', { timeout: 120000 }, () => {
    const { b, v, send, run } = atSea();
    const pods = b.recipe.modules.find((m) => m.module === 'propulsion.pods')!.config as { mount: { y: number }; retract: number };
    // The pods module's own view (her whole view needs a page for her screens).
    const view = LIBRARY.modules.get('propulsion.pods')!.view!.build({ config: pods, keys: { portAngle: 'pods.angle.port', stbdAngle: 'pods.angle.stbd', deploy: 'foils.deploy' }, hull: hullQueries(VESSEL_DEFS.design) } as never);
    const mesh = view.movingParts!.find((o) => o.name === 'pods') as THREE.InstancedMesh;
    const yOf = () => {
      view.update(busOf(v), undefined, 1 / 60, {} as never);
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(0, m);
      return new THREE.Vector3().setFromMatrixPosition(m).y;
    };
    expect(yOf()).toBeCloseTo(pods.mount.y, 3);
    send('foils.mode', 2);
    run(25);
    expect(v.foil!.deploy).toBeLessThan(0.01);
    expect(yOf()).toBeCloseTo(pods.mount.y + pods.retract, 2);
    // Retracted, she still goes ahead on both levers.
    send('throttle.demand', 0.4);
    send('throttle.demand2', 0.4);
    run(15);
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144).toBeGreaterThan(3);
  });
});
