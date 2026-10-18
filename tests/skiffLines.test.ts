/**
 * The skiff's lines (owner: a stern cleat too, so she can be tied up front and back, to the
 * ship or to the quay). Her bow and stern cleats are modules (deck.boat-cleat). A press on
 * either lets its line go if it's fast; else, at a free quay berth, makes it fast ashore;
 * else to the ship's nearest cleat in reach.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { gearOf } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { createWeather } from '../src/environment/weather';
import { berthAxis } from '../src/vessel/physics/mooring';
import { painterPlan } from '../src/vessel/physics/painter';
import { placeVessel } from '../src/vessel/vesselControl';
import { BERTHS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup(wind = 0, windFrom = 270) {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat', { tender: true });
  world.environment.waves = [];
  world.geography = 'archipelago';
  const w = (world.environment.weather = createWeather('Clear', 0));
  w.fixed = true;
  w.now = { ...w.now, wind, windFrom };
  w.target = { ...w.now };
  const boat = world.vessels[vesselId];
  const skiff = Object.values(world.vessels).find((v) => v.defId === 'skiff')!;
  skiff.tender!.phase = 'free';
  const send = (value: number) => stepWorld(world, [{ playerId: 'p', targetId: skiff.id, control: 'painter', value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, boat, skiff, send, run };
}

/** A berth with no one in it, and the skiff lying in it (slow, lined up), `off` m out from her mark. */
function atBerth(skiff: Parameters<typeof placeVessel>[0], off: number) {
  const b = BERTHS.find((x) => x.id === 'calder-fuel')!;
  const inshore = CONFIG.vessels.skiff.cleats.inshore;
  const x = b.x + b.shoreX * (inshore - off);
  const z = b.z + b.shoreZ * (inshore - off);
  placeVessel(skiff, x, 0, z, b.headingDeg);
  return { b, mark: { x: b.x + b.shoreX * inshore, z: b.z + b.shoreZ * inshore } };
}

describe("the skiff's cleats", () => {
  it('she has a bow cleat at her stem head and a stern cleat on her quarter', () => {
    const bow = gearOf({ defId: 'skiff' }, 'bowCleat')!;
    const stern = gearOf({ defId: 'skiff' }, 'sternCleat')!;
    expect(bow.z).toBeLessThan(-1.4);
    expect(stern.z).toBeGreaterThan(1.4);
    expect(stern.x).toBeLessThan(0); // on the quarter, clear of the outboard on her centreline
  });

  it('at a quay berth her bow and stern lines go ashore, and she lies alongside the quay', () => {
    const { world, skiff, send, run } = setup();
    const { mark, b } = atBerth(skiff, 1.5);
    // Far from the ship: her lines go ashore.
    expect(painterPlan(world, skiff, -1).action).toBe('ashore');
    send(-1);
    expect(skiff.mooring.bow).not.toBe(0);
    expect(skiff.mooring.phase).toBe('docking');
    send(-2);
    expect(skiff.mooring.stern).not.toBe(0);
    run(30);
    expect(skiff.mooring.phase).toBe('moored');
    // Alongside: her middle at the berth's mark brought in for her beam, lined up with it.
    const d = Math.hypot(skiff.position[0] - mark.x, skiff.position[2] - mark.z);
    expect(d).toBeLessThan(0.5);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...skiff.orientation));
    const a = berthAxis(b, skiff.mooring.reversed);
    expect(Math.abs(fwd.x * a.x + fwd.z * a.z)).toBeGreaterThan(0.98);
    // Her lines don't go to the ship as well, and a press lets each go.
    expect(skiff.tender!.painter).toBeUndefined();
    send(-1);
    send(-2);
    expect(skiff.mooring.phase).toBe('free');
  });

  it("in the ship's own berth her lines go to the ship, not ashore", () => {
    const { world, boat, skiff } = setup();
    atBerth(skiff, 0);
    Object.assign(boat.mooring, { phase: 'moored', berthId: 'calder-fuel', bow: 1, stern: 1 });
    expect(painterPlan(world, skiff, -1).action).not.toBe('ashore');
  });

  it('in a strong offshore breeze, moored by both ends she stays put; let go, she blows off', () => {
    // Calder quay faces west: an east wind blows her off it.
    const { skiff, send, run } = setup(14, 90);
    const { mark } = atBerth(skiff, 0);
    send(-1);
    send(-2);
    run(60);
    expect(Math.hypot(skiff.position[0] - mark.x, skiff.position[2] - mark.z)).toBeLessThan(1);
    send(-1);
    send(-2);
    run(30);
    expect(Math.hypot(skiff.position[0] - mark.x, skiff.position[2] - mark.z)).toBeGreaterThan(3);
  });

  it("away from a quay, her stern line goes to the ship's nearest cleat too: tied fore and aft alongside", () => {
    const { boat, skiff, send, run } = setup(10);
    // Alongside the ship's starboard side, abreast of her working deck, bow forward.
    placeVessel(boat, 0, 0, -300, 0);
    const q = new THREE.Quaternion(...boat.orientation);
    const at = new THREE.Vector3(3.4, 0, 2.5).applyQuaternion(q).add(new THREE.Vector3(...boat.position));
    placeVessel(skiff, at.x, 0, at.z, 0);
    send(-1);
    send(-2);
    expect(skiff.tender!.painter).toBeDefined();
    expect(skiff.tender!.sternPainter).toBeDefined();
    expect(skiff.tender!.sternPainter!.cleat).not.toBe(skiff.tender!.painter!.cleat);
    run(60);
    // Still alongside (the breeze blows her off; both lines hold her).
    const local = new THREE.Vector3(...skiff.position).sub(new THREE.Vector3(...boat.position)).applyQuaternion(q.clone().invert());
    expect(Math.hypot(local.x - 3.4, local.z - 2.5)).toBeLessThan(CONFIG.docking.painter.maxLength);
    expect(skiff.tender!.painter).toBeDefined();
    expect(skiff.tender!.sternPainter).toBeDefined();
  });
});

