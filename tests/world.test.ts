import { describe, expect, it } from 'vitest';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { CONFIG } from '../src/config';
import { prepareWaves, surfaceHeight } from '../src/ocean/waves';
import { canRefuel, placeVessel } from '../src/vessel/vesselControl';
import { BLOCKS, CUTS, ISLANDS, PORTS } from '../src/world/archipelago';
import { blockContact } from '../src/world/geography';
import { groundHeight } from '../src/world/terrain';
import { shelterFactor } from '../src/world/shelter';

const DT = 1 / 60;

function boatAt(x: number, z: number, headingDeg: number, calm = true) {
  const { world, vesselId } = createWorld(new IdFactory());
  if (calm) world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, x, 0, z, headingDeg);
  const send = (control: string, value: number) => {
    const intent: Intent = { playerId: 't', targetId: v.id, control, value };
    stepWorld(world, [intent], DT);
  };
  const run = (seconds: number, each?: () => void) => {
    for (let i = 0; i < seconds / DT; i++) {
      stepWorld(world, [], DT);
      each?.();
    }
  };
  const start = () => {
    send('lever', 0);
    send('engineStartStop', 1);
    run(3);
  };
  const speed = () => Math.hypot(v.linearVelocity[0], v.linearVelocity[2]);
  return { world, v, send, run, start, speed };
}

describe('terrain', () => {
  it('islands rise above the sea, open water is deep, the start is clear', () => {
    // Each island's high ground: the highest point near its middle (a fjord may run through the
    // very middle of a mountain mass).
    for (const isl of ISLANDS) {
      let top = -Infinity;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) top = Math.max(top, groundHeight(isl.x + (a * isl.radius) / 5, isl.z + (b * isl.radius) / 5));
      expect(top).toBeGreaterThan(isl.height * 0.5);
    }
    expect(groundHeight(0, 0)).toBeLessThan(-30);
    expect(groundHeight(0, -22)).toBeLessThan(-30);
  });

  it('basins and bays are dredged to their depth', () => {
    for (const c of CUTS) expect(groundHeight(c.x, c.z)).toBeCloseTo(-c.depth, 0);
  });

  it('a quay is solid and pushes out through its nearest face', () => {
    const q = BLOCKS.find((b) => b.kind === 'quay')!;
    // Just inside the west (seaward) face of the Calder quay: pushed west.
    const hit = { depth: 0, nx: 0, ny: 0, nz: 0, fendered: false };
    expect(blockContact(q.x - q.halfWidth + 0.1, 0, q.z, hit)).toBe(true);
    expect(hit.nx).toBeCloseTo(-1);
    expect(hit.depth).toBeCloseTo(0.1);
    expect(hit.fendered).toBe(true);
    expect(blockContact(q.x - q.halfWidth - 0.1, 0, q.z, hit)).toBe(false);
  });
});

describe('sheltered water', () => {
  it('waves inside Calder Haven are a small fraction of those outside', () => {
    const basin = CUTS[0];
    expect(shelterFactor(basin.x, basin.z)).toBeLessThan(0.1);
    expect(shelterFactor(0, 0)).toBe(1);
    let inside = 0;
    let outside = 0;
    for (let t = 0; t < 60; t += 0.5) {
      const w = prepareWaves(CONFIG.ocean.waves, t);
      inside = Math.max(inside, Math.abs(surfaceHeight(w, basin.x, basin.z)));
      outside = Math.max(outside, Math.abs(surfaceHeight(w, 300, 0)));
    }
    expect(inside).toBeLessThan(0.15 * outside);
  });
});

describe('grounding and collisions', () => {
  it('running onto Brannock at full speed stops the boat on the shore without passing through or blowing up', () => {
    const isl = ISLANDS.find((i) => i.name === 'Brannock')!;
    // 250 m north of the island centre, heading south at it.
    const b = boatAt(isl.x, isl.z - 250, 180);
    b.start();
    b.send('lever', 1);
    let maxContact = 0;
    b.run(120, () => (maxContact = Math.max(maxContact, b.v.contact.force)));
    expect(maxContact).toBeGreaterThan(1e4);
    expect(b.speed()).toBeLessThan(1.5); // pinned against the beach, prop still pushing
    const [x, y, z] = b.v.position;
    expect(Number.isFinite(x + y + z)).toBe(true);
    // Still near the coast, not driven inland.
    const dist = Math.hypot(x - isl.x, z - isl.z);
    expect(dist).toBeGreaterThan(isl.radius * 0.8);
    b.send('lever', 0);
    b.run(10);
    expect(b.v.contact.force).toBeGreaterThan(0); // aground
  });

  it('hitting the side of Brannock pier bounces off, never through it', () => {
    const pier = BLOCKS.find((p) => p.kind === 'pier')!;
    // Approach the pier's north-west side square on, from 40 m off, at about 4 kn.
    const a = (pier.yawDeg * Math.PI) / 180;
    const nx = -Math.cos(a); // left of the axis (bearing yaw - 90)
    const nz = -Math.sin(a);
    const b = boatAt(pier.x + nx * 40, pier.z + nz * 40, (pier.yawDeg + 90) % 360);
    b.start();
    b.send('lever', 0.35);
    let minGap = Infinity;
    b.run(60, () => {
      const [x, , z] = b.v.position;
      const across = (x - pier.x) * nx + (z - pier.z) * nz;
      minGap = Math.min(minGap, across - pier.halfWidth);
    });
    // The centreline never gets closer than ~half a beam to the pier face.
    expect(minGap).toBeGreaterThan(1.2);
  });
});

