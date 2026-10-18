/**
 * VR hand gestures (owner, Oct 2026): with nothing in the hand, grip makes a fist, grip and
 * the stick forward points, grip and the stick back gives the middle finger. A hand holding
 * anything just makes a fist. Crew-mates see the gesture.
 */
import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { decodeLook, handGeometries, handGeometry, turnHands } from '../src/net/avatarOutfits';
import { CONFIG } from '../src/config';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import type { PlayerPose } from '../src/net/protocol';
import { LoopbackHost } from '../src/net/transport';
import { HAND_POSES, HandGestures, poseFromCode } from '../src/player/handGesture';

const free = (grip: boolean, y = 0) => ({ grip, stick: [0, y] as [number, number], busy: false });

describe('hand gestures', () => {
  it('a free hand: relaxed, a fist on the grip, then a finger by the stick, kept until the grip is let go', () => {
    const g = new HandGestures();
    expect(g.update('right', free(false))).toBe('rest');
    expect(g.ownsStick('right')).toBe(false);
    expect(g.update('right', free(true))).toBe('fist');
    expect(g.ownsStick('right')).toBe(true); // the stick is the gesture's now: no turning
    expect(g.gesturing('right')).toBe(false); // a fist still grabs the world
    expect(g.update('right', free(true, -0.3))).toBe('fist'); // not far enough
    expect(g.update('right', free(true, -0.9))).toBe('point'); // forward
    expect(g.gesturing('right')).toBe(true);
    expect(g.update('right', free(true, 0))).toBe('point'); // the stick back to the middle: still pointing
    expect(g.update('right', free(true, 0.9))).toBe('rude'); // back
    expect(g.update('right', free(true, 0))).toBe('rude');
    expect(g.update('right', free(false))).toBe('rest');
    expect(g.update('right', free(true))).toBe('fist'); // a fresh grip starts from a fist
  });

  it('a hand holding something makes a fist on its grip, no gesture, and its stick works as usual', () => {
    const g = new HandGestures();
    expect(g.update('left', { grip: true, stick: [0, -1], busy: true })).toBe('fist');
    expect(g.ownsStick('left')).toBe(false);
    expect(g.gesturing('left')).toBe(false);
    expect(g.update('left', { grip: false, stick: [0, -1], busy: true })).toBe('rest');
    // The hands are separate.
    g.update('right', free(true, -1));
    expect(g.codes()).toEqual([HAND_POSES.indexOf('rest'), HAND_POSES.indexOf('point')]);
    g.reset();
    expect(g.codes()).toEqual([0, 0]);
  });

  it('every pose has its own hand: the pointing and the rude finger reach out ahead of the fist', () => {
    const l = decodeLook(3);
    const front = (pose: 'fist' | 'point' | 'rude') => {
      const geo = handGeometry(l, 1, pose);
      geo.computeBoundingBox();
      return geo.boundingBox!.min.z;
    };
    expect(front('point')).toBeLessThan(front('fist') - 0.04);
    expect(front('rude')).toBeLessThan(front('point')); // a little longer
    const set = handGeometries(3, 1);
    expect(new Set(Object.values(set)).size).toBe(4);
    expect(handGeometries(3, 1)).toBe(set); // shared
    expect(poseFromCode(2)).toBe('point');
    expect(poseFromCode(9)).toBe('rest');
    expect(poseFromCode('x')).toBe('rest');
  });

  it("crew-mates get the gesture through the host; junk is a relaxed hand", async () => {
    const ids = new IdFactory();
    const { world } = createWorld(ids);
    const loop = new LoopbackHost();
    new HostSession(world, ids, loop, '1');
    const c = new ClientSession(loop.client(), 'Mate');
    await new Promise((r) => setTimeout(r, 0));
    const pose: PlayerPose = { name: 'Mate', aboardVesselId: null, position: [0, 0, 0], yaw: 0, head: [0, 1.7, 0, 0, 0, 0, 1], left: [-0.3, 1.2, 0], right: [0.3, 1.2, 0] };
    c.sendPose({ ...pose, poses: [1, 3] });
    expect(world.players[c.playerId!].avatar!.poses).toEqual([1, 3]);
    c.sendPose({ ...pose, poses: [7, Number.NaN] } as never);
    expect(world.players[c.playerId!].avatar!.poses).toEqual([0, 0]);
    c.sendPose(pose); // a desktop player, or an older version
    expect(world.players[c.playerId!].avatar!.poses).toEqual([0, 0]);
  });

  it("sits on the controller as the WebXR grip frame says: the finger out along -Y (away from the arm), the thumb toward -Z (up the handle)", () => {
    expect(CONFIG.avatar.handTurn).toEqual({ pitchDeg: 90, rollDeg: 0, yawDeg: 0 });
    const point = handGeometries(5, 1).point;
    point.computeBoundingBox();
    const b = point.boundingBox!;
    // The finger reaches furthest of anything, out along -Y; the wrist's cuff is back along +Y.
    expect(-b.min.y).toBeGreaterThan(0.09);
    expect(b.max.y).toBeGreaterThan(0.05);
    expect(-b.min.y).toBeGreaterThan(Math.max(-b.min.z, b.max.z, -b.min.x, b.max.x));
    // Nudged from Debug > Hands, the shapes are built again turned; back to the spec's.
    turnHands('rollDeg', 15);
    expect(CONFIG.avatar.handTurn.rollDeg).toBe(15);
    expect(handGeometries(5, 1).point).not.toBe(point);
    turnHands('pitchDeg', null);
    expect(CONFIG.avatar.handTurn).toEqual({ pitchDeg: 90, rollDeg: 0, yawDeg: 0 });
  });
});
