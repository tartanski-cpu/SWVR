import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { launchPoint, launchTime, recoverCheck } from '../src/vessel/tenderCrane';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { hullPlan } from '../src/vessel/layout';
import * as THREE from 'three';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat', { tender: true });
  world.environment.waves = [];
  world.geography = 'openSea';
  const boat = world.vessels[vesselId];
  const skiff = Object.values(world.vessels).find((v) => v.defId === 'skiff')!;
  const send = (control: string, value: number) => {
    const i: Intent = { playerId: 'p', targetId: skiff.id, control, value };
    stepWorld(world, [i], DT);
  };
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      each?.();
    }
  };
  return { world, boat, skiff, send, run };
}

describe('the tender crane', () => {
  const crane = VESSEL_DEFS.workboat.tenderCrane!;
  /** Her origin in the workboat's axes. */
  const local = (boat: { position: number[]; orientation: number[] }, skiff: { position: number[] }) =>
    new THREE.Vector3(...(skiff.position as [number, number, number])).sub(new THREE.Vector3(...(boat.position as [number, number, number]))).applyQuaternion(new THREE.Quaternion(...(boat.orientation as [number, number, number, number])).invert());

  it('the launch path: up out of the cradle clear of the rails, round over the bow, down alongside', () => {
    const plan = hullPlan(VESSEL_DEFS.workboat);
    const p = new THREE.Vector3();
    const T = launchTime(crane);
    expect(launchPoint(crane, 0, p).toArray()).toEqual(crane.stow);
    // Slewing, she stays high enough for her keel (0.14 m under her origin) to clear the rail
    // wherever she is over the hull, and never comes over the wheelhouse.
    for (let t = crane.rigTime + crane.hoistTime; t <= crane.rigTime + crane.hoistTime + crane.slewTime; t += 0.1) {
      launchPoint(crane, t, p);
      const overHull = p.z > plan.stem && p.z < plan.transom && Math.abs(p.x) < plan.halfBeam(p.z) + 0.8;
      if (overHull) expect(p.y - 0.14).toBeGreaterThan(plan.deckY(p.z) + VESSEL_DEFS.workboat.layout.railHeight);
      // Her transom (1.8 m aft of her origin) stays forward of the wheelhouse unless she's
      // already outboard of it (her inboard side, 0.8 m from her centreline, beyond its side).
      const wh = VESSEL_DEFS.workboat.layout.wheelhouse!;
      if (p.x - 0.8 < wh.halfWidth) expect(p.z + 1.8).toBeLessThan(wh.front);
    }
    // At the water: alongside the starboard bow, clear of the hull (her half-beam is 0.8 m).
    launchPoint(crane, T, p);
    expect(p.y).toBeCloseTo(crane.waterY, 6);
    expect(p.x - 0.8).toBeGreaterThan(plan.halfBeam(p.z));
  });

  it('one press launches her: hoisted, slewed out, lowered to the water, then afloat on her own', () => {
    const { world, boat, skiff, send, run } = setup();
    run(1);
    send('crane', 1);
    expect(skiff.tender?.phase).toBe('lowering');
    run(crane.rigTime - 0.2);
    expect(local(boat, skiff).distanceTo(new THREE.Vector3(...crane.stow))).toBeLessThan(1e-6); // rigging: still in the cradle
    run(crane.hoistTime + 0.25);
    expect(local(boat, skiff).y).toBeGreaterThan(crane.stow[1] + crane.clear - 0.05); // up out of the cradle
    run(launchTime(crane) - crane.hoistTime + 0.2);
    expect(skiff.tender?.phase).toBe('free');
    run(4);
    // Floating near her waterline, off the starboard bow.
    expect(Math.abs(skiff.position[1])).toBeLessThan(0.2);
    expect(local(boat, skiff).x).toBeGreaterThan(2.5);
    expect(world.vessels[skiff.id]).toBe(skiff);
  });

  it('recovers her only when alongside the starboard bow and slow; back in the cradle, the crew step out', () => {
    const { world, boat, skiff, send, run } = setup();
    send('crane', 1);
    run(launchTime(crane) + 2);
    // Far away: refused.
    const bx = boat.position[0];
    const bz = boat.position[2];
    placeVessel(skiff, bx + 30, 0, bz, 0);
    run(1);
    send('crane', 1);
    expect(skiff.tender?.phase).toBe('free');
    // Back alongside, 1.5 m from the outboard spot, with a player aboard.
    const spot = new THREE.Vector3(crane.outboard[0] + 1.5, 0, crane.outboard[1]).applyQuaternion(new THREE.Quaternion(...boat.orientation)).add(new THREE.Vector3(...boat.position));
    placeVessel(skiff, spot.x, 0, spot.z, 90);
    run(0.5);
    const player = Object.values(world.players)[0];
    player.aboardVesselId = skiff.id;
    player.position = [0, 0.3, 0.5];
    expect(recoverCheck(world, skiff).ok).toBe(true);
    send('crane', 1);
    expect(skiff.tender?.phase).toBe('hoisting');
    run(crane.alignTime + launchTime(crane) + 0.2);
    expect(skiff.tender?.phase).toBe('stowed');
    expect(local(boat, skiff).distanceTo(new THREE.Vector3(...crane.stow))).toBeLessThan(1e-6);
    expect(player.aboardVesselId).toBe(boat.id);
    // Standing on the foredeck beside the cradle, on the deck.
    const plan = hullPlan(VESSEL_DEFS.workboat);
    expect(player.position[1]).toBeCloseTo(plan.deckY(player.position[2]), 6);
  });
});