describe('anchor', () => {
  const bay = PORTS.find((p) => p.kind === 'anchorage')!;

  it('lets go in Selkie Bay, pays out scope for the depth and holds against the engine astern', () => {
    const b = boatAt(bay.x, bay.z + 20, 180);
    b.start();
    b.send('anchor', 1);
    b.run(30);
    const a = b.v.anchor;
    expect(a.phase).toBe('set');
    const depth = -groundHeight(a.x, a.z);
    expect(a.rodeM).toBeGreaterThan(3 * depth);
    // Gentle astern: the chain comes taut and holds.
    b.send('lever', -0.3);
    b.run(60);
    const dist = Math.hypot(b.v.position[0] - a.x, b.v.position[2] - a.z);
    expect(dist).toBeLessThan(a.rodeM + 8);
    expect(a.tension).toBeGreaterThan(500);
    expect(a.dragging).toBe(false);
  });

  it('weighs: the windlass heaves the boat up to the anchor and stows it', () => {
    const b = boatAt(bay.x, bay.z + 20, 180);
    b.start();
    b.send('anchor', 1);
    b.run(30);
    b.send('anchor', 0);
    b.run(240);
    expect(b.v.anchor.phase).toBe('stowed');
    expect(b.v.anchor.rodeM).toBe(0);
  });

  it('in 40 m all the chain goes out at a poor scope, and it drags easily', () => {
    const b = boatAt(0, -22, 90);
    b.start();
    b.send('anchor', 1);
    b.run(40);
    expect(b.v.anchor.phase).toBe('set');
    expect(b.v.anchor.rodeM).toBe(60);
    b.send('lever', -0.6);
    let dragged = false;
    b.run(60, () => (dragged ||= b.v.anchor.dragging));
    expect(dragged).toBe(true);
  });
});

describe('refuelling', () => {
  const port = PORTS.find((p) => p.id === 'calder')!;

  it('fills the tank alongside the fuel berth, and stops when the boat leaves', () => {
    // Alongside the quay face, bow north.
    const b = boatAt(port.fuel!.x + 1, port.fuel!.z, 0);
    b.run(5);
    expect(canRefuel(b.v)).toBe(true);
    b.send('debugFuel', 50);
    b.send('refuel', 1);
    b.run(20);
    expect(b.v.engine.fuelL).toBeGreaterThan(90);
    expect(b.v.refuelling).toBe(true);
    // Moving the boat away ends it.
    placeVessel(b.v, 0, 0, -22, 0);
    b.run(1);
    expect(b.v.refuelling).toBe(false);
  });

  it('is refused away from a fuel berth', () => {
    const b = boatAt(0, -22, 0);
    expect(canRefuel(b.v)).toBe(false);
    b.send('refuel', 1);
    b.run(1);
    expect(b.v.refuelling).toBe(false);
  });
});

describe('sea states', () => {
  it('a building sea gets bigger and steeper, but crests never loop (Σ Q·k·A < 1)', async () => {
    const { seaStateWaves } = await import('../src/environment/environmentState');
    const { crestLoopFactor, significantWaveHeight } = await import('../src/ocean/waves');
    const m = seaStateWaves(1);
    const storm = seaStateWaves(2.6);
    expect(significantWaveHeight(storm)).toBeCloseTo(2.6 * significantWaveHeight(m), 6);
    expect(crestLoopFactor(storm)).toBeGreaterThan(crestLoopFactor(m));
    expect(crestLoopFactor(seaStateWaves(3))).toBeLessThan(0.5);
    expect(seaStateWaves(0)).toEqual([]);
  });

  it('the boat rides out a storm sea under way without blowing up or capsizing', () => {
    const b = boatAt(0, -22, 45, false);
    b.world.environment.seaScale = 2.6;
    b.send('seaState', 2.6);
    b.start();
    b.send('lever', 0.5);
    let maxHeel = 0;
    b.run(90, () => {
      const q = b.v.orientation;
      // Body up-vector's world y: cos of the total tilt.
      const upY = 1 - 2 * (q[0] * q[0] + q[2] * q[2]);
      maxHeel = Math.max(maxHeel, (Math.acos(Math.min(1, upY)) * 180) / Math.PI);
    });
    expect(Number.isFinite(b.v.position[0] + b.v.position[1] + b.v.position[2])).toBe(true);
    expect(maxHeel).toBeLessThan(60);
  });
});
