import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { cargoPaused } from '../src/rescue/rescue';
import { distanceToHull, stepRecovery, vesselToWorld } from '../src/rescue/recovery';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const DT = 1 / 60;

function setup(defId: 'manOverboard' | 'lostCargo') {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -400, 0); // heading north (-z): the stern is to the south (+z)
  const send = (control: string, opts: { value?: number; ref?: string; args?: number[]; player?: string } = {}) => {
    const i: Intent = { playerId: opts.player ?? 'p', targetId: v.id, control, value: opts.value ?? 1, ref: opts.ref, args: opts.args };
    stepWorld(world, [i], DT);
  };
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  send('rescueDebugNear', { ref: defId });
  const inc = world.rescue!.active!;
  const gear = VESSEL_DEFS[v.defId].rescueGear;
  return { world, v, send, run, inc, gear };
}

/** Put a target a given distance astern on the starboard quarter, where the ring goes. */
function astern(s: ReturnType<typeof setup>, i: number, d: number) {
  const st = vesselToWorld(s.v, s.gear.stern);
  s.inc.targets[i].x = st.x + 3;
  s.inc.targets[i].z = st.z + d;
}

describe('recovery: life ring, line and climbing aboard', () => {
  it('a ring landing near the survivor is caught; reeling brings them to the stern; in neutral they climb aboard', () => {
    const s = setup('manOverboard');
    const { world, send, run, inc } = s;
    astern(s, 0, 14);
    const t = inc.targets[0];
    send('ringTake');
    expect(world.rescue!.ring!.state).toBe('held');
    // Throw it to land right by them.
    send('ringThrow', { args: [t.x + 1, 2, t.z, 0, 0, 0] });
    run(1);
    expect(world.rescue!.ring!.state).toBe('water');
    expect(t.phase).toBe('onLine');
    // Hand over hand.
    for (let k = 0; k < 20 && t.phase === 'onLine'; k++) {
      send('ringPull', { value: 1 });
      run(0.2);
    }
    expect(['climbing', 'aboard']).toContain(t.phase);
    run(CONFIG.rescue.climbTime + 0.5);
    expect(t.phase).toBe('aboard');
    expect(t.seat).toBeDefined();
    expect(inc.phase).toBe('recovered');
    expect(world.rescue!.cheer).toBe(1);
    expect(world.rescue!.radio!.text).toMatch(/land the survivor at/);
    expect(world.rescue!.ring!.state).toBe('stowed');
    expect(cargoPaused(world)).toBe(true); // until landed (milestone 4)
  });

  it('a throw that misses floats on its line and can be reeled back aboard', () => {
    const s = setup('manOverboard');
    const { world, send, run, inc } = s;
    astern(s, 0, 25);
    send('ringTake');
    const cleat = vesselToWorld(s.v, s.gear.ringCleat);
    send('ringThrow', { args: [cleat.x + 8, 2, cleat.z, 0, 0, 0] }); // way off
    run(1);
    expect(inc.targets[0].phase ?? 'floating').toBe('floating');
    for (let k = 0; k < 12; k++) send('ringPull', { value: 1 });
    run(0.2);
    expect(world.rescue!.ring!.state).toBe('stowed');
  });

  it('propeller rule: in gear with the survivor near the stern, they shout and swim away; in neutral they come aboard', () => {
    const s = setup('manOverboard');
    const { world, send, run, inc, v } = s;
    astern(s, 0, 2.5);
    const t = inc.targets[0];
    send('ringTake');
    send('ringThrow', { args: [t.x, 1, t.z, 0, 0, 0] });
    run(0.5);
    expect(t.phase).toBe('onLine');
    // Hold the engine in gear and step the recovery directly.
    v.engine.gear = 1;
    t.phase = 'onLine';
    const st = vesselToWorld(v, s.gear.stern);
    const d0 = Math.hypot(t.x - st.x, t.z - st.z);
    for (let i = 0; i < 120; i++) stepRecovery(world, v, [], DT);
    expect(world.rescue!.shout?.text).toMatch(/propeller/);
    expect(t.phase).toBe('onLine');
    expect(Math.hypot(t.x - st.x, t.z - st.z)).toBeGreaterThan(d0);
    v.engine.gear = 0;
    send('ringPull', { value: 3 });
    run(0.5);
    expect(['climbing', 'aboard']).toContain(t.phase);
  });
});

