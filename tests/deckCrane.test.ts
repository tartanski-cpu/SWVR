/**
 * The placeable deck crane (modules/deckCrane, cargo/craneHook): on a Shipyard design it
 * moves only with hydraulic pressure, at its own rates, and its HOOK takes cargo under it,
 * hangs it under the hook (its weight on the boat there), and sets it down again.
 */
import { describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { LIBRARY, RECIPES } from '../src/boats/library';
import { deckHeightAt, payloadOf, type CargoItem } from '../src/cargo/cargo';
import { craneStateOf, cranesOf, hookOnBoat } from '../src/cargo/craneHook';
import { craneRadius, craneSeatAt, safeLoadAt } from '../src/modules/deckCrane';
import { hullQueries } from '../src/modular/hull';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { buyBlocker, createCareer } from '../src/career/career';
import * as THREE from 'three';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { busOf } from '../src/modular/bus';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { startEngine } from './helpers/engine';

const DT = 1 / 60;
const crane = CONFIG.modules.deckCrane;

function setup(deckCrane: number) {
  useDesign({ ...DEFAULT_DESIGN, deckCrane });
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  world.environment.waves = [];
  world.geography = 'openSea';
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const path = cranesOf(v)[0]?.path;
  return { world, v, send, run, path };
}

describe('deck crane', { timeout: 30000 }, () => {
  it('only a design with one has it, and its keys', () => {
    const none = setup(0);
    expect(cranesOf(none.v)).toEqual([]);
    expect(busOf(none.v).has('crane.slew')).toBe(false);
    for (const at of [1, 2]) {
      const { v, path } = setup(at);
      expect(path).toBeDefined();
      expect(busOf(v).has('crane.slew')).toBe(true);
      expect(busOf(v).get('crane.luff')).toBe(crane.stow.luffDeg); // the stick untouched: stowed
    }
  });

  it('holds without hydraulic pressure, then slews, luffs and hoists at its own rates', () => {
    const { world, v, send, run, path } = setup(1);
    send('crane.slew', 90);
    send('crane.luff', 40);
    run(2);
    expect(craneStateOf(v, path!)!.slew).toBe(crane.stow.slewDeg); // engine off: no pressure
    startEngine(world, v);
    run(1);
    const s = craneStateOf(v, path!)!;
    expect(s.slew).toBeGreaterThan(crane.slewRateDeg * 0.5);
    expect(s.slew).toBeLessThan(90);
    run(6);
    expect(s.slew).toBeCloseTo(90, 5);
    expect(s.luff).toBeCloseTo(40, 5);
    const wire = s.wire;
    send('crane.hoistDown', 1);
    run(2);
    send('crane.hoistDown', 0);
    expect(s.wire).toBeCloseTo(wire + 2 * crane.hoistRate, 1);
  });

  it('hooks a crate on her deck, carries its weight at the hook, and sets it down on deck', () => {
    const { world, v, send, run, path } = setup(1);
    startEngine(world, v);
    // Boom raised and swung a little inboard (it stands at the starboard deck edge), over her
    // open foredeck, and let it get there.
    send('crane.luff', 50);
    send('crane.slew', -20);
    run(5);
    const s = craneStateOf(v, path!)!;
    const hook = hookOnBoat(v, path!)!;
    // A crate on deck under the hook, and the hook lowered to its top.
    const kind = CONFIG.cargo.kinds.findIndex((k) => k.mass <= crane.swlKg);
    const h = CONFIG.cargo.kinds[kind].size[1];
    const deckY = deckHeightAt(v.defId, hook.z);
    const item: CargoItem = { id: 'c1', kind, mass: CONFIG.cargo.kinds[kind].mass, from: 'calder', to: 'brannock', at: { vessel: v.id, pos: [hook.x, deckY, hook.z], yaw: 0, vel: [0, 0], lashed: false } };
    world.cargo.c1 = item;
    s.wire += hook.y - (deckY + h);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect(item.at).toEqual({ hook: v.id, crane: path });
    expect(s.hooked).toBe('c1');
    // Its weight bears at the hook.
    const p = payloadOf(world, v.id);
    expect(p.reduce((m, x) => m + x.mass, 0)).toBeGreaterThanOrEqual(item.mass);
    // Hoist it up and down again, then set it down: back on her deck.
    send('crane.hoistUp', 1);
    run(3);
    send('crane.hoistUp', 0);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect('hook' in item.at).toBe(true); // too high to set down
    send('crane.hoistDown', 1);
    run(3);
    send('crane.hoistDown', 0);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect('vessel' in item.at).toBe(true);
    expect(s.hooked).toBeNull();
  });

  it('won\'t lift more than its safe working load', () => {
    const { world, v, send, run, path } = setup(1);
    startEngine(world, v);
    send('crane.luff', 50);
    run(5);
    const s = craneStateOf(v, path!)!;
    const hook = hookOnBoat(v, path!)!;
    const deckY = deckHeightAt(v.defId, hook.z);
    world.cargo.big = { id: 'big', kind: 0, mass: crane.swlKg + 100, from: 'calder', to: 'brannock', at: { vessel: v.id, pos: [hook.x, deckY, hook.z], yaw: 0, vel: [0, 0], lashed: false } };
    s.wire += hook.y - (deckY + CONFIG.cargo.kinds[0].size[1]);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect('vessel' in world.cargo.big.at).toBe(true);
    expect(s.hooked).toBeNull();
  });

  it('runs its boom out and in at its own rate, reaching further out, up to its full stretch', () => {
    const { world, v, send, run, path } = setup(1);
    startEngine(world, v);
    const s = craneStateOf(v, path!)!;
    const before = hookOnBoat(v, path!)!.clone();
    send('crane.boomOut', 1);
    run(2);
    expect(s.extend).toBeCloseTo(2 * crane.extendRate, 1);
    // Stowed pointing forward: the hook goes further forward (-z) by as much.
    expect(before.z - hookOnBoat(v, path!)!.z).toBeCloseTo(s.extend * Math.cos((s.luff * Math.PI) / 180), 6);
    run(20);
    expect(s.extend).toBe(crane.extendMax);
    send('crane.boomOut', 0);
    send('crane.boomIn', 1);
    run(20);
    expect(s.extend).toBe(0);
  });

  it('lifts less the further out: its safe working load to the base boom\'s reach, then the same load moment', () => {
    const c = { ...crane };
    expect(safeLoadAt(c, { luff: 0, extend: 0 })).toBe(crane.swlKg);
    expect(safeLoadAt(c, { luff: 40, extend: 0 })).toBe(crane.swlKg); // closer in: no more than its SWL
    const far = safeLoadAt(c, { luff: 0, extend: crane.extendMax });
    expect(far * craneRadius(c, 0, crane.extendMax)).toBeCloseTo(crane.swlKg * crane.boomLength, 6);
    expect(far).toBeLessThan(crane.swlKg);
  });

  it('its load-moment limiter: with a heavy load on, the boom won\'t run out past what it may hold there, but comes back in', () => {
    const { world, v, send, run, path } = setup(1);
    startEngine(world, v);
    const s = craneStateOf(v, path!)!;
    send('crane.luff', 0);
    run(2);
    // A 700 kg crate on the hook.
    const hook = hookOnBoat(v, path!)!;
    const deckY = deckHeightAt(v.defId, hook.z);
    world.cargo.big = { id: 'big', kind: 0, mass: 700, from: 'calder', to: 'brannock', at: { vessel: v.id, pos: [hook.x, deckY, hook.z], yaw: 0, vel: [0, 0], lashed: false } };
    s.wire += hook.y - (deckY + CONFIG.cargo.kinds[0].size[1]);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect(s.loadKg).toBe(700);
    send('crane.boomOut', 1);
    run(10);
    // It stops where 700 kg is all it may hold.
    expect(safeLoadAt(crane, s)).toBeGreaterThanOrEqual(700);
    expect(safeLoadAt(crane, { luff: s.luff, extend: s.extend + crane.extendRate / 30 })).toBeLessThan(700);
    send('crane.boomOut', 0);
    send('crane.boomIn', 1);
    run(1);
    expect(s.extend).toBeLessThan(0.5);
  });

  it('won\'t hook a load heavier than it may lift at that reach', () => {
    const { world, v, send, run, path } = setup(1);
    startEngine(world, v);
    send('crane.luff', 30);
    send('crane.boomOut', 1);
    run(8);
    send('crane.boomOut', 0);
    const s = craneStateOf(v, path!)!;
    const hook = hookOnBoat(v, path!)!;
    const deckY = deckHeightAt(v.defId, hook.z);
    const mass = Math.round(safeLoadAt(crane, s)) + 50; // under its SWL, over what it may lift this far out
    expect(mass).toBeLessThan(crane.swlKg);
    world.cargo.heavy = { id: 'heavy', kind: 0, mass, from: 'calder', to: 'brannock', at: { vessel: v.id, pos: [hook.x, deckY, hook.z], yaw: 0, vel: [0, 0], lashed: false } };
    s.wire += hook.y - (deckY + CONFIG.cargo.kinds[0].size[1]);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect('vessel' in world.cargo.heavy.at).toBe(true);
    // Run in, and it takes it.
    send('crane.boomIn', 1);
    run(10);
    send('crane.boomIn', 0);
    const h2 = hookOnBoat(v, path!)!;
    world.cargo.heavy.at = { vessel: v.id, pos: [h2.x, deckHeightAt(v.defId, h2.z), h2.z], yaw: 0, vel: [0, 0], lashed: false };
    s.wire += h2.y - (deckHeightAt(v.defId, h2.z) + CONFIG.cargo.kinds[0].size[1]);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect(world.cargo.heavy.at).toEqual({ hook: v.id, crane: path });
    expect(s.loadKg).toBe(mass);
  });

  /** How far the hook wanders (m, the most from its mean) over 20 s in a seaway, in the world as she heads and drifts. */
  function wander(upgrade: boolean, hydraulics = true): number {
    useDesign({ ...DEFAULT_DESIGN, deckCrane: 1 });
    const { world, vesselId } = createWorld(new IdFactory(), 'design'); // the default sea: waves on
    world.geography = 'openSea';
    world.career = createCareer();
    if (upgrade) world.career.upgrades.push('craneComp');
    const v = world.vessels[vesselId];
    const path = cranesOf(v)[0].path;
    if (hydraulics) startEngine(world, v);
    const step = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
    step('crane.luff', 20);
    step('crane.slew', 90); // out over the side: where she rolls most
    for (let i = 0; i < 20 / DT; i++) stepWorld(world, [], DT);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 20 / DT; i++) {
      stepWorld(world, [], DT);
      // In the world, then taken back by her drift and heading (not compensated, nor meant to be).
      const q = new THREE.Quaternion().fromArray(v.orientation);
      const h = hookOnBoat(v, path)!.applyQuaternion(q);
      const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
      h.y += v.position[1];
      pts.push(h.applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw));
    }
    const mean = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    return Math.max(...pts.map((p) => p.distanceTo(mean)));
  }

  it('motion compensation (an upgrade): the hook holds steady in a seaway as she rolls, pitches and heaves', () => {
    const plain = wander(false);
    const held = wander(true);
    expect(plain).toBeGreaterThan(0.1); // she does move it about
    expect(held).toBeLessThan(plain * 0.3);
    // Without hydraulic pressure it can't: the hook rides with her. (It can't be swung out over
    // the side either, so it rides stowed inboard, where she moves a little less.)
    expect(wander(true, false)).toBeGreaterThan(plain * 0.5);
  });

  it('motion compensation is sold only for a boat with a deck crane', () => {
    for (const [deckCrane, why] of [[0, 'Needs a deck crane'], [1, null]] as const) {
      useDesign({ ...DEFAULT_DESIGN, deckCrane });
      const { world } = createWorld(new IdFactory(), 'design');
      world.career = createCareer();
      world.career.money = 1e6;
      world.career.rep = { calder: 100 };
      const blocker = buyBlocker(world, 'craneComp');
      if (why) expect(blocker).toBe(why);
      else expect(blocker).not.toBe('Needs a deck crane');
    }
  });

  it('stands at the deck edge, clear of the working deck: from a centreline socket to starboard (or the side asked), its post inboard', () => {
    useDesign(DEFAULT_DESIGN);
    const hull = hullQueries(VESSEL_DEFS.design);
    const z = -1;
    const socket = (x: number, turned = false) => new THREE.Matrix4().compose(new THREE.Vector3(x, hull.deckY(z), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turned ? Math.PI : 0, 0)), new THREE.Vector3(1, 1, 1));
    const edge = hull.halfBeam(z) - crane.edgeInset;
    // A centreline socket: out to the starboard edge, the post inboard (to port).
    let seat = craneSeatAt(crane, hull, socket(0));
    expect(seat.dx).toBeCloseTo(edge, 9);
    expect(seat.postX).toBe(-Math.abs(crane.post.x));
    // Asked for port: the port edge, the post to starboard.
    seat = craneSeatAt({ ...crane, side: 'port' }, hull, socket(0));
    expect(seat.dx).toBeCloseTo(-edge, 9);
    expect(seat.postX).toBe(Math.abs(crane.post.x));
    // A socket already off to port, turned to face aft: it stays there, its post still inboard
    // (in the socket's axes, turned, inboard is -x).
    seat = craneSeatAt(crane, hull, socket(-0.8, true));
    expect(seat.dx).toBeCloseTo(0, 12);
    expect(seat.postX).toBe(-Math.abs(crane.post.x));
    // 'socket': exactly on it, the post as configured.
    seat = craneSeatAt({ ...crane, side: 'socket' }, hull, socket(0));
    expect(seat).toEqual({ dx: 0, postX: crane.post.x });
  });

  it('its weight is where it stands; a Shipyard boat is designed for it, so she floats upright', () => {
    useDesign({ ...DEFAULT_DESIGN, deckCrane: 1 });
    // The crane stands at the starboard edge...
    expect(new THREE.Vector3().setFromMatrixPosition(cranesOf({ defId: 'design' })[0].place).x).toBeGreaterThan(0.4);
    // ...and her hull and ballast are trimmed against it: the boat as a whole has no list.
    expect(LIBRARY.hulls.get(RECIPES.design.hull)!.lightship.cg[0]).toBeLessThan(-0.005);
    expect(Math.abs(VESSEL_DEFS.design.cg[0])).toBeLessThan(0.002);
  });
});
