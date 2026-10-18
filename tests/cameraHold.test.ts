/**
 * The recording camera picked up by a VR crew-mate (owner, Oct 2026): only a camera can be
 * grabbed, by one hand at a time, not by another camera; whoever holds it lets it go; it's
 * let go when the holder or the camera leaves, or stops being a camera. Crew get it in the
 * snapshot; the camera flag rides in the pose through the host.
 */
import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import type { PlayerPose } from '../src/net/protocol';
import { LoopbackHost } from '../src/net/transport';
import { createPlayerState } from '../src/player/playerState';

const DT = 1 / 60;
const head: [number, number, number, number, number, number, number] = [0, 1.7, 0, 0, 0, 0, 1];

function setup() {
  const { world, localPlayerId } = createWorld(new IdFactory());
  const cam = createPlayerState('player-2', 'Cam');
  cam.avatar = { head, left: null, right: null, camera: true };
  const vr = createPlayerState('player-3', 'Skipper');
  vr.avatar = { head, left: [0.3, 1.2, -0.3], right: [0.3, 1.2, -0.3] };
  world.players[cam.id] = cam;
  world.players[vr.id] = vr;
  const send = (control: string, player: string, ref: string, value = 1) => stepWorld(world, [{ playerId: player, targetId: 'env', control, value, ref } as Intent], DT);
  return { world, cam, vr, send, me: localPlayerId };
}

describe('the recording camera in a VR hand', () => {
  it('a VR player grips it: held in that hand; nobody else can take it; only they let it go', () => {
    const { world, cam, vr, send, me } = setup();
    send('cameraGrab', vr.id, cam.id, 1);
    expect(world.cameraHolds?.[cam.id]).toEqual({ by: vr.id, hand: 'right' });
    send('cameraGrab', me, cam.id, 0);
    expect(world.cameraHolds?.[cam.id]?.by).toBe(vr.id); // already held
    send('cameraRelease', me, cam.id);
    expect(world.cameraHolds?.[cam.id]?.by).toBe(vr.id); // not theirs to let go
    send('cameraRelease', vr.id, cam.id);
    expect(world.cameraHolds?.[cam.id]).toBeUndefined();
    send('cameraGrab', me, cam.id, 0);
    expect(world.cameraHolds?.[cam.id]).toEqual({ by: me, hand: 'left' });
  });

  it("only a camera, not yourself, not by a camera; let go when the holder or camera goes, or it isn't a camera now", () => {
    const { world, cam, vr, send } = setup();
    send('cameraGrab', vr.id, 'player-1');
    expect(world.cameraHolds?.['player-1']).toBeUndefined(); // a crew-mate, not a camera
    send('cameraGrab', cam.id, cam.id);
    expect(world.cameraHolds?.[cam.id]).toBeUndefined(); // your own
    const cam2 = createPlayerState('player-4', 'Cam 2');
    cam2.avatar = { head, left: null, right: null, camera: true };
    world.players[cam2.id] = cam2;
    send('cameraGrab', cam2.id, cam.id);
    expect(world.cameraHolds?.[cam.id]).toBeUndefined(); // a camera has no hands
    send('cameraGrab', vr.id, cam.id);
    expect(world.cameraHolds?.[cam.id]).toBeDefined();
    cam.avatar = { head, left: null, right: null }; // back to being a crew-mate
    stepWorld(world, [], DT);
    expect(world.cameraHolds?.[cam.id]).toBeUndefined();
    cam.avatar.camera = true;
    send('cameraGrab', vr.id, cam.id);
    delete world.players[vr.id]; // the holder leaves
    stepWorld(world, [], DT);
    expect(world.cameraHolds?.[cam.id]).toBeUndefined();
  });

  it('a camera can be anywhere: it doesn\'t move where the sea is kept steady (the players\' middle)', () => {
    const { world, cam } = setup();
    stepWorld(world, [], DT);
    const before = { ...world.environment.seaAnchor! };
    cam.position = [5000, 50, 5000];
    stepWorld(world, [], DT);
    expect(world.environment.seaAnchor).toEqual(before);
  });

  it('the camera flag rides in the pose through the host, and junk is not a camera', async () => {
    const ids = new IdFactory();
    const { world } = createWorld(ids);
    const loop = new LoopbackHost();
    new HostSession(world, ids, loop, '1');
    const c = new ClientSession(loop.client(), 'Cam');
    await new Promise((r) => setTimeout(r, 0));
    const pose: PlayerPose = { name: 'Cam', aboardVesselId: null, position: [0, 3, 0], yaw: 0, head: [0, 3, 0, 0, 0, 0, 1], left: null, right: null };
    c.sendPose({ ...pose, camera: true });
    expect(world.players[c.playerId!].avatar!.camera).toBe(true);
    c.sendPose({ ...pose, camera: 1 } as never);
    expect(world.players[c.playerId!].avatar!.camera).toBe(false);
  });
});
