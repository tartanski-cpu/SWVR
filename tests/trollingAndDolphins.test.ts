import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { leverDemand, type EngineSpec } from '../src/vessel/physics/propulsion';
import { podVisit } from '../src/wildlife/wildlife';
import { WildlifeView } from '../src/wildlife/wildlifeView';

const DT = 1 / 60;
const KN = 0.5144;

/** Her steady speed (kn) and engine rpm with the lever at `lever`, calm open water. */
function steady(defId: string, lever: number): { kn: number; rpm: number } {
  const { world, vesselId } = createWorld(new IdFactory(), defId);
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  world.environment.waves = [];
  world.geography = 'openSea';
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
  send('quickStart', 1);
  for (let i = 0; i < 5 / DT; i++) stepWorld(world, [], DT);
  send('lever', lever);
  for (let i = 0; i < 90 / DT; i++) stepWorld(world, [], DT);
  return { kn: Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / KN, rpm: v.engine.rpm };
}

describe('trolling valve (big engines: dead slow in gear)', () => {
  it('maps the lever: clutch slipping at idle up to trollingLever, then the throttle opens', () => {
    const spec = { engine: { ...CONFIG.vessels.workboat.engine, trollingLever: 0.3, trollingMinShaft: 0.3 } } as EngineSpec;
    expect(leverDemand(spec, 0)).toEqual({ gear: 0, throttle: 0, shaft: 1 });
    const justIn = leverDemand(spec, 0.081);
    expect(justIn.gear).toBe(1);
    expect(justIn.throttle).toBe(0);
    expect(justIn.shaft).toBeCloseTo(0.3, 2);
    expect(leverDemand(spec, -0.19).shaft).toBeCloseTo(0.3 + (0.7 * 0.11) / 0.22, 5);
    expect(leverDemand(spec, 0.3)).toEqual({ gear: 1, throttle: 0, shaft: 1 });
    expect(leverDemand(spec, 1)).toEqual({ gear: 1, throttle: 1, shaft: 1 });
    // The workboat has none: the throttle opens from the detent, as it always did.
    const wb = { engine: CONFIG.vessels.workboat.engine } as EngineSpec;
    expect(leverDemand(wb, 0.54).throttle).toBeCloseTo(0.5, 5);
    expect(leverDemand(wb, 0.1).shaft).toBe(1);
  });

  it('the landing craft goes dead slow just into gear, gathers way through the slip, and still makes 20 kn', () => {
    const slow = steady('landingCraft', 0.1);
    const locked = steady('landingCraft', 0.3);
    expect(slow.kn).toBeLessThan(3.5);
    expect(slow.rpm).toBeLessThan(650); // the engine at idle, the clutch slipping
    expect(locked.kn).toBeGreaterThan(5.5);
    expect(steady('landingCraft', 1).kn).toBeGreaterThan(19);
  }, 60000);
});

describe('dolphins keep up only to about 9 kn', () => {
  it('a pod at the bow drops back astern when she goes faster, and comes up again when she slows', () => {
    // A moment well into a pod's visit.
    let t = 0;
    while (podVisit(t) === null || podVisit(t)! < 15) t += 1;
    const view = new WildlifeView();
    const boat = new THREE.Object3D();
    const listener = new THREE.Vector3();
    const dolphins = (view as unknown as { dolphins: THREE.InstancedMesh }).dolphins;
    const m = new THREE.Matrix4();
    const surfaced = () => {
      let n = 0;
      for (let j = 0; j < dolphins.count; j++) {
        dolphins.getMatrixAt(j, m);
        if (m.elements[0] !== 0) n++;
      }
      return n;
    };
    const run = (speed: number, seconds: number) => {
      let seen = 0;
      for (let k = 0; k < seconds * 30; k++) {
        view.update(t + k / 30, boat, speed, true, [], 0, listener);
        seen = Math.max(seen, surfaced());
      }
      t += seconds;
      return seen;
    };
    expect(run(4, 4)).toBeGreaterThan(0); // 7.8 kn: with her
    run(CONFIG.wildlife.dolphins.maxSpeed + 1, CONFIG.wildlife.dolphins.fallBack + 0.5); // 11 kn: falling back...
    expect(run(CONFIG.wildlife.dolphins.maxSpeed + 1, 4)).toBe(0); // ...and gone
    run(3, CONFIG.wildlife.dolphins.fallBack + 0.5); // slowed: they come up again
    expect(run(3, 4)).toBeGreaterThan(0);
  });
});
