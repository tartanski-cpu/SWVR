import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { createWeather } from '../src/environment/weather';
import { cleatLocal, skiffCleatLocal } from '../src/vessel/physics/painter';
import { launchTime, stowTender } from '../src/vessel/tenderCrane';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import type { VesselState } from '../src/vessel/vesselState';
import { startEngine } from './helpers/engine';

const DT = 1 / 60;

function setup(wind: number) {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat', { tender: true });
  world.environment.waves = [];
  world.geography = 'openSea';
  const w = (world.environment.weather = createWeather('Clear', 0));
  w.fixed = true;
  // A strong breeze from the port beam: it blows her away from the ship's starboard side.
  w.now = { ...w.now, wind, windFrom: 270 };
  w.target = { ...w.now };
  const boat = world.vessels[vesselId];
  const skiff = Object.values(world.vessels).find((v) => v.defId === 'skiff')!;
  placeVessel(boat, boat.position[0], 0, boat.position[2], 0); // heading north: starboard is east
  startEngine(world, boat);
  stowTender(world, skiff, boat.id); // back in her cradle on the turned ship
  const send = (targetId: string, control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const launch = () => {
    send(skiff.id, 'crane', 1);
    run(launchTime(CONFIG.vessels.workboat.tenderCrane) + 1);
  };
  return { world, boat, skiff, send, run, launch };
}

const world = (v: VesselState, local: readonly number[]) =>
  new THREE.Vector3(local[0], local[1], local[2]).applyQuaternion(new THREE.Quaternion().fromArray(v.orientation)).add(new THREE.Vector3().fromArray(v.position));

/** Her bow cleat to the ship's cleat `i` (m). */
const span = (boat: VesselState, skiff: VesselState, i: number) => world(boat, cleatLocal(VESSEL_DEFS.workboat, i)!).distanceTo(world(skiff, skiffCleatLocal(VESSEL_DEFS.skiff)));

// Room for the long runs: about twice as slow on GitHub's publishing machine, past the 20 s default.
describe("the skiff's painter", { timeout: 60000 }, () => {
  it('launched, she is on the forward starboard cleat and lies to it in a blow', () => {
    const { boat, skiff, run, launch } = setup(14);
    launch();
    expect(skiff.tender!.phase).toBe('free');
    expect(skiff.tender!.painter?.cleat).toBe(1);
    run(90);
    const p = skiff.tender!.painter!;
    expect(p).toBeTruthy();
    // Held: no further off than the painter (plus the little it stretches).
    expect(span(boat, skiff, 1)).toBeLessThan(p.length + 0.3);
  });

  it('without it she blows away', () => {
    const { boat, skiff, send, run, launch } = setup(14);
    launch();
    send(skiff.id, 'painter', -1); // let go
    expect(skiff.tender!.painter).toBeUndefined();
    run(90);
    expect(span(boat, skiff, 1)).toBeGreaterThan(CONFIG.docking.painter.maxLength + 5);
  });

  it('led to the midship cleat (the nearer of her free lines), and made fast again from her bow cleat', () => {
    const { boat, skiff, send, run, launch } = setup(0);
    launch();
    // Her painter's fast forward: the midship cleat takes her free stern line (in reach of it).
    send(skiff.id, 'painter', 5);
    expect(skiff.tender!.painter?.cleat).toBe(1);
    expect(skiff.tender!.sternPainter?.cleat).toBe(5);
    // Let both go (from her own cleats).
    send(skiff.id, 'painter', -2);
    send(skiff.id, 'painter', -1);
    expect(skiff.tender!.painter).toBeUndefined();
    expect(skiff.tender!.sternPainter).toBeUndefined();
    // Bring her bow alongside the working deck (as if she'd been walked aft on it).
    const [cx, , cz] = cleatLocal(VESSEL_DEFS.workboat, 5)!;
    const bowZ = skiffCleatLocal(VESSEL_DEFS.skiff)[2];
    const at = world(boat, [cx + 1.5, 0, cz - bowZ]);
    skiff.position = [at.x, skiff.position[1], at.z];
    skiff.orientation = [...boat.orientation];
    skiff.linearVelocity = [0, 0, 0];
    skiff.angularVelocity = [0, 0, 0];
    // Both free: the nearer end, her bow, is led there.
    send(skiff.id, 'painter', 5);
    expect(skiff.tender!.painter?.cleat).toBe(5);
    run(20);
    expect(span(boat, skiff, 5)).toBeLessThan(skiff.tender!.painter!.length + 0.3);
    // Let go from the midship cleat, then from her own: nearest cleat in reach.
    send(skiff.id, 'painter', 5);
    expect(skiff.tender!.painter).toBeUndefined();
    send(skiff.id, 'painter', -1);
    // The nearest in reach: she lies alongside the working deck, between midship and aft cleats.
    const c = skiff.tender!.painter?.cleat;
    expect(c === 3 || c === 5).toBe(true);
    expect(span(boat, skiff, c!)).toBeLessThanOrEqual(Math.min(span(boat, skiff, 3), span(boat, skiff, 5)) + 1e-9);
  });

  it('comes off when she is hoisted back aboard', () => {
    const { skiff, send, launch } = setup(0);
    launch();
    send(skiff.id, 'crane', 1);
    expect(skiff.tender!.phase).toBe('hoisting');
    expect(skiff.tender!.painter).toBeUndefined();
  });
});

describe("a Shipyard design's skiff's painter (owner: a midship cleat for it)", { timeout: 60000 }, () => {
  it('launched from her crane, then led to her midship cleat and held there', async () => {
    const { useDesign } = await import('../src/boats/sims');
    const { DEFAULT_DESIGN } = await import('../src/shipyard/design');
    const { DESIGN_HULLS } = await import('../src/shipyard/build');
    // The workboat type, her house forward, the skiff on her aft deck to starboard.
    useDesign({ ...DEFAULT_DESIGN, hull: 2, ...DESIGN_HULLS[2].defaults, guard: 0, housePos: 1, skiff: 3 });
    const { world: w, vesselId } = createWorld(new IdFactory(), 'design', { tender: true });
    w.environment.waves = [];
    w.geography = 'openSea';
    const boat = w.vessels[vesselId];
    const skiff = Object.values(w.vessels).find((v) => v.defId === 'skiff')!;
    placeVessel(boat, boat.position[0], 0, boat.position[2], 0);
    startEngine(w, boat);
    stowTender(w, skiff, boat.id);
    const send = (control: string, value: number) => stepWorld(w, [{ playerId: 'p', targetId: skiff.id, control, value } as Intent], DT);
    const run = (s: number) => {
      for (let i = 0; i < s / DT; i++) stepWorld(w, [], DT);
    };
    send('crane', 1);
    run(launchTime(CONFIG.vessels.workboat.tenderCrane) + 1);
    expect(skiff.tender!.phase).toBe('free');
    // Her bow brought alongside the starboard midship cleat, the painter led to it.
    const mid = cleatLocal(VESSEL_DEFS.design, 5)!;
    const bowZ = skiffCleatLocal(VESSEL_DEFS.skiff)[2];
    const at = world(boat, [mid[0] + 1.5, 0, mid[2] - bowZ]);
    skiff.position = [at.x, skiff.position[1], at.z];
    skiff.orientation = [...boat.orientation];
    skiff.linearVelocity = [0, 0, 0];
    skiff.angularVelocity = [0, 0, 0];
    send('painter', 5);
    expect(skiff.tender!.painter?.cleat).toBe(5);
    run(20);
    const d = world(boat, mid).distanceTo(world(skiff, skiffCleatLocal(VESSEL_DEFS.skiff)));
    expect(d).toBeLessThan(skiff.tender!.painter!.length + 0.3);
  });
});
