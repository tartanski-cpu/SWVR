import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { cargoPaused, nearestPort, runStatus } from '../src/rescue/rescue';
import { placeVessel } from '../src/vessel/vesselControl';
import { hullPlan } from '../src/vessel/layout';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { PORTS } from '../src/world/archipelago';
import { groundHeight } from '../src/world/terrain';

const DT = 1 / 60;
const chance0 = CONFIG.rescue.chance;
afterEach(() => {
  (CONFIG.rescue as { chance: number }).chance = chance0;
});

function setup(chance: number) {
  (CONFIG.rescue as { chance: number }).chance = chance;
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  const calder = PORTS.find((p) => p.id === 'calder')!;
  const brannock = PORTS.find((p) => p.id === 'brannock')!;
  const send = (control: string, value = 1, ref?: string) => {
    const i: Intent = { playerId: 'p', targetId: v.id, control, value, ref };
    stepWorld(world, [i], DT);
  };
  /** Put the boat at a point (heading toward Brannock), still; one tick. */
  const at = (x: number, z: number) => {
    const hdg = ((Math.atan2(brannock.x - x, -(brannock.z - z)) * 180) / Math.PI + 360) % 360;
    placeVessel(v, x, 0, z, hdg);
    stepWorld(world, [], DT);
  };
  const loadFor = (to: string) => {
    world.cargo.t1 = { id: 't1', kind: 0, mass: 40, from: 'calder', to, at: { vessel: v.id, pos: [0.6, plan.deckY(3.5), 3.5], yaw: 0, vel: [0, 0], lashed: true } };
  };
  /** Steam from Calder toward Brannock in 50 m hops until something happens or we arrive. */
  const steam = () => {
    for (let k = 0; k <= 40; k++) {
      const f = k / 40;
      at(calder.x + (brannock.x - calder.x) * f, calder.z + (brannock.z - calder.z) * f);
      if (world.rescue!.active) return f;
    }
    return null;
  };
  return { world, v, calder, brannock, send, at, loadFor, steam };
}

describe('rescue: cargo runs and distress calls', () => {
  it('a cargo run starts on leaving harbour with cargo for another port; at chance 1 a call comes partway', () => {
    const { world, calder, at, loadFor, steam } = setup(1);
    at(calder.x, calder.z);
    expect(runStatus(world)).toBe('No cargo aboard');
    loadFor('brannock');
    at(calder.x, calder.z);
    expect(world.rescue!.lastPort).toBe('calder');
    expect(world.rescue!.run).toBeNull();
    expect(runStatus(world)).toBe('Cargo for Brannock Pier: loaded, head out');
    const f = steam()!;
    expect(f).toBeGreaterThan(0.15);
    expect(f).toBeLessThan(0.8);
    expect(world.rescue!.run).toMatchObject({ from: 'calder', to: 'brannock' });
    const inc = world.rescue!.active!;
    expect(inc.phase).toBe('calling');
    expect(world.rescue!.radio?.kind).toBe('distress');
    expect(world.rescue!.radio?.text).toMatch(/MAYDAY|PAN-PAN/);
    // In open water, clear of the ports.
    expect(groundHeight(inc.x, inc.z)).toBeLessThan(-CONFIG.rescue.minDepth);
    expect(nearestPort(inc.x, inc.z).dist).toBeGreaterThan(CONFIG.rescue.minPortDistance - 1);
    expect(runStatus(world)).toMatch(/handset/);
  });

  it('the incident is ahead of the boat, a short way off her route toward the destination', () => {
    const { world, v, brannock, loadFor, at, calder, steam } = setup(1);
    loadFor('brannock');
    at(calder.x, calder.z);
    steam();
    const inc = world.rescue!.active!;
    const [bx, , bz] = v.position;
    const tx = brannock.x - bx;
    const tz = brannock.z - bz;
    const len = Math.hypot(tx, tz);
    const along = ((inc.x - bx) * tx + (inc.z - bz) * tz) / len;
    const off = Math.abs(((inc.x - bx) * -tz + (inc.z - bz) * tx) / len);
    expect(along).toBeGreaterThan(CONFIG.rescue.ahead[0] * 0.8);
    expect(off).toBeLessThan(CONFIG.rescue.offset[1] + 1);
  });

  it('no cargo or chance 0: no call; one call at most per run', () => {
    const a = setup(1);
    a.at(a.calder.x, a.calder.z);
    expect(a.steam()).toBeNull(); // no cargo aboard
    const b = setup(0);
    b.loadFor('brannock');
    b.at(b.calder.x, b.calder.z);
    expect(b.steam()).toBeNull();
  });

  it('picking up the handset accepts: the cargo run pauses, and resumes when the rescue is over', () => {
    const { world, send, loadFor, at, calder, steam } = setup(1);
    loadFor('brannock');
    at(calder.x, calder.z);
    steam();
    send('rescueHandset', 1);
    expect(world.rescue!.active!.phase).toBe('accepted');
    expect(world.rescue!.radio?.text).toMatch(/Thanks, skipper\. Your cargo client has been told/);
    expect(cargoPaused(world)).toBe(true);
    expect(runStatus(world)).toMatch(/paused/);
    send('rescueDebugComplete');
    expect(world.rescue!.active).toBeNull();
    expect(world.rescue!.completed).toBe(1);
    expect(cargoPaused(world)).toBe(false);
    expect(runStatus(world)).toBe('Cargo run to Brannock Pier');
    expect(world.rescue!.radio?.kind).toBe('info');
  });

  it("an unanswered call goes away by itself (declining is fine)", () => {
    const { world, send, v } = setup(1);
    placeVessel(v, 0, 0, -400, 0);
    send('rescueDebugTrigger');
    expect(world.rescue!.active?.phase).toBe('calling');
    for (let i = 0; i < (CONFIG.rescue.callTimeout + 1) / DT; i++) stepWorld(world, [], DT);
    expect(world.rescue!.active).toBeNull();
    expect(world.rescue!.radio?.kind).toBe('info');
  });

  it('targets lie inside the search area (not at its centre) and drift slowly', () => {
    const { world, send, v } = setup(1);
    placeVessel(v, 0, 0, -400, 0);
    send('rescueDebugTrigger', 1, 'lostCargo');
    const inc = world.rescue!.active!;
    expect(inc.targets.length).toBeGreaterThanOrEqual(2);
    expect(inc.targets.length).toBeLessThanOrEqual(3);
    for (const t of inc.targets) {
      expect(t.kind).toBe('crate');
      expect(Math.hypot(t.x - inc.x, t.z - inc.z)).toBeLessThan(inc.radius);
    }
    const x0 = inc.targets[0].x;
    for (let i = 0; i < 60 / DT; i++) stepWorld(world, [], DT);
    expect(inc.targets[0].x - x0).toBeCloseTo(CONFIG.rescue.drift[0] * 60, 0);
  });

  it('debug: a person in the water off the bow, already accepted', () => {
    const { world, send, v } = setup(1);
    placeVessel(v, 0, 0, -400, 0); // heading north (-z)
    send('rescueDebugNear', 1, 'manOverboard');
    const inc = world.rescue!.active!;
    expect(inc.phase).toBe('accepted');
    expect(inc.targets).toHaveLength(1);
    expect(inc.targets[0].kind).toBe('person');
    expect(inc.targets[0].z).toBeLessThan(-400 - CONFIG.rescue.debugSpawnDistance + 2);
  });
});
