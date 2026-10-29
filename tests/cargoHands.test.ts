import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { CargoHands, type CargoHandsContext } from '../src/cargo/cargoHands';
import { GROUND, isHeavy, type CargoItem } from '../src/cargo/cargo';
import type { HandFrame } from '../src/controls/InteractionSystem';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { HostSession } from '../src/net/hostSession';
import { ClientSession } from '../src/net/clientSession';
import { LoopbackHost } from '../src/net/transport';

// These tests carry, stow and pot with the ports kept stocked and the pot pallet filled: the
// old way, kept as CONFIG.cargo.onDemand off. Goods on order (the game's way now): cargoOrder.test.ts.
beforeAll(() => {
  (CONFIG.cargo as { onDemand: boolean }).onDemand = false;
});
afterAll(() => {
  (CONFIG.cargo as { onDemand: boolean }).onDemand = true;
});

function setup() {
  const { world, localPlayerId, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const scene = new THREE.Group();
  const boatRoot = new THREE.Group();
  boatRoot.position.set(0, 0, -300);
  scene.add(boatRoot);
  scene.updateMatrixWorld(true);
  const sent: Intent[] = [];
  const notes: string[] = [];
  const ctx: CargoHandsContext = {
    world,
    playerId: localPlayerId,
    frame: scene,
    vesselRoots: new Map([[vesselId, boatRoot]]),
    push: (control, targetId, ref, value, args) => sent.push({ playerId: localPlayerId, targetId, control, value, ref, args }),
    notify: (t) => notes.push(t),
    pulse: () => {},
  };
  const hand = (p: THREE.Vector3, grip: boolean, pressed: boolean): HandFrame => ({
    tracked: true,
    grip: p.clone(),
    ray: new THREE.Ray(p.clone(), new THREE.Vector3(0, 0, -1)),
    gripDown: grip,
    gripPressed: pressed,
    triggerDown: false,
    triggerPressed: false,
  });
  const free = { left: false, right: false };
  const top = (c: CargoItem) => {
    const g = (c.at as { ground: number[] }).ground;
    return new THREE.Vector3(g[0], g[1] + 0.2, g[2]);
  };
  const ground = Object.values(world.cargo).filter((c) => 'ground' in c.at);
  return { world, ctx, sent, notes, hand, free, top, ground, scene, localPlayerId };
}

describe('cargo hands (VR)', () => {
  it('a light item comes up in one hand, follows it, and is set down where you let go', () => {
    const { ctx, sent, hand, free, top, ground } = setup();
    const hands = new CargoHands();
    const c = ground.find((g) => !isHeavy(g))!;
    const p = top(c);
    const far = new THREE.Vector3(0, 50, 0);
    hands.updateXR(ctx, { left: hand(far, false, false), right: hand(p, true, true) }, free);
    expect(hands.carrying).toBe(true);
    expect(hands.busy('right')).toBe(true);
    expect(sent[0]).toMatchObject({ control: 'cargoTake', ref: c.id });
    // Move the hand 1 m east and let go: placed ashore 1 m east of where it was.
    const moved = p.clone().add(new THREE.Vector3(1, 0, 0));
    hands.updateXR(ctx, { left: hand(far, false, false), right: hand(moved, true, false) }, free);
    hands.updateXR(ctx, { left: hand(far, false, false), right: hand(moved, false, false) }, free);
    expect(hands.carrying).toBe(false);
    const place = sent.find((i) => i.control === 'cargoPlace')!;
    expect(place.targetId).toBe(GROUND);
    expect(place.args![0]).toBeCloseTo((c.at as { ground: number[] }).ground[0] + 1, 5);
  });

  it('a heavy item needs both hands on it', () => {
    const { world, ctx, sent, notes, hand, free, top } = setup();
    const hands = new CargoHands();
    const c = Object.values(world.cargo).find((g) => 'ground' in g.at && isHeavy(g)) ?? (() => {
      const any = Object.values(world.cargo).find((g) => 'ground' in g.at)!;
      any.kind = 4;
      any.mass = 110;
      return any;
    })();
    const p = top(c);
    const off = new THREE.Vector3(0.15, 0, 0);
    hands.updateXR(ctx, { left: hand(new THREE.Vector3(0, 50, 0), false, false), right: hand(p, true, true) }, free);
    expect(hands.carrying).toBe(false);
    expect(notes.join()).toMatch(/both hands/);
    hands.updateXR(ctx, { left: hand(p.clone().sub(off), true, true), right: hand(p, true, false) }, free);
    expect(hands.carrying).toBe(true);
    expect(sent.filter((i) => i.control === 'cargoTake')).toHaveLength(1);
  });

  it('a hand busy on a bridge control or the menu never picks anything up', () => {
    const { ctx, sent, hand, top, ground } = setup();
    const hands = new CargoHands();
    const p = top(ground[0]);
    hands.updateXR(ctx, { left: hand(new THREE.Vector3(0, 50, 0), false, false), right: hand(p, true, true) }, { left: false, right: true });
    expect(hands.carrying).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe('cargo in multiplayer', () => {
  it("a crew-mate's pick-up reaches the host; leaving the game sets it down where they stood", async () => {
    const ids = new IdFactory();
    const { world } = createWorld(ids);
    world.environment.waves = [];
    const loop = new LoopbackHost();
    const host = new HostSession(world, ids, loop, '1');
    const t = loop.client();
    const client = new ClientSession(t, 'Mate');
    await new Promise((r) => setTimeout(r, 0));
    const item = Object.values(world.cargo).find((c) => 'ground' in c.at && !isHeavy(c))!;
    const g = (item.at as { ground: [number, number, number] }).ground;
    // They're standing next to it on the quay.
    client.sendPose({ name: 'Mate', aboardVesselId: null, position: [g[0] + 1, g[1], g[2]], yaw: 0, head: [g[0] + 1, g[1] + 1.7, g[2], 0, 0, 0, 1], left: null, right: null });
    client.sendIntents([{ playerId: '', targetId: GROUND, control: 'cargoTake', value: 1, ref: item.id }]);
    stepWorld(world, host.takeIntents(), 1 / 60);
    expect(item.at).toEqual({ carriedBy: client.playerId });
    t.close();
    expect('ground' in item.at).toBe(true);
    expect((item.at as { ground: number[] }).ground[0]).toBeCloseTo(g[0] + 1, 5);
  });
});
