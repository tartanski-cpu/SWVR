/**
 * The Shipyard's foiling ferry in the game (owner, 28 Oct 2026): her one electric pod
 * (modules/pods, one unit; physics/electricMotor.ts) lifting her onto her hydrofoils
 * (vessel/physics/foils.ts, through her lines' `foils`): on her hulls at low speed, flying level
 * over the hump at full ahead, the power at 25 kn that her figures give her range on, held down
 * on her hulls on HULL, and turning on her pod while she flies.
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { FOIL_FERRY } from '../../src/shipyard/parts/catalog';
import { placeVessel } from '../../src/vessel/vesselControl';

afterAll(() => useDesign(DEFAULT_DESIGN));

const ferry: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[FOIL_FERRY].defaults, hull: FOIL_FERRY };
const DT = 1 / 60;
const knots = (v: { linearVelocity: number[] }) => Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144;
const DEG = 180 / Math.PI;

/** Her out on calm open water, her motors switched on. */
function afloat() {
  useDesign(ferry);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  world.environment.waves = [];
  world.geography = 'openSea';
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      each?.();
    }
  };
  send('quickStart', 1);
  run(2);
  /** Her pitch (deg, bow up) and heel (deg, to starboard). */
  const attitude = () => {
    const q = new THREE.Quaternion(...v.orientation);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    return { pitch: Math.asin(fwd.y) * DEG, heel: -Math.asin(right.y) * DEG };
  };
  return { world, v, send, run, attitude };
}

describe('the foiling ferry on her pod and foils', () => {
  it('on her hulls at half ahead; flat out she climbs over the hump onto her foils, level, past 30 kn', () => {
    const { v, send, run, attitude } = afloat();
    send('lever', 0.5);
    run(30);
    expect(knots(v)).toBeGreaterThan(7);
    expect(knots(v)).toBeLessThan(13);
    expect(v.foil!.clear).toBeLessThan(0.3);
    send('lever', 1);
    let maxPitch = 0;
    run(40, () => (maxPitch = Math.max(maxPitch, attitude().pitch)));
    expect(v.foil!.engaged).toBe(1);
    expect(v.foil!.clear).toBe(1);
    expect(knots(v)).toBeGreaterThan(30);
    expect(Math.abs(attitude().pitch)).toBeLessThan(2);
    expect(Math.abs(attitude().heel)).toBeLessThan(1);
    // A steady climb, never leaping bow-up.
    expect(maxPitch).toBeLessThan(5);
    // Her two motors at their rated power, no more.
    expect(v.engine.powerKw!).toBeLessThan(200);
  });

  it('at 25 kn on her foils her battery gives what her figures say (her range: parts/solar.ts)', () => {
    const { v, send, run } = afloat();
    let lever = 0.75;
    send('lever', lever);
    run(25);
    let kw = 0;
    for (let t = 0; t < 60; t++) {
      run(1);
      lever += (25 - knots(v)) * 0.002;
      send('lever', lever);
      if (t >= 40) kw += v.engine.powerKw! / 20;
    }
    expect(knots(v)).toBeCloseTo(25, 0);
    expect(v.foil!.clear).toBe(1);
    const figure = buildDesign(ferry).figures.solar!.cruiseKw;
    expect(Math.abs(kw - figure) / figure, `${kw.toFixed(1)} kW against ${figure}`).toBeLessThan(0.1);
  });

  it('on HULL she stays down on her hulls at full power', () => {
    const { v, send, run } = afloat();
    v.controls.foilMode = 0;
    send('lever', 1);
    run(40);
    expect(v.foil!.engaged).toBe(0);
    expect(v.foil!.clear).toBeLessThan(0.5);
    expect(knots(v)).toBeLessThan(25);
  });

  it('turns on her pod while she flies, still flying, banked into the turn', () => {
    const { v, send, run, attitude } = afloat();
    send('lever', 0.8);
    run(35);
    expect(v.foil!.clear).toBe(1);
    send('helm', 0.5);
    let yaw = 0;
    run(10, () => (yaw += v.angularVelocity[1] * DT));
    expect(Math.abs(yaw) * DEG).toBeGreaterThan(20);
    expect(v.foil!.clear).toBeGreaterThan(0.9);
    // Banked into it (her bow swinging to starboard turns her about -y: heeled to starboard).
    expect(Math.sign(attitude().heel)).toBe(-Math.sign(yaw));
  });
});