describe('the skiff', () => {
  it('comes in her cradle on the workboat\'s foredeck, riding with her, with a full battery', () => {
    const { boat, skiff, run } = setup();
    expect(VESSEL_DEFS[skiff.defId].outboard).toBeTruthy();
    expect(skiff.battery).toBe(1);
    expect(skiff.tender?.phase).toBe('stowed');
    run(3);
    const stow = VESSEL_DEFS[boat.defId].tenderCrane!.stow;
    const local = new THREE.Vector3(...skiff.position).sub(new THREE.Vector3(...boat.position)).applyQuaternion(new THREE.Quaternion(...boat.orientation).invert());
    expect(local.distanceTo(new THREE.Vector3(...stow))).toBeLessThan(1e-6);
  });

  it('charges in the cradle', () => {
    const { skiff, run } = setup();
    skiff.battery = 0.5;
    run(30);
    expect(skiff.battery).toBeGreaterThan(0.5);
  });

  it('gives no thrust with the motor off or in neutral; shifting closes the throttle', () => {
    const { skiff, send, run } = setup();
    placeVessel(skiff, 0, 0, 200, 0);
    const speed = () => Math.hypot(skiff.linearVelocity[0], skiff.linearVelocity[2]);
    send('lever', 1); // motor off
    run(3);
    expect(speed()).toBeLessThan(0.1);
    send('obPower', 1); // on, still neutral
    send('lever', 1);
    run(3);
    expect(speed()).toBeLessThan(0.1);
    send('obGear', -1);
    expect(skiff.controls.lever).toBe(0); // shifting closes the throttle
    send('lever', 1);
    run(3);
    expect(skiff.linearVelocity[2]).toBeGreaterThan(0.3); // astern (forward is -z at heading 0)
    send('obPower', 0); // toggles off
    expect(skiff.controls.obOn).toBe(0);
  });

  it('drives on its outboard; the throttle drains the battery; the tiller turns it', () => {
    const { skiff, send, run } = setup();
    placeVessel(skiff, 0, 0, 200, 0); // heading north, well clear of the workboat
    send('obPower', 1);
    send('obGear', 1);
    send('lever', 1);
    run(10);
    const speed = Math.hypot(skiff.linearVelocity[0], skiff.linearVelocity[2]);
    expect(speed * 1.944).toBeGreaterThan(4.5);
    expect(skiff.battery!).toBeLessThan(1);
    const [qx, qy, qz, qw] = skiff.orientation;
    const h0 = Math.atan2(-(2 * (qx * qz + qw * qy)), (1 - 2 * (qx * qx + qy * qy)));
    send('helm', 1);
    run(3);
    const [rx, ry, rz, rw] = skiff.orientation;
    const h1 = Math.atan2(-(2 * (rx * rz + rw * ry)), (1 - 2 * (rx * rx + ry * ry)));
    // Heading toward starboard (clockwise seen from above).
    expect(skiff.angularVelocity[1]).toBeLessThan(0);
    expect(h1).not.toBeCloseTo(h0, 1);
  });

  it('no battery, no thrust', () => {
    const { skiff, send, run } = setup();
    placeVessel(skiff, 0, 0, 200, 0);
    skiff.battery = 0;
    send('obPower', 1);
    send('obGear', 1);
    send('lever', 1);
    run(5);
    expect(Math.hypot(skiff.linearVelocity[0], skiff.linearVelocity[2])).toBeLessThan(0.2);
  });

  it('bumps off the workboat instead of going through her', () => {
    const { boat, skiff, send, run } = setup();
    placeVessel(boat, 0, 0, 0, 0); // heading north
    // Skiff 6 m to starboard, heading west, straight at the workboat's side, full throttle.
    placeVessel(skiff, 6, 0, 0, 270);
    send('obPower', 1);
    send('obGear', 1);
    send('lever', 1);
    const plan = hullPlan(VESSEL_DEFS[boat.defId]);
    const qb = new THREE.Quaternion();
    const qs = new THREE.Quaternion();
    const p = new THREE.Vector3();
    let deepest = 0;
    let touched = false;
    run(8, () => {
      qb.fromArray(boat.orientation).invert();
      qs.fromArray(skiff.orientation);
      for (const st of VESSEL_DEFS.skiff.hull.stations) {
        for (const k of [0, 4]) {
          const [x, y] = st.polygon[k];
          p.set(x, y, st.z).applyQuaternion(qs).add(new THREE.Vector3(...skiff.position)).sub(new THREE.Vector3(...boat.position)).applyQuaternion(qb);
          if (p.z > plan.transom || p.z < plan.stem) continue;
          const depth = plan.halfBeam(p.z) - Math.abs(p.x);
          if (depth > -0.05) touched = true;
          deepest = Math.max(deepest, depth);
        }
      }
    });
    expect(touched).toBe(true);
    // Fender-soft: in by a few centimetres at most, never through.
    expect(deepest).toBeLessThan(0.15);
  });
});