describe('recovery: boat hook and lifting crates', () => {
  it('hook a crate, tow it alongside, lift it aboard: it becomes cargo for any harbour; all aboard ends the rescue', () => {
    const s = setup('lostCargo');
    const { world, send, inc, v } = s;
    const n = inc.targets.length;
    send('hookTake');
    expect(world.rescue!.hook!.holder).toBe('p');
    for (const t of [...inc.targets]) {
      send('crateHook', { ref: t.id });
      expect(t.phase).toBe('hooked');
      // Too far off: can't lift.
      send('crateLift', { ref: t.id });
      expect(t.phase).toBe('hooked');
      // Tow it alongside the starboard side, amidships.
      const side = vesselToWorld(v, [2.8, 0, 3]);
      for (let k = 0; k < 30; k++) send('crateTow', { ref: t.id, args: [side.x, side.z] });
      expect(distanceToHull(v, t.x, t.z)).toBeLessThan(CONFIG.rescue.liftRange);
      send('crateLift', { ref: t.id });
      expect(t.phase).toBe('aboard');
      const item = world.cargo[t.cargoId!];
      expect(item.at).toEqual({ carriedBy: 'p' });
      expect(item.to).toBe('any');
    }
    expect(Object.values(world.cargo).filter((c) => c.to === 'any')).toHaveLength(n);
    expect(world.rescue!.active).toBeNull();
    expect(world.rescue!.completed).toBe(1);
    expect(world.rescue!.radio!.text).toMatch(/any harbour/);
  });

  it("only the hook's holder can hook and tow", () => {
    const s = setup('lostCargo');
    const { send, inc } = s;
    send('hookTake', { player: 'a' });
    send('hookTake', { player: 'b' });
    send('crateHook', { ref: inc.targets[0].id, player: 'b' });
    expect(inc.targets[0].phase ?? 'floating').toBe('floating');
    send('crateHook', { ref: inc.targets[0].id, player: 'a' });
    expect(inc.targets[0].hookedBy).toBe('a');
    const x0 = inc.targets[0].x;
    send('crateTow', { ref: inc.targets[0].id, player: 'b', args: [x0 + 2, inc.targets[0].z] });
    expect(inc.targets[0].x).toBeCloseTo(x0, 5);
    void THREE;
  });
});

describe('recovery: desktop hands', () => {
  it('a desktop throw lands the ring where you look on the water', async () => {
    const { RescueHands } = await import('../src/rescue/rescueHands');
    const { CargoHands } = await import('../src/cargo/cargoHands');
    const s = setup('manOverboard');
    const { world, v, run } = s;
    const root = new THREE.Object3D();
    root.position.fromArray(v.position);
    root.quaternion.fromArray(v.orientation);
    root.updateMatrixWorld();
    const pending: Intent[] = [];
    const hands = new RescueHands();
    const ctx = {
      world,
      playerId: 'p',
      vesselId: v.id,
      vesselRoot: root,
      waves: [],
      cargoHands: new CargoHands(),
      push: (control: string, ref: string | undefined, value: number, args?: number[]) => pending.push({ playerId: 'p', targetId: v.id, control, value, ref, args }),
      notify: () => {},
      pulse: () => {},
    };
    const flush = () => stepWorld(world, pending.splice(0), DT);
    // Standing on the aft deck, looking at the ring on the wheelhouse wall: click takes it.
    const eye = vesselToWorld(v, [0, 2.6, 3.5]);
    const ring = vesselToWorld(v, s.gear.ringStow);
    const ray = new THREE.Ray(eye.clone(), ring.clone().sub(eye).normalize());
    expect(hands.desktopClick(ctx, ray, ray.direction)).toBe(true);
    flush();
    expect(world.rescue!.ring!.state).toBe('held');
    // Look at a spot on the water 15 m astern and click: it lands within catch range of it.
    const spot = vesselToWorld(v, [2, 0, 21]);
    spot.y = 0;
    const look = spot.clone().sub(eye).normalize();
    hands.updateDesktop(ctx, new THREE.Ray(eye.clone(), look), eye, look, DT);
    expect(hands.desktopClick(ctx, new THREE.Ray(eye.clone(), look), look)).toBe(true);
    flush();
    expect(world.rescue!.ring!.state).toBe('flying');
    run(3);
    const r = world.rescue!.ring!;
    expect(r.state).toBe('water');
    expect(Math.hypot(r.pos[0] - spot.x, r.pos[2] - spot.z)).toBeLessThan(CONFIG.rescue.catchRadius);
  });
});

describe('recovery: boat hook laid down', () => {
  it('can be laid on deck and taken from there; over the side it goes back in its clips', () => {
    const s = setup('lostCargo');
    const { world, send } = s;
    send('hookTake');
    send('hookDrop', { args: [0.3, 1, 3.5, 0.4] });
    expect(world.rescue!.hook!.holder).toBeNull();
    expect(world.rescue!.hook!.deck?.[2]).toBeCloseTo(3.5);
    send('hookTake', { player: 'b' });
    expect(world.rescue!.hook!.holder).toBe('b');
    expect(world.rescue!.hook!.deck).toBeUndefined();
    send('hookDrop', { player: 'b', args: [6, 1, 3.5, 0] });
    expect(world.rescue!.hook!.deck).toBeUndefined();
  });
});
