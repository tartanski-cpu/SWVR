import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld, type WorldState } from '../src/core/world';
import { submergedSection } from '../src/vessel/physics/sectionClip';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import type { VesselState } from '../src/vessel/vesselState';

const DT = 1 / 60;
const DEG = 180 / Math.PI;
const def = VESSEL_DEFS.workboat;

function setup(calm: boolean): { world: WorldState; vessel: VesselState } {
  const { world, vesselId } = createWorld(new IdFactory());
  if (calm) world.environment.waves = [];
  return { world, vessel: world.vessels[vesselId] };
}

function run(world: WorldState, seconds: number, each?: (t: number) => void) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    stepWorld(world, [], DT);
    each?.(world.time);
  }
}

/** Heel (deg, + = starboard down) and trim (deg, + = bow down) from the orientation. */
function attitude(v: VesselState) {
  const q = new THREE.Quaternion().fromArray(v.orientation);
  const stbd = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return { heel: -Math.asin(stbd.y) * DEG, trim: -Math.asin(fwd.y) * DEG };
}

const finite = (v: VesselState) =>
  [...v.position, ...v.orientation, ...v.linearVelocity, ...v.angularVelocity].every(Number.isFinite);

describe('hull hydrostatics', () => {
  it('displacement at the DWL matches the vessel mass (floats on her lines)', () => {
    const out = { area: 0, cx: 0, cy: 0, maxDepth: 0 };
    let volume = 0;
    for (const s of def.hull.stations) {
      submergedSection(s.polygon, s.polygon.map(([, y]) => -y), out);
      volume += out.area * s.weight;
    }
    expect((volume * CONFIG.ocean.density) / def.mass).toBeGreaterThan(0.98);
    expect((volume * CONFIG.ocean.density) / def.mass).toBeLessThan(1.02);
  });
});

describe('vessel dynamics (headless)', () => {
  it('settles level at the DWL in calm water', () => {
    const { world, vessel } = setup(true);
    placeVessel(vessel, 0, 0.3, 0, 0);
    run(world, 40);
    const a = attitude(vessel);
    expect(Math.abs(vessel.position[1])).toBeLessThan(0.05);
    expect(Math.abs(a.heel)).toBeLessThan(0.5);
    expect(Math.abs(a.trim)).toBeLessThan(1.0);
    expect(Math.hypot(...vessel.linearVelocity)).toBeLessThan(0.01);
  });

  it('dropped from 4 m it splashes down and settles without blowing up', () => {
    const { world, vessel } = setup(true);
    let maxRate = 0;
    run(world, 40, () => (maxRate = Math.max(maxRate, Math.hypot(...vessel.angularVelocity))));
    expect(finite(vessel)).toBe(true);
    expect(maxRate).toBeLessThan(3); // rad/s: no wild spinning
    expect(Math.abs(vessel.position[1])).toBeLessThan(0.05);
    expect(Math.abs(attitude(vessel).heel)).toBeLessThan(0.5);
  });

  it('heeled 15 deg and released: rolls back with a plausible period and decays', () => {
    const { world, vessel } = setup(true);
    placeVessel(vessel, 0, 0, 0, 0, 15);
    const crossings: number[] = [];
    let prev = attitude(vessel).heel;
    let peakLate = 0;
    run(world, 20, (t) => {
      const h = attitude(vessel).heel;
      if (prev > 0 !== h > 0) crossings.push(t);
      prev = h;
      if (t > 12) peakLate = Math.max(peakLate, Math.abs(h));
    });
    const period = 2 * (crossings[2] - crossings[1]);
    expect(period).toBeGreaterThan(2.5);
    expect(period).toBeLessThan(5);
    expect(peakLate).toBeLessThan(5); // well damped after a few cycles
  });

  it('develops a righting moment at large heel (positive GZ at 45 deg)', () => {
    const { world, vessel } = setup(true);
    placeVessel(vessel, 0, 0, 0, 0, 45);
    run(world, 0.2);
    // Heel to starboard (+) must start to reduce: roll rate opposes the heel.
    expect(attitude(vessel).heel).toBeLessThan(45);
  });

  it('rides 2 minutes of waves upright, stable and on station', () => {
    const { world, vessel } = setup(false);
    placeVessel(vessel, 0, 0, 0, 90);
    let maxHeel = 0;
    run(world, 120, () => (maxHeel = Math.max(maxHeel, Math.abs(attitude(vessel).heel))));
    expect(finite(vessel)).toBe(true);
    expect(maxHeel).toBeLessThan(25);
    expect(Math.hypot(vessel.position[0], vessel.position[2])).toBeLessThan(30);
  });

  it('vessel state stays JSON-serializable', () => {
    const { world } = setup(false);
    run(world, 1);
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });
});

describe('prop walk (right-handed prop)', () => {
  const swing = (lever: number) => {
    const { world, vessel } = setup(true);
    placeVessel(vessel, 0, 0, 0, 0);
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: vessel.id, control, value }], DT);
    send('engineStartStop', 1);
    run(world, 3);
    send('lever', lever);
    run(world, 12);
    const q = new THREE.Quaternion().fromArray(vessel.orientation);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    return (Math.atan2(f.x, -f.z) * 180) / Math.PI; // heading change from north, + = to starboard
  };

  it('going astern from rest with the wheel amidships, the stern walks to port (bow swings to starboard)', () => {
    expect(swing(-0.6)).toBeGreaterThan(5);
  });

  it('the effect ahead is much smaller and the other way', () => {
    const ahead = swing(0.6);
    expect(ahead).toBeLessThan(0);
    expect(Math.abs(ahead)).toBeLessThan(Math.abs(swing(-0.6)));
  });
});
